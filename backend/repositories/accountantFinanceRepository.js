const pool = require('../config/database');

const getFinanceStats = async () => {

    const query = `
        WITH order_stats AS (
            SELECT
                o.id,
                COALESCE(ship_sum.actual_price, 0)      AS actual_price,
                -- Khách phải trả = cước + chi hộ khách (nợ & phiếu thu đều gồm chi hộ)
                COALESCE(ship_sum.actual_price, 0) + COALESCE(pt.pass_through_total, 0) AS collectible,
                COALESCE(cust.remaining, 0)             AS customer_remaining,
                COALESCE(drv.remaining, 0)              AS driver_remaining,
                COALESCE(pending.receipt_remaining, 0)  AS pending_receipt_remaining
            FROM orders o
            LEFT JOIN (
                SELECT order_id, COALESCE(SUM(actual_price), 0) AS actual_price
                FROM order_shipments
                GROUP BY order_id
            ) ship_sum ON ship_sum.order_id = o.id
            LEFT JOIN (
                SELECT os.order_id,
                       COALESCE(SUM(e.amount) FILTER (WHERE e.expense_type IN ('toll','parking','etc')), 0) AS pass_through_total
                FROM expenses e
                JOIN order_shipments os ON os.id = e.shipment_id
                WHERE e.status != 'rejected'
                GROUP BY os.order_id
            ) pt ON pt.order_id = o.id
            LEFT JOIN (
                SELECT d.order_id,
                       GREATEST(
                           SUM(d.total_amount)
                           - COALESCE(SUM(dp_agg.paid), 0),
                           0
                       ) AS remaining
                FROM debts d
                LEFT JOIN (
                    SELECT debt_id, COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
                    FROM debt_payments
                    GROUP BY debt_id
                ) dp_agg ON dp_agg.debt_id = d.id
                WHERE d.debt_type = 'customer'
                GROUP BY d.order_id
            ) cust ON cust.order_id = o.id
            LEFT JOIN (
                SELECT d.order_id,
                       GREATEST(
                           SUM(d.total_amount)
                           - COALESCE(SUM(dp_agg.paid), 0),
                           0
                       ) AS remaining
                FROM debts d
                LEFT JOIN (
                    SELECT debt_id, COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
                    FROM debt_payments
                    GROUP BY debt_id
                ) dp_agg ON dp_agg.debt_id = d.id
                WHERE d.debt_type = 'driver'
                GROUP BY d.order_id
            ) drv ON drv.order_id = o.id
            LEFT JOIN (
                SELECT rr.order_id,
                       COALESCE(SUM(sr.amount), 0) AS receipt_remaining
                FROM shipment_receipts sr
                JOIN order_receipt_requests rr ON rr.id = sr.order_receipt_request_id
                WHERE sr.payment_type IS NULL
                GROUP BY rr.order_id
            ) pending ON pending.order_id = o.id
            WHERE o.derived_status = 'completed'
        )
        SELECT
            SUM(actual_price)::numeric AS total_gross_revenue,
            SUM(GREATEST(
                collectible - customer_remaining - driver_remaining - pending_receipt_remaining,
                0
            ))::numeric AS total_revenue,
            SUM(GREATEST(
                collectible - customer_remaining - driver_remaining - pending_receipt_remaining,
                0
            ))::numeric AS total_collected,
            (SUM(customer_remaining) + SUM(driver_remaining) + SUM(pending_receipt_remaining))::numeric AS total_receivables,
            COUNT(*) FILTER (
                WHERE customer_remaining + driver_remaining + pending_receipt_remaining > 0.01
            )::int AS pending_payments_count
        FROM order_stats
    `;
    // Tiền tài xế đã ứng túi (chi hộ khách/chi phí công ty) chờ công ty hoàn lại —
    // đã duyệt nhưng chưa cấn trừ nợ (TH2) và chưa hoàn qua lương (TH1)
    const reimbursableQuery = `
        SELECT COALESCE(SUM(amount), 0)::numeric AS total_reimbursable
        FROM expenses
        WHERE status = 'approved' AND reimbursement_status = 'pending'
    `;

    const [result, reimbResult] = await Promise.all([
        pool.query(query),
        pool.query(reimbursableQuery),
    ]);
    const row = result.rows[0];
    return {
        total_gross_revenue:    Number(row.total_gross_revenue)    || 0,
        total_revenue:          Number(row.total_revenue)          || 0,
        total_collected:        Number(row.total_collected)        || 0,
        total_receivables:      Number(row.total_receivables)      || 0,
        pending_payments_count: Number(row.pending_payments_count) || 0,
        total_reimbursable:     Number(reimbResult.rows[0].total_reimbursable) || 0,
    };
};

module.exports = {
    getFinanceStats,
};
