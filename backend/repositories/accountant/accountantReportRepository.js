const pool = require('../../config/database');

/**
 * Tổng quan báo cáo tài chính cho kế toán.
 * Gồm: doanh thu theo tháng, top khách hàng, nợ quá hạn, tóm tắt lương.
 */
const getReportOverview = async ({ months = 6 } = {}) => {
    const [
        revenueChart,
        topCustomers,
        debtAging,
        payrollSummary,
        revenueByPaymentType,
    ] = await Promise.all([
        _getMonthlyRevenue(months),
        _getTopCustomers(),
        _getDebtAging(),
        _getPayrollSummary(),
        _getRevenueByPaymentType(months),
    ]);

    return {
        revenueChart,
        topCustomers,
        debtAging,
        payrollSummary,
        revenueByPaymentType,
    };
};

// ─── Doanh thu theo tháng (N tháng gần nhất) ─────────────────────────────────
const _getMonthlyRevenue = async (months) => {
    const { rows } = await pool.query(`
        WITH month_series AS (
            SELECT generate_series(
                DATE_TRUNC('month', NOW() - ($1 - 1) * INTERVAL '1 month'),
                DATE_TRUNC('month', NOW()),
                INTERVAL '1 month'
            )::DATE AS month
        )
        SELECT
            TO_CHAR(ms.month, 'MM/YYYY')          AS label,
            COALESCE(SUM(os.actual_price), 0)::float AS revenue,
            COUNT(DISTINCT o.id)::int              AS order_count
        FROM month_series ms
        LEFT JOIN orders o
            ON DATE_TRUNC('month', o.created_at) = ms.month
            AND o.derived_status = 'completed'
        LEFT JOIN order_shipments os
            ON os.order_id = o.id
        GROUP BY ms.month
        ORDER BY ms.month
    `, [months]);
    return rows;
};

// ─── Top 10 khách hàng theo doanh thu ────────────────────────────────────────
const _getTopCustomers = async () => {
    const { rows } = await pool.query(`
        SELECT
            COALESCE(c.full_name, c.company_name, 'Không tên') AS name,
            c.phone,
            c.company_name,
            COUNT(DISTINCT o.id)::int                          AS total_orders,
            COALESCE(SUM(os.actual_price), 0)::float           AS total_revenue,
            COALESCE(
                SUM(GREATEST(d.total_amount - d.paid_amount, 0))
                FILTER (WHERE d.status != 'paid'), 0
            )::float AS outstanding_debt
        FROM customers c
        JOIN orders o ON o.customer_id = c.id
        JOIN order_shipments os ON os.order_id = o.id
        LEFT JOIN debts d ON d.order_id = o.id AND d.debt_type = 'customer'
        WHERE o.derived_status = 'completed'
        GROUP BY c.id, c.full_name, c.phone, c.company_name
        ORDER BY total_revenue DESC
        LIMIT 10
    `);
    return rows;
};

// ─── Nợ quá hạn theo nhóm ngày (aging) ───────────────────────────────────────
const _getDebtAging = async () => {
    const { rows } = await pool.query(`
        SELECT
            COALESCE(SUM(GREATEST(d.total_amount - d.paid_amount, 0))
                FILTER (WHERE NOW() - d.created_at <= INTERVAL '30 days'), 0)::float
                AS d0_30,
            COALESCE(SUM(GREATEST(d.total_amount - d.paid_amount, 0))
                FILTER (WHERE NOW() - d.created_at > INTERVAL '30 days'
                          AND NOW() - d.created_at <= INTERVAL '60 days'), 0)::float
                AS d30_60,
            COALESCE(SUM(GREATEST(d.total_amount - d.paid_amount, 0))
                FILTER (WHERE NOW() - d.created_at > INTERVAL '60 days'
                          AND NOW() - d.created_at <= INTERVAL '90 days'), 0)::float
                AS d60_90,
            COALESCE(SUM(GREATEST(d.total_amount - d.paid_amount, 0))
                FILTER (WHERE NOW() - d.created_at > INTERVAL '90 days'), 0)::float
                AS d90_plus
        FROM debts d
        WHERE d.status != 'paid'
          AND d.debt_type = 'customer'
    `);
    return rows[0];
};

// ─── Tóm tắt lương tháng hiện tại ────────────────────────────────────────────
const _getPayrollSummary = async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const { rows } = await pool.query(`
        SELECT
            status,
            COUNT(*)::int         AS count,
            COALESCE(SUM(net_salary), 0)::float AS total_net
        FROM payrolls
        WHERE payroll_month = $1 AND payroll_year = $2
        GROUP BY status
    `, [month, year]);

    const summary = { month, year, pending: 0, reviewed: 0, approved: 0, paid: 0, total_net: 0 };
    for (const row of rows) {
        summary[row.status] = row.count;
        summary.total_net  += row.total_net;
    }
    return summary;
};

// ─── Doanh thu theo hình thức thanh toán (N tháng gần nhất) ──────────────────
const _getRevenueByPaymentType = async (months) => {
    const { rows } = await pool.query(`
        SELECT
            o.payment_type,
            COALESCE(SUM(os.actual_price), 0)::float AS revenue,
            COUNT(DISTINCT o.id)::int AS count
        FROM order_shipments os
        JOIN orders o ON o.id = os.order_id
        WHERE o.derived_status = 'completed'
          AND o.created_at >= NOW() - $1 * INTERVAL '1 month'
        GROUP BY o.payment_type
        ORDER BY revenue DESC
    `, [months]);
    return rows;
};

module.exports = { getReportOverview };
