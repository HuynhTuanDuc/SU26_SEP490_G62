/**
 * L3-FLOW-04 — Luồng System API: Đơn cash khách xin nợ (TH3) qua HTTP thật
 *
 * Test THEO LUỒNG ở tầng API — tương ứng với L2-FLOW-02 (integration) nhưng đi qua
 * HTTP thật: driver chạy trọn vòng đời → gửi yêu cầu phiếu thu → coordinator duyệt
 * → driver chọn "Khách nợ" (client_credit) → kế toán ghi nhận thanh toán từng phần
 * qua API cho tới khi tất toán.
 *
 *   [driver]      POST claim → PATCH status → POST start-transit → PATCH arrived
 *                 → POST complete → POST /api/orders/:id/request-receipt
 *   [coordinator] POST /api/coordinator/receipt-requests/:id/approve
 *   [driver]      POST /api/trips/receipts/:id/record-collection (client_credit)
 *   [accountant]  POST /accountant/debts/payment/allocate (nhiều lần, tất toán)
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';

const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('../helpers/testDb');
const { TEST_PASSWORD_HASH, loginAs } = require('../helpers/httpAuth');

let pool;
let teardown;
let app;
let driverToken;
let coordToken;
let acctToken;

const PRICE_PER_KM = 15000;
const ACTUAL_KM = 200;
const CREDIT_PRICE = ACTUAL_KM * PRICE_PER_KM; // 3.000.000

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());

    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/', require('../../routes'));

    await pool.query(`
        TRUNCATE financial_transactions, debt_payments, debts, payment_receipts, shipment_receipts,
                 order_receipt_requests, delivery_proofs, trip_stops, shipment_assignment_history,
                 shipment_revenue_allocations, kpi_records, expenses, order_shipments, orders,
                 customers, vehicles, vehicle_groups, drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id) VALUES
        (1,'manager@test.com',$1,1),(2,'coord@test.com',$1,2),
        (3,'acct@test.com',$1,3),(4,'driver1@test.com',$1,4)
    `, [TEST_PASSWORD_HASH]);
    await pool.query(`
        INSERT INTO profiles (id, full_name, role_id) VALUES
        (1,'Manager',1),(2,'Coordinator',2),(3,'Accountant',3),(4,'Driver A',4)
    `);
    await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Xe 5m2', ${PRICE_PER_KM})`);
    await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '51E-246.80', 1, 4, 'active')`);
    await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date) VALUES (4, 1, 1, 'DL-1', CURRENT_DATE)`);
    await pool.query(`
        INSERT INTO customers (id, customer_type, company_name, contact_person, phone)
        VALUES (2, 'business', 'Cong ty Moc Viet', 'Mr. Hung', '0987000003')
    `);
    await pool.query(`
        INSERT INTO orders (id, customer_id, created_by, cargo_name, payment_type, total_estimated_price)
        VALUES (2, 2, 2, 'Noi that', 'cash', ${CREDIT_PRICE})
    `);
    await pool.query(`
        INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_price, estimated_distance_km, status)
        VALUES (2, 2, 1, 1, ${CREDIT_PRICE}, ${ACTUAL_KM}, 'available')
    `);
    await pool.query(`
        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address) VALUES
        (2, 1, 'pickup', 'Xuong Moc Viet, Q5'), (2, 2, 'delivery', 'Cang Cat Lai')
    `);

});

afterAll(async () => {
    await teardown();
});

const img = () => Buffer.from('fake-image-bytes');

describe('L3-FLOW-04 — API: Đơn cash khách xin nợ (TH3) → Nợ khách hàng → Trả dần qua API', () => {
    it('B1 — Mỗi vai trò đăng nhập THẬT qua HTTP (POST /auth/login) trước khi bắt đầu luồng', async () => {
        driverToken = await loginAs(app, 'driver1@test.com');
        coordToken = await loginAs(app, 'coord@test.com');
        acctToken = await loginAs(app, 'acct@test.com');
    });

    it('B2 [driver] — chạy trọn vòng đời chuyến qua HTTP và gửi yêu cầu phiếu thu', async () => {
        const claim = await request(app).post('/api/trips/2/claim').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(claim.status, 200);

        const picking = await request(app).patch('/api/trips/2/status')
            .set('Authorization', `Bearer ${driverToken}`).send({ status: 'picking' });
        assert.strictEqual(picking.status, 200);

        const transit = await request(app).post('/api/trips/2/start-transit')
            .set('Authorization', `Bearer ${driverToken}`).attach('proof', img(), 'loading.jpg');
        assert.strictEqual(transit.status, 200);

        const arrived = await request(app).patch('/api/trips/2/status')
            .set('Authorization', `Bearer ${driverToken}`).send({ status: 'arrived' });
        assert.strictEqual(arrived.status, 200);

        const complete = await request(app).post('/api/trips/2/complete')
            .set('Authorization', `Bearer ${driverToken}`).attach('proof', img(), 'delivery.jpg');
        assert.strictEqual(complete.status, 200);

        const rr = await request(app).post('/api/orders/2/request-receipt')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ shipment_id: 2, actual_km: ACTUAL_KM });
        assert.strictEqual(rr.status, 201);
        assert.strictEqual(rr.body.receipt_request_created, true);
    });

    it('B3 [coordinator] — duyệt yêu cầu → phiếu thu 3.000.000', async () => {
        const list = await request(app).get('/api/coordinator/receipt-requests')
            .set('Authorization', `Bearer ${coordToken}`);
        assert.strictEqual(list.status, 200);
        const pending = (list.body.requests ?? list.body).find((r) => r.order_id === 2);
        assert.ok(pending, 'coordinator phải thấy yêu cầu phiếu thu của đơn 2');

        const approve = await request(app).post(`/api/coordinator/receipt-requests/${pending.id}/approve`)
            .set('Authorization', `Bearer ${coordToken}`)
            .send({ notes: 'cong no 30 ngay', expenses: [] });
        assert.strictEqual(approve.status, 201);

        const { rows: [receipt] } = await pool.query('SELECT amount FROM shipment_receipts WHERE shipment_id = 2');
        assert.strictEqual(Number(receipt.amount), CREDIT_PRICE);
    });

    it('B4 [driver] — chọn "Khách nợ" (client_credit) → nợ KHÁCH HÀNG, không nợ tài xế', async () => {
        const { rows: [receipt] } = await pool.query('SELECT id FROM shipment_receipts WHERE shipment_id = 2');
        const record = await request(app).post(`/api/trips/receipts/${receipt.id}/record-collection`)
            .set('Authorization', `Bearer ${driverToken}`)
            .field('payment_type', 'client_credit');
        assert.strictEqual(record.status, 200);

        const debt = await request(app).get('/accountant/debts/person/customer/2')
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(debt.status, 200);
        const [d] = debt.body.debts;
        assert.strictEqual(Number(d.remaining), CREDIT_PRICE);

        const { rows: driverDebts } = await pool.query(
            `SELECT id FROM debts WHERE debt_type = 'driver' AND shipment_id = 2`,
        );
        assert.strictEqual(driverDebts.length, 0, 'client_credit không được sinh nợ tài xế');
    });

    it('B5 [accountant] — thanh toán một phần qua API (chuyển khoản) → nợ giảm', async () => {
        const allocate = await request(app).post('/accountant/debts/payment/allocate')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({ personType: 'customer', personId: 2, amount: 1_000_000, paymentMethod: 'bank_transfer', notes: 'tra dot 1' });
        assert.strictEqual(allocate.status, 200);

        const { rows: [summary] } = await pool.query('SELECT remaining_debt FROM v_customer_debt_summary WHERE customer_id = 2');
        assert.strictEqual(Number(summary.remaining_debt), CREDIT_PRICE - 1_000_000);
    });

    it('B6 [accountant] — thanh toán nốt phần còn lại qua API → tất toán, biến mất khỏi danh sách nợ', async () => {
        const allocate = await request(app).post('/accountant/debts/payment/allocate')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({ personType: 'customer', personId: 2, amount: CREDIT_PRICE - 1_000_000, paymentMethod: 'cash', notes: 'tat toan' });
        assert.strictEqual(allocate.status, 200);

        const { rows } = await pool.query('SELECT * FROM v_customer_debt_summary WHERE customer_id = 2');
        assert.strictEqual(rows.length, 0);
    });
});

describe('L3-FLOW-04 — Negative paths over HTTP (BR-018, authZ, invalid input)', () => {
    it('N1 — BR-018: sending a second receipt request for the same order is rejected', async () => {
        const res = await request(app).post('/api/orders/2/request-receipt')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ shipment_id: 2, actual_km: ACTUAL_KM });
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });

    it('N2 — a driver token hitting the accountant-only debt allocation endpoint is forbidden', async () => {
        const res = await request(app).post('/accountant/debts/payment/allocate')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ personType: 'customer', personId: 2, amount: 100000, paymentMethod: 'cash' });
        assert.strictEqual(res.status, 403);
    });

    it('N3 — allocating a payment with an invalid personType is rejected', async () => {
        const res = await request(app).post('/accountant/debts/payment/allocate')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({ personType: 'not_a_real_type', personId: 2, amount: 100000, paymentMethod: 'cash' });
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });

    it('N4 — allocating a non-positive payment amount is rejected', async () => {
        const res = await request(app).post('/accountant/debts/payment/allocate')
            .set('Authorization', `Bearer ${acctToken}`)
            .send({ personType: 'customer', personId: 2, amount: 0, paymentMethod: 'cash' });
        assert.ok(res.status >= 400, `expected an error status, got ${res.status}`);
    });
});
