/**
 * Lương tài xế VÀO LÀM GIỮA THÁNG.
 *
 * Bug đã sửa: ngày công = số ngày lịch − ngày nghỉ, không xét hire_date. Hệ quả:
 *   - tài vào làm ngày 25 vẫn nhận đủ lương cứng cả tháng;
 *   - tính lương tháng TRƯỚC ngày vào làm vẫn sinh phiếu đủ tháng cho họ;
 *   - lưới chấm công hiện các ngày chưa vào làm là "Có mặt".
 *
 * Quy tắc sau khi sửa (constants/payrollConstants):
 *   employed_days = số ngày từ MAX(mùng 1, hire_date) tới cuối tháng
 *   lương cứng    = base/28 × (employed_days − công không lương)
 *   phụ cấp ĐT    = 200.000 × employed_days / số ngày của tháng
 *   BHXH          = (5.310.000 × employed_days / số ngày của tháng) × 10.5% (DN 21.5%)
 *   vào làm sau kỳ → không có phiếu lương
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let payrollRepository;
let accountantPayrollRepository;
let attendanceService;
let leaveRepository;

const JUNIOR = 8_000_000;
const MONTH = 9;               // tháng 9/2026 — 30 ngày lịch
const YEAR = 2026;
const DAYS = 30;

const ACCOUNTANT = 3;
const NEW_DRIVER = 4;          // vào làm 25/09/2026 → 6/30 ngày
const FULL_DRIVER = 5;         // vào làm 01/09/2026 → đủ tháng
const LAST_DAY_DRIVER = 6;     // vào làm 30/09/2026 → 1/30 ngày
const OLD_DRIVER = 7;          // vào làm 15/06/2025 — dùng cho ca chấm công (ngày đã qua)

const getPayroll = async (driverId, month = MONTH, year = YEAR) => {
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
    payrollRepository = require('../../repositories/payrollRepository');
    accountantPayrollRepository = require('../../repositories/accountantPayrollRepository');
    attendanceService = require('../../services/attendanceService');
    leaveRepository = require('../../repositories/leaveRepository');

    await pool.query(`
        TRUNCATE financial_transactions, debt_payments, debts, payrolls, kpi_records,
                 company_holidays, attendance_overrides, leave_requests,
                 drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
        (3,'kt@t.com','h',3,TRUE), (4,'d4@t.com','h',4,TRUE), (5,'d5@t.com','h',4,TRUE),
        (6,'d6@t.com','h',4,TRUE), (7,'d7@t.com','h',4,TRUE)
    `);
    await pool.query(`
        INSERT INTO profiles (id, full_name, role_id) VALUES
        (3,'Ke Toan',3), (4,'Tai Moi',4), (5,'Tai Du Thang',4), (6,'Tai Cuoi Thang',4), (7,'Tai Cu',4)
    `);
    await pool.query(`
        INSERT INTO drivers (profile_id, default_vehicle_group_id, license_number, hire_date, revenue_share_percent) VALUES
        (4, NULL, 'DL-4', '2026-09-25', 15),
        (5, NULL, 'DL-5', '2026-09-01', 15),
        (6, NULL, 'DL-6', '2026-09-30', 15),
        (7, NULL, 'DL-7', '2025-06-15', 15)
    `);
});

afterAll(async () => { await teardown(); });

describe('Vào làm 25/9 — chỉ tính công 6/30 ngày', () => {
    it('màn ước tính: 6 ngày công, phụ cấp ĐT và BHXH chia theo 6/30', async () => {
        const est = await payrollRepository.getPayrollEstimate(NEW_DRIVER, { month: MONTH, year: YEAR });

        assert.strictEqual(est.hire_date, '2026-09-25');
        assert.strictEqual(est.days_in_month, DAYS);
        assert.strictEqual(est.employed_days, 6);
        assert.strictEqual(est.actual_working_days, 6, 'trước đây ra 30 — đủ cả tháng');
        assert.strictEqual(Number(est.pro_rated_base), Number(((JUNIOR / 28) * 6).toFixed(2)));
        assert.strictEqual(Number(est.phone_allowance), 40_000);          // 200.000 × 6/30
        assert.strictEqual(Number(est.insurance_salary_base), 1_062_000); // 5.310.000 × 6/30
        assert.strictEqual(Number(est.insurance_employee), 111_510);      // 1.062.000 × 10.5%
    });

    it('đơn nghỉ / chấm vắng TRƯỚC ngày vào làm bị bỏ qua, SAU ngày vào làm vẫn trừ', async () => {
        await pool.query(
            `INSERT INTO leave_requests (driver_id, leave_date, leave_type, status) VALUES ($1, '2026-09-10', 'unpaid', 'approved')`,
            [NEW_DRIVER],
        );
        await pool.query(
            `INSERT INTO attendance_overrides (driver_id, work_date, status, marked_by) VALUES
             ($1, '2026-09-20', 'absent_unexcused', $2), ($1, '2026-09-27', 'absent_unexcused', $2)`,
            [NEW_DRIVER, ACCOUNTANT],
        );

        const est = await payrollRepository.getPayrollEstimate(NEW_DRIVER, { month: MONTH, year: YEAR });
        assert.strictEqual(est.unpaid_days, 1, 'chỉ ngày 27/9 (sau ngày vào làm) bị trừ');
        assert.strictEqual(est.actual_working_days, 5);

        const summary = await leaveRepository.getAttendanceSummary(NEW_DRIVER, { month: MONTH, year: YEAR });
        assert.strictEqual(summary.working_days, 5, 'màn chấm công của tài phải khớp bảng lương');
        assert.strictEqual(summary.employed_days, 6);
        assert.strictEqual(summary.unexcused_days, 1, 'không liệt kê vắng trước ngày vào làm');
        assert.strictEqual(Number(summary.unpaid_days), 0);

        await pool.query('DELETE FROM leave_requests WHERE driver_id = $1', [NEW_DRIVER]);
        await pool.query('DELETE FROM attendance_overrides WHERE driver_id = $1', [NEW_DRIVER]);
    });

    it('chốt lương: phiếu lưu đúng số ngày, phụ cấp và BHXH đã chia tỉ lệ', async () => {
        await accountantPayrollRepository.calculateAndUpsertPayrolls(MONTH, YEAR);
        const p = await getPayroll(NEW_DRIVER);

        const proRated = Math.round((JUNIOR / 28) * 6); // 1.714.286
        assert.ok(p, 'tài vào làm trong kỳ vẫn phải có phiếu lương');
        assert.strictEqual(p.employed_days, 6);
        assert.strictEqual(Number(p.working_days), 6);
        assert.strictEqual(Number(p.base_salary), JUNIOR);
        assert.strictEqual(Number(p.absence_penalty), JUNIOR - proRated);
        assert.strictEqual(Number(p.other_bonus), 40_000);
        assert.strictEqual(Number(p.insurance_employee), 111_510);
        assert.strictEqual(Number(p.insurance_company), 228_330);         // 1.062.000 × 21.5%
        // net_salary (GENERATED) = lương theo công + phụ cấp − BHXH — không còn đủ tháng
        assert.strictEqual(Number(p.net_salary), proRated + 40_000 - 111_510);
    });
});

describe('Đủ tháng — không đổi hành vi', () => {
    it('vào làm đúng mùng 1: đủ 30 công, phụ cấp 200.000, BHXH nguyên mức', async () => {
        await accountantPayrollRepository.calculateAndUpsertPayrolls(MONTH, YEAR);
        const p = await getPayroll(FULL_DRIVER);

        assert.strictEqual(p.employed_days, DAYS);
        assert.strictEqual(Number(p.working_days), DAYS);
        assert.strictEqual(Number(p.absence_penalty), JUNIOR - Math.round((JUNIOR / 28) * DAYS));
        assert.strictEqual(Number(p.other_bonus), 200_000);
        assert.strictEqual(Number(p.insurance_employee), 557_550);
        assert.strictEqual(Number(p.insurance_company), 1_141_650);
    });
});

describe('Vào làm ngày cuối tháng — 1/30 ngày', () => {
    it('một ngày công, phụ cấp và BHXH theo 1/30', async () => {
        const est = await payrollRepository.getPayrollEstimate(LAST_DAY_DRIVER, { month: MONTH, year: YEAR });
        assert.strictEqual(est.employed_days, 1);
        assert.strictEqual(est.actual_working_days, 1);
        assert.strictEqual(Number(est.phone_allowance), 6_667);           // round(200.000 / 30)
        assert.strictEqual(Number(est.insurance_employee), 18_585);       // 177.000 × 10.5%

        await accountantPayrollRepository.calculateAndUpsertPayrolls(MONTH, YEAR);
        const p = await getPayroll(LAST_DAY_DRIVER);
        assert.strictEqual(p.employed_days, 1);
        assert.strictEqual(Number(p.insurance_company), 38_055);          // 177.000 × 21.5%
    });
});

describe('Vào làm SAU kỳ lương — không có phiếu', () => {
    it('tính lương tháng 8: không tạo phiếu cho tài vào làm tháng 9, gỡ phiếu pending cũ, giữ phiếu đã chi', async () => {
        // Phiếu do bản cũ (chưa xét ngày vào làm) tạo ra
        await pool.query(`
            INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service, status) VALUES
            (4, 8, 2026, 8000000, 0, 'pending'),
            (6, 8, 2026, 8000000, 0, 'paid')
        `);

        const result = await accountantPayrollRepository.calculateAndUpsertPayrolls(8, YEAR);

        assert.strictEqual(result.not_employed, 3, 'tài 4, 5, 6 đều vào làm tháng 9');
        assert.strictEqual(result.removed, 1, 'chỉ gỡ phiếu pending');
        assert.strictEqual(await getPayroll(NEW_DRIVER, 8), null);
        assert.strictEqual(await getPayroll(FULL_DRIVER, 8), null);
        assert.strictEqual((await getPayroll(LAST_DAY_DRIVER, 8)).status, 'paid', 'phiếu đã chi không được đụng tới');
        assert.ok(await getPayroll(OLD_DRIVER, 8), 'tài vào làm từ trước vẫn có phiếu bình thường');
    });

    it('màn ước tính tháng trước ngày vào làm: mọi khoản theo ngày bằng 0', async () => {
        const est = await payrollRepository.getPayrollEstimate(NEW_DRIVER, { month: 8, year: YEAR });
        assert.strictEqual(est.employed_days, 0);
        assert.strictEqual(est.actual_working_days, 0);
        assert.strictEqual(Number(est.pro_rated_base), 0);
        assert.strictEqual(Number(est.phone_allowance), 0);
        assert.strictEqual(Number(est.insurance_employee), 0);
    });
});

describe('Lưới chấm công và chấm công', () => {
    it('ngày trước ngày vào làm hiện "Chưa vào làm", không sửa được', async () => {
        const { drivers } = await attendanceService.getMonthlyGrid({ month: MONTH, year: YEAR, driverId: NEW_DRIVER });
        const d = drivers[0];

        assert.strictEqual(d.hire_date, '2026-09-25');
        assert.strictEqual(d.summary.not_employed, 24);
        assert.strictEqual(d.summary.present, 6);
        assert.strictEqual(d.days[0].status, 'not_employed');
        assert.strictEqual(d.days[0].editable, false);
        assert.strictEqual(d.days[24].status, 'present', 'ngày 25/9 là ngày đầu đi làm');
        assert.strictEqual(d.days[24].editable, true);
    });

    it('tài vào làm sau tháng đang xem không có trong lưới', async () => {
        const { drivers } = await attendanceService.getMonthlyGrid({ month: 8, year: YEAR, driverId: NEW_DRIVER });
        assert.strictEqual(drivers.length, 0);
    });

    it('chấm công trước ngày vào làm bị chặn, sau ngày vào làm vẫn chấm được', async () => {
        await assert.rejects(
            () => attendanceService.markAttendance(
                { driverId: OLD_DRIVER, workDate: '2025-06-10', status: 'absent_unexcused' }, ACCOUNTANT,
            ),
            /chưa thuộc thời gian làm việc/,
        );

        const saved = await attendanceService.markAttendance(
            { driverId: OLD_DRIVER, workDate: '2025-06-20', status: 'absent_unexcused' }, ACCOUNTANT,
        );
        assert.strictEqual(saved.status, 'absent_unexcused');
    });
});
