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
}) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null; // CHECK (amount > 0)
    const { rows: [row] } = await executor.query(
        `INSERT INTO financial_transactions
            (event_type, debit_account, credit_account, amount, description,
             ref_type, ref_id, actor_id, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id`,
        [eventType, debitAccount, creditAccount, numericAmount, description, refType, refId, actorId],
    );
    return row;
};

const getJournal = async ({ eventType = null, from = null, to = null, exported = null, limit = 200, offset = 0 }) => {
    const params = [];
    const conditions = [];
    if (eventType) { params.push(eventType); conditions.push(`ft.event_type = $${params.length}`); }
    if (from)      { params.push(from);      conditions.push(`ft.occurred_at >= $${params.length}`); }
    if (to)        { params.push(to);        conditions.push(`ft.occurred_at < ($${params.length}::date + INTERVAL '1 day')`); }
    if (exported === 'pending')  conditions.push('ft.exported_at IS NULL');
    if (exported === 'exported') conditions.push('ft.exported_at IS NOT NULL');

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
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
            p.full_name AS actor_name,
            COUNT(*) OVER() AS total_count
         FROM financial_transactions ft
         LEFT JOIN profiles p ON p.id = ft.actor_id
         ${where}
         ORDER BY ft.occurred_at DESC, ft.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
    );
    return rows;
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
        const { rows } = await client.query(
            `UPDATE financial_transactions ft
             SET exported_at = NOW(), export_batch_id = $1
             WHERE ft.exported_at IS NULL
               AND ft.occurred_at >= $2
               AND ft.occurred_at < ($3::date + INTERVAL '1 day')
             RETURNING ft.id, ft.event_type, ft.debit_account, ft.credit_account,
                       ft.amount::text, ft.description, ft.ref_type, ft.ref_id,
                       ft.actor_id, ft.occurred_at`,
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

module.exports = { insertTransaction, getJournal, getJournalStats, exportPeriod };
