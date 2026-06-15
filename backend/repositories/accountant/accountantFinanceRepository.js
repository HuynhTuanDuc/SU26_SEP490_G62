const pool = require('../../config/database');

/**
 * Tính tổng doanh thu + công nợ cho dashboard kế toán.
 *
 * - total_revenue     = SUM(order_shipments.actual_price) (doanh thu thực tế)
 * - total_collected   = SUM(confirmed debt_payments amount) cho mọi debt
 *                       thuộc các shipment trong hệ thống (gồm cả customer +
 *                       driver debt để khớp với "thu về")
 * - total_receivables = SUM(actual_price) - SUM(confirmed payments)
 *                       (số tiền còn phải thu từ khách + tài xế giữ tiền)
 * - pending_payments_count = số đơn còn nợ (status != 'paid')
 *
 * Lưu ý: "doanh thu" dùng actual_price (giá trị thực tế cuối cùng), không
 * dùng estimated_price. estimated_price chỉ để tham khảo.
 */
const getFinanceStats = async () => {
    const query = `
        WITH shipment_revenue AS (
            SELECT
                os.id            AS shipment_id,
                os.order_id,
                os.actual_price  AS actual_price
            FROM order_shipments os
        ),
        revenue_per_order AS (
            SELECT
                order_id,
                COALESCE(SUM(actual_price), 0) AS order_actual
            FROM shipment_revenue
            GROUP BY order_id
        ),
        order_remaining AS (
            SELECT
                rpo.order_id,
                GREATEST(rpo.order_actual - COALESCE(paid.amt, 0), 0) AS remaining
            FROM revenue_per_order rpo
            LEFT JOIN (
                SELECT
                    d.order_id,
                    SUM(dp.amount) AS amt
                FROM debts d
                JOIN debt_payments dp
                    ON dp.debt_id = d.id AND dp.status = 'confirmed'
                WHERE d.order_id IS NOT NULL
                GROUP BY d.order_id
            ) paid ON paid.order_id = rpo.order_id
        )
        SELECT
            COALESCE((SELECT SUM(actual_price) FROM shipment_revenue), 0) AS total_revenue,
            COALESCE((
                SELECT SUM(dp.amount)
                FROM debt_payments dp
                WHERE dp.status = 'confirmed'
            ), 0) AS total_collected,
            COALESCE((SELECT SUM(remaining) FROM order_remaining), 0) AS total_receivables,
            (
                SELECT COUNT(*)
                FROM order_remaining
                WHERE remaining > 0
            ) AS pending_payments_count
    `;
    const result = await pool.query(query);
    return result.rows[0];
};

module.exports = {
    getFinanceStats,
};
