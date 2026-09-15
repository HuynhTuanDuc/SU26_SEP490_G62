/**
 * Tài xế NGHỈ VIỆC giữa tháng + thưởng Tết theo thời gian làm việc.
 *
 * Bug đã sửa:
 *   - không có cách ghi ngày nghỉ việc ngoài khoá tài khoản, mà bảng lương loại hẳn tài
 *     khoản đã khoá → tài nghỉ ngày 20, bị khoá trước kỳ tính lương, mất trắng 20 ngày công;
 *     còn tài chưa bị khoá thì vẫn nhận đủ lương cả tháng;
 *   - thưởng Tết: tháng vào làm luôn được xét (và luôn "đủ công"); tài vào làm sau năm tính
 *     thưởng vẫn được xét đủ 12 tháng; tài đã nghỉ / đã khoá vẫn có tên; công không lương
 *     đếm lệch bảng lương (trừ trùng đơn nghỉ + chấm vắng, bỏ qua nửa công, không miễn ngày lễ).
 *
 * Quy tắc sau khi sửa: termination_date = ngày làm việc CUỐI CÙNG. Công chỉ tính trong
 * [hire_date, termination_date]; tài nghỉ việc trước 31/12 không có thưởng Tết năm đó.
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let accountantPayrollRepository;
let payrollRepository;
let attendanceService;
let leaveRepository;
let bonusRepository;
let driverRepository;

const SENIOR = 9_000_000;
const ACCOUNTANT = 3;
const QUIT = 4;             // vào làm 2020, làm tới 20/09/2025, tài khoản đã khoá
const QUIT_NOT_LOCKED = 5;  // vào làm 2020, làm tới 10/08/2025, quên khoá tài khoản
const STAY = 6;             // vào làm 2020, đang làm
const LOCKED_NO_DATE = 7;   // vào làm 2020, bị khoá, không ghi ngày nghỉ việc
const MID_YEAR = 8;         // vào làm 15/03/2025
const LATE_DEC = 9;         // vào làm 28/12/2025
const FIRST_OF_MONTH = 10;  // vào làm 01/10/2025
const NEXT_YEAR = 11;       // vào làm 05/01/2026

const getPayroll = async (driverId, month, year = 2025) => {
    const { rows: [p] } = await pool.query(
        `SELECT base_salary, absence_penalty, other_bonus, insurance_employee, insurance_company,
                employed_days, working_days, net_salary, status
         FROM payrolls WHERE driver_id = $1 AND payroll_month = $2 AND payroll_year = $3`,
        [driverId, month, year],
    );
    return p ?? null;
};

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    accountantPayrollRepository = require('../../repositories/accountantPayrollRepository');
    payrollRepository = require('../../repositories/payrollRepository');
    attendanceService = require('../../services/attendanceService');
    leaveRepository = require('../../repositories/leaveRepository');
    bonusRepository = require('../../repositories/bonusRepository');
    driverRepository = require('../../repositories/driverRepository');

    await pool.query(`
        TRUNCATE financial_transactions, debt_payments, debts, payrolls, kpi_records, driver_bonuses,
                 company_holidays, attendance_overrides, leave_requests,
                 drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
        (3,'kt@t.com','h',3,TRUE),
        (4,'d4@t.com','h',4,FALSE), (5,'d5@t.com','h',4,TRUE), (6,'d6@t.com','h',4,TRUE),
        (7,'d7@t.com','h',4,FALSE), (8,'d8@t.com','h',4,TRUE), (9,'d9@t.com','h',4,TRUE),
        (10,'d10@t.com','h',4,TRUE), (11,'d11@t.com','h',4,TRUE)
    `);
    await pool.query(`
        INSERT INTO profiles (id, full_name, role_id) VALUES
        (3,'Ke Toan',3), (4,'Tai Nghi Viec',4), (5,'Tai Quen Khoa',4), (6,'Tai O Lai',4),
        (7,'Tai Khoa Khong Ngay',4), (8,'Tai Giua Nam',4), (9,'Tai Cuoi Nam',4),
        (10,'Tai Mung Mot',4), (11,'Tai Nam Sau',4)
    `);
    await pool.query(`
        INSERT INTO drivers (profile_id, default_vehicle_group_id, license_number, hire_date, termination_date, revenue_share_percent) VALUES
        (4,  NULL, 'DL-4',  '2020-01-01', '2025-09-20', 15),
        (5,  NULL, 'DL-5',  '2020-01-01', '2025-08-10', 15),
        (6,  NULL, 'DL-6',  '2020-01-01', NULL,         15),
        (7,  NULL, 'DL-7',  '2020-01-01', NULL,         15),
        (8,  NULL, 'DL-8',  '2025-03-15', NULL,         15),
        (9,  NULL, 'DL-9',  '2025-12-28', NULL,         15),
        (10, NULL, 'DL-10', '2025-10-01', NULL,         15),
        (11, NULL, 'DL-11', '2026-01-05', NULL,         15)
    `);
});

afterAll(async () => { await teardown(); });

describe('Bảng lương tháng nghỉ việc — 9/2025 (30 ngày)', () => {
    it('tài đã khoá vẫn có phiếu, chỉ tính 20/30 ngày; phụ cấp và BHXH chia theo 20/30', async () => {
        const result = await accountantPayrollRepository.calculateAndUpsertPayrolls(9, 2025);
        const p = await getPayroll(QUIT, 9);

        const proRated = Math.round((SENIOR / 28) * 20); // 6.428.571
        assert.ok(p, 'trước đây tài khoản đã khoá bị loại khỏi bảng lương — mất trắng 20 ngày công');
        assert.strictEqual(p.employed_days, 20);
        assert.strictEqual(Number(p.working_days), 20);
        assert.strictEqual(Number(p.base_salary), SENIOR);
        assert.strictEqual(Number(p.absence_penalty), SENIOR - proRated);
        assert.strictEqual(Number(p.other_bonus), 133_333);           // 200.000 × 20/30
        assert.strictEqual(Number(p.insurance_employee), 371_700);    // 3.540.000 × 10.5%
        assert.strictEqual(Number(p.insurance_company), 761_100);     // 3.540.000 × 21.5%
        assert.strictEqual(Number(p.net_salary), proRated + 133_333 - 371_700);

        assert.strictEqual(result.not_employed, 3, 'quên khoá (nghỉ từ tháng 8), vào làm 28/12, vào làm năm sau');
        assert.strictEqual(await getPayroll(QUIT_NOT_LOCKED, 9), null, 'đã nghỉ việc trước kỳ — không còn lương dù tài khoản còn mở');
        assert.strictEqual(await getPayroll(LOCKED_NO_DATE, 9), null, 'khoá mà không ghi ngày nghỉ việc — giữ như cũ');
    });

    it('kỳ sau ngày nghỉ việc: không có phiếu, phiếu pending cũ bị gỡ', async () => {
        await pool.query(
            `INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service, status)
             VALUES ($1, 10, 2025, 9000000, 60, 'pending')`,
            [QUIT],
        );

        const result = await accountantPayrollRepository.calculateAndUpsertPayrolls(10, 2025);

        assert.strictEqual(await getPayroll(QUIT, 10), null);
        assert.ok(result.removed >= 1);
    });

    it('màn ước tính của tài tháng sau nghỉ việc: 0 ngày, mọi khoản theo ngày bằng 0', async () => {
        const est = await payrollRepository.getPayrollEstimate(QUIT, { month: 10, year: 2025 });
        assert.strictEqual(est.termination_date, '2025-09-20');
        assert.strictEqual(est.employed_days, 0);
        assert.strictEqual(Number(est.phone_allowance), 0);
        assert.strictEqual(Number(est.insurance_employee), 0);
    });
});

describe('Chấm công quanh ngày nghỉ việc', () => {
    it('lưới tháng 9: sau ngày làm cuối là "Đã nghỉ việc", không sửa được', async () => {
        const { drivers } = await attendanceService.getMonthlyGrid({ month: 9, year: 2025, driverId: QUIT });
        const d = drivers[0];

        assert.ok(d, 'tài đã khoá nhưng nghỉ việc trong tháng vẫn phải có trong lưới');
        assert.strictEqual(d.termination_date, '2025-09-20');
        assert.strictEqual(d.summary.present, 20);
        assert.strictEqual(d.summary.terminated, 10);
        assert.strictEqual(d.days[19].status, 'present', '20/9 là ngày làm cuối');
        assert.strictEqual(d.days[20].status, 'terminated');
        assert.strictEqual(d.days[20].editable, false);
    });

    it('tháng sau nghỉ việc không còn trong lưới — kể cả khi quên khoá tài khoản', async () => {
        const oct = await attendanceService.getMonthlyGrid({ month: 10, year: 2025, driverId: QUIT });
        assert.strictEqual(oct.drivers.length, 0);
        const sep = await attendanceService.getMonthlyGrid({ month: 9, year: 2025, driverId: QUIT_NOT_LOCKED });
        assert.strictEqual(sep.drivers.length, 0);
    });

    it('chấm công sau ngày nghỉ việc bị chặn, trước đó vẫn chấm được; màn công của tài khớp', async () => {
        await assert.rejects(
            () => attendanceService.markAttendance({ driverId: QUIT, workDate: '2025-09-25', status: 'absent_unexcused' }, ACCOUNTANT),
            /nghỉ việc/,
        );
        await attendanceService.markAttendance({ driverId: QUIT, workDate: '2025-09-15', status: 'half_day' }, ACCOUNTANT);
        // Đơn nghỉ SAU ngày làm cuối không được trừ gì thêm
        await pool.query(
            `INSERT INTO leave_requests (driver_id, leave_date, leave_type, status) VALUES ($1, '2025-09-26', 'unpaid', 'approved')`,
            [QUIT],
        );

        const summary = await leaveRepository.getAttendanceSummary(QUIT, { month: 9, year: 2025 });
        assert.strictEqual(summary.employed_days, 20);
        assert.strictEqual(summary.working_days, 19.5);
        assert.strictEqual(Number(summary.unpaid_days), 0);
    });

    it('không gán chuyến mới cho tài đã qua ngày làm cuối, dù tài khoản còn mở', async () => {
        assert.strictEqual(await driverRepository.getDriverForAssignment(QUIT_NOT_LOCKED), null);
        assert.ok(await driverRepository.getDriverForAssignment(STAY));
    });
});

describe('Thưởng Tết 2025', () => {
    let byId;

    beforeAll(async () => {
        // Tài ở lại cả năm — công không lương phải đếm ĐÚNG như bảng lương:
        //  • 14/02 nửa công: tháng 2 có 28 ngày, không có phần dư → thiếu công (trước đây
        //    nửa công bị bỏ qua nên tháng 2 vẫn "đủ");
        //  • 10/03 vừa đơn nghỉ vừa chấm vắng + vắng 11, 12/03: 3 công ≤ phần dư 3 → đủ công
        //    (trước đây đếm 4 → thiếu);
        //  • vắng 28, 29, 30/04 với 30/04 là ngày lễ: 2 công ≤ phần dư 2 → đủ công (trước
        //    đây không miễn ngày lễ, đếm 3 → thiếu).
        await pool.query(`INSERT INTO company_holidays (holiday_date, name) VALUES ('2025-04-30', 'Giai phong mien Nam')`);
        await pool.query(
            `INSERT INTO leave_requests (driver_id, leave_date, leave_type, status) VALUES ($1, '2025-03-10', 'unpaid', 'approved')`,
            [STAY],
        );
        await pool.query(
            `INSERT INTO attendance_overrides (driver_id, work_date, status, marked_by) VALUES
             ($1, '2025-02-14', 'half_day', $2),
             ($1, '2025-03-10', 'absent_unexcused', $2), ($1, '2025-03-11', 'absent_unexcused', $2), ($1, '2025-03-12', 'absent_unexcused', $2),
             ($1, '2025-04-28', 'absent_unexcused', $2), ($1, '2025-04-29', 'absent_unexcused', $2), ($1, '2025-04-30', 'absent_unexcused', $2)`,
            [STAY, ACCOUNTANT],
        );

        const previews = await bonusRepository.previewTetBonuses(2025);
        byId = new Map(previews.map((p) => [p.driver_id, p]));
    });

    it('chỉ xét tài còn làm tới 31/12 năm đó', () => {
        assert.ok(!byId.has(QUIT), 'nghỉ việc 20/9 — không có thưởng Tết');
        assert.ok(!byId.has(QUIT_NOT_LOCKED), 'nghỉ việc 10/8 dù tài khoản còn mở');
        assert.ok(!byId.has(LOCKED_NO_DATE), 'khoá mà không ghi ngày nghỉ việc');
        assert.ok(!byId.has(NEXT_YEAR), 'vào làm năm sau — trước đây vẫn được xét đủ 12 tháng');
        for (const id of [STAY, MID_YEAR, LATE_DEC, FIRST_OF_MONTH]) assert.ok(byId.has(id));
    });

    it('tháng vào làm chỉ được xét khi vào làm đúng mùng 1', () => {
        assert.strictEqual(byId.get(MID_YEAR).months_full_count, 9, 'vào 15/3 → xét từ tháng 4');
        assert.strictEqual(byId.get(MID_YEAR).total, 9_000_000);
        assert.strictEqual(byId.get(LATE_DEC).total, 0, 'vào 28/12 — trước đây ăn 1.000.000');
        assert.strictEqual(byId.get(FIRST_OF_MONTH).months_full_count, 3);
        assert.strictEqual(byId.get(FIRST_OF_MONTH).total, 3_000_000);
    });

    it('công không lương đếm cùng quy tắc bảng lương', () => {
        const p = byId.get(STAY);
        assert.strictEqual(p.months_full_count, 11, 'chỉ tháng 2 thiếu công');
        assert.strictEqual(p.months_incomplete_count, 1);
        assert.strictEqual(p.seniority_bonus, 2_000_000);
        assert.strictEqual(p.attendance_bonus, 11_000_000);
        assert.strictEqual(p.total, 13_000_000);
    });
});

/**
 * Chấm dứt hợp đồng qua nút "Chấm dứt HĐ" + quyết toán kỳ cuối.
 *
 * Tài vào làm 2020, đã ứng 5.000.000 lương tháng 8/2025 (đã giải ngân), còn một yêu cầu ứng
 * 1.000.000 tháng 9 đã duyệt chưa giải ngân. Nghỉ việc, làm tới 05/08/2025 (5/31 ngày):
 *   lương cứng theo công  9.000.000 / 28 × 5  = 1.607.143
 *   phụ cấp ĐT            200.000 × 5/31     =    32.258
 *   BHXH NLĐ              856.452 × 10.5%    =    89.927
 *   → làm ra 1.549.474, ít hơn 5.000.000 đã ứng.
 * Trước đây phiếu lương ra −3.450.526 và phần tài còn nợ không nằm ở đâu để thu.
 */
