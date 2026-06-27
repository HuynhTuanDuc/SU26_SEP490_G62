const pool = require('../../config/database');

const INSURANCE_SALARY_BASE = 5_310_000;
const BHXH_EMPLOYEE         = Math.round(INSURANCE_SALARY_BASE * 0.105); // 557,550
const BHXH_COMPANY          = Math.round(INSURANCE_SALARY_BASE * 0.215); // 1,141,650
const PHONE_ALLOWANCE        = 200_000;
const BASE_SALARY_JUNIOR     = 8_000_000;  // < 12 months service
const BASE_SALARY_SENIOR     = 9_000_000;  // >= 12 months service
const WORKING_DAYS_PER_MONTH = 28;

// ─── Helper: calculate one driver's payroll components ───────────────────────
const _calcDriverPayroll = async (client, driver, month, year) => {
    const hireDate        = new Date(driver.hire_date);
    const now             = new Date();
    const monthsOfService = (now.getFullYear() - hireDate.getFullYear()) * 12
                          + (now.getMonth() - hireDate.getMonth());
    const baseSalary      = monthsOfService >= 12 ? BASE_SALARY_SENIOR : BASE_SALARY_JUNIOR;
    const revenuePct      = Number(driver.revenue_share_percent ?? 15);

    // Unpaid leave days this month
    const { rows: [leaveRow] } = await client.query(`
        SELECT COUNT(*) FILTER (WHERE leave_type = 'unpaid' AND status = 'approved')::int AS unpaid_days
        FROM leave_requests
        WHERE driver_id = $1
          AND EXTRACT(MONTH FROM leave_date) = $2
          AND EXTRACT(YEAR  FROM leave_date) = $3
    `, [driver.driver_id, month, year]);
    const unpaidDays     = Number(leaveRow.unpaid_days ?? 0);
    const actualWorkDays = Math.max(0, WORKING_DAYS_PER_MONTH - unpaidDays);
    const proRatedBase   = Math.round((baseSalary / WORKING_DAYS_PER_MONTH) * actualWorkDays);
    const absencePenalty = baseSalary - proRatedBase;

    // KPI revenue + bonus eligibility
    const { rows: [kpi] } = await client.query(`
        SELECT
            COALESCE(k.total_revenue, 0)                             AS total_revenue,
            lb.revenue_rank,
            br_kpi.reward_amount                                      AS kpi_bonus_reward,
            (br_kpi.conditions_json->>'min_revenue')::numeric         AS kpi_threshold,
            br_top.reward_amount                                      AS top_driver_reward
        FROM kpi_records k
        LEFT JOIN v_leaderboard lb
            ON lb.driver_id = k.driver_id
           AND lb.vehicle_group_id = k.vehicle_group_id
           AND lb.year = k.year AND lb.month = k.month
        LEFT JOIN LATERAL (
            SELECT reward_amount, conditions_json
            FROM bonus_rules
            WHERE vehicle_group_id = k.vehicle_group_id
              AND bonus_type = 'kpi'
              AND is_active = TRUE
            ORDER BY id LIMIT 1
        ) br_kpi ON TRUE
        LEFT JOIN LATERAL (
            SELECT reward_amount
            FROM bonus_rules
            WHERE vehicle_group_id = k.vehicle_group_id
              AND bonus_type = 'top_revenue'
              AND is_active = TRUE
            ORDER BY id LIMIT 1
        ) br_top ON TRUE
        WHERE k.driver_id = $1 AND k.month = $2 AND k.year = $3
    `, [driver.driver_id, month, year]);

    const totalRevenue   = Number(kpi?.total_revenue ?? 0);
    const revenueBonus   = Math.round(totalRevenue * (revenuePct / 100));
    const kpiBonus       = (kpi?.kpi_bonus_reward && kpi?.kpi_threshold
                           && totalRevenue >= Number(kpi.kpi_threshold))
                         ? Number(kpi.kpi_bonus_reward) : 0;
    const topDriverBonus = (Number(kpi?.revenue_rank) === 1 && kpi?.top_driver_reward)
                         ? Number(kpi.top_driver_reward) : 0;

    // Salary advance deductions approved/paid this month
    const { rows: [advRow] } = await client.query(`
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM salary_advances
        WHERE driver_id = $1
          AND request_month = $2 AND request_year = $3
          AND status IN ('approved','paid')
    `, [driver.driver_id, month, year]);
    const advanceDeduction = Number(advRow.total ?? 0);

    // Outstanding driver debt (capped at net salary after other deductions)
    const { rows: [debtRow] } = await client.query(`
        SELECT COALESCE(SUM(total_amount - paid_amount), 0)::numeric AS remaining
        FROM debts
        WHERE driver_id = $1
          AND debt_type = 'driver'
          AND status IN ('unpaid','partial','overdue')
    `, [driver.driver_id]);
    const totalDebt    = Number(debtRow.remaining ?? 0);
    // Gross = proRatedBase + revenueBonus + PHONE_ALLOWANCE + kpiBonus + topDriverBonus
    const gross        = proRatedBase + revenueBonus + PHONE_ALLOWANCE + kpiBonus + topDriverBonus;
    const netBeforeDebt= gross - BHXH_EMPLOYEE - advanceDeduction - absencePenalty;
    // Carry-forward rule: deduct only what's available; remainder carries to next month
    const driverDebtDeduction = Math.min(totalDebt, Math.max(0, netBeforeDebt));

    return {
        monthsOfService,
        baseSalary,           // full base (8M or 9M)
        proRatedBase,         // actual base after unpaid days
        absencePenalty,
        totalRevenue,
        revenuePct,
        revenueBonus,
        kpiBonus,
        topDriverBonus,
        phoneAllowance: PHONE_ALLOWANCE,
        advanceDeduction,
        driverDebtDeduction,
        gross,
    };
};

