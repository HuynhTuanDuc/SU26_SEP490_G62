const pool = require('../config/database');

// Sổ nhật ký tài chính — append-only (BUSINESS_SPECIFICATION §33)
// Mỗi sự kiện tiền tệ INSERT 1 bản ghi. Không UPDATE, không DELETE
// (ngoại trừ đánh dấu exported_at khi xuất kỳ kế toán).

// Số hiệu tài khoản kế toán VN (text label — MISA xử lý bút toán thật):
//   1111 tiền mặt | 1121 tiền gửi NH | 131 phải thu KH | 1388 phải thu tài xế
//   141 tạm ứng   | 334 phải trả NLĐ | 511 doanh thu   | 642 chi phí QLDN | 3388 thu hộ/chi hộ

// executor: pool hoặc client (khi cần nằm trong transaction của caller)
const insertTransaction = async (executor, {
    eventType, debitAccount, creditAccount, amount,
    description = null, refType = null, refId = null, actorId = null,
    occurredAt = null, // ngày phát sinh thực tế (đơn import quá khứ) — null = NOW()
}) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null; // CHECK (amount > 0)
    const { rows: [row] } = await executor.query(
        `INSERT INTO financial_transactions
            (event_type, debit_account, credit_account, amount, description,
             ref_type, ref_id, actor_id, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()))
         RETURNING id`,
        [eventType, debitAccount, creditAccount, numericAmount, description, refType, refId, actorId, occurredAt],
    );
    return row;
};

// sort resolved via allowlist, never interpolated directly from user input
const JOURNAL_SORTS = {
    oldest:        'ft.occurred_at ASC, ft.id ASC',
    'amount-desc': 'ft.amount DESC, ft.id DESC',
    'amount-asc':  'ft.amount ASC, ft.id DESC',
};

const getJournal = async ({ eventType = null, from = null, to = null, exported = null, sort = null, limit = 200, offset = 0 }) => {
    const params = [];
    const conditions = [];
    if (eventType) { params.push(eventType); conditions.push(`ft.event_type = $${params.length}`); }
    if (from)      { params.push(from);      conditions.push(`ft.occurred_at >= $${params.length}`); }
    if (to)        { params.push(to);        conditions.push(`ft.occurred_at < ($${params.length}::date + INTERVAL '1 day')`); }
    if (exported === 'pending')  conditions.push('ft.exported_at IS NULL');
    if (exported === 'exported') conditions.push('ft.exported_at IS NOT NULL');

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = JOURNAL_SORTS[sort] ?? 'ft.occurred_at DESC, ft.id DESC';
    params.push(limit, offset);

    const { rows } = await pool.query(
        `SELECT
            ft.id, ft.event_type,
            ft.debit_account, ft.credit_account,
            ft.amount::text,
            ft.description,
            ft.ref_type, ft.ref_id,
            ft.occurred_at,
            ft.exported_at, ft.export_batch_id,
            ft.reversal_of_id, ft.reversal_reason,
            rev.id AS reversed_by_id,
            p.full_name AS actor_name,
            COUNT(*) OVER() AS total_count
         FROM financial_transactions ft
         LEFT JOIN profiles p ON p.id = ft.actor_id
         LEFT JOIN financial_transactions rev ON rev.reversal_of_id = ft.id
         ${where}
         ORDER BY ${orderClause}
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
    );
    return rows;
};

// ─── Bút toán đảo (reversal entry) ────────────────────────────────────────────
// Không sửa/xóa dòng gốc — ghi 1 dòng NGƯỢC CHIỀU (đổi TK nợ/có) cùng số tiền,
// gắn reversal_of_id + lý do. Số dư tự triệt tiêu, audit trail giữ nguyên vẹn.
const reverseTransaction = async (ftId, { reason, actorId }, executor = pool) => {
    const { rows: [original] } = await executor.query(
        `SELECT ft.*, rev.id AS reversed_by_id
         FROM financial_transactions ft
         LEFT JOIN financial_transactions rev ON rev.reversal_of_id = ft.id
         WHERE ft.id = $1`,
        [ftId],
    );
    if (!original) throw new Error('Không tìm thấy bút toán');
    if (original.reversal_of_id) throw new Error('Đây đã là bút toán đảo — không đảo tiếp được');
    if (original.reversed_by_id) throw new Error('Bút toán này đã được đảo trước đó');

    const { rows: [reversal] } = await executor.query(
        `INSERT INTO financial_transactions
            (event_type, debit_account, credit_account, amount, description,
             ref_type, ref_id, actor_id, occurred_at, reversal_of_id, reversal_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10)
         RETURNING id`,
        [
            original.event_type,
            original.credit_account,   // đổi chiều nợ ↔ có
            original.debit_account,
            original.amount,
            `ĐẢO bút toán #${original.id}: ${reason}`,
            original.ref_type, original.ref_id,
            actorId, ftId, reason,
        ],
    );
    return { reversalId: reversal.id, originalId: Number(ftId) };
};

