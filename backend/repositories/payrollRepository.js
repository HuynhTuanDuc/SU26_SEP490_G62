const pool = require('../config/database');
const revenueAllocationRepository = require('./revenueAllocationRepository');

// ─── Payroll ─────────────────────────────────────────────────────────────────

const getDriverPayrolls = async (driverId, { month = null, year = null } = {}) => {
    const conditions = ['driver_id = $1'];
    const params = [driverId];
    if (year)  { params.push(year);  conditions.push(`payroll_year = $${params.length}`); }
    if (month) { params.push(month); conditions.push(`payroll_month = $${params.length}`); }

    const result = await pool.query(
        `SELECT
            id, payroll_month, payroll_year,
            base_salary::text,
            months_of_service,
            total_revenue::text,
            revenue_share_pct::text,
            revenue_bonus::text,
            kpi_bonus::text,
            top_driver_bonus::text,
            overtime_bonus::text,
            holiday_bonus::text,
            other_bonus::text,
            insurance_employee::text,
            driver_debt_deduction::text,
            advance_deduction::text,
            absence_penalty::text,
            other_deduction::text,
            expense_reimbursement::text,
            gross_salary::text,
            net_salary::text,
            status,
            paid_at
         FROM payrolls
         WHERE ${conditions.join(' AND ')}
         ORDER BY payroll_year DESC, payroll_month DESC`,
        params,
    );
    return result.rows;
};

// ─── Salary Advance ───────────────────────────────────────────────────────────

