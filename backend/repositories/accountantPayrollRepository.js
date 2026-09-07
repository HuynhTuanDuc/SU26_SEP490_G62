const pool = require('../config/database');
const financialLedgerRepository = require('./financialLedgerRepository');
const activityLogRepository = require('./activityLogRepository');
const reversalService = require('../services/reversalService');
const { ruleLateralSql, getHolidayMultiplier } = require('./bonusRuleLookup');
const { NO_LIVE_REIMBURSEMENT_VOUCHER_SQL } = require('../constants/expenseConstants');
const { UNPAID_DAYS_SQL } = require('../constants/payrollConstants');
const { money } = require('../utils/formatNumber');

const INSURANCE_SALARY_BASE = 5_310_000;
const BHXH_EMPLOYEE         = Math.round(INSURANCE_SALARY_BASE * 0.105);
const BHXH_COMPANY          = Math.round(INSURANCE_SALARY_BASE * 0.215);
const PHONE_ALLOWANCE        = 200_000;
const BASE_SALARY_JUNIOR     = 8_000_000;
const BASE_SALARY_SENIOR     = 9_000_000;
const WORKING_DAYS_PER_MONTH = 28;

// Số ngày lịch của tháng (28-31) — dùng làm mốc "ngày dư" so với quota 28 công:
// tháng càng dài thì càng có nhiều ngày nghỉ được miễn trừ trước khi hụt công.
const getDaysInMonth = (month, year) => new Date(Number(year), Number(month), 0).getDate();

// Điều III — trả lương 1 lần vào ngày 10 hàng tháng; nếu ngày 10 trùng cuối tuần/ngày
// lễ thì dời sang ngày làm việc liền kề (trước hoặc sau — công ty được chọn).
const PAYROLL_PAY_DAY = 10;