describe('Chấm dứt hợp đồng + quyết toán kỳ cuối (8/2025)', () => {
    const RealDate = Date;
    const QUIT_ADVANCE = 12;
    const EARNED = 1_607_143 + 32_258 - 89_927; // 1.549.474
    const CARRIED = 5_000_000 - EARNED;          // 3.450.526
    let adminService;
    let accountantPaymentRepository;
    let payDate;

    beforeAll(async () => {
        adminService = require('../../services/adminService');
        accountantPaymentRepository = require('../../repositories/accountantPaymentRepository');
        payDate = require('../helpers/payDateStub');

        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES (12,'d12@t.com','h',4,TRUE)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (12,'Tai Ung Vuot',4)`);
        await pool.query(
            `INSERT INTO drivers (profile_id, license_number, hire_date, revenue_share_percent) VALUES (12, 'DL-12', '2020-01-01', 15)`,
        );
        await pool.query(
            `INSERT INTO salary_advances (driver_id, amount, request_month, request_year, status) VALUES
             (12, 5000000, 8, 2025, 'paid'), (12, 1000000, 9, 2025, 'approved')`,
        );
    });

    it('chấm dứt HĐ: ghi ngày làm cuối + khoá tài khoản cùng lúc, huỷ ứng lương chưa giải ngân', async () => {
        const res = await adminService.terminateDriverContract(QUIT_ADVANCE, { terminationDate: '2025-08-05', reason: 'Xin nghỉ' }, ACCOUNTANT);

        assert.strictEqual(res.employment.termination_date, '2025-08-05');
        const { rows: [acc] } = await pool.query('SELECT is_active FROM accounts WHERE id = $1', [QUIT_ADVANCE]);
        assert.strictEqual(acc.is_active, false);
        const { rows: advs } = await pool.query(
            'SELECT request_month, status FROM salary_advances WHERE driver_id = $1 ORDER BY request_month', [QUIT_ADVANCE]);
        assert.deepStrictEqual(advs.map((a) => a.status), ['paid', 'rejected'], 'khoản đã giải ngân giữ nguyên để trừ vào lương');

        await assert.rejects(
            () => adminService.terminateDriverContract(QUIT_ADVANCE, { terminationDate: '2025-08-05' }, ACCOUNTANT),
            (err) => err.status === 409,
        );
    });

    it('lương tháng 8 vẫn được tính (tài khoản đã khoá): 5/31 ngày, ứng lương trừ tối đa bằng lương làm ra', async () => {
        await accountantPayrollRepository.calculateAndUpsertPayrolls(8, 2025);
        const { rows: [p] } = await pool.query(
            `SELECT employed_days, advance_deduction, driver_debt_deduction, net_salary
             FROM payrolls WHERE driver_id = $1 AND payroll_month = 8 AND payroll_year = 2025`,
            [QUIT_ADVANCE],
        );

        assert.ok(p, 'tài đã khoá nhưng nghỉ trong kỳ vẫn phải có phiếu lương');
        assert.strictEqual(p.employed_days, 5);
        assert.strictEqual(Number(p.advance_deduction), EARNED);
        assert.strictEqual(Number(p.net_salary), 0, 'trước đây ra số âm −3.450.526');

        const est = await payrollRepository.getPayrollEstimate(QUIT_ADVANCE, { month: 8, year: 2025 });
        assert.ok(Math.abs(Number(est.estimated_net)) < 0.01);
        assert.ok(Number(est.advance_carried_over) > 3_450_000, 'màn ước tính báo trước phần sẽ thành nợ');
    });

    it('chi lương kỳ cuối: phần ứng vượt lương thành công nợ tài xế, bút toán Nợ 1388 | Có 141', async () => {
        const { rows: [p] } = await pool.query(
            `UPDATE payrolls SET status = 'approved' WHERE driver_id = $1 AND payroll_month = 8 AND payroll_year = 2025 RETURNING id`,
            [QUIT_ADVANCE],
        );
        const now = new RealDate();
        payDate.stubDateTo(RealDate, await payDate.computeValidPayrollPayDate(pool, now.getFullYear(), now.getMonth() + 1));
        let paid;
        try {
            paid = await accountantPayrollRepository.markPayrollPaid(p.id, ACCOUNTANT);
        } finally {
            payDate.restoreDateTo(RealDate);
        }

        assert.match(paid.advance_carried_to_debt, /công nợ tài xế/);
        const { rows: [debt] } = await pool.query(
            `SELECT id, total_amount, source FROM debts WHERE driver_id = $1 AND debt_type = 'driver'`, [QUIT_ADVANCE]);
        assert.strictEqual(debt.source, 'payroll');
        assert.strictEqual(Number(debt.total_amount), CARRIED);

        const { rows: ledger } = await pool.query(
            `SELECT event_type, debit_account, credit_account, amount::numeric AS amount
             FROM financial_transactions
             WHERE event_type IN ('advance_recovered', 'advance_to_debt', 'payroll_paid')
               AND ((ref_type = 'payroll' AND ref_id = $1) OR (ref_type = 'debt' AND ref_id = $2))
             ORDER BY event_type`,
            [p.id, debt.id],
        );
        assert.deepStrictEqual(
            ledger.map((l) => [l.event_type, l.debit_account, l.credit_account, Number(l.amount)]),
            [
                ['advance_recovered', '334', '141', EARNED],
                ['advance_to_debt', '1388', '141', CARRIED],
            ],
            'TK 141 tất toán đủ 5.000.000; lương thực nhận 0 nên không có bút toán chi lương',
        );
    });

    it('màn quyết toán: còn phải thu đúng phần ứng vượt lương; thu xong là đã quyết toán', async () => {
        const find = async () => (await accountantPayrollRepository.getTerminationSettlements())
            .find((r) => r.driver_id === QUIT_ADVANCE);

        const before = await find();
        assert.strictEqual(before.final_month, 8);
        assert.strictEqual(before.final_payroll.status, 'paid');
        assert.strictEqual(Number(before.remaining_debt), CARRIED);
        assert.strictEqual(before.settled, false);

        await accountantPaymentRepository.allocatePayment('driver', QUIT_ADVANCE, {
            amount: CARRIED, paymentMethod: 'cash', notes: 'Thu nợ khi nghỉ việc', createdBy: ACCOUNTANT,
        });

        const after = await find();
        assert.strictEqual(Number(after.remaining_debt), 0);
        assert.strictEqual(after.settled, true);
    });
});
