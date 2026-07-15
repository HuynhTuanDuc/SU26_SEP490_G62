const pool = require('../config/database');

// GET /api/accountant/receipts/bank-transfer — danh sách phiếu thu bank_transfer chưa xác nhận
const getPendingBankTransfers = async ({ limit, offset, like }) => {
    const { rows } = await pool.query(
        `SELECT
            sr.id                        AS receipt_id,
            orr.id                       AS orr_id,
            orr.order_id,
            orr.requesting_shipment_id   AS shipment_id,
            sr.amount,
            sr.collected_at,
            sr.notes,
            o.cargo_name,
            c.full_name                  AS customer_name,
            c.company_name               AS customer_company,
            c.phone                      AS customer_phone,
            p.full_name                  AS driver_name,
            p.phone                      AS driver_phone,
            v.plate_number,
            COALESCE(
                json_agg(pr.file_url ORDER BY pr.uploaded_at) FILTER (WHERE pr.file_url IS NOT NULL),
                '[]'
            )                            AS proof_urls,
            (SELECT ts.address FROM trip_stops ts
             WHERE ts.shipment_id = orr.requesting_shipment_id AND ts.stop_type = 'pickup'
             ORDER BY ts.stop_index ASC  LIMIT 1) AS pickup_address,
            (SELECT ts.address FROM trip_stops ts
             WHERE ts.shipment_id = orr.requesting_shipment_id AND ts.stop_type = 'delivery'
             ORDER BY ts.stop_index DESC LIMIT 1) AS delivery_address
         FROM shipment_receipts sr
         JOIN order_receipt_requests orr ON orr.id = sr.order_receipt_request_id
         JOIN orders o                   ON o.id   = orr.order_id
         LEFT JOIN customers c           ON c.id   = o.customer_id
         LEFT JOIN profiles p            ON p.id   = orr.driver_id
         LEFT JOIN v_shipment_current sc ON sc.shipment_id = orr.requesting_shipment_id
         LEFT JOIN vehicles v            ON v.id   = sc.vehicle_id
         LEFT JOIN payment_receipts pr   ON pr.payment_id = sr.id
         WHERE sr.payment_type = 'bank_transfer'
           AND NOT EXISTS (
               SELECT 1 FROM financial_transactions ft
               WHERE ft.ref_type = 'shipment'
                 AND ft.ref_id   = orr.requesting_shipment_id
                 AND ft.event_type = 'bank_receipt'
           )
           AND (
               c.full_name    ILIKE $3 OR
               c.company_name ILIKE $3 OR
               p.full_name    ILIKE $3 OR
               o.cargo_name   ILIKE $3 OR
               sr.id::text    ILIKE $3
           )
         GROUP BY sr.id, orr.id, orr.order_id, orr.requesting_shipment_id,
                  o.cargo_name, c.full_name, c.company_name, c.phone,
                  p.full_name, p.phone, v.plate_number
         ORDER BY sr.collected_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, like],
    );
    return rows;
};

const countPendingBankTransfers = async (like) => {
    const { rows } = await pool.query(
        `SELECT COUNT(*) AS total
         FROM shipment_receipts sr
         JOIN order_receipt_requests orr ON orr.id = sr.order_receipt_request_id
         JOIN orders o                   ON o.id   = orr.order_id
         LEFT JOIN customers c           ON c.id   = o.customer_id
         LEFT JOIN profiles p            ON p.id   = orr.driver_id
         WHERE sr.payment_type = 'bank_transfer'
           AND NOT EXISTS (
               SELECT 1 FROM financial_transactions ft
               WHERE ft.ref_type = 'shipment'
                 AND ft.ref_id   = orr.requesting_shipment_id
                 AND ft.event_type = 'bank_receipt'
           )
           AND (
               c.full_name    ILIKE $1 OR
               c.company_name ILIKE $1 OR
               p.full_name    ILIKE $1 OR
               o.cargo_name   ILIKE $1 OR
               sr.id::text    ILIKE $1
           )`,
        [like],
    );
    return Number(rows[0].total);
};

// POST /api/accountant/receipts/:receiptId/confirm-bank-transfer
// Toàn bộ nghiệp vụ xác nhận chuyển khoản chạy trong 1 transaction (khóa dòng, ghi sổ,
// xử lý thiếu/thừa) — theo đúng pattern của debtRepository.confirmRepayment/voidRepayment.
const confirmBankTransfer = async (receiptId, accountantId, { notes, actualReceived }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(
            `SELECT sr.id AS sr_id, sr.amount, sr.payment_type,
                    orr.requesting_shipment_id AS shipment_id,
                    orr.order_id,
                    orr.driver_id,
                    o.customer_id
             FROM shipment_receipts sr
             JOIN order_receipt_requests orr ON orr.id = sr.order_receipt_request_id
             JOIN orders o ON o.id = orr.order_id
             WHERE sr.id = $1
             FOR UPDATE OF sr`,
            [receiptId],
        );
        const rec = rows[0];
        if (!rec) throw new Error('Không tìm thấy phiếu thu');
        if (rec.payment_type !== 'bank_transfer') throw new Error('Phiếu thu này không phải chuyển khoản');

        const { rows: ftRows } = await client.query(
            `SELECT 1 FROM financial_transactions
             WHERE ref_type = 'shipment' AND ref_id = $1 AND event_type = 'bank_receipt'`,
            [rec.shipment_id],
        );
        if (ftRows.length > 0) throw new Error('Phiếu thu này đã được xác nhận trước đó');

        const receiptAmount = Number(rec.amount);
        const diff          = actualReceived - receiptAmount; // dương = thừa, âm = thiếu
        const baseDesc      = notes
            ? `Kế toán xác nhận chuyển khoản — phiếu thu #${rec.sr_id}. ${notes}`
            : `Kế toán xác nhận chuyển khoản — phiếu thu #${rec.sr_id}`;

        const ftAmount = actualReceived > 0 ? actualReceived : receiptAmount;
        await client.query(
            `INSERT INTO financial_transactions
                (event_type, debit_account, credit_account, amount, description,
                 ref_type, ref_id, actor_id, occurred_at)
             VALUES ('bank_receipt', '1121', '131', $1, $2, 'shipment', $3, $4, NOW())`,
            [ftAmount, baseDesc, rec.shipment_id, accountantId],
        );

        let result = { confirmed: true, diff: 0, action: 'exact' };

        if (diff < -0.01) {
            const shortfall = Math.abs(diff);
            await client.query(
                `INSERT INTO debts
                    (debt_type, customer_id, order_id, shipment_id, total_amount,
                     due_date, notes, updated_by, created_at, updated_at)
                 VALUES ('customer', $1, $2, $3, $4,
                    CURRENT_DATE + INTERVAL '30 days',
                    $5, $6, NOW(), NOW())`,
                [
                    rec.customer_id, rec.order_id, rec.shipment_id, shortfall,
                    `Khách chuyển khoản thiếu ${shortfall.toLocaleString('vi-VN')}₫ so với phiếu thu #${rec.sr_id}`,
                    accountantId,
                ],
            );
            result = { confirmed: true, diff, action: 'short', shortfall };

        } else if (diff > 0.01 && rec.customer_id) {
            const excess = diff;
            // Postgres cấm FOR UPDATE + GROUP BY — dùng LATERAL để vẫn lock được dòng debts
            const { rows: oldDebts } = await client.query(
                `SELECT d.id AS debt_id,
                        GREATEST(0, d.total_amount - paid.paid) AS remaining
                 FROM debts d
                 LEFT JOIN LATERAL (
                     SELECT COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS paid
                     FROM debt_payments dp
                     WHERE dp.debt_id = d.id
                 ) paid ON TRUE
                 WHERE d.customer_id = $1
                   AND d.debt_type = 'customer'
                   AND d.order_id != $2
                   AND GREATEST(0, d.total_amount - paid.paid) > 0.01
                 ORDER BY d.created_at ASC, d.id ASC
                 FOR UPDATE OF d`,
                [rec.customer_id, rec.order_id],
            );

            let rem = excess;
            const ids = [], amounts = [];
            for (const debt of oldDebts) {
                if (rem < 0.01) break;
                const alloc = Math.min(rem, Number(debt.remaining));
                if (alloc < 0.01) continue;
                ids.push(Number(debt.debt_id));
                amounts.push(alloc);
                rem -= alloc;
            }
            if (ids.length > 0) {
                await client.query(
                    `INSERT INTO debt_payments
                         (debt_id, amount, payment_method, status,
                          paid_at, confirmed_at, confirmed_by, created_by, notes)
                     SELECT unnest($1::int[]), unnest($2::numeric[]),
                            'bank_transfer', 'confirmed', NOW(), NOW(), $3, $3, $4`,
                    [ids, amounts, accountantId,
                     `Phân bổ tự động từ phiếu thu #${rec.sr_id} — khách chuyển thừa`],
                );
            }
            result = { confirmed: true, diff, action: 'excess', excess, allocated: excess - rem };
        }

        await client.query('COMMIT');
        return { ...result, receiptId: rec.sr_id, driverId: rec.driver_id };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { getPendingBankTransfers, countPendingBankTransfers, confirmBankTransfer };