const _pad2 = (n) => String(n).padStart(2, '0');
const _dateKey = (d) => `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;

const _isBusinessDay = (date, holidayKeys) => {
    const dow = date.getDay(); // 0 = Chủ nhật, 6 = Thứ bảy
    if (dow === 0 || dow === 6) return false;
    return !holidayKeys.has(_dateKey(date));
};

// Trả về danh sách ngày hợp lệ để chi lương trong 1 tháng cụ thể: đúng ngày 10 nếu đó
// là ngày làm việc, hoặc [ngày làm việc liền trước, ngày làm việc liền sau] nếu ngày 10
// rơi vào cuối tuần/ngày lễ (kể cả cụm nghỉ nhiều ngày liên tiếp như Tết).
const _getValidPayrollPayDates = async (client, year, month) => {
    const { rows } = await client.query(`SELECT holiday_date::text AS d FROM company_holidays`);
    const holidayKeys = new Set(rows.map((r) => r.d));

    const nominal = new Date(Number(year), Number(month) - 1, PAYROLL_PAY_DAY);
    if (_isBusinessDay(nominal, holidayKeys)) return [nominal];

    const prev = new Date(nominal);
    do { prev.setDate(prev.getDate() - 1); } while (!_isBusinessDay(prev, holidayKeys));
    const next = new Date(nominal);
    do { next.setDate(next.getDate() + 1); } while (!_isBusinessDay(next, holidayKeys));
    return [prev, next];
};

const assertTodayIsValidPayrollPayDate = async (client) => {
    const now = new Date();
    const validDates = await _getValidPayrollPayDates(client, now.getFullYear(), now.getMonth() + 1);
    const todayKey = _dateKey(now);
    if (!validDates.some((d) => _dateKey(d) === todayKey)) {
        const label = validDates.map((d) => `${_pad2(d.getDate())}/${_pad2(d.getMonth() + 1)}`).join(' hoặc ');
        throw new Error(`Chi lương chỉ được thực hiện vào ngày ${label} (Điều III)`);
    }
};

const getMonthsOfServiceAtPeriodEnd = (hireDateValue, month, year) => {
    const hireDate = new Date(hireDateValue);
    const periodEnd = new Date(Number(year), Number(month), 0);
    let months = (periodEnd.getFullYear() - hireDate.getFullYear()) * 12
               + (periodEnd.getMonth() - hireDate.getMonth());
    if (periodEnd.getDate() < hireDate.getDate()) months -= 1;
    return Math.max(0, months);
};

const _calcDriverPayroll = async (client, driver, month, year) => {
    const monthsOfService = getMonthsOfServiceAtPeriodEnd(driver.hire_date, month, year);
    const baseSalary      = monthsOfService >= 12 ? BASE_SALARY_SENIOR : BASE_SALARY_JUNIOR;
    const revenuePct      = Number(driver.revenue_share_percent ?? 15);

    // Ngày công không lương = leave_requests (nghỉ không lương) HOẶC chấm công đánh dấu
    // 'absent_unexcused' — nhưng nếu Manager/Coordinator đã ghi đè 'present' cho đúng
    // ngày đó (vd tài xế xin nghỉ nhưng thực tế vẫn đi làm), ghi đè luôn được ưu tiên,
    // không tính ngày đó là nghỉ nữa.
    // Ngày lễ luôn được loại khỏi mọi phép trừ công: Điều V.1 quy định nghỉ lễ vẫn
    // hưởng nguyên lương, nên dù tài có đơn nghỉ hay bị chấm vắng đúng ngày lễ thì
    // cũng không được trừ.
    // Một truy vấn DUY NHẤT, khử trùng theo ngày — xem UNPAID_DAYS_SQL để biết thứ tự ưu
    // tiên giữa chấm công và đơn nghỉ, và vì sao KHÔNG được cộng ba truy vấn rời.
    const { rows: [dayRow] } = await client.query(UNPAID_DAYS_SQL, [driver.driver_id, month, year]);
    const unpaidDays     = Number(dayRow.unpaid_days ?? 0);
    // "28 công" là đơn giá quy đổi 1 ngày lương (base/28), KHÔNG phải trần số ngày được
    // trả. Tháng dài hơn 28 ngày lịch mà tài đi làm hết cả những ngày dư (29, 30, 31) thì
    // được trả thêm đúng phần dư đó — proRatedBase khi ấy VƯỢT base_salary. Ngược lại,
    // vắng/nghỉ không lương thì trừ đúng phần hụt so với số ngày lịch của tháng.
    const daysInMonth    = getDaysInMonth(month, year);
    const actualWorkDays = Math.max(0, daysInMonth - unpaidDays);
    const proRatedBase   = Math.round((baseSalary / WORKING_DAYS_PER_MONTH) * actualWorkDays);
    const absencePenalty = baseSalary - proRatedBase;

    const { rows: [kpi] } = await client.query(`
        SELECT
            COALESCE(k.total_revenue, 0)                             AS total_revenue,
            k.vehicle_group_id,
            lb.revenue_rank,
            br_kpi.reward_amount                                      AS kpi_bonus_reward,
            (br_kpi.conditions_json->>'min_revenue')::numeric         AS kpi_threshold,
            br_top.reward_amount                                      AS top_driver_reward
        FROM kpi_records k
        LEFT JOIN v_leaderboard lb
            ON lb.driver_id = k.driver_id
           AND lb.vehicle_group_id = k.vehicle_group_id
           AND lb.year = k.year AND lb.month = k.month
        LEFT JOIN LATERAL (${ruleLateralSql('k.vehicle_group_id', 'kpi')}) br_kpi ON TRUE
        LEFT JOIN LATERAL (${ruleLateralSql('k.vehicle_group_id', 'top_revenue')}) br_top ON TRUE
        WHERE k.driver_id = $1 AND k.month = $2 AND k.year = $3
    `, [driver.driver_id, month, year]);

    const totalRevenue   = Number(kpi?.total_revenue ?? 0);
    const revenueBonus   = Math.round(totalRevenue * (revenuePct / 100));
    const kpiBonus       = (kpi?.kpi_bonus_reward && kpi?.kpi_threshold
                           && totalRevenue > Number(kpi.kpi_threshold))
                         ? Number(kpi.kpi_bonus_reward) : 0;
    const topDriverBonus = (Number(kpi?.revenue_rank) === 1 && kpi?.top_driver_reward)
                         ? Number(kpi.top_driver_reward) : 0;

    const { rows: [advRow] } = await client.query(`
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM salary_advances
        WHERE driver_id = $1
          AND request_month = $2 AND request_year = $3
          AND status = 'paid'
    `, [driver.driver_id, month, year]);
    const advanceDeduction = Number(advRow.total ?? 0);

    const { rows: [debtRow] } = await client.query(`
        SELECT COALESCE(SUM(
            d.total_amount - COALESCE((
                SELECT SUM(dp.amount) FROM debt_payments dp
                WHERE dp.debt_id = d.id AND dp.status = 'confirmed'
            ), 0)
        ), 0)::numeric AS remaining
        FROM debts d
        WHERE d.driver_id = $1
          AND d.debt_type = 'driver'
          AND d.total_amount - COALESCE((
              SELECT SUM(dp2.amount) FROM debt_payments dp2
              WHERE dp2.debt_id = d.id AND dp2.status = 'confirmed'
          ), 0) > 0.01
    `, [driver.driver_id]);
    const totalDebt    = Number(debtRow.remaining ?? 0);

    // Đi làm ngày lễ hưởng hệ số lương theo Điều V.1 (mặc định 200%): lương cứng đã gồm
    // 100% (lễ không trừ công), nên chỉ cộng thêm phần vượt — (hệ số - 1) lương ngày cho
    // mỗi ngày lễ tài xế có đi làm. Hệ số lấy từ bonus_rules(bonus_type='holiday'), không
    // còn hardcode, để thay đổi chính sách không phải sửa mã và deploy lại.
    // Bằng chứng đi làm: hoàn thành chuyến trong ngày (tự nhận), HOẶC kế toán chấm tay
    // 'holiday_worked' (tài chạy xuyên đêm nên chuyến rơi sang hôm sau, trực kho...).
    const { rows: [holidayRow] } = await client.query(`
        SELECT COUNT(DISTINCT h.holiday_date)::int AS days
        FROM company_holidays h
        WHERE EXTRACT(MONTH FROM h.holiday_date) = $2
          AND EXTRACT(YEAR  FROM h.holiday_date) = $3
          AND (
              EXISTS (
                  SELECT 1
                  FROM order_shipments os
                  JOIN v_shipment_current sc ON sc.shipment_id = os.id
                  WHERE sc.owner_driver_id = $1
                    AND os.status = 'completed'
                    AND os.completed_at::date = h.holiday_date
              )
              OR EXISTS (
                  SELECT 1 FROM attendance_overrides ao
                  WHERE ao.driver_id = $1
                    AND ao.work_date = h.holiday_date
                    AND ao.status = 'holiday_worked'
              )
          )
    `, [driver.driver_id, month, year]);
    const holidayDaysWorked = Number(holidayRow?.days ?? 0);
    // Nhóm xe của KỲ ĐÓ (kpi_records) chứ không phải nhóm hiện tại của tài — trùng với
    // cách rule KPI/top tài đang tra, nên đổi nhóm không làm lệch lương kỳ cũ. Tài chưa
    // có KPI tháng đó (không chạy chuyến nào nhưng vẫn trực lễ) thì lấy nhóm cố định.
    const holidayGroupId    = kpi?.vehicle_group_id ?? driver.default_vehicle_group_id ?? null;
    const holidayMultiplier = await getHolidayMultiplier(client, holidayGroupId);
    const holidayDailyWage  = Math.round(baseSalary / WORKING_DAYS_PER_MONTH);
    const holidayBonus      = Math.round(holidayDailyWage * holidayDaysWorked * (holidayMultiplier - 1));

    // Thưởng & phúc lợi đã duyệt trong kỳ, chờ chi qua lương (Tết, hiếu hỉ, đặc biệt...)
    // Chỉ tính 'approved' — khoản 'paid' là đã chi rồi, không cộng lại (tránh chi 2 lần)
    const { rows: [bonusRow] } = await client.query(`
        SELECT COALESCE(SUM(amount), 0)::numeric AS total
        FROM driver_bonuses
        WHERE driver_id = $1
          AND status = 'approved'
          AND EXTRACT(MONTH FROM approved_at) = $2
          AND EXTRACT(YEAR  FROM approved_at) = $3
    `, [driver.driver_id, month, year]);
    const bonusWelfareTotal = Number(bonusRow.total ?? 0);

    // Hoàn chi phí tài đã ứng (TH1): các expense đã duyệt còn 'pending' chưa được cấn trừ
    // vào nợ thu hộ — quy chủ theo tài giữ chuyến (v_shipment_current), bảo dưỡng theo
    // performed_by, còn lại theo người tạo. KHÔNG phải thu nhập — không vào gross/BHXH,
    // chỉ cộng vào tiền thực chi trả (net).
    const { rows: [reimbRow] } = await client.query(`
        SELECT COALESCE(SUM(e.amount), 0)::numeric AS total
        FROM expenses e
        LEFT JOIN v_shipment_current sc ON sc.shipment_id = e.shipment_id
        LEFT JOIN maintenance_records mr ON mr.expense_id = e.id
        WHERE e.status = 'approved'
          AND e.reimbursement_status = 'pending'
          AND ${NO_LIVE_REIMBURSEMENT_VOUCHER_SQL('e')}
          AND COALESCE(sc.owner_driver_id, mr.performed_by, e.created_by) = $1
    `, [driver.driver_id]);
    const expenseReimbursement = Number(reimbRow.total ?? 0);

    const gross        = proRatedBase + revenueBonus + PHONE_ALLOWANCE + kpiBonus + topDriverBonus + holidayBonus + bonusWelfareTotal;
    // proRatedBase đã phản ánh ngày nghỉ; DB computed net_salary dùng full baseSalary rồi trừ absence_penalty
    // → không trừ kép absencePenalty ở đây để tránh cap driverDebtDeduction quá thấp
    //
    // expenseReimbursement PHẢI nằm trong mẫu số của trần khấu trừ. Nó không phải thu nhập
    // (không vào gross, không vào BHXH) nhưng net_salary có cộng nó, nên nó là một phần của
    // "số tài xế còn được nhận" — đúng thứ mà trần này lấy N%.
    //
    // Bỏ sót nó làm bản chốt lệch bản tài xế xem trước (payrollRepository.getPayrollEstimate
    // đã cộng từ đầu): tài có chi phí ứng túi chờ hoàn sẽ thấy một số tiền trừ nợ ở app rồi
    // nhận về một số khác trên phiếu lương. Lệch đúng bằng N% × tiền hoàn chi phí.
    const netBeforeDebt= gross + expenseReimbursement - BHXH_EMPLOYEE - advanceDeduction;

    // Trần khấu trừ công nợ mỗi kỳ: chỉ lấy tối đa N% số tài xế còn được nhận, phần nợ
    // còn lại tự chuyển sang kỳ sau (lần tính lương tháng sau vẫn thấy nó trong tổng nợ).
    //
    // Trước đây trừ tới 100% — không âm, nhưng tài xế có khoản nợ cũ lớn sẽ nhận về ĐÚNG
    // 0đ trong tháng đó. Nợ vẫn phải đòi, nhưng không phải bằng cách lấy sạch một tháng
    // lương của người ta.
    const { rows: [capRow] } = await client.query(
        'SELECT driver_debt_monthly_cap_percent AS pct FROM company_info WHERE id = 1',
    );
    const debtCapPercent = Number(capRow?.pct ?? 30);
    const debtCap = Math.round(Math.max(0, netBeforeDebt) * debtCapPercent / 100);

    const driverDebtDeduction = Math.min(totalDebt, debtCap);

    return {
        monthsOfService,
        baseSalary,
        proRatedBase,
        absencePenalty,
        totalRevenue,
        revenuePct,
        revenueBonus,
        kpiBonus,
        topDriverBonus,
        holidayBonus,
        holidayDaysWorked,
        holidayMultiplier,
        bonusWelfareTotal,
        expenseReimbursement,
        phoneAllowance: PHONE_ALLOWANCE,
        advanceDeduction,
        driverDebtDeduction,
        gross,
    };
};

// sort resolved via allowlist, never interpolated directly from user input
const PAYROLL_SORTS = {
    'net-salary-desc': 'p.net_salary DESC',
    'net-salary-asc':  'p.net_salary ASC',
    status:            'p.status ASC, pr.full_name ASC',
};

const getAllPayrolls = async ({ month, year, status = null, search = null, sort = null }) => {
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
            p.overtime_bonus::text,
            p.holiday_bonus::text,
            p.other_bonus::text,
            p.insurance_employee::text,
            p.driver_debt_deduction::text,
            p.advance_deduction::text,
            p.absence_penalty::text,
            p.other_deduction::text,
            p.manual_bonus::text,
            p.manual_deduction::text,
            p.expense_reimbursement::text,
            p.gross_salary::text,
            p.net_salary::text,
            p.status,
            p.reviewed_at, p.approved_at, p.paid_at,
            p.adjusted_at, p.adjustment_note,
            p.created_at, p.updated_at,
            pr.full_name  AS driver_name,
            pr.phone      AS driver_phone,
            d.default_vehicle_group_id AS vehicle_group_id,
            COALESCE(vg.name, '')       AS vehicle_group,
            COALESCE(v.plate_number, '') AS plate_number
        FROM payrolls p
        JOIN  profiles pr ON pr.id = p.driver_id
        LEFT JOIN drivers d ON d.profile_id = p.driver_id
        LEFT JOIN vehicles v ON v.id = d.vehicle_id
        LEFT JOIN vehicle_groups vg ON vg.id = d.default_vehicle_group_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${PAYROLL_SORTS[sort] ?? 'pr.full_name'}
    `, params);

    return rows;
};

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

