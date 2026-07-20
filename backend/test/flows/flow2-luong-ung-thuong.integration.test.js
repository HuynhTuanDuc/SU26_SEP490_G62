/**
 * L2-FLOW-03 — Luồng nghiệp vụ: Ứng lương → Duyệt → Giải ngân → Phúc lợi → Chốt lương → Chi lương
 *
 * Test THEO LUỒNG, xuyên các service/role:
 *   payrollService (driver xin ứng, chỉ được ngày 25 — Điều IV)
 *   → managerService (manager duyệt ứng — BR-029)
 *   → accountantPayrollRepository (kế toán giải ngân → bút toán 141/1111)
 *   → bonusService (kế toán tạo phúc lợi → manager duyệt)
 *   → accountantPayrollRepository (generate → manager review → confirm → chi lương)
 *   → financial_transactions (payroll_paid + advance_disbursed) + driver_bonuses chuyển 'paid'
 *
 * Số liệu chốt theo chính sách lương 04/2026: lương cứng 9tr (≥12 tháng), 15% doanh thu,
 * phụ cấp ĐT 200k, thưởng top nhóm xe 1tr, BHXH NLĐ 557.550đ, ứng trừ ngay tháng ứng.
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');
const { stubDateTo, restoreDateTo, computeValidPayrollPayDate } = require('../helpers/payDateStub');

let pool;
let teardown;
let payrollService;
let managerService;
let bonusService;
let accountantPayrollRepository;
let bonusRuleService;
let leaveService;

const MGR_ID = 1;
const ACCT_ID = 3;
const DRIVER_ID = 4;
const REVENUE = 10_000_000;
const NOW = new Date();
const MONTH = NOW.getMonth() + 1;
const YEAR = NOW.getFullYear();

// 9tr + 15%×10tr + 1tr top + 200k ĐT + 500k phúc lợi − 557.550 BHXH − 3tr ứng
const EXPECTED_NET = 9_000_000 + 1_500_000 + 1_000_000 + 200_000 + 500_000 - 557_550 - 3_000_000;

const RealDate = Date;
const stubDay25 = () => {
    const fixed = new RealDate(YEAR, MONTH - 1, 25, 9, 0, 0);
    global.Date = class extends RealDate {
        constructor(...args) {
            if (args.length === 0) return new RealDate(fixed);
            super(...args);
        }
        static now() { return fixed.getTime(); }
    };
};
const restoreDate = () => { global.Date = RealDate; };

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    payrollService = require('../../services/payrollService');
    managerService = require('../../services/managerService');
    bonusService = require('../../services/bonusService');
    accountantPayrollRepository = require('../../repositories/accountantPayrollRepository');
    bonusRuleService = require('../../services/bonusRuleService');
    leaveService = require('../../services/leaveService');

    await pool.query(`
        TRUNCATE financial_transactions, driver_bonuses, payrolls, salary_advances, debt_payments, debts,
                 shipment_receipts, order_receipt_requests, trip_stops, shipment_assignment_history,
                 shipment_revenue_allocations, kpi_records, bonus_rules, order_shipments, orders,
                 customers, vehicles, vehicle_groups, drivers, profiles, roles, accounts, leave_requests,
                 attendance_overrides
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id) VALUES
        (1,'manager@test.com','hash',1),(2,'coord@test.com','hash',2),
        (3,'acct@test.com','hash',3),(4,'driver1@test.com','hash',4)
    `);
    await pool.query(`
        INSERT INTO profiles (id, full_name, role_id) VALUES
        (1,'Manager',1),(2,'Coordinator',2),(3,'Accountant',3),(4,'Driver A',4)
    `);
    await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Xe 5m2', 15000)`);
    await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '51E-246.80', 1, 4, 'active')`);
    // ≥ 12 tháng thâm niên → lương cứng 9.000.000 (chính sách 04/2026)
    await pool.query(`
        INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date, revenue_share_percent)
        VALUES (4, 1, 1, 'DL-1', CURRENT_DATE - INTERVAL '14 months', 15)
    `);
    // Doanh thu tháng này: 1 chuyến hoàn thành 10tr (đã chốt actual_price) + KPI + phân bổ
    await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1, 'individual', 'Khach A', '0912345678')`);
    await pool.query(`INSERT INTO orders (id, customer_id, created_by, payment_type, derived_status) VALUES (1, 1, 2, 'bank_transfer', 'completed')`);
    await pool.query(`
        INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, actual_price, status, claimed_at, completed_at)
        VALUES (1, 1, 1, 1, ${REVENUE}, 'completed', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')
    `);
    await pool.query(`
        INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
        VALUES (1, 4, 1, 4, 'self_claim')
    `);
    await pool.query(`
        INSERT INTO shipment_revenue_allocations (shipment_id, driver_id, share_percent, allocation_reason)
        VALUES (1, 4, 100, 'default_owner')
    `);
    await pool.query(`
        INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue)
        VALUES (4, 1, ${MONTH}, ${YEAR}, 1, ${REVENUE})
    `);
});

afterAll(async () => {
    restoreDate();
    await teardown();
});

describe('L2-FLOW-03 — Ứng lương → Giải ngân → Phúc lợi → Chốt lương → Chi lương', () => {
    it('B0 — Manager cấu hình quy tắc thưởng theo nhóm xe (top doanh thu 1tr, KPI 2tr khi vượt 50tr) — dùng thật để tính lương ở B6', async () => {
        const topRule = await bonusRuleService.createRule({
            vehicle_group_id: 1, title: 'Top nhóm 5m2', bonus_type: 'top_revenue', reward_amount: 1000000,
        });
        assert.strictEqual(Number(topRule.reward_amount), 1000000);

        const kpiRule = await bonusRuleService.createRule({
            vehicle_group_id: 1, title: 'KPI 5m2', bonus_type: 'kpi', reward_amount: 2000000,
            conditions_json: { min_revenue: 50000000 },
        });
        assert.strictEqual(Number(kpiRule.reward_amount), 2000000);
    });

    it('B1 — Điều IV: driver xin ứng NGOÀI ngày 25 bị từ chối', async () => {
        // Nếu hôm nay đúng ngày 25 thì stub sang ngày khác để kiểm tra chiều ngược lại
        if (new RealDate().getDate() === 25) {
            const off = new RealDate(YEAR, MONTH - 1, 20);
            global.Date = class extends RealDate {
                constructor(...a) { if (a.length === 0) return new RealDate(off); super(...a); }
                static now() { return off.getTime(); }
            };
        }
        if (new Date().getDate() !== 25) {
            await assert.rejects(
                () => payrollService.requestSalaryAdvance(DRIVER_ID, { amount: 3_000_000, requestMonth: MONTH, requestYear: YEAR }),
                /ngày 25/,
            );
        }
        restoreDate();
    });

    it('B2 — Ngày 25: driver xin ứng 3tr (≤ trần 5tr) → pending; xin quá 5tr bị chặn', async () => {
        stubDay25();
        await assert.rejects(
            () => payrollService.requestSalaryAdvance(DRIVER_ID, { amount: 6_000_000, requestMonth: MONTH, requestYear: YEAR }),
            /tối đa/,
        );
        const advance = await payrollService.requestSalaryAdvance(DRIVER_ID, {
            amount: 3_000_000, reason: 'Viec gia dinh', requestMonth: MONTH, requestYear: YEAR,
        });
        assert.strictEqual(advance.status, 'pending');
        restoreDate();
    });

    it('B3 — BR-029: manager duyệt yêu cầu ứng → approved (driver không tự duyệt được)', async () => {
        const { rows: [adv] } = await pool.query(`SELECT id FROM salary_advances WHERE status = 'pending'`);
        await managerService.approveSalaryAdvance(adv.id, MGR_ID);

        const { rows: [row] } = await pool.query('SELECT status, approved_by FROM salary_advances WHERE id = $1', [adv.id]);
        assert.strictEqual(row.status, 'approved');
        assert.strictEqual(row.approved_by, MGR_ID);
    });

    it('B4 — Kế toán giải ngân → paid + bút toán tạm ứng 141/1111', async () => {
        const { rows: [adv] } = await pool.query(`SELECT id FROM salary_advances WHERE status = 'approved'`);
        const row = await accountantPayrollRepository.disburseAdvance(adv.id, ACCT_ID, 'chi tien mat');
        assert.strictEqual(row.status, 'paid');

        const { rows: [ft] } = await pool.query(
            `SELECT debit_account, credit_account, amount FROM financial_transactions WHERE event_type = 'advance_disbursed'`,
        );
        assert.strictEqual(ft.debit_account, '141');
        assert.strictEqual(ft.credit_account, '1111');
        assert.strictEqual(Number(ft.amount), 3_000_000);
    });

    it('B5 — Kế toán tạo phúc lợi đặc biệt 500k (pending) → manager duyệt (approved)', async () => {
        const bonus = await bonusService.createWelfare({
            driver_id: DRIVER_ID, type: 'special', year: YEAR, amount: 500_000, notes: 'Ho tro giao gap',
        }, ACCT_ID, 'accountant');
        assert.strictEqual(bonus.status, 'pending', 'kế toán tạo thì phải chờ manager duyệt');

        const approved = await bonusService.approve(bonus.id, MGR_ID, null);
        assert.strictEqual(approved.status, 'approved');
    });

    it('B6 — Kế toán generate bảng lương: đủ các cấu phần đúng chính sách 04/2026', async () => {
        const result = await accountantPayrollRepository.calculateAndUpsertPayrolls(MONTH, YEAR);
        assert.strictEqual(result.created, 1);

        const { rows: [p] } = await pool.query('SELECT * FROM payrolls WHERE driver_id = $1', [DRIVER_ID]);
        assert.strictEqual(Number(p.base_salary), 9_000_000, 'thâm niên ≥12 tháng → 9tr');
        assert.strictEqual(Number(p.revenue_bonus), 1_500_000, '15% × 10tr doanh thu');
        assert.strictEqual(Number(p.top_driver_bonus), 1_000_000, 'top 1 doanh thu nhóm xe');
        assert.strictEqual(Number(p.kpi_bonus), 0, 'chưa vượt ngưỡng 50tr → không có thưởng KPI');
        assert.strictEqual(Number(p.other_bonus), 200_000, 'phụ cấp điện thoại');
        assert.strictEqual(Number(p.overtime_bonus), 500_000, 'phúc lợi approved trong kỳ');
        assert.strictEqual(Number(p.insurance_employee), 557_550, 'BHXH 10.5% × 5.310.000');
        assert.strictEqual(Number(p.advance_deduction), 3_000_000, 'ứng trừ ngay tháng ứng');
        assert.strictEqual(Number(p.expense_reimbursement), 0, 'không có khoản tài ứng chờ hoàn');
        assert.strictEqual(Number(p.net_salary), EXPECTED_NET);
        assert.strictEqual(p.status, 'pending');
    });

    it('B7 — Manager review → reviewed; kế toán confirm → approved (đúng trình tự trạng thái)', async () => {
        const { rows: [p] } = await pool.query('SELECT id FROM payrolls WHERE driver_id = $1', [DRIVER_ID]);

        const reviewed = await accountantPayrollRepository.reviewPayroll(p.id, MGR_ID);
        assert.strictEqual(reviewed.status, 'reviewed');

        const confirmed = await accountantPayrollRepository.confirmPayroll(p.id, ACCT_ID);
        assert.strictEqual(confirmed.status, 'approved');
    });

    it('B8 — Kế toán chi lương: paid + bút toán 334/1111 đúng số thực lĩnh + phúc lợi chuyển "paid" (chi qua lương)', async () => {
        const { rows: [p] } = await pool.query('SELECT id FROM payrolls WHERE driver_id = $1', [DRIVER_ID]);

        // Điều III: chi lương chỉ được thực hiện đúng ngày 10 (hoặc ngày làm việc liền kề
        // nếu trùng cuối tuần/lễ) — stub đồng hồ sang đúng ngày hợp lệ của tháng hiện tại
        const payDate = await computeValidPayrollPayDate(pool, YEAR, MONTH);
        stubDateTo(RealDate, payDate);
        const paid = await accountantPayrollRepository.markPayrollPaid(p.id, ACCT_ID);
        restoreDateTo(RealDate);
        assert.strictEqual(paid.status, 'paid');

        const { rows: [ft] } = await pool.query(
            `SELECT debit_account, credit_account, amount FROM financial_transactions WHERE event_type = 'payroll_paid'`,
        );
        assert.strictEqual(ft.debit_account, '334');
        assert.strictEqual(ft.credit_account, '1111');
        assert.strictEqual(Number(ft.amount), EXPECTED_NET, 'sổ ghi đúng số thực lĩnh');

        const { rows: [b] } = await pool.query(`SELECT status FROM driver_bonuses WHERE driver_id = $1`, [DRIVER_ID]);
        assert.strictEqual(b.status, 'paid', 'phúc lợi trong kỳ chi qua lương, không chi lẻ');
    });
});

describe('L2-FLOW-03b — Nghỉ không lương (leaveService) làm giảm thật lương cơ bản khi chốt lương', () => {
    const DRIVER_D = 7;
    // Tháng đủ 30/31 ngày có "dư" so với 28 ngày công chuẩn — nghỉ ít ngày được miễn trừ tự
    // nhiên, không bị trừ lương (xem comment trong accountantPayrollRepository). Cần đủ 5
    // ngày nghỉ để chắc chắn tụt dưới 28 ở MỌI tháng (kể cả tháng 31 ngày).
    const UNPAID_DAYS = 5;
    const WORKING_DAYS_PER_MONTH = 28;
    const BASE_SALARY = 9_000_000;

    beforeAll(async () => {
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (7,'driverD@test.com','hash',4)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (7,'Driver D',4)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (3, '51E-777.77', 1, 7, 'active')`);
        await pool.query(`
            INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date)
            VALUES (7, 3, 1, 'DL-D', CURRENT_DATE - INTERVAL '14 months')
        `);
    });

    it('B1 — Driver tự đăng ký 2 ngày nghỉ KHÔNG LƯƠNG trong tháng qua leaveService', async () => {
        for (let i = 0; i < UNPAID_DAYS; i += 1) {
            const day = String(10 + i).padStart(2, '0');
            const leave = await leaveService.createLeave(DRIVER_D, {
                leaveDate: `${YEAR}-${String(MONTH).padStart(2, '0')}-${day}`, leaveType: 'unpaid', reason: 'Nghi viec rieng',
            });
            assert.strictEqual(leave.status, 'approved');
        }
    });

    it('B2 — Chốt lương: absence_penalty bị trừ ĐÚNG theo công thức pro-rate của 5 ngày nghỉ không lương', async () => {
        await accountantPayrollRepository.calculateAndUpsertPayrolls(MONTH, YEAR);

        const daysInMonth = new Date(YEAR, MONTH, 0).getDate();
        const actualWorkDays = Math.max(0, Math.min(WORKING_DAYS_PER_MONTH, daysInMonth - UNPAID_DAYS));
        const expectedProRatedBase = Math.round((BASE_SALARY / WORKING_DAYS_PER_MONTH) * actualWorkDays);
        const expectedPenalty = BASE_SALARY - expectedProRatedBase;

        // base_salary luôn lưu lương ĐỦ tháng (không đổi); phần bị trừ do nghỉ nằm ở
        // absence_penalty riêng — net_salary mới là số DB tự trừ đi cột này.
        const { rows: [p] } = await pool.query('SELECT base_salary, absence_penalty, net_salary FROM payrolls WHERE driver_id = $1', [DRIVER_D]);
        assert.strictEqual(Number(p.base_salary), BASE_SALARY, 'base_salary luôn lưu lương đủ tháng, không tự trừ');
        assert.strictEqual(Number(p.absence_penalty), expectedPenalty,
            '5 ngày nghỉ không lương phải trừ ĐÚNG theo công thức pro-rate (không trừ thẳng theo ngày vắng)');
        assert.ok(expectedPenalty > 0, 'phải có phần bị trừ — chứng minh nghỉ phép có ảnh hưởng thật tới lương');
    });
});

describe('L2-FLOW-03 — Negative paths (BR violations, invalid input, duplicate actions)', () => {
    const DRIVER_C = 6;

    beforeAll(async () => {
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (6,'driverC@test.com','hash',4)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (6,'Driver C',4)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (2, '51E-999.99', 1, 6, 'active')`);
        await pool.query(`
            INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date)
            VALUES (6, 2, 1, 'DL-C', CURRENT_DATE - INTERVAL '14 months')
        `);
    });

    it('N1 — requesting a salary advance with a non-positive amount is rejected regardless of the request day', async () => {
        await assert.rejects(
            () => payrollService.requestSalaryAdvance(DRIVER_C, { amount: 0, requestMonth: MONTH, requestYear: YEAR }),
            /Số tiền phải lớn hơn 0/,
        );
    });

    it('N2 — BR-029: approving the same salary advance request twice is rejected the second time', async () => {
        stubDay25();
        const advance = await payrollService.requestSalaryAdvance(DRIVER_C, {
            amount: 1_000_000, reason: 'Test', requestMonth: MONTH, requestYear: YEAR,
        });
        restoreDate();

        await managerService.approveSalaryAdvance(advance.id, MGR_ID);
        await assert.rejects(
            () => managerService.approveSalaryAdvance(advance.id, MGR_ID),
            /đã được xử lý/,
        );
    });

    it('N3 — disbursing a salary advance that has not been manager-approved yet is rejected', async () => {
        stubDay25();
        const advance = await payrollService.requestSalaryAdvance(DRIVER_C, {
            amount: 500_000, reason: 'Chua duyet', requestMonth: MONTH, requestYear: YEAR,
        });
        restoreDate();

        await assert.rejects(
            () => accountantPayrollRepository.disburseAdvance(advance.id, ACCT_ID, 'chi som'),
            /chưa được manager duyệt/,
        );
    });

    it('N4 — creating a welfare bonus with a non-positive amount is rejected', async () => {
        await assert.rejects(
            () => bonusService.createWelfare({
                driver_id: DRIVER_C, type: 'special', year: YEAR, amount: 0, notes: 'invalid',
            }, ACCT_ID, 'accountant'),
            /Số tiền phải lớn hơn 0/,
        );
    });

    it('N5 — rejecting a bonus without a reason is rejected', async () => {
        const bonus = await bonusService.createWelfare({
            driver_id: DRIVER_C, type: 'special', year: YEAR, amount: 200_000, notes: 'to be rejected',
        }, ACCT_ID, 'accountant');
        await assert.rejects(
            () => bonusService.reject(bonus.id, MGR_ID, ''),
            /Cần ghi lý do/,
        );
    });

    it('N6 — reviewing the same payroll twice is rejected the second time (must be "pending")', async () => {
        await pool.query(`
            INSERT INTO orders (id, customer_id, created_by, payment_type, derived_status) VALUES (90, 1, 2, 'bank_transfer', 'completed')
        `);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, actual_price, status, claimed_at, completed_at)
            VALUES (90, 90, 1, 1, 5000000, 'completed', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')
        `);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (90, $1, 2, $1, 'self_claim')
        `, [DRIVER_C]);
        await pool.query(`
            INSERT INTO shipment_revenue_allocations (shipment_id, driver_id, share_percent, allocation_reason)
            VALUES (90, $1, 100, 'default_owner')
        `, [DRIVER_C]);

        await accountantPayrollRepository.calculateAndUpsertPayrolls(MONTH, YEAR);
        const { rows: [p] } = await pool.query('SELECT id, status FROM payrolls WHERE driver_id = $1', [DRIVER_C]);
        assert.strictEqual(p.status, 'pending');

        await accountantPayrollRepository.reviewPayroll(p.id, MGR_ID);
        await assert.rejects(
            () => accountantPayrollRepository.reviewPayroll(p.id, MGR_ID),
            /trạng thái không hợp lệ/,
        );
    });

    it('N7 — Điều III: paying a payroll on a day other than the valid payday is rejected', async () => {
        const { rows: [p] } = await pool.query('SELECT id FROM payrolls WHERE driver_id = $1', [DRIVER_C]);
        await accountantPayrollRepository.confirmPayroll(p.id, ACCT_ID);

        const validPayDate = await computeValidPayrollPayDate(pool, YEAR, MONTH);
        const isTodayValid = new RealDate().toDateString() === validPayDate.toDateString();
        if (isTodayValid) return; // hôm nay tình cờ đúng ngày hợp lệ — bỏ qua case này, không thể tạo negative

        const invalidDate = new RealDate(validPayDate.getTime());
        invalidDate.setDate(invalidDate.getDate() + 2);
        stubDateTo(RealDate, invalidDate);
        try {
            await assert.rejects(
                () => accountantPayrollRepository.markPayrollPaid(p.id, ACCT_ID),
                /Điều III/,
            );
        } finally {
            restoreDateTo(RealDate);
        }
    });
});
