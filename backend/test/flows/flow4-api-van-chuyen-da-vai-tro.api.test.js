/**
 * L3-FLOW-01 — Luồng System API: Vận chuyển tiền mặt ĐA VAI TRÒ qua HTTP thật
 *
 * Test THEO LUỒNG ở tầng API: một chuỗi request tuần tự qua 4 vai trò (driver →
 * coordinator → driver → accountant) trên CÙNG app Express mount toàn bộ route thật
 * (routes/index.js — y hệt app.js), JWT thật, DB Postgres thật, upload multipart thật
 * (Cloudinary mock qua moduleNameMapper).
 *
 *   [driver]      GET  /api/trips/pool → POST claim → PATCH status → POST start-transit
 *                 → PATCH arrived → POST complete → POST /api/orders/:id/request-receipt
 *   [coordinator] GET  /api/coordinator/receipt-requests → POST .../approve
 *   [driver]      GET  /api/trips/receipts → POST .../record-collection (tiền mặt)
 *                 → GET /api/debts/summary (nợ 1.5tr) → POST /api/debts/:id/repayments
 *   [accountant]  GET  /api/debts/repayments/pending → PATCH .../confirm
 *   [driver]      GET  /api/debts/summary → nợ về 0
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';

const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('../helpers/testDb');
const { signAccessToken } = require('../helpers/authToken');

let pool;
let teardown;
let app;
let driverToken;
let coordToken;
let acctToken;

const PRICE_PER_KM = 15000;
const ACTUAL_KM = 100;
const EXPECTED_PRICE = ACTUAL_KM * PRICE_PER_KM; // 1.500.000
const img = () => Buffer.from('fake-image-bytes');

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());

    // App thật: mount TOÀN BỘ cây route như app.js (không mount lẻ từng router)
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
        (1,'manager@test.com','hash',1),(2,'coord@test.com','hash',2),
        (3,'acct@test.com','hash',3),(4,'driver1@test.com','hash',4)
    `);
    await pool.query(`
        INSERT INTO profiles (id, full_name, role_id) VALUES
        (1,'Manager',1),(2,'Coordinator',2),(3,'Accountant',3),(4,'Driver A',4)
    `);
    await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Xe 5m2', ${PRICE_PER_KM})`);
    await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '51E-246.80', 1, 4, 'active')`);
    await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (4, 1, 'DL-1', CURRENT_DATE)`);
    await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1, 'individual', 'Nguyen Van A', '0912345678')`);
    await pool.query(`
        INSERT INTO orders (id, customer_id, created_by, cargo_name, payment_type, total_estimated_price)
        VALUES (1, 1, 2, 'Hang gia dung', 'cash', 1400000)
    `);
    await pool.query(`
        INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_price, estimated_distance_km, status)
        VALUES (1, 1, 1, 1, 1400000, 95, 'available')
    `);
    await pool.query(`
        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address) VALUES
        (1, 1, 'pickup', '123 Nguyen Hue, Q1'), (1, 2, 'delivery', '45 QL51, Long Thanh')
    `);

    driverToken = signAccessToken({ userId: 4, role: 'driver' });
    coordToken = signAccessToken({ userId: 2, role: 'coordinator' });
    acctToken = signAccessToken({ userId: 3, role: 'accountant' });
});

afterAll(async () => {
    await teardown();
});

describe('L3-FLOW-01 — API: Vận chuyển tiền mặt đa vai trò (driver → coordinator → driver → accountant)', () => {
    it('B1 [driver] — GET /api/trips/pool thấy chuyến; không token thì 403', async () => {
        const noAuth = await request(app).get('/api/trips/pool');
        assert.strictEqual(noAuth.status, 403);

        const res = await request(app).get('/api/trips/pool').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 200);
        const pool1 = res.body.trips ?? res.body;
        assert.ok(JSON.stringify(pool1).includes('"order_id":1') || (Array.isArray(pool1) && pool1.length >= 1));
    });

    it('B2 [driver] — POST claim → 200; vòng đời picking → transit (ảnh) → arrived qua HTTP', async () => {
        const claim = await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(claim.status, 200);

        const picking = await request(app).patch('/api/trips/1/status')
            .set('Authorization', `Bearer ${driverToken}`).send({ status: 'picking' });
        assert.strictEqual(picking.status, 200);

        // BR-013: thiếu ảnh phải bị chặn 422
        const noProof = await request(app).post('/api/trips/1/start-transit')
            .set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(noProof.status, 422);

        const transit = await request(app).post('/api/trips/1/start-transit')
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', img(), 'loading.jpg');
        assert.strictEqual(transit.status, 200);

        const arrived = await request(app).patch('/api/trips/1/status')
            .set('Authorization', `Bearer ${driverToken}`).send({ status: 'arrived' });
        assert.strictEqual(arrived.status, 200);
    });

    it('B3 [driver] — POST complete (ảnh giao hàng) → completed; gửi yêu cầu phiếu thu kèm km → 201', async () => {
        const complete = await request(app).post('/api/trips/1/complete')
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', img(), 'delivery.jpg');
        assert.strictEqual(complete.status, 200);

        const rr = await request(app).post('/api/orders/1/request-receipt')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ shipment_id: 1, actual_km: ACTUAL_KM });
        assert.strictEqual(rr.status, 201);
        assert.strictEqual(rr.body.receipt_request_created, true);
    });

    it('B4 [coordinator] — thấy yêu cầu pending và duyệt → phiếu thu 1.5tr; driver không gọi được API coordinator', async () => {
        const forbidden = await request(app).get('/api/coordinator/receipt-requests')
            .set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(forbidden.status, 403, 'phân quyền: driver không được vào API coordinator');

        const list = await request(app).get('/api/coordinator/receipt-requests')
            .set('Authorization', `Bearer ${coordToken}`);
        assert.strictEqual(list.status, 200);
        const pending = (list.body.requests ?? list.body).find((r) => r.order_id === 1);
        assert.ok(pending, 'coordinator phải thấy yêu cầu phiếu thu');

        const approve = await request(app).post(`/api/coordinator/receipt-requests/${pending.id}/approve`)
            .set('Authorization', `Bearer ${coordToken}`)
            .send({ notes: 'ok', expenses: [] });
        assert.strictEqual(approve.status, 201);

        const { rows: [receipt] } = await pool.query('SELECT amount, payment_type FROM shipment_receipts WHERE shipment_id = 1');
        assert.strictEqual(Number(receipt.amount), EXPECTED_PRICE);
        assert.strictEqual(receipt.payment_type, null);
    });

    it('B5 [driver] — TH2: tài đã ứng 50k đỗ xe; thu TIỀN MẶT → nợ ghi đủ 1.5tr nhưng TỰ CẤN 50k → còn phải nộp 1.45tr', async () => {
        // Khoản tài ứng túi đã được duyệt trước đó (chờ hoàn)
        await pool.query(`
            INSERT INTO expenses (shipment_id, vehicle_id, created_by, expense_type, amount, description,
                                  status, reviewed_by, reviewed_at, reimbursement_status)
            VALUES (1, 1, 4, 'parking', 50000, 'Phi do xe tai kho', 'approved', 2, NOW(), 'pending')
        `);

        const receipts = await request(app).get('/api/trips/receipts').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(receipts.status, 200);
        const receipt = (receipts.body.receipts ?? receipts.body)[0];
        assert.ok(receipt, 'driver phải thấy phiếu thu coordinator vừa tạo');

        const record = await request(app).post(`/api/trips/receipts/${receipt.receipt_id}/record-collection`)
            .set('Authorization', `Bearer ${driverToken}`)
            .field('payment_type', 'cash_collected')
            .attach('proof', img(), 'cash.jpg');
        assert.strictEqual(record.status, 200);

        // Nợ gốc ghi ĐỦ 1.5tr (audit), nhưng 50k tài đã ứng được cấn tự động
        const { rows: [debt] } = await pool.query(`SELECT total_amount FROM debts WHERE debt_type = 'driver'`);
        assert.strictEqual(Number(debt.total_amount), EXPECTED_PRICE);
        const { rows: [offset] } = await pool.query(
            `SELECT amount, status FROM debt_payments WHERE payment_method = 'offset'`,
        );
        assert.strictEqual(Number(offset.amount), 50000, 'cấn trừ đúng phần tài đã ứng');
        assert.strictEqual(offset.status, 'confirmed');

        const { rows: [exp] } = await pool.query(`SELECT reimbursement_status FROM expenses WHERE expense_type = 'parking'`);
        assert.strictEqual(exp.reimbursement_status, 'offset_debt', 'khoản ứng đã tất toán bằng cấn trừ');

        const summary = await request(app).get('/api/debts/summary').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(Number(summary.body.total_remaining), EXPECTED_PRICE - 50000,
            'tài giữ 50k hợp lệ — chỉ còn phải nộp 1.45tr');
    });

    it('B6 [driver→accountant] — driver nộp đủ tiền (ảnh chứng từ) → kế toán thấy pending và xác nhận → nợ về 0', async () => {
        const { rows: [debt] } = await pool.query(`SELECT id FROM debts WHERE debt_type = 'driver' AND driver_id = 4`);

        const submit = await request(app).post(`/api/debts/${debt.id}/repayments`)
            .set('Authorization', `Bearer ${driverToken}`)
            .field('amount', String(EXPECTED_PRICE - 50000))
            .field('payment_method', 'cash')
            .attach('receipt', img(), 'repay.jpg');
        assert.ok([200, 201].includes(submit.status), `submit repayment failed: ${submit.status} ${JSON.stringify(submit.body)}`);

        const pending = await request(app).get('/api/debts/repayments/pending').set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(pending.status, 200);
        const payment = (pending.body.repayments ?? pending.body)[0];
        assert.ok(payment, 'kế toán phải thấy khoản nộp chờ xác nhận');

        const confirm = await request(app).patch(`/api/debts/repayments/${payment.id}/confirm`)
            .set('Authorization', `Bearer ${acctToken}`);
        assert.strictEqual(confirm.status, 200);

        const summary = await request(app).get('/api/debts/summary').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(Number(summary.body.total_remaining), 0);

        // Sổ kế toán khép kín: nợ tạo = tiền tài nộp + phần cấn trừ chi hộ (3388/1388)
        const { rows: [led] } = await pool.query(`
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE event_type = 'driver_debt_created'), 0) AS created,
                COALESCE(SUM(amount) FILTER (WHERE event_type = 'driver_debt_paid'), 0)    AS paid,
                COALESCE(SUM(amount) FILTER (WHERE event_type = 'pass_through_cost' AND credit_account = '1388'), 0) AS offset_reimb
            FROM financial_transactions
        `);
        assert.strictEqual(Number(led.created), EXPECTED_PRICE);
        assert.strictEqual(Number(led.paid), EXPECTED_PRICE - 50000);
        assert.strictEqual(Number(led.offset_reimb), 50000);
        assert.strictEqual(Number(led.paid) + Number(led.offset_reimb), Number(led.created), 'sổ cân tuyệt đối');
    });
});