const calculateAndUpsertPayrolls = async (month, year) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: drivers } = await client.query(`
            SELECT d.profile_id AS driver_id,
                   d.hire_date,
                   d.revenue_share_percent,
                   d.default_vehicle_group_id
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
                    expense_reimbursement,
                    status
                ) VALUES (
                    $1, $2, $3,
                    $4, $5,
                    $6, $7, $8,
                    $9, $10,
                    $11, $18, $12,
                    $13, $14,
                    $15, $16,
                    $17, 0,
                    $19,
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
                    overtime_bonus         = EXCLUDED.overtime_bonus,
                    holiday_bonus          = EXCLUDED.holiday_bonus,
                    other_bonus            = EXCLUDED.other_bonus,
                    insurance_employee     = EXCLUDED.insurance_employee,
                    insurance_company      = EXCLUDED.insurance_company,
                    driver_debt_deduction  = EXCLUDED.driver_debt_deduction,
                    advance_deduction      = EXCLUDED.advance_deduction,
                    absence_penalty        = EXCLUDED.absence_penalty,
                    expense_reimbursement  = EXCLUDED.expense_reimbursement,
                    updated_at             = NOW()
                WHERE payrolls.status = 'pending'
                RETURNING (xmax = 0) AS is_insert
            `, [
                driver.driver_id, month, year,
                c.baseSalary, c.monthsOfService,
                c.totalRevenue, c.revenuePct, c.revenueBonus,
                c.kpiBonus, c.topDriverBonus,
                c.bonusWelfareTotal,
                PHONE_ALLOWANCE,
                BHXH_EMPLOYEE, BHXH_COMPANY,
                c.driverDebtDeduction, c.advanceDeduction,
                c.absencePenalty,
                c.holidayBonus,
                c.expenseReimbursement,
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

const confirmPayroll = async (payrollId, accountantId) => {
    const { rows: [row] } = await pool.query(`
        UPDATE payrolls
        SET status      = 'approved',
            reviewed_by = COALESCE(reviewed_by, $2),
            reviewed_at = COALESCE(reviewed_at, NOW()),
            approved_by = $2,
            approved_at = NOW(),
            updated_at  = NOW()
        WHERE id = $1
          AND status IN ('pending', 'reviewed')
        RETURNING *
    `, [payrollId, accountantId]);

    if (!row) throw new Error('Không tìm thấy phiếu lương hoặc trạng thái không hợp lệ (cần pending/reviewed)');
    return row;
};

const markPayrollPaid = async (payrollId, accountantId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await assertTodayIsValidPayrollPayDate(client);

        const { rows: [row] } = await client.query(`
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

        // 1. Chốt thưởng & phúc lợi đã cộng vào lương kỳ này → 'paid' (chi qua lương, không chi lẻ nữa)
        const { rows: paidBonuses } = await client.query(`
            UPDATE driver_bonuses
            SET status = 'paid', paid_by = $2, paid_at = NOW(), updated_at = NOW()
            WHERE driver_id = $1
              AND status = 'approved'
              AND EXTRACT(MONTH FROM approved_at) = $3
              AND EXTRACT(YEAR  FROM approved_at) = $4
            RETURNING id, amount
        `, [row.driver_id, accountantId, row.payroll_month, row.payroll_year]);

        // Cảnh báo nếu bonus duyệt thêm sau lần tính lương cuối → tổng không khớp snapshot
        const bonusPaidTotal = paidBonuses.reduce((s, b) => s + Number(b.amount), 0);
        const bonusSnapshot  = Number(row.overtime_bonus ?? 0);
        const bonusMismatch  = Math.abs(bonusPaidTotal - bonusSnapshot) > 0.01;

        // 2. Cấn trừ công nợ tài xế đã khấu trừ vào lương → ghi debt_payments (FIFO nợ cũ nhất trước)
        const debtDeduction = Number(row.driver_debt_deduction ?? 0);
        let clearedTotal = 0;
        let deductionAdjusted = false;
        if (debtDeduction > 0.01) {
            // Postgres cấm FOR UPDATE + GROUP BY — tính tổng qua LATERAL để vẫn lock được dòng debts
            const { rows: openDebts } = await client.query(`
                SELECT d.id AS debt_id,
                       GREATEST(0, d.total_amount - paid.paid) AS remaining
                FROM debts d
                LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(dp.amount) FILTER (WHERE dp.status = 'confirmed'), 0) AS paid
                    FROM debt_payments dp
                    WHERE dp.debt_id = d.id
                ) paid ON TRUE
                WHERE d.driver_id = $1
                  AND d.debt_type = 'driver'
                  AND GREATEST(0, d.total_amount - paid.paid) > 0.01
                ORDER BY d.created_at ASC, d.id ASC
                FOR UPDATE OF d
            `, [row.driver_id]);

            let rem = debtDeduction;
            const ids = [], amounts = [];
            for (const debt of openDebts) {
                if (rem < 0.01) break;
                const alloc = Math.min(rem, Number(debt.remaining));
                if (alloc < 0.01) continue;
                ids.push(Number(debt.debt_id));
                amounts.push(alloc);
                rem -= alloc;
            }
            if (ids.length > 0) {
                await client.query(`
                    INSERT INTO debt_payments
                        (debt_id, amount, payment_method, status,
                         paid_at, confirmed_at, confirmed_by, created_by, notes)
                    SELECT unnest($1::int[]), unnest($2::numeric[]),
                           'offset', 'confirmed', NOW(), NOW(), $3, $3, $4
                `, [
                    ids, amounts, accountantId,
                    `Cấn trừ công nợ vào lương tháng ${row.payroll_month}/${row.payroll_year} — bảng lương #${payrollId}`,
                ]);
                clearedTotal = amounts.reduce((s, a) => s + a, 0);
                await financialLedgerRepository.insertTransaction(client, {
                    eventType: 'driver_debt_paid',
                    debitAccount: '334', creditAccount: '1388',
                    amount: clearedTotal,
                    description: `Cấn trừ nợ tài xế vào lương ${row.payroll_month}/${row.payroll_year} — bảng lương #${payrollId}`,
                    refType: 'payroll', refId: payrollId, actorId: accountantId,
                });
            }

            // Bảo vệ lương tài xế: nợ thực còn ÍT hơn snapshot (tài đã nộp quỹ sau khi chốt lương)
            // → chỉ trừ đúng số cấn được, phần chênh trả lại vào lương (net_salary tự tính lại)
            if (clearedTotal < debtDeduction - 0.01) {
                const { rows: [adjusted] } = await client.query(
                    `UPDATE payrolls
                     SET driver_debt_deduction = $2, updated_at = NOW()
                     WHERE id = $1
                     RETURNING net_salary, driver_debt_deduction`,
                    [payrollId, clearedTotal],
                );
                row.net_salary = adjusted.net_salary;
                row.driver_debt_deduction = adjusted.driver_debt_deduction;
                deductionAdjusted = true;
            }
        }

        // 2b. HOÀN CHI PHÍ TÀI ĐÃ ỨNG qua lương (TH1) — tất toán các expense 'pending'
        // của tài; đồng bộ lại snapshot (khoản có thể đã được cấn trừ nợ TH2 sau khi
        // generate). Chi phí đã lên sổ từ lúc duyệt nên ở đây chỉ còn việc đánh dấu đã hoàn.
        {
            const { rows: pendingExpenses } = await client.query(`
                SELECT e.id, e.amount
                FROM expenses e
                LEFT JOIN v_shipment_current sc ON sc.shipment_id = e.shipment_id
                LEFT JOIN maintenance_records mr ON mr.expense_id = e.id
                WHERE e.status = 'approved'
                  AND e.reimbursement_status = 'pending'
                  AND ${NO_LIVE_REIMBURSEMENT_VOUCHER_SQL('e')}
                  AND COALESCE(sc.owner_driver_id, mr.performed_by, e.created_by) = $1
                ORDER BY e.id
                FOR UPDATE OF e
            `, [row.driver_id]);

            const actualReimb = pendingExpenses.reduce((s, e) => s + Number(e.amount), 0);
            if (Math.abs(actualReimb - Number(row.expense_reimbursement ?? 0)) > 0.01) {
                const { rows: [adj] } = await client.query(
                    `UPDATE payrolls SET expense_reimbursement = $2, updated_at = NOW()
                     WHERE id = $1 RETURNING net_salary, expense_reimbursement`,
                    [payrollId, actualReimb],
                );
                row.net_salary = adj.net_salary;
                row.expense_reimbursement = adj.expense_reimbursement;
            }

            if (pendingExpenses.length > 0) {
                await client.query(
                    `UPDATE expenses
                     SET reimbursement_status = 'paid_via_payroll', reimbursed_at = NOW(), updated_at = NOW()
                     WHERE id = ANY($1::int[])`,
                    [pendingExpenses.map((e) => e.id)],
                );
                // KHÔNG ghi bút toán chi phí ở đây: các khoản này đã được ghi nhận từ lúc
                // DUYỆT (Nợ 3388/642 | Có 334 — recordExpenseAccrual). Tiền hoàn nằm trong
                // net_salary nên bút toán chi lương (Nợ 334 | Có 1111) ở bước 4 chính là
                // vế tất toán khoản phải trả tài xế. Ghi thêm ở đây là ghi nhận chi phí
                // lần hai cho cùng một hoá đơn.
            }
        }

        // 3. Ghi sổ hoàn ứng lương — tất toán TK 141 (đã ghi 141/1111 khi giải ngân)
        if (Number(row.advance_deduction ?? 0) > 0) {
            await financialLedgerRepository.insertTransaction(client, {
                eventType: 'advance_recovered',
                debitAccount: '334', creditAccount: '141',
                amount: Number(row.advance_deduction),
                description: `Hoàn ứng lương tháng ${row.payroll_month}/${row.payroll_year} — bảng lương #${payrollId}`,
                refType: 'payroll', refId: payrollId, actorId: accountantId,
            });
        }

        // 4. Ghi sổ chi tiền — TÁCH lương và tiền hoàn ứng, dù cả hai cùng ra khỏi quỹ
        // trong một lần trả và cùng bút toán Nợ 334 | Có 1111.
        //
        // Vì sao phải tách: tiền hoàn ứng KHÔNG phải chi phí của kỳ này — chi phí đó đã
        // được ghi nhận từ lúc DUYỆT khoản chi (Nợ 642/3388 | Có 334). Gộp chung vào
        // 'payroll_paid' thì màn Tổng hợp chi cộng khoản đó lần thứ hai, một hoá đơn xăng
        // 500k hiện thành 1 triệu tiền đã chi. 'expense_reimbursed' là tất toán khoản phải
        // trả nên không nằm trong danh sách sự kiện chi.
        const netSalary   = Number(row.net_salary ?? 0);
        const reimbAmount = Math.min(Number(row.expense_reimbursement ?? 0), netSalary);
        const salaryOnly  = netSalary - reimbAmount;

        await financialLedgerRepository.insertTransaction(client, {
            eventType: 'payroll_paid',
            debitAccount: '334', creditAccount: '1111',
            amount: salaryOnly,
            description: `Chi lương tháng ${row.payroll_month}/${row.payroll_year} — bảng lương #${payrollId}`,
            refType: 'payroll', refId: payrollId, actorId: accountantId,
        });
        await financialLedgerRepository.insertTransaction(client, {
            eventType: 'expense_reimbursed',
            debitAccount: '334', creditAccount: '1111',
            amount: reimbAmount,
            description: `Hoàn chi phí tài đã ứng — trả cùng lương ${row.payroll_month}/${row.payroll_year}, bảng lương #${payrollId}`,
            refType: 'payroll', refId: payrollId, actorId: accountantId,
        });

        await client.query('COMMIT');
        return {
            ...row,
            bonuses_marked_paid: paidBonuses.length,
            bonus_mismatch_warning: bonusMismatch
                ? `Tổng thưởng phúc lợi đã duyệt (${money(bonusPaidTotal)}) khác snapshot trong bảng lương (${money(bonusSnapshot)}) — có khoản duyệt sau lần tính lương cuối.`
                : null,
            debt_deduction_adjusted: deductionAdjusted
                ? `Nợ tài xế thực còn ${money(clearedTotal)} (thấp hơn khấu trừ đã chốt ${money(debtDeduction)} — tài xế đã nộp quỹ sau khi tính lương). Đã tự điều chỉnh: chỉ trừ ${money(clearedTotal)}, lương thực nhận cập nhật ${money(Number(row.net_salary))}.`
                : null,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

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

    await financialLedgerRepository.insertTransaction(pool, {
        eventType: 'advance_disbursed',
        debitAccount: '141', creditAccount: '1111',
        amount: Number(row.amount),
        description: `Giải ngân ứng lương tháng ${row.request_month}/${row.request_year} — yêu cầu #${advanceId}`,
        refType: 'advance', refId: advanceId, actorId: accountantId,
    });
    return row;
};

