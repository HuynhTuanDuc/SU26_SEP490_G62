/**
 * L3-FLOW-02 — Luồng System API: Ứng lương → Duyệt → Giải ngân → Chốt lương → Chi lương
 * L3-FLOW-03 — Luồng System API: Chi phí tài xế + Phiếu chi 2 cấp → Tổng hợp chi
 *
 * Chuỗi HTTP tuần tự đa vai trò trên app mount TOÀN BỘ route thật (routes/index.js):
 *   [driver]     POST /api/payroll/advance (chỉ ngày 25 — stub đồng hồ)
 *   [manager]    PATCH /api/manager/salary-advances/:id/approve
 *   [accountant] PATCH /accountant/payroll/advances/:id/disburse
 *                POST  /accountant/payroll/generate → [manager] review → confirm → pay
 *                GET   /accountant/ledger — sổ có payroll_paid + advance_disbursed
 *
 *   [driver]     POST /api/expenses (multipart ảnh hóa đơn)
 *   [manager]    GET  /api/manager/expenses → PATCH approve
 *   [accountant] POST /accountant/vouchers → [manager] approve → [accountant] pay
 *                GET  /accountant/spending-summary — tổng hợp chi khớp
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';

const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { setupTestDb } = require('../helpers/testDb');

// Token hạn dài — stub đồng hồ sang ngày 25 sẽ làm token 1h "hết hạn" giữa luồng
const signLongToken = ({ userId, role }) => jwt.sign(
    { userId, email: `${role}@test.com`, role, tokenType: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '365d' },
);

let pool;
let teardown;
let app;
let driverToken;
let mgrToken;
let acctToken;

const NOW = new Date();
const MONTH = NOW.getMonth() + 1;
const YEAR = NOW.getFullYear();
const REVENUE = 10_000_000;
const img = () => Buffer.from('fake-image-bytes');

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
    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/', require('../../routes'));

    await pool.query(`
        TRUNCATE financial_transactions, payment_vouchers, expense_attachments, expenses, driver_bonuses,
                 payrolls, salary_advances, debt_payments, debts, shipment_receipts, order_receipt_requests,
                 trip_stops, shipment_assignment_history, shipment_revenue_allocations, kpi_records,
                 bonus_rules, order_shipments, orders, customers, vehicles, vehicle_groups, drivers,
                 profiles, roles, accounts, leave_requests, attendance_overrides
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
    await pool.query(`
        INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date, revenue_share_percent)
        VALUES (4, 1, 'DL-1', CURRENT_DATE - INTERVAL '14 months', 15)
    `);
    await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1, 'individual', 'Khach A', '0912345678')`);
    // Doanh thu tháng này để bảng lương có thưởng doanh thu
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
    // Chuyến đang transit để driver khai chi phí ở FLOW-03
    await pool.query(`INSERT INTO orders (id, customer_id, created_by, payment_type) VALUES (2, 1, 2, 'bank_transfer')`);
    await pool.query(`
        INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status, claimed_at, picking_at, transit_at)
        VALUES (2, 2, 1, 1, 'transit', NOW(), NOW(), NOW())
    `);
    await pool.query(`
        INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
        VALUES (2, 4, 1, 4, 'self_claim')
    `);

    driverToken = signLongToken({ userId: 4, role: 'driver' });
    mgrToken = signLongToken({ userId: 1, role: 'manager' });
    acctToken = signLongToken({ userId: 3, role: 'accountant' });
});

afterAll(async () => {
    restoreDate();
    await teardown();
});

describe('L3-FLOW-02 — API: Ứng lương → Duyệt → Giải ngân → Chốt lương → Chi lương', () => {
    it('B1 [driver] — POST /api/payroll/advance ngày 25: quá 5tr bị 4xx, 3tr thành công', async () => {
        stubDay25();
        const tooMuch = await request(app).post('/api/payroll/advance')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ amount: 6_000_000, requestMonth: MONTH, requestYear: YEAR });
        assert.ok(tooMuch.status >= 400, 'vượt trần 5tr phải bị chặn');

        const ok = await request(app).post('/api/payroll/advance')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ amount: 3_000_000, reason: 'Viec gia dinh', requestMonth: MONTH, requestYear: YEAR });
        assert.ok([200, 201].includes(ok.status), `xin ứng hợp lệ thất bại: ${ok.status} ${JSON.stringify(ok.body)}`);
        restoreDate();
    });

    it('B2 [manager] — thấy yêu cầu và duyệt; driver gọi API manager bị 403', async () => {
        const forbidden = await request(app).get('/api/manager/salary-advances')
            .set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(forbidden.status, 403);

        const list = await request(app).get('/api/manager/salary-advances')
            .set('Authorization', `Bearer ${mgrToken}`);
        assert.strictEqual(list.status, 200);
        const adv = (list.body.advances ?? list.body).find((a) => a.status === 'pending');
        assert.ok(adv, 'manager phải thấy yêu cầu ứng pending');

        const approve = await request(app).patch(`/api/manager/salary-advances/${adv.id}/approve`)
            .set('Authorization', `Bearer ${mgrToken}`);
        assert.strictEqual(approve.status, 200);
    });

    it('B3 [accountant] — giải ngân → paid + bút toán 141/1111 trên sổ', async () => {
        const { rows: [adv] } = await pool.query(`SELECT id FROM salary_advances WHERE status = 'approved'`);
        const disburse = await request(app).patch(`/accountant/payroll/advances/${adv.id}/disburse`)
            .set('Authorization', `Bearer ${acctToken}`).send({ notes: 'chi tien mat' });
        assert.strictEqual(disburse.status, 200);

        const ledger = await request(app).get('/accountant/ledger?eventType=advance_disbursed')
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(ledger.status, 200);
        const entries = ledger.body.entries ?? ledger.body.journal ?? ledger.body;
        assert.ok(JSON.stringify(entries).includes('advance_disbursed'), 'sổ phải có bút toán giải ngân ứng');
    });

    it('B4 [accountant→manager→accountant] — generate → review → confirm → pay: trạng thái đi đúng trình tự', async () => {
        const gen = await request(app).post('/accountant/payroll/generate')
            .set('Authorization', `Bearer ${acctToken}`).send({ month: MONTH, year: YEAR });
        assert.strictEqual(gen.status, 200);
        assert.strictEqual(gen.body.created, 1);

        const { rows: [p] } = await pool.query('SELECT id, status FROM payrolls WHERE driver_id = 4');
        assert.strictEqual(p.status, 'pending');

        const review = await request(app).patch(`/api/manager/payrolls/${p.id}/review`)
            .set('Authorization', `Bearer ${mgrToken}`).send({});
        assert.strictEqual(review.status, 200);

        const confirm = await request(app).patch(`/accountant/payroll/${p.id}/confirm`)
            .set('Authorization', `Bearer ${acctToken}`).send({});
        assert.strictEqual(confirm.status, 200);

        const pay = await request(app).patch(`/accountant/payroll/${p.id}/pay`)
            .set('Authorization', `Bearer ${acctToken}`).send({});
        assert.strictEqual(pay.status, 200);

        const { rows: [after] } = await pool.query('SELECT status, advance_deduction FROM payrolls WHERE id = $1', [p.id]);
        assert.strictEqual(after.status, 'paid');
        assert.strictEqual(Number(after.advance_deduction), 3_000_000, 'ứng lương trừ ngay vào lương tháng ứng');

        const { rows: [ft] } = await pool.query(
            `SELECT debit_account, credit_account FROM financial_transactions WHERE event_type = 'payroll_paid'`,
        );
        assert.strictEqual(ft.debit_account, '334');
        assert.strictEqual(ft.credit_account, '1111');
    });
});

describe('L3-FLOW-03 — API: Chi phí tài xế + Phiếu chi 2 cấp → Tổng hợp chi', () => {
    it('B1 [driver] — POST /api/expenses (multipart hóa đơn) → pending; chưa duyệt chưa ghi sổ', async () => {
        const res = await request(app).post('/api/expenses')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('shipmentId', '2')
            .field('expenseType', 'fuel')
            .field('amount', '500000')
            .field('description', 'Do dau chuyen 2')
            .attach('receipt', img(), 'fuel.jpg');
        assert.ok([200, 201].includes(res.status), `khai chi phí thất bại: ${res.status} ${JSON.stringify(res.body)}`);

        const { rows: [e] } = await pool.query(`SELECT status FROM expenses ORDER BY id DESC LIMIT 1`);
        assert.strictEqual(e.status, 'pending');

        const { rows: [c] } = await pool.query(`SELECT COUNT(*)::int AS c FROM financial_transactions WHERE ref_type = 'expense'`);
        assert.strictEqual(c.c, 0);
    });

    it('B2 [manager] — GET /api/manager/expenses thấy pending → PATCH approve → ghi sổ 642/1111', async () => {
        const list = await request(app).get('/api/manager/expenses?status=pending')
            .set('Authorization', `Bearer ${mgrToken}`);
        assert.strictEqual(list.status, 200);
        const exp = (list.body.rows ?? list.body)[0];
        assert.ok(exp, 'manager phải thấy chi phí chờ duyệt trên màn Quản lý chi');

        const approve = await request(app).patch(`/api/manager/expenses/${exp.id}/approve`)
            .set('Authorization', `Bearer ${mgrToken}`);
        assert.strictEqual(approve.status, 200);

        // Duyệt = công ty nhận nợ tài (chờ hoàn) — sổ CHƯA ghi chi cho tới khi hoàn
        const { rows: [e] } = await pool.query(`SELECT reimbursement_status FROM expenses WHERE id = $1`, [exp.id]);
        assert.strictEqual(e.reimbursement_status, 'pending');
        const { rows: [c] } = await pool.query(`SELECT COUNT(*)::int AS c FROM financial_transactions WHERE ref_type = 'expense' AND ref_id = $1`, [exp.id]);
        assert.strictEqual(c.c, 0);
    });

    it('B3 [accountant→manager→accountant] — phiếu chi: tạo → duyệt → chi → ghi sổ 642/1121', async () => {
        const create = await request(app).post('/accountant/vouchers')
            .set('Authorization', `Bearer ${acctToken}`)
            .field('voucher_type', 'utilities')
            .field('amount', '2500000')
            .field('payee', 'Dien luc TP.HCM')
            .field('reason', 'Tien dien van phong')
            .field('payment_method', 'bank_transfer');
        assert.strictEqual(create.status, 201);
        const voucherId = create.body.voucher.id;

        // Kế toán không tự duyệt được phiếu (route duyệt thuộc manager)
        const selfApprove = await request(app).patch(`/api/manager/vouchers/${voucherId}/approve`)
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(selfApprove.status, 403);

        const approve = await request(app).patch(`/api/manager/vouchers/${voucherId}/approve`)
            .set('Authorization', `Bearer ${mgrToken}`);
        assert.strictEqual(approve.status, 200);

        const pay = await request(app).patch(`/accountant/vouchers/${voucherId}/pay`)
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(pay.status, 200);

        const { rows: [ft] } = await pool.query(
            `SELECT debit_account, credit_account, amount FROM financial_transactions WHERE ref_type = 'voucher' AND ref_id = $1`, [voucherId],
        );
        assert.strictEqual(ft.debit_account, '642');
        assert.strictEqual(ft.credit_account, '1121');
        assert.strictEqual(Number(ft.amount), 2_500_000);
    });

    it('B4 [accountant] — GET /accountant/spending-summary: tổng chi khớp mọi khoản đã ra trong luồng', async () => {
        const res = await request(app).get(`/accountant/spending-summary?month=${MONTH}&year=${YEAR}`)
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(res.status, 200);

        const byType = Object.fromEntries(res.body.by_type.map((r) => [r.event_type, Number(r.total_amount)]));
        // 500k dầu duyệt SAU kỳ lương đã chi → còn 'chờ hoàn', chưa vào tổng chi
        assert.strictEqual(byType.expense_recorded, 2_500_000, 'chỉ phiếu chi tiền điện đã chi');
        assert.ok(byType.payroll_paid > 0, 'tổng hợp phải gồm cả chi lương từ FLOW-02');
        assert.strictEqual(byType.advance_disbursed, 3_000_000);
    });
});
