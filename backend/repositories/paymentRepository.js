const pool = require('../config/database');

const recordCashPayment = async ({ shipmentId, amount, collectedBy, notes }) => {
    const result = await pool.query(
        `INSERT INTO shipment_receipts
             (shipment_id, payment_type, amount, collected_by, notes, collected_at)
         VALUES ($1, 'cash_collected', $2, $3, $4, NOW())
         RETURNING *`,
        [shipmentId, amount, collectedBy, notes ?? null],
    );
    return { payment: result.rows[0] };
};

const getPendingReceiptShell = async (shipmentId) => {
    const result = await pool.query(
        `SELECT *
         FROM shipment_receipts
         WHERE shipment_id = $1
           AND payment_type IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [shipmentId],
    );
    return result.rows[0] ?? null;
};

const confirmReceiptShell = async ({ paymentId, paymentType, amount, collectedBy, notes }) => {
    const result = await pool.query(
        `UPDATE shipment_receipts
         SET payment_type = $1,
             amount = $2,
             collected_by = $3,
             notes = $4,
             collected_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [paymentType, amount, collectedBy, notes ?? null, paymentId],
    );
    return result.rows[0] ?? null;
};

const addPaymentReceipt = async (paymentId, fileUrl) => {
    const result = await pool.query(
        `INSERT INTO payment_receipts (payment_id, file_url)
         VALUES ($1, $2)
         RETURNING *`,
        [paymentId, fileUrl],
    );
    return result.rows[0];
};

const getShipmentPayments = async (shipmentId) => {
    const result = await pool.query(
        `SELECT
            sp.id,
            sp.shipment_id,
            sp.payment_type,
            sp.amount::text,
            sp.notes,
            sp.collected_at,
            COALESCE(
                json_agg(pr.file_url ORDER BY pr.uploaded_at)
                FILTER (WHERE pr.id IS NOT NULL),
                '[]'::json
            ) AS receipt_urls
         FROM shipment_receipts sp
         LEFT JOIN payment_receipts pr ON pr.payment_id = sp.id
         WHERE sp.shipment_id = $1
           AND sp.payment_type IS NOT NULL
         GROUP BY sp.id
         ORDER BY sp.collected_at ASC`,
        [shipmentId],
    );
    return result.rows;
};

// Tổng hợp tài chính của 1 shipment — dùng để validate trước khi tạo payment/debt mới
const getShipmentFinancialSummary = async (shipmentId) => {
    const result = await pool.query(
        `SELECT
            COALESCE(os.actual_price, os.estimated_price, 0)          AS trip_value,
            o.payment_type                                             AS order_payment_type,
            COALESCE(o.prepaid_amount, 0)                              AS prepaid_amount,
            COALESCE(SUM(sp.amount) FILTER (WHERE sp.payment_type IS NOT NULL), 0) AS cash_collected,
            COALESCE(SUM(
                CASE WHEN d.debt_type = 'customer'
                     AND d.total_amount - COALESCE((
                         SELECT SUM(dp.amount) FROM debt_payments dp
                         WHERE dp.debt_id = d.id AND dp.status = 'confirmed'
                     ), 0) > 0.01
                THEN d.total_amount ELSE 0 END
            ), 0) AS customer_debt_total
         FROM order_shipments os
         JOIN orders o ON o.id = os.order_id
         LEFT JOIN shipment_receipts sp ON sp.shipment_id = os.id
         LEFT JOIN debts d ON d.shipment_id = os.id
         WHERE os.id = $1
         GROUP BY os.id, os.actual_price, os.estimated_price, o.payment_type, o.prepaid_amount`,
        [shipmentId],
    );
    const row = result.rows[0];
    if (!row) return null;

    const tripValue        = Number(row.trip_value);
    const prepaidAmount    = Number(row.prepaid_amount);
    const cashCollected    = Number(row.cash_collected);
    const customerDebt     = Number(row.customer_debt_total);
    const remaining        = tripValue > 0 ? tripValue - prepaidAmount - cashCollected - customerDebt : null;

    return {
        trip_value:           tripValue,
        order_payment_type:   row.order_payment_type,
        prepaid_amount:       prepaidAmount,
        cash_collected:       cashCollected,
        customer_debt_total:  customerDebt,
        remaining,            // null = không biết giá trị chuyến (chưa set actual_price/estimated_price)
    };
};

// Tạo driver debt ngay khi driver thu tiền mặt từ khách (§15 TH2)
const createDriverDebt = async ({ driverId, shipmentId, orderId, amount, notes }) => {
    await pool.query(
        `INSERT INTO debts
             (debt_type, driver_id, shipment_id, order_id, total_amount, notes)
         VALUES ('driver', $1, $2, $3, $4, $5)`,
        [driverId, shipmentId ?? null, orderId ?? null, amount, notes ?? null],
    );
};

// Tạo customer debt khi driver báo khách chưa trả (§15 TH3)
const createCustomerDebt = async ({ customerId, driverId, shipmentId, orderId, amount }) => {
    await pool.query(
        `INSERT INTO debts
             (debt_type, customer_id, driver_id, shipment_id, order_id, total_amount, created_at, updated_at)
         VALUES ('customer', $1, $2, $3, $4, $5, NOW(), NOW())`,
        [customerId, driverId, shipmentId ?? null, orderId ?? null, amount],
    );
};

const getPaymentById = async (paymentId) => {
    const result = await pool.query(
        `SELECT sp.id, sp.shipment_id, sp.payment_type, sp.amount::text, sp.collected_by,
                sp.notes, sp.collected_at,
                COALESCE(json_agg(pr.file_url ORDER BY pr.uploaded_at) FILTER (WHERE pr.id IS NOT NULL), '[]'::json) AS receipt_urls
         FROM shipment_receipts sp
         LEFT JOIN payment_receipts pr ON pr.payment_id = sp.id
         WHERE sp.id = $1
         GROUP BY sp.id`,
        [paymentId],
    );
    return result.rows[0] ?? null;
};

const updateShipmentPayment = async (paymentId, newAmount) => {
    const result = await pool.query(
        `UPDATE shipment_receipts SET amount = $1 WHERE id = $2 RETURNING *`,
        [newAmount, paymentId],
    );
    return result.rows[0];
};

const replacePaymentReceipts = async (paymentId, newFileUrl) => {
    await pool.query(`DELETE FROM payment_receipts WHERE payment_id = $1`, [paymentId]);
    const result = await pool.query(
        `INSERT INTO payment_receipts (payment_id, file_url) VALUES ($1, $2) RETURNING *`,
        [paymentId, newFileUrl],
    );
    return result.rows[0];
};

module.exports = {
    recordCashPayment, addPaymentReceipt, getShipmentPayments, getShipmentFinancialSummary,
    createDriverDebt, createCustomerDebt,
    getPaymentById, updateShipmentPayment, replacePaymentReceipts,
    getPendingReceiptShell, confirmReceiptShell,
};
