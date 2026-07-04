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
let otherDriverToken;
let uninstallCloudinaryMock;

describe('Expense Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        uninstallCloudinaryMock = installCloudinaryMock();
        ({ pool, teardown } = await setupTestDb());

        const expenseRoutes = require('../../routes/expenseRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/expenses', expenseRoutes);

        driverToken      = signAccessToken({ userId: 1, email: 'driver1@test.com', role: 'driver' });
        otherDriverToken = signAccessToken({ userId: 2, email: 'driver2@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
        uninstallCloudinaryMock();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE expense_attachments, expenses, shipment_assignment_history, order_shipments,
                     orders, vehicles, vehicle_groups, drivers, profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'driver1@test.com', 'hash', 2, true),
            (2, 'driver2@test.com', 'hash', 2, true)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Driver One', 2),
            (2, 'Driver Two', 2)
        `);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, '5m2', 15000)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '29A-11111', 1, 1, 'active')`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (1, 1, 'L1', CURRENT_DATE)`);
        await pool.query(`INSERT INTO orders (id, created_by) VALUES (1, 1)`);
        await pool.query(`INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status) VALUES (1, 1, 1, 1, 'transit')`);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (1, 1, 1, 1, 'initial_assign')
        `);
    });

    it('POST /api/expenses without a token -> 403', async () => {
        const res = await request(app).post('/api/expenses').send({ shipmentId: 1, expenseType: 'fuel', amount: 100000 });
        assert.strictEqual(res.status, 403);
    });

    it('POST /api/expenses without a receipt -> 400 (BR-021: receipt required, "bắt buộc" maps to 400 in expenseController)', async () => {
        const res = await request(app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('shipmentId', '1')
            .field('expenseType', 'fuel')
            .field('amount', '200000');

        assert.strictEqual(res.status, 400);
    });

    it('POST /api/expenses WITH a receipt file -> 201, creates the expense (BR-021/022, Cloudinary mocked)', async () => {
        const res = await request(app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('shipmentId', '1')
            .field('expenseType', 'fuel')
            .field('amount', '200000')
            .field('description', 'Đổ xăng')
            .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });

        assert.strictEqual(res.status, 201);
    });

    it('POST /api/expenses missing shipmentId -> 400', async () => {
        const res = await request(app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('expenseType', 'fuel')
            .field('amount', '200000')
            .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });

        assert.strictEqual(res.status, 400);
    });

    it('GET /api/expenses/shipment/:shipmentId as a driver not on the shipment -> 403', async () => {
        const res = await request(app)
            .get('/api/expenses/shipment/1')
            .set('Authorization', `Bearer ${otherDriverToken}`);

        assert.strictEqual(res.status, 403);
    });

    it('GET /api/expenses/shipment/:shipmentId as the owning driver -> 200', async () => {
        await request(app)
            .post('/api/expenses')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('shipmentId', '1')
            .field('expenseType', 'fuel')
            .field('amount', '200000')
            .attach('receipt', Buffer.from('fake-image-bytes'), { filename: 'receipt.jpg', contentType: 'image/jpeg' });

        const res = await request(app)
            .get('/api/expenses/shipment/1')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.expenses.length, 1);
    });
});