const getJournalStats = async ({ from = null, to = null }) => {
    const params = [];
    const conditions = [];
    if (from) { params.push(from); conditions.push(`occurred_at >= $${params.length}`); }
    if (to)   { params.push(to);   conditions.push(`occurred_at < ($${params.length}::date + INTERVAL '1 day')`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
        `SELECT event_type,
                COUNT(*)                 AS tx_count,
                COALESCE(SUM(amount),0)::text AS total_amount,
                COUNT(*) FILTER (WHERE exported_at IS NULL) AS pending_export_count
         FROM financial_transactions
         ${where}
         GROUP BY event_type
         ORDER BY event_type`,
        params,
    );
    return rows;
};

// Xuất kỳ kế toán: chốt các bản ghi chưa export trong khoảng [from, to],
// đánh dấu exported_at + export_batch_id, trả về data để dựng file CSV.
const exportPeriod = async ({ from, to, accountantId }) => {
    const batchId = `EXP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}`;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // TH1 — cặp gốc + đảo đều CHƯA export: triệt tiêu nhau → đánh dấu VOID-batch,
        // KHÔNG đưa vào file (MISA nhận file sạch; vết sai vẫn nằm đủ trong TMS)
        await client.query(
            `UPDATE financial_transactions ft
             SET exported_at = NOW(), export_batch_id = $1
             FROM financial_transactions rev
             WHERE rev.reversal_of_id = ft.id
               AND ft.exported_at  IS NULL
               AND rev.exported_at IS NULL`,
            [`VOID-${batchId}`],
        );
        await client.query(
            `UPDATE financial_transactions rev
             SET exported_at = NOW(), export_batch_id = $1
             FROM financial_transactions orig
             WHERE rev.reversal_of_id = orig.id
               AND rev.exported_at IS NULL
               AND orig.export_batch_id = $1`,
            [`VOID-${batchId}`],
        );

        // TH2 — bút toán đảo của dòng ĐÃ export kỳ trước: vẫn nằm trong file kỳ này
        // như một dòng điều chỉnh (MISA hạch toán điều chỉnh kỳ sau — chuẩn kế toán).
        // Kèm cột tách cước / chi hộ khách cho các sự kiện tiền về (dữ liệu thô đủ
        // để kế toán MISA hạch toán tất toán 3388) — quy ước: chi hộ được thu trước.
        const { rows } = await client.query(
            `UPDATE financial_transactions ft
             SET exported_at = NOW(), export_batch_id = $1
             FROM (
                SELECT f.id,
                       CASE
                           WHEN f.event_type IN ('bank_receipt','driver_debt_created','driver_debt_paid','customer_payment','cash_receipt')
                           THEN LEAST(COALESCE(pt.pass_total, 0), f.amount)
                           ELSE NULL
                       END AS chi_ho_amount
                FROM financial_transactions f
                LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(e.amount), 0) AS pass_total
                    FROM expenses e
                    JOIN order_shipments os ON os.id = e.shipment_id
                    WHERE e.status != 'rejected'
                      AND e.expense_type IN ('toll','parking','etc')
                      AND os.order_id = CASE
                          WHEN f.ref_type = 'order'    THEN f.ref_id
                          WHEN f.ref_type = 'shipment' THEN (SELECT order_id FROM order_shipments WHERE id = f.ref_id)
                          WHEN f.ref_type = 'debt'     THEN (SELECT order_id FROM debts WHERE id = f.ref_id)
                          ELSE NULL
                      END
                ) pt ON TRUE
             ) info
             WHERE ft.id = info.id
               AND ft.exported_at IS NULL
               AND ft.occurred_at >= $2
               AND ft.occurred_at < ($3::date + INTERVAL '1 day')
             RETURNING ft.id, ft.event_type, ft.debit_account, ft.credit_account,
                       ft.amount::text, ft.description, ft.ref_type, ft.ref_id,
                       ft.actor_id, ft.occurred_at, ft.reversal_of_id,
                       info.chi_ho_amount::text`,
            [batchId, from, to],
        );

        await client.query('COMMIT');
        return { batchId, exportedBy: accountantId, rows };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { insertTransaction, getJournal, getJournalStats, exportPeriod, reverseTransaction };