// ─── Get all payrolls for a given month/year ─────────────────────────────────
const getAllPayrolls = async ({ month, year, status = null, search = null }) => {
    const params = [month, year];
    const conditions = ['p.payroll_month = $1', 'p.payroll_year = $2'];

    if (status) {
        params.push(status);
        conditions.push(`p.status = $${params.length}`);
    }
    if (search) {
        params.push(`%${search}%`);
        conditions.push(`pr.full_name ILIKE $${params.length}`);
    }

    const { rows } = await pool.query(`
        SELECT
            p.id, p.driver_id, p.payroll_month, p.payroll_year,
            p.base_salary::text,
            p.months_of_service,
            p.total_revenue::text,
            p.revenue_share_pct::text,
            p.revenue_bonus::text,
            p.kpi_bonus::text,
            p.top_driver_bonus::text,
            p.other_bonus::text,
            p.insurance_employee::text,
            p.driver_debt_deduction::text,
            p.advance_deduction::text,
            p.absence_penalty::text,
            p.other_deduction::text,
            p.gross_salary::text,
            p.net_salary::text,
            p.status,
            p.reviewed_at, p.approved_at, p.paid_at,
            p.created_at, p.updated_at,
            pr.full_name  AS driver_name,
            pr.phone      AS driver_phone,
            COALESCE(vg.name, '')       AS vehicle_group,
            COALESCE(v.plate_number, '') AS plate_number
        FROM payrolls p
        JOIN  profiles pr ON pr.id = p.driver_id
        LEFT JOIN drivers d ON d.profile_id = p.driver_id
        LEFT JOIN vehicles v ON v.id = d.vehicle_id
        LEFT JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY pr.full_name
    `, params);

    return rows;
};

// ─── Get summary stats for a period ─────────────────────────────────────────
const getPayrollStats = async ({ month, year }) => {
    const { rows: [row] } = await pool.query(`
        SELECT
            COUNT(*)                                         AS total_drivers,
            COUNT(*) FILTER (WHERE status = 'pending')      AS pending_count,
            COUNT(*) FILTER (WHERE status = 'reviewed')     AS reviewed_count,
            COUNT(*) FILTER (WHERE status = 'approved')     AS approved_count,
            COUNT(*) FILTER (WHERE status = 'paid')         AS paid_count,
            COALESCE(SUM(gross_salary), 0)::text            AS total_gross,
            COALESCE(SUM(net_salary),   0)::text            AS total_net
        FROM payrolls
        WHERE payroll_month = $1 AND payroll_year = $2
    `, [month, year]);
    return row;
};