const createSalaryAdvance = async ({ driverId, amount, reason, requestMonth, requestYear }) => {
    // Một tháng chỉ được có 1 request đang pending/approved
    const existing = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS active_total
         FROM salary_advances
         WHERE driver_id = $1
           AND request_month = $2
           AND request_year  = $3
           AND status IN ('pending','approved','paid')`,
        [driverId, requestMonth, requestYear],
    );
    const activeTotal = Number(existing.rows[0]?.active_total ?? 0);
    if (activeTotal + Number(amount) > MAX_ADVANCE_AMOUNT) {
        const remaining = Math.max(0, MAX_ADVANCE_AMOUNT - activeTotal);
        throw new Error(`Tổng tiền ứng lương trong tháng không được vượt quá ${MAX_ADVANCE_AMOUNT.toLocaleString('vi-VN')}đ. Còn có thể ứng: ${remaining.toLocaleString('vi-VN')}đ`);
    }

    const result = await pool.query(
        `INSERT INTO salary_advances
             (driver_id, amount, reason, request_month, request_year, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING *`,
        [driverId, amount, reason ?? null, requestMonth, requestYear],
    );
    return result.rows[0];
};

const getDriverAdvances = async (driverId, { status = null } = {}) => {
    const params = [driverId];
    let where = 'WHERE driver_id = $1';
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }

    const result = await pool.query(
        `SELECT id, amount::text, reason, request_month, request_year,
                status, reject_reason, created_at, paid_at
         FROM salary_advances
         ${where}
         ORDER BY created_at DESC`,
        params,
    );
    return result.rows;
};

// ─── Estimate lương tháng hiện tại (computed, không phải finalized) ───────────
// Công thức: (base/28) × working_days + revenue_share% + phụ cấp + thưởng − BHXH − advance − driver_debt
// BHXH người lao động: vùng I 2025 → mức lương cơ sở 5,310,000 × 10.5%

const INSURANCE_SALARY_BASE = 5_310_000;
const BHXH_EMPLOYEE         = Math.round(INSURANCE_SALARY_BASE * 0.105);
const PHONE_ALLOWANCE        = 200_000;
const MAX_ADVANCE_AMOUNT     = 5_000_000;

const getMonthsOfServiceAtPeriodEnd = (hireDateValue, month, year) => {
    const hireDate = new Date(hireDateValue);
    const periodEnd = new Date(Number(year), Number(month), 0);
    let months = (periodEnd.getFullYear() - hireDate.getFullYear()) * 12
        + (periodEnd.getMonth() - hireDate.getMonth());
    if (periodEnd.getDate() < hireDate.getDate()) months -= 1;
    return Math.max(0, months);
};

const getPayrollEstimate = async (driverId, { month, year }) => {
    await revenueAllocationRepository.ensureRevenueAllocationTable();

    // 1. Thông tin driver
    const driverRes = await pool.query(
        `SELECT d.hire_date, d.revenue_share_percent
         FROM drivers d WHERE d.profile_id = $1`,
        [driverId],
    );
    if (!driverRes.rows[0]) throw new Error('Driver không tồn tại');
    const { hire_date, revenue_share_percent } = driverRes.rows[0];

    const monthsOfService = getMonthsOfServiceAtPeriodEnd(hire_date, month, year);
    const baseSalary = monthsOfService >= 12 ? 9_000_000 : 8_000_000;

    // 2. Số ngày nghỉ không lương / vắng không phép tháng này (khớp logic với
    // accountantPayrollRepository — gồm cả chấm công 'absent_unexcused', ghi đè
    // 'present' được ưu tiên) để màn ước tính khớp số với bảng lương chính thức
    const leaveRes = await pool.query(
        `SELECT COUNT(*)::int AS unpaid_days
         FROM leave_requests lr
         LEFT JOIN attendance_overrides ao
                ON ao.driver_id = lr.driver_id AND ao.work_date = lr.leave_date
         WHERE lr.driver_id = $1
           AND lr.leave_type = 'unpaid' AND lr.status = 'approved'
           AND EXTRACT(MONTH FROM lr.leave_date) = $2
           AND EXTRACT(YEAR  FROM lr.leave_date) = $3
           AND COALESCE(ao.status, 'leave_unpaid') != 'present'`,
        [driverId, month, year],
    );
    const attRes = await pool.query(
        `SELECT COUNT(*)::int AS unexcused_days
         FROM attendance_overrides
         WHERE driver_id = $1 AND status = 'absent_unexcused'
           AND EXTRACT(MONTH FROM work_date) = $2 AND EXTRACT(YEAR FROM work_date) = $3`,
        [driverId, month, year],
    );
    const unpaidDays = Number(leaveRes.rows[0].unpaid_days ?? 0) + Number(attRes.rows[0].unexcused_days ?? 0);
    // "28 công" là quota — tháng dài hơn 28 ngày lịch có phần dư được miễn trừ tự
    // nhiên; chỉ khi số ngày thực đi làm tụt dưới 28 mới bị trừ đúng phần hụt đó.
    const daysInMonth = new Date(Number(year), Number(month), 0).getDate();
    const actualWorkingDays = Math.max(0, Math.min(28, daysInMonth - unpaidDays));
    const proRatedBase = (baseSalary / 28) * actualWorkingDays;
    const absencePenalty = baseSalary - proRatedBase;

    // 3. Doanh thu & bonus từ KPI tháng này
    const kpiRes = await pool.query(
        `SELECT
            k.total_revenue,
            lb.revenue_rank,
            br_kpi.reward_amount                                AS kpi_bonus_reward,
            (br_kpi.conditions_json->>'min_revenue')::numeric   AS kpi_threshold,
            br_top.reward_amount                                AS top_driver_reward
         FROM kpi_records k
         LEFT JOIN v_leaderboard lb
            ON lb.driver_id = k.driver_id AND lb.vehicle_group_id = k.vehicle_group_id
            AND lb.year = k.year AND lb.month = k.month
         LEFT JOIN LATERAL (
             SELECT reward_amount, conditions_json FROM bonus_rules
             WHERE vehicle_group_id = k.vehicle_group_id AND bonus_type = 'kpi' AND is_active = TRUE
             ORDER BY id LIMIT 1
         ) br_kpi ON TRUE
         LEFT JOIN LATERAL (
             SELECT reward_amount FROM bonus_rules
             WHERE vehicle_group_id = k.vehicle_group_id AND bonus_type = 'top_revenue' AND is_active = TRUE
             ORDER BY id LIMIT 1
         ) br_top ON TRUE
         WHERE k.driver_id = $1 AND k.month = $2 AND k.year = $3`,
        [driverId, month, year],
    );
    const kpi = kpiRes.rows[0] ?? {};
    const totalRevenue = Number(kpi.total_revenue ?? 0);
    const revenuePct   = Number(revenue_share_percent ?? 15);
    const revenueBonus = totalRevenue * (revenuePct / 100);

    const kpiBonus = (kpi.kpi_bonus_reward && kpi.kpi_threshold && totalRevenue > Number(kpi.kpi_threshold))
        ? Number(kpi.kpi_bonus_reward) : 0;
    const topDriverBonus = (Number(kpi.revenue_rank) === 1 && kpi.top_driver_reward)
        ? Number(kpi.top_driver_reward) : 0;

    // 4. Tiền ứng lương đã được duyệt tháng này
    const advRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS advance_total
         FROM salary_advances
         WHERE driver_id = $1 AND request_month = $2 AND request_year = $3
           AND status = 'paid'`,
        [driverId, month, year],
    );
    const advanceDeduction = Number(advRes.rows[0].advance_total ?? 0);

    // 5. Công nợ driver chưa nộp (BR-020 / Payroll §24)
    const debtRes = await pool.query(
        `SELECT COALESCE(SUM(
             d.total_amount - COALESCE((
                 SELECT SUM(dp.amount) FROM debt_payments dp
                 WHERE dp.debt_id = d.id AND dp.status = 'confirmed'
             ), 0)
         ), 0) AS remaining
         FROM debts d
         WHERE d.driver_id = $1
           AND d.debt_type = 'driver'
           AND d.total_amount - COALESCE((
               SELECT SUM(dp2.amount) FROM debt_payments dp2
               WHERE dp2.debt_id = d.id AND dp2.status = 'confirmed'
           ), 0) > 0.01`,
        [driverId],
    );
    const driverDebtDeduction = Number(debtRes.rows[0].remaining ?? 0);

    // 5b. Đi làm ngày lễ = 200% lương: cộng thêm 100% lương ngày cho mỗi ngày lễ có chuyến hoàn thành
    const holidayRes = await pool.query(
        `SELECT COUNT(DISTINCT h.holiday_date)::int AS days
         FROM company_holidays h
         WHERE EXTRACT(MONTH FROM h.holiday_date) = $2
           AND EXTRACT(YEAR  FROM h.holiday_date) = $3
           AND EXISTS (
               SELECT 1
               FROM order_shipments os
               JOIN v_shipment_current sc ON sc.shipment_id = os.id
               WHERE sc.owner_driver_id = $1
                 AND os.status = 'completed'
                 AND os.completed_at::date = h.holiday_date
           )`,
        [driverId, month, year],
    );
    const holidayDaysWorked = Number(holidayRes.rows[0]?.days ?? 0);
    const holidayBonus      = Math.round(baseSalary / 28) * holidayDaysWorked;

    // 6. Thưởng & phúc lợi đã duyệt trong kỳ, chờ chi qua lương (Tết, hiếu hỉ, đặc biệt...)
    // Chỉ tính 'approved' — khoản 'paid' là đã chi rồi (qua lương kỳ trước hoặc chi lẻ), không cộng lại
    const bonusRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM driver_bonuses
         WHERE driver_id = $1
           AND status = 'approved'
           AND EXTRACT(MONTH FROM approved_at) = $2
           AND EXTRACT(YEAR  FROM approved_at) = $3`,
        [driverId, month, year],
    );
    const bonusWelfareTotal = Number(bonusRes.rows[0].total ?? 0);

    // 7. Hoàn chi phí tài đã ứng (đã duyệt, chờ hoàn — chưa cấn trừ nợ) — không phải
    // thu nhập, chỉ cộng vào tiền thực nhận
    const reimbRes = await pool.query(
        `SELECT COALESCE(SUM(e.amount), 0) AS total
         FROM expenses e
         LEFT JOIN v_shipment_current sc ON sc.shipment_id = e.shipment_id
         LEFT JOIN maintenance_records mr ON mr.expense_id = e.id
         WHERE e.status = 'approved'
           AND e.reimbursement_status = 'pending'
           AND COALESCE(sc.owner_driver_id, mr.performed_by, e.created_by) = $1`,
        [driverId],
    );
    const expenseReimbursement = Number(reimbRes.rows[0].total ?? 0);

    const estimatedGross = proRatedBase + revenueBonus + PHONE_ALLOWANCE + kpiBonus + topDriverBonus + holidayBonus + bonusWelfareTotal;
    const estimatedNet   = estimatedGross + expenseReimbursement - BHXH_EMPLOYEE - advanceDeduction - driverDebtDeduction;

    return {
        month, year,
        months_of_service:      monthsOfService,
        base_salary:            baseSalary.toFixed(2),
        actual_working_days:    actualWorkingDays,
        unpaid_days:            unpaidDays,
        absence_penalty:        absencePenalty.toFixed(2),
        pro_rated_base:         proRatedBase.toFixed(2),
        total_revenue:          totalRevenue.toFixed(2),
        revenue_share_pct:      revenuePct.toFixed(2),
        revenue_bonus:          revenueBonus.toFixed(2),
        phone_allowance:        PHONE_ALLOWANCE.toFixed(2),
        kpi_bonus:              kpiBonus.toFixed(2),
        top_driver_bonus:       topDriverBonus.toFixed(2),
        holiday_bonus:          holidayBonus.toFixed(2),
        holiday_days_worked:    holidayDaysWorked,
        bonus_welfare_total:    bonusWelfareTotal.toFixed(2),
        expense_reimbursement:  expenseReimbursement.toFixed(2),
        insurance_employee:     BHXH_EMPLOYEE.toFixed(2),
        insurance_salary_base:  INSURANCE_SALARY_BASE.toFixed(2),
        advance_deduction:      advanceDeduction.toFixed(2),
        driver_debt_deduction:  driverDebtDeduction.toFixed(2),
        max_advance_amount:     MAX_ADVANCE_AMOUNT.toFixed(2),
        estimated_gross:        estimatedGross.toFixed(2),
        estimated_net:          estimatedNet.toFixed(2),
    };
};

module.exports = {
    getDriverPayrolls,
    createSalaryAdvance,
    getDriverAdvances,
    getPayrollEstimate,
    MAX_ADVANCE_AMOUNT,
};