const reviewPayroll = async (payrollId, managerId) => {
    const { rows: [row] } = await pool.query(`
        UPDATE payrolls
        SET status      = 'reviewed',
            reviewed_by = $2,
            reviewed_at = NOW(),
            updated_at  = NOW()
        WHERE id = $1
          AND status = 'pending'
        RETURNING *
    `, [payrollId, managerId]);

    if (!row) throw new Error('Không tìm thấy phiếu lương hoặc trạng thái không hợp lệ (cần pending)');
    return row;
};

// Trả phiếu lương về 'pending' để tính lại (Manager hoặc Kế toán) — huỷ mọi dấu duyệt cũ.
// Chỉ áp dụng khi phiếu đang reviewed/approved; đã 'paid' thì khoá (đã sinh bút toán + xoá nợ).
const revertPayrollToPending = async (payrollId, actorId, reason = null, actorRole = 'accountant') => {
    // Tầng 2: trả phiếu lương về tính lại là đảo một quyết định đã duyệt. Trước đây lý
    // do là tuỳ chọn, nên nửa số lần trả về không ai biết vì sao — mà đúng lúc cần tra
    // thì đó là thứ duy nhất giải thích được con số cuối tháng.
    reversalService.assertAllowed('payroll.review', { actorRole, reason });

    const { rows: [prev] } = await pool.query(`SELECT status FROM payrolls WHERE id = $1`, [payrollId]);
    const { rows: [row] } = await pool.query(`
        UPDATE payrolls
        SET status          = 'pending',
            reviewed_by     = NULL,
            reviewed_at     = NULL,
            approved_by     = NULL,
            approved_at     = NULL,
            adjusted_by     = $2,
            adjusted_at     = NOW(),
            adjustment_note = $3,
            updated_at      = NOW()
        WHERE id = $1
          AND status IN ('reviewed', 'approved')
        RETURNING *
    `, [payrollId, actorId, reason ? `Trả về tính lại: ${reason}` : 'Trả về tính lại']);

    if (!row) {
        throw new Error('Không thể trả về: phiếu không tồn tại, đang chờ duyệt hoặc đã trả lương');
    }
    reversalService.recordReversal({
        kind: 'payroll.review',
        entityId: payrollId,
        actorId,
        reason,
        oldData: { status: prev?.status ?? null, net_salary: row.net_salary },
        newData: { status: 'pending' },
    });
    return row;
};

