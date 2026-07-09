const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('../helpers/testDb');
const { signAccessToken } = require('../helpers/authToken');
const { installCloudinaryMock } = require('../helpers/cloudinaryMock');

let pool;
let teardown;
let app;
let driverToken;
let uninstallCloudinaryMock;

describe('Debt Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        uninstallCloudinaryMock = installCloudinaryMock();
        ({ pool, teardown } = await setupTestDb());

        const debtRoutes = require('../../routes/debtRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/debts', debtRoutes);

        driverToken = signAccessToken({ userId: 1, email: 'driver@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
        uninstallCloudinaryMock();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE debt_payments, debts, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver'), (4, 'accountant') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'driver@test.com', 'hash', 2, true),
            (2, 'acc@test.com', 'hash', 4, true)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Driver One', 2),
            (2, 'Accountant One', 4)
        `);
        await pool.query(`INSERT INTO debts (id, debt_type, driver_id, total_amount) VALUES (1, 'driver', 1, 1000000)`);
    });

    it('GET /api/debts/me without a token -> 403', async () => {
        const res = await request(app).get('/api/debts/me');
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/debts/me -> 200 with the driver\'s own debts', async () => {
        const res = await request(app).get('/api/debts/me').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 200);
    });

    it('GET /api/debts/summary -> 200 with total_remaining', async () => {
        const res = await request(app).get('/api/debts/summary').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(Number(res.body.total_remaining), 1000000);
    });

    it('POST /api/debts/:id/repayments without a receipt file -> 422 (BR: receipt required)', async () => {
        const res = await request(app)
            .post('/api/debts/1/repayments')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('amount', '300000');

        assert.strictEqual(res.status, 422);
    });

    it('POST /api/debts/:id/repayments WITH a receipt file -> 201 (BR-020, Cloudinary mocked)', async () => {
        const res = await request(app)
            .post('/api/debts/1/repayments')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('amount', '300000')
            .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(Number(res.body.payment.amount), 300000);
    });

    it('GET /api/debts/:id/payments -> 200 with the repayment history for that debt', async () => {
        await request(app)
            .post('/api/debts/1/repayments')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('amount', '300000')
            .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });

        const res = await request(app)
            .get('/api/debts/1/payments')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.payments.length, 1);
        assert.strictEqual(Number(res.body.payments[0].amount), 300000);
    });

    it('GET /api/debts/:id/payments for a debt belonging to another driver -> 200 with an empty list', async () => {
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES (3, 'driver2@test.com', 'hash', 2, true)
        `);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (3, 'Driver Two', 2)`);
        const otherDriverToken = signAccessToken({ userId: 3, email: 'driver2@test.com', role: 'driver' });

        await request(app)
            .post('/api/debts/1/repayments')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('amount', '300000')
            .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });

        const res = await request(app)
            .get('/api/debts/1/payments')
            .set('Authorization', `Bearer ${otherDriverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.payments.length, 0);
    });

    it('DELETE /api/debts/repayments/:paymentId cancels a pending repayment request', async () => {
        const created = await request(app)
            .post('/api/debts/1/repayments')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('amount', '300000')
            .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });

        const res = await request(app)
            .delete(`/api/debts/repayments/${created.body.payment.id}`)
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        const row = await pool.query('SELECT id FROM debt_payments WHERE id = $1', [created.body.payment.id]);
        assert.strictEqual(row.rows.length, 0);
    });

    it('DELETE /api/debts/repayments/:paymentId belonging to another driver -> 403', async () => {
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES (3, 'driver2@test.com', 'hash', 2, true)
        `);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (3, 'Driver Two', 2)`);
        const otherDriverToken = signAccessToken({ userId: 3, email: 'driver2@test.com', role: 'driver' });

        const created = await request(app)
            .post('/api/debts/1/repayments')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('amount', '300000')
            .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });

        const res = await request(app)
            .delete(`/api/debts/repayments/${created.body.payment.id}`)
            .set('Authorization', `Bearer ${otherDriverToken}`);

        assert.strictEqual(res.status, 403);
    });

    it('DELETE /api/debts/repayments/:paymentId for a non-existent payment -> 404', async () => {
        const res = await request(app)
            .delete('/api/debts/repayments/999999')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 404);
    });

    // NOTE: GET /repayments/pending, PATCH /repayments/:id/confirm, PATCH /repayments/:id/reject
    // (the accountant/manager-facing financeRoles endpoints) were removed from debtRoutes.js in
    // commit c5875fe "fix dead code(api error)" — no frontend caller referenced them. The
    // service-layer logic (debtService.getPendingRepayments/confirmRepayment/rejectRepayment)
    // still exists and is covered at L2 (backend/test/debt/debtService.integration.test.js),
    // but is no longer reachable via HTTP.
});
