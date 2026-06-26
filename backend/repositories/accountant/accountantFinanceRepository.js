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
    // total_receivables = tổng công nợ chưa thu (customer + driver) của đơn đã hoàn thành
    // total_collected   = total_revenue - total_receivables (tránh double-count)
    // pending_count     = số đơn còn có ít nhất 1 khoản nợ chưa thu đủ
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
