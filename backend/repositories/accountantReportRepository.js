const pool = require('../config/database');

const getReportOverview = async ({ months = 6, granularity = 'month' } = {}) => {
    const [
        revenueChart,
        topCustomers,
        debtAging,
        payrollSummary,
        revenueByVehicle,
        driverHoldings,
    ] = await Promise.all([
        _getRevenueTrend(granularity, months),
        _getTopCustomers(),
        _getDebtAging(),
        _getPayrollSummary(),
        _getRevenueByVehicle(months),
        _getDriverHoldings(),
    ]);

    return {
        revenueChart,
        topCustomers,
        debtAging,
        payrollSummary,
        revenueByVehicle,
        driverHoldings,
    };
};

// Xu hướng doanh thu theo ngày / tuần / tháng.
// Doanh thu tính theo completed_at của chuyến (đúng ngày chạy — nhất quán KPI/lương/sổ).
// Cửa sổ thời gian: day = 30 ngày, week = 12 tuần, month = theo bộ lọc months.
const _getRevenueTrend = async (granularity, months) => {
    const CONFIG = {
        day:   { trunc: 'day',   step: '1 day',   span: `29 days`,               labelFmt: 'DD/MM' },
        week:  { trunc: 'week',  step: '1 week',  span: `11 weeks`,              labelFmt: '"T"DD/MM' },
        month: { trunc: 'month', step: '1 month', span: `${months - 1} months`,  labelFmt: 'MM/YYYY' },
    };
    const cfg = CONFIG[granularity] ?? CONFIG.month;

    const { rows } = await pool.query(`
        WITH bucket_series AS (
            SELECT generate_series(
                DATE_TRUNC('${cfg.trunc}', NOW() - INTERVAL '${cfg.span}'),
                DATE_TRUNC('${cfg.trunc}', NOW()),
                INTERVAL '${cfg.step}'
            )::DATE AS bucket
        )
        SELECT
            TO_CHAR(bs.bucket, '${cfg.labelFmt}')       AS label,
            COALESCE(SUM(os.actual_price), 0)::float    AS revenue,
            COUNT(DISTINCT os.order_id)::int            AS order_count
        FROM bucket_series bs
        LEFT JOIN order_shipments os
            ON DATE_TRUNC('${cfg.trunc}', os.completed_at) = bs.bucket
            AND os.status = 'completed'
        GROUP BY bs.bucket
        ORDER BY bs.bucket
    `);
    return rows;
};

const _getTopCustomers = async () => {
    const { rows } = await pool.query(`
        SELECT
            COALESCE(c.full_name, c.company_name, 'KhÃ´ng tÃªn') AS name,
            c.phone,
            c.company_name,
            COUNT(DISTINCT o.id)::int                          AS total_orders,
            COALESCE(SUM(os.actual_price), 0)::float           AS total_revenue,
            COALESCE(
                SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0)), 0
            )::float AS outstanding_debt
        FROM customers c
        JOIN orders o ON o.customer_id = c.id
        JOIN order_shipments os ON os.order_id = o.id
        LEFT JOIN debts d ON d.order_id = o.id AND d.debt_type = 'customer'
        LEFT JOIN (
            SELECT debt_id, COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
            FROM debt_payments GROUP BY debt_id
        ) dp_agg ON dp_agg.debt_id = d.id
        WHERE o.derived_status = 'completed'
        GROUP BY c.id, c.full_name, c.phone, c.company_name
        ORDER BY total_revenue DESC
        LIMIT 10
    `);
    return rows;
};

const _getDebtAging = async () => {
    const { rows } = await pool.query(`
        WITH dp_agg AS (
            SELECT debt_id, COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
            FROM debt_payments GROUP BY debt_id
        )
        SELECT
            COALESCE(SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0))
                FILTER (WHERE NOW() - d.created_at <= INTERVAL '30 days'), 0)::float
                AS d0_30,
            COALESCE(SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0))
                FILTER (WHERE NOW() - d.created_at > INTERVAL '30 days'
                          AND NOW() - d.created_at <= INTERVAL '60 days'), 0)::float
                AS d30_60,
            COALESCE(SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0))
                FILTER (WHERE NOW() - d.created_at > INTERVAL '60 days'
                          AND NOW() - d.created_at <= INTERVAL '90 days'), 0)::float
                AS d60_90,
            COALESCE(SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0))
                FILTER (WHERE NOW() - d.created_at > INTERVAL '90 days'), 0)::float
                AS d90_plus
        FROM debts d
        LEFT JOIN dp_agg ON dp_agg.debt_id = d.id
        WHERE GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0) > 0.01
          AND d.debt_type = 'customer'
    `);
    return rows[0];
};

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

// Doanh thu theo từng xe (cước thuần, chuyến hoàn thành trong kỳ)
const _getRevenueByVehicle = async (months) => {
    const { rows } = await pool.query(`
        SELECT
            v.plate_number,
            vg.name AS vehicle_group_name,
            COALESCE(SUM(os.actual_price), 0)::float AS revenue,
            COUNT(os.id)::int AS trip_count
        FROM order_shipments os
        JOIN v_shipment_current sc ON sc.shipment_id = os.id
        JOIN vehicles v ON v.id = sc.vehicle_id
        LEFT JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
        WHERE os.status = 'completed'
          AND os.completed_at >= NOW() - $1 * INTERVAL '1 month'
        GROUP BY v.plate_number, vg.name
        ORDER BY revenue DESC
        LIMIT 12
    `, [months]);
    return rows;
};

// Tiền tài xế đang cầm (nợ driver còn lại, tính động từ debt_payments confirmed)
const _getDriverHoldings = async () => {
    const { rows } = await pool.query(`
        WITH dp_agg AS (
            SELECT debt_id, COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid
            FROM debt_payments GROUP BY debt_id
        )
        SELECT
            p.full_name AS driver_name,
            COALESCE(SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0)), 0)::float AS holding,
            COUNT(d.id) FILTER (WHERE GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0) > 0.01)::int AS debt_count
        FROM debts d
        JOIN profiles p ON p.id = d.driver_id
        LEFT JOIN dp_agg ON dp_agg.debt_id = d.id
        WHERE d.debt_type = 'driver'
        GROUP BY p.id, p.full_name
        HAVING COALESCE(SUM(GREATEST(d.total_amount - COALESCE(dp_agg.paid, 0), 0)), 0) > 0.01
        ORDER BY holding DESC
        LIMIT 10
    `);
    return rows;
};

module.exports = { getReportOverview };