// Kế toán nhập khoản điều chỉnh tay (thưởng thêm / khấu trừ thêm) rồi đưa phiếu về 'pending'
// để duyệt lại từ đầu. net_salary được DB tự tính lại. Không cho sửa khi đã 'paid'.
const adjustPayroll = async (payrollId, { manualBonus, manualDeduction, note }, actorId) => {
    const { rows: [prev] } = await pool.query(
        `SELECT manual_bonus, manual_deduction, net_salary, status FROM payrolls WHERE id = $1`, [payrollId]);
    const { rows: [row] } = await pool.query(`
        UPDATE payrolls
        SET manual_bonus     = $2,
            manual_deduction = $3,
            adjustment_note  = $4,
            adjusted_by      = $5,
            adjusted_at      = NOW(),
            status           = 'pending',
            reviewed_by      = NULL,
            reviewed_at      = NULL,
            approved_by      = NULL,
            approved_at      = NULL,
            updated_at       = NOW()
        WHERE id = $1
          AND status <> 'paid'
        RETURNING *
    `, [payrollId, manualBonus, manualDeduction, note || null, actorId]);

    if (!row) {
        throw new Error('Không thể điều chỉnh: phiếu không tồn tại hoặc đã trả lương');
    }
    activityLogRepository.logSafe({
        userId: actorId, action: 'payroll_adjust', entityType: 'payroll', entityId: payrollId,
        oldData: {
            manual_bonus: Number(prev?.manual_bonus ?? 0),
            manual_deduction: Number(prev?.manual_deduction ?? 0),
            net_salary: Number(prev?.net_salary ?? 0),
        },
        newData: {
            manual_bonus: Number(row.manual_bonus),
            manual_deduction: Number(row.manual_deduction),
            net_salary: Number(row.net_salary),
            note: note || null,
        },
    });
    return row;
};

module.exports = {
    getAllPayrolls,
    getPayrollStats,
    calculateAndUpsertPayrolls,
    reviewPayroll,
    revertPayrollToPending,
    adjustPayroll,
    confirmPayroll,
    markPayrollPaid,
    getSalaryAdvances,
    disburseAdvance,
};

