const pool = require('../../config/database');

const getFinanceStats = async () => {

    const query = `
        WITH completed_revenue AS (
            SELECT COALESCE(SUM(os.actual_price), 0) AS total_revenue
            FROM order_shipments os
            JOIN orders o ON o.id = os.order_id
            WHERE o.derived_status = 'completed'
        ),
        outstanding_debts AS (
            SELECT
                COALESCE(SUM(GREATEST(d.total_amount - d.paid_amount, 0)), 0) AS total_receivables,
                COUNT(DISTINCT d.order_id)
                    FILTER (WHERE (d.total_amount - d.paid_amount) > 0.01) AS pending_count
            FROM debts d
            JOIN orders o ON o.id = d.order_id
            WHERE o.derived_status = 'completed'
              AND d.status != 'paid'
        )
        SELECT
            cr.total_revenue,
            GREATEST(cr.total_revenue - od.total_receivables, 0) AS total_collected,
            od.total_receivables,
            od.pending_count::int AS pending_payments_count
        FROM completed_revenue cr, outstanding_debts od
    `;
    const result = await pool.query(query);
    return result.rows[0];
};

module.exports = {
    getFinanceStats,
};
