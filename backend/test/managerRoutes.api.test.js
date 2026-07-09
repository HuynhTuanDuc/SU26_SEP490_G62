const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('./helpers/testDb');
const { signAccessToken } = require('./helpers/authToken');

let pool;
let teardown;
let app;
let managerToken;
let driverToken;

describe('Manager Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        const managerRoutes = require('../routes/managerRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/manager', managerRoutes);

        managerToken = signAccessToken({ userId: 1, email: 'manager@test.com', role: 'manager' });
        driverToken  = signAccessToken({ userId: 2, email: 'driver@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE debt_payments, debts, salary_advances, payrolls, partners,
                     order_receipt_requests, drivers, vehicles, vehicle_groups,
                     profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`INSERT INTO roles (id, name) VALUES (1, 'manager'), (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'manager@test.com', 'hash', 1, true),
            (2, 'driver@test.com', 'hash', 2, true)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Manager One', 1),
            (2, 'Driver One', 2)
        `);
        await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (2, 'L1', CURRENT_DATE)`);
    });

    // ─── Dashboard ────────────────────────────────────────────────────────────

    it('GET /api/manager/dashboard without a token -> 403', async () => {
        const res = await request(app).get('/api/manager/dashboard');
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/manager/dashboard as a driver -> 403 (requireRole manager)', async () => {
        const res = await request(app).get('/api/manager/dashboard').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/manager/dashboard as manager -> 200 with overview/finance/queues', async () => {
        const res = await request(app).get('/api/manager/dashboard').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.overview);
        assert.ok(res.body.queues);
        assert.ok('salary_advances' in res.body.queues);
    });

    // ─── Salary advances ──────────────────────────────────────────────────────

    it('GET /api/manager/salary-advances without a token -> 403', async () => {
        const res = await request(app).get('/api/manager/salary-advances');
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/manager/salary-advances as manager -> 200 with a list', async () => {
        await pool.query(`
            INSERT INTO salary_advances (id, driver_id, amount, reason, request_month, request_year, status)
            VALUES (1, 2, 1000000, 'test', 6, 2026, 'pending')
        `);

        const res = await request(app).get('/api/manager/salary-advances').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.advances.length, 1);
    });

    it('PATCH /api/manager/salary-advances/:id/approve as driver -> 403', async () => {
        const res = await request(app)
            .patch('/api/manager/salary-advances/1/approve')
            .set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 403);
    });

    it('PATCH /api/manager/salary-advances/:id/approve on unknown id -> 404', async () => {
        const res = await request(app)
            .patch('/api/manager/salary-advances/999/approve')
            .set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 404);
    });

    it('PATCH /api/manager/salary-advances/:id/approve -> 200, status becomes approved', async () => {
        await pool.query(`
            INSERT INTO salary_advances (id, driver_id, amount, reason, request_month, request_year, status)
            VALUES (1, 2, 1000000, 'test', 6, 2026, 'pending')
        `);

        const res = await request(app)
            .patch('/api/manager/salary-advances/1/approve')
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.advance.status, 'approved');
    });

    it('PATCH /api/manager/salary-advances/:id/reject -> 200, status becomes rejected', async () => {
        await pool.query(`
            INSERT INTO salary_advances (id, driver_id, amount, reason, request_month, request_year, status)
            VALUES (1, 2, 1000000, 'test', 6, 2026, 'pending')
        `);

        const res = await request(app)
            .patch('/api/manager/salary-advances/1/reject')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ reason: 'không hợp lệ' });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.advance.status, 'rejected');
    });

    it('PATCH /api/manager/salary-advances/:id/approve when already processed -> 409', async () => {
        await pool.query(`
            INSERT INTO salary_advances (id, driver_id, amount, reason, request_month, request_year, status)
            VALUES (1, 2, 1000000, 'test', 6, 2026, 'approved')
        `);

        const res = await request(app)
            .patch('/api/manager/salary-advances/1/approve')
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 409);
    });

    // ─── Debt repayments ──────────────────────────────────────────────────────

    it('GET /api/manager/debt-repayments as manager -> 200 with a list of pending repayments', async () => {
        await pool.query(`INSERT INTO debts (id, debt_type, driver_id, total_amount) VALUES (1, 'driver', 2, 1000000)`);
        await pool.query(`
            INSERT INTO debt_payments (id, debt_id, amount, payment_method, status, created_by)
            VALUES (1, 1, 300000, 'cash', 'pending', 2)
        `);

        const res = await request(app).get('/api/manager/debt-repayments').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.repayments.length, 1);
    });

    it('PATCH /api/manager/debt-repayments/:paymentId/confirm -> 200, message returned', async () => {
        await pool.query(`INSERT INTO debts (id, debt_type, driver_id, total_amount) VALUES (1, 'driver', 2, 1000000)`);
        await pool.query(`
            INSERT INTO debt_payments (id, debt_id, amount, payment_method, status, created_by)
            VALUES (1, 1, 300000, 'cash', 'pending', 2)
        `);

        const res = await request(app)
            .patch('/api/manager/debt-repayments/1/confirm')
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.message, 'Đã xác nhận nộp tiền');

        const row = await pool.query('SELECT status FROM debt_payments WHERE id = 1');
        assert.strictEqual(row.rows[0].status, 'confirmed');
    });

    it('PATCH /api/manager/debt-repayments/:paymentId/reject -> 200', async () => {
        await pool.query(`INSERT INTO debts (id, debt_type, driver_id, total_amount) VALUES (1, 'driver', 2, 1000000)`);
        await pool.query(`
            INSERT INTO debt_payments (id, debt_id, amount, payment_method, status, created_by)
            VALUES (1, 1, 300000, 'cash', 'pending', 2)
        `);

        const res = await request(app)
            .patch('/api/manager/debt-repayments/1/reject')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ reason: 'invalid receipt' });

        assert.strictEqual(res.status, 200);

        const row = await pool.query('SELECT status FROM debt_payments WHERE id = 1');
        assert.strictEqual(row.rows[0].status, 'rejected');
    });

    it('PATCH /api/manager/debt-repayments/:paymentId/confirm on unknown id -> error (message "Không tìm thấy...", falls through sendError to 500)', async () => {
        const res = await request(app)
            .patch('/api/manager/debt-repayments/999/confirm')
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 500);
        assert.match(res.body.error, /Không tìm thấy/);
    });

    // ─── Payrolls ─────────────────────────────────────────────────────────────

    it('GET /api/manager/payrolls without a token -> 403', async () => {
        const res = await request(app).get('/api/manager/payrolls');
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/manager/payrolls?month=&year= -> 200 with payrolls + stats', async () => {
        await pool.query(`
            INSERT INTO payrolls (id, driver_id, payroll_month, payroll_year, base_salary, months_of_service, status)
            VALUES (1, 2, 6, 2026, 8000000, 3, 'pending')
        `);

        const res = await request(app)
            .get('/api/manager/payrolls?month=6&year=2026')
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.payrolls.length, 1);
        assert.strictEqual(res.body.month, 6);
        assert.strictEqual(res.body.year, 2026);
        assert.ok(res.body.stats);
    });

    it('GET /api/manager/payrolls?status=bogus -> 400 (invalid status)', async () => {
        const res = await request(app)
            .get('/api/manager/payrolls?status=bogus')
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 400);
    });

    it('PATCH /api/manager/payrolls/:id/review -> 200, status becomes reviewed', async () => {
        await pool.query(`
            INSERT INTO payrolls (id, driver_id, payroll_month, payroll_year, base_salary, months_of_service, status)
            VALUES (1, 2, 6, 2026, 8000000, 3, 'pending')
        `);

        const res = await request(app)
            .patch('/api/manager/payrolls/1/review')
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.payroll.status, 'reviewed');
    });

    it('PATCH /api/manager/payrolls/:id/review on unknown id -> 4xx error', async () => {
        const res = await request(app)
            .patch('/api/manager/payrolls/999/review')
            .set('Authorization', `Bearer ${managerToken}`);

        assert.ok(res.status >= 400 && res.status < 500);
    });

    // ─── Receipt requests ─────────────────────────────────────────────────────

    it('GET /api/manager/receipt-requests as manager -> 200', async () => {
        const res = await request(app).get('/api/manager/receipt-requests').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 200);
    });

    it('GET /api/manager/receipt-requests as driver -> 403', async () => {
        const res = await request(app).get('/api/manager/receipt-requests').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 403);
    });

    // ─── Partners ─────────────────────────────────────────────────────────────

    it('GET /api/manager/partners -> 200 with partners + summary', async () => {
        const res = await request(app).get('/api/manager/partners').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.body.partners));
        assert.ok(res.body.summary);
    });

    it('POST /api/manager/partners missing company_name -> error (message "là bắt buộc" does not match sendError\'s substrings, falls through to 500)', async () => {
        const res = await request(app)
            .post('/api/manager/partners')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ phone: '0912345678' });

        assert.strictEqual(res.status, 500);
        assert.match(res.body.error, /bắt buộc/);
    });

    it('POST /api/manager/partners as driver -> 403', async () => {
        const res = await request(app)
            .post('/api/manager/partners')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ company_name: 'ABC Logistics' });

        assert.strictEqual(res.status, 403);
    });

    it('POST /api/manager/partners -> 201, persists the partner', async () => {
        const res = await request(app)
            .post('/api/manager/partners')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ company_name: 'ABC Logistics', phone: '0912345678' });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.partner.company_name, 'ABC Logistics');

        const row = await pool.query('SELECT company_name FROM partners WHERE id = $1', [res.body.partner.id]);
        assert.strictEqual(row.rows[0].company_name, 'ABC Logistics');
    });

    it('PUT /api/manager/partners/:id on unknown id -> 404', async () => {
        const res = await request(app)
            .put('/api/manager/partners/999')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ company_name: 'Updated Co' });

        assert.strictEqual(res.status, 404);
    });

    it('PUT /api/manager/partners/:id -> 200, updates the partner', async () => {
        const createRes = await request(app)
            .post('/api/manager/partners')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ company_name: 'ABC Logistics' });
        const partnerId = createRes.body.partner.id;

        const res = await request(app)
            .put(`/api/manager/partners/${partnerId}`)
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ company_name: 'ABC Logistics Updated' });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.partner.company_name, 'ABC Logistics Updated');
    });

    it('GET /api/manager/partners/:id/debts on unknown id -> 404', async () => {
        const res = await request(app)
            .get('/api/manager/partners/999/debts')
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 404);
    });

    it('GET /api/manager/partners/:id/debts -> 200 with partner + debts', async () => {
        const createRes = await request(app)
            .post('/api/manager/partners')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ company_name: 'ABC Logistics' });
        const partnerId = createRes.body.partner.id;

        const res = await request(app)
            .get(`/api/manager/partners/${partnerId}/debts`)
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.partner.id, partnerId);
        assert.ok(Array.isArray(res.body.debts));
    });
});
