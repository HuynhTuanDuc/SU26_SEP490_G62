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
                COALESCE(SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0)), 0) AS total_receivables,
                COUNT(DISTINCT d.order_id)
                    FILTER (WHERE (d.total_amount - COALESCE(dp_agg.paid, 0)) > 0.01) AS pending_count
            FROM debts d
            LEFT JOIN (
                SELECT debt_id, COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
                FROM debt_payments GROUP BY debt_id
            ) dp_agg ON dp_agg.debt_id = d.id
            JOIN orders o ON o.id = d.order_id
            WHERE o.derived_status = 'completed'
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