// ─── Generate / recalculate payrolls for all active drivers ─────────────────
// Idempotent: updates pending records, skips reviewed/approved/paid ones
const calculateAndUpsertPayrolls = async (month, year) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: drivers } = await client.query(`
            SELECT d.profile_id AS driver_id,
                   d.hire_date,
                   d.revenue_share_percent
            FROM drivers d
            JOIN accounts a ON a.id = d.profile_id
            WHERE a.is_active = TRUE
        `);

        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const driver of drivers) {
            const c = await _calcDriverPayroll(client, driver, month, year);

            const { rows: [upserted] } = await client.query(`
                INSERT INTO payrolls (
                    driver_id, payroll_month, payroll_year,
                    base_salary, months_of_service,
                    total_revenue, revenue_share_pct, revenue_bonus,
                    kpi_bonus, top_driver_bonus,
                    overtime_bonus, holiday_bonus, other_bonus,
                    insurance_employee, insurance_company,
                    driver_debt_deduction, advance_deduction,
                    absence_penalty, other_deduction,
                    status
                ) VALUES (
                    $1, $2, $3,
                    $4, $5,
                    $6, $7, $8,
                    $9, $10,
                    0, 0, $11,
                    $12, $13,
                    $14, $15,
                    $16, 0,
                    'pending'
                )
                ON CONFLICT (driver_id, payroll_month, payroll_year)
                DO UPDATE SET
                    base_salary            = EXCLUDED.base_salary,
                    months_of_service      = EXCLUDED.months_of_service,
                    total_revenue          = EXCLUDED.total_revenue,
                    revenue_share_pct      = EXCLUDED.revenue_share_pct,
                    revenue_bonus          = EXCLUDED.revenue_bonus,
                    kpi_bonus              = EXCLUDED.kpi_bonus,
                    top_driver_bonus       = EXCLUDED.top_driver_bonus,
                    other_bonus            = EXCLUDED.other_bonus,
                    insurance_employee     = EXCLUDED.insurance_employee,
                    insurance_company      = EXCLUDED.insurance_company,
                    driver_debt_deduction  = EXCLUDED.driver_debt_deduction,
                    advance_deduction      = EXCLUDED.advance_deduction,
                    absence_penalty        = EXCLUDED.absence_penalty,
                    updated_at             = NOW()
                WHERE payrolls.status = 'pending'
                RETURNING (xmax = 0) AS is_insert
            `, [
                driver.driver_id, month, year,
                c.baseSalary, c.monthsOfService,
                c.totalRevenue, c.revenuePct, c.revenueBonus,
                c.kpiBonus, c.topDriverBonus,
                PHONE_ALLOWANCE,
                BHXH_EMPLOYEE, BHXH_COMPANY,
                c.driverDebtDeduction, c.advanceDeduction,
                c.absencePenalty,
            ]);

            if (!upserted) { skipped++; }
            else if (upserted.is_insert) { created++; }
            else { updated++; }
        }

        await client.query('COMMIT');
        return { total: drivers.length, created, updated, skipped };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// ─── Confirm payroll (reviewed → approved) ───────────────────────────────────
const confirmPayroll = async (payrollId, accountantId) => {
    const { rows: [row] } = await pool.query(`
        UPDATE payrolls
        SET status      = 'approved',
            approved_by = $2,
            approved_at = NOW(),
            updated_at  = NOW()
        WHERE id = $1
          AND status = 'reviewed'
        RETURNING *
    `, [payrollId, accountantId]);

    if (!row) throw new Error('Không tìm thấy phiếu lương hoặc trạng thái không hợp lệ (cần reviewed)');
    return row;
};

// ─── Mark payroll as paid (approved → paid) ──────────────────────────────────
const markPayrollPaid = async (payrollId, accountantId) => {
    const { rows: [row] } = await pool.query(`
        UPDATE payrolls
        SET status  = 'paid',
            paid_by = $2,
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND status = 'approved'
        RETURNING *
    `, [payrollId, accountantId]);

    if (!row) throw new Error('Không tìm thấy phiếu lương hoặc trạng thái không hợp lệ (cần approved)');
    return row;
};

// ─── Salary Advances ─────────────────────────────────────────────────────────
const getSalaryAdvances = async ({ status = null, month = null, year = null, search = null }) => {
    const params = [];
    const conditions = [];

    if (status) { params.push(status); conditions.push(`sa.status = $${params.length}`); }
    if (month)  { params.push(month);  conditions.push(`sa.request_month = $${params.length}`); }
    if (year)   { params.push(year);   conditions.push(`sa.request_year = $${params.length}`); }
    if (search) {
        params.push(`%${search}%`);
        conditions.push(`pr.full_name ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(`
        SELECT
            sa.id, sa.driver_id,
            sa.amount::text,
            sa.reason, sa.request_month, sa.request_year,
            sa.status, sa.reject_reason,
            sa.approved_at, sa.paid_at,
            sa.created_at,
            pr.full_name AS driver_name,
            pr.phone     AS driver_phone
        FROM salary_advances sa
        JOIN profiles pr ON pr.id = sa.driver_id
        ${where}
        ORDER BY sa.created_at DESC
    `, params);

    return rows;
};

// ─── Disburse salary advance (approved → paid) ───────────────────────────────
const disburseAdvance = async (advanceId, accountantId, { notes = null } = {}) => {
    const { rows: [row] } = await pool.query(`
        UPDATE salary_advances
        SET status  = 'paid',
            paid_by = $2,
            paid_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND status = 'approved'
        RETURNING *
    `, [advanceId, accountantId]);

    if (!row) throw new Error('Không tìm thấy yêu cầu ứng lương hoặc chưa được manager duyệt');
    return row;
};

module.exports = {
    getAllPayrolls,
    getPayrollStats,
    calculateAndUpsertPayrolls,
    confirmPayroll,
    markPayrollPaid,
    getSalaryAdvances,
    disburseAdvance,
};
