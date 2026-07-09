const { describe, it, before, after, beforeEach, afterEach, mock } = require('node:test');
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
let emailService;

describe('Admin Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        emailService = require('../services/emailService');

        const adminRoutes = require('../routes/adminRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/admin', adminRoutes);

        managerToken = signAccessToken({ userId: 1, email: 'manager@test.com', role: 'manager' });
        driverToken = signAccessToken({ userId: 2, email: 'driver@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
    });

    afterEach(() => {
        mock.restoreAll();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver'), (5, 'manager') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'manager@test.com', 'hash', 5, true),
            (2, 'driver@test.com', 'hash', 2, true),
            (3, 'driver2@test.com', 'hash', 2, true)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, phone, role_id) VALUES
            (1, 'Manager One', '0900000001', 5),
            (2, 'Driver One', '0900000002', 2),
            (3, 'Driver Two', '0900000003', 2)
        `);
        mock.method(emailService, 'sendWelcomeEmail', async () => {});
    });

    describe('GET /api/admin/users', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/admin/users');
            assert.strictEqual(res.status, 403);
        });

        it('as a driver (wrong role) -> 403', async () => {
            const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('as a manager -> 200 with the full user list', async () => {
            const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${managerToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.users.length, 3);
        });
    });

    describe('POST /api/admin/users', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/admin/users').send({ email: 'x@test.com', role: 'driver' });
            assert.strictEqual(res.status, 403);
        });

        it('as a driver (wrong role) -> 403', async () => {
            const res = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ email: 'x@test.com', role: 'driver' });
            assert.strictEqual(res.status, 403);
        });

        it('duplicate email -> 409', async () => {
            const res = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ email: 'driver@test.com', full_name: 'Dup', phone: '0911111199', role: 'driver' });
            assert.strictEqual(res.status, 409);
            assert.strictEqual(res.body.error, 'Email đã tồn tại.');
        });

        it('happy path as manager -> 201, creates account + profile, sends welcome email', async () => {
            const res = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ email: 'new.user@test.com', full_name: 'New User', phone: '0911111111', role: 'driver' });

            assert.strictEqual(res.status, 201);
            assert.ok(res.body.id);
            assert.strictEqual(res.body.message, 'Tạo người dùng thành công.');
            assert.strictEqual(emailService.sendWelcomeEmail.mock.calls.length, 1);

            const account = await pool.query('SELECT email FROM accounts WHERE id = $1', [res.body.id]);
            assert.strictEqual(account.rows[0].email, 'new.user@test.com');
        });
    });

    describe('PUT /api/admin/users/:id', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).put('/api/admin/users/2').send({ full_name: 'X', phone: '0900000002', role: 'driver' });
            assert.strictEqual(res.status, 403);
        });

        it('as a driver (wrong role) -> 403', async () => {
            const res = await request(app)
                .put('/api/admin/users/2')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ full_name: 'X', phone: '0900000002', role: 'driver' });
            assert.strictEqual(res.status, 403);
        });

        it('non-existent user -> 404', async () => {
            const res = await request(app)
                .put('/api/admin/users/999')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ full_name: 'Ghost', phone: '0900099999', role: 'driver' });
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error, 'Người dùng không tồn tại.');
        });

        it('happy path as manager -> 200, persists the update', async () => {
            const res = await request(app)
                .put('/api/admin/users/2')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ full_name: 'Driver Updated', phone: '0900000099', role: 'driver' });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Cập nhật thành công.');

            const profile = await pool.query('SELECT full_name, phone FROM profiles WHERE id = 2');
            assert.strictEqual(profile.rows[0].full_name, 'Driver Updated');
            assert.strictEqual(profile.rows[0].phone, '0900000099');
        });
    });

    describe('PATCH /api/admin/users/:id/status', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).patch('/api/admin/users/2/status').send({ is_active: false });
            assert.strictEqual(res.status, 403);
        });

        it('as a driver (wrong role) -> 403', async () => {
            const res = await request(app)
                .patch('/api/admin/users/2/status')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ is_active: false });
            assert.strictEqual(res.status, 403);
        });

        it('manager locking their own account -> 400', async () => {
            const res = await request(app)
                .patch('/api/admin/users/1/status')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ is_active: false });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Không thể tự khóa tài khoản của chính mình.');
        });

        it('happy path as manager -> 200, persists is_active=false', async () => {
            const res = await request(app)
                .patch('/api/admin/users/2/status')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ is_active: false });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Đã khóa tài khoản.');

            const account = await pool.query('SELECT is_active FROM accounts WHERE id = 2');
            assert.strictEqual(account.rows[0].is_active, false);
        });
    });
});
