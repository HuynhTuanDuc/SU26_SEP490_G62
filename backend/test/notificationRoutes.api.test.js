const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('./helpers/testDb');
const { signAccessToken } = require('./helpers/authToken');

let pool;
let teardown;
let app;
let driverToken;
let otherDriverToken;

describe('Notification Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        const notificationRoutes = require('../routes/notificationRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/notifications', notificationRoutes);

        driverToken = signAccessToken({ userId: 1, email: 'driver@test.com', role: 'driver' });
        otherDriverToken = signAccessToken({ userId: 2, email: 'driver2@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE notifications, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'driver@test.com', 'hash', 2, true),
            (2, 'driver2@test.com', 'hash', 2, true)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Driver One', 2),
            (2, 'Driver Two', 2)
        `);
        await pool.query(`
            INSERT INTO notifications (id, user_id, title, body, type, is_read) VALUES
            (1, 1, 'Trip assigned', 'You have a new trip', 'TRIP_ASSIGNED', false),
            (2, 1, 'KPI updated', 'Your KPI was updated', 'KPI_UPDATED', true),
            (3, 2, 'Other user notification', 'Not yours', 'SYSTEM_ALERT', false)
        `);
    });

    describe('GET /api/notifications', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/notifications');
            assert.strictEqual(res.status, 403);
        });

        it('as the driver -> 200 with only their own notifications', async () => {
            const res = await request(app).get('/api/notifications').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.notifications.length, 2);
            assert.strictEqual(res.body.unreadCount, 1);
            assert.strictEqual(res.body.total, 2);
            assert.ok(res.body.notifications.every((n) => n.user_id === 1));
        });

        it('supports pagination query params', async () => {
            const res = await request(app)
                .get('/api/notifications?page=1&limit=1')
                .set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.notifications.length, 1);
            assert.strictEqual(res.body.limit, 1);
            assert.strictEqual(res.body.totalPages, 2);
        });
    });

    describe('PATCH /api/notifications/read-all', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).patch('/api/notifications/read-all');
            assert.strictEqual(res.status, 403);
        });

        it('as the driver -> 200, marks all of their notifications read', async () => {
            const res = await request(app).patch('/api/notifications/read-all').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.ok, true);

            const row = await pool.query('SELECT is_read FROM notifications WHERE id = 1');
            assert.strictEqual(row.rows[0].is_read, true);

            // does not affect another user's notifications
            const otherRow = await pool.query('SELECT is_read FROM notifications WHERE id = 3');
            assert.strictEqual(otherRow.rows[0].is_read, false);
        });
    });

    describe('GET /api/notifications/:id', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/notifications/1');
            assert.strictEqual(res.status, 403);
        });

        it('with an invalid (non-numeric) id -> 400', async () => {
            const res = await request(app).get('/api/notifications/abc').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Notification ID không hợp lệ');
        });

        it('with an id belonging to another user -> 404', async () => {
            const res = await request(app).get('/api/notifications/3').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error, 'Thông báo không tồn tại');
        });

        it('with a valid own id -> 200 and marks it read as a side effect', async () => {
            const res = await request(app).get('/api/notifications/1').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.notification.id, 1);
            assert.strictEqual(res.body.notification.is_read, true);

            const row = await pool.query('SELECT is_read FROM notifications WHERE id = 1');
            assert.strictEqual(row.rows[0].is_read, true);
        });
    });

    describe('PATCH /api/notifications/:id/read', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).patch('/api/notifications/1/read');
            assert.strictEqual(res.status, 403);
        });

        it('with an invalid (non-numeric) id -> 400', async () => {
            const res = await request(app).patch('/api/notifications/abc/read').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Notification ID không hợp lệ');
        });

        it("with another user's notification id -> 404", async () => {
            const res = await request(app).patch('/api/notifications/3/read').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error, 'Thông báo không tồn tại');
        });

        it('with a valid own id -> 200, marks it read', async () => {
            const res = await request(app).patch('/api/notifications/1/read').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.notification.id, 1);
            assert.strictEqual(res.body.notification.is_read, true);
        });
    });
});
