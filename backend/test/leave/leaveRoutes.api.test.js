const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('../helpers/testDb');
const { signAccessToken } = require('../helpers/authToken');

let pool;
let teardown;
let app;
let driverToken;

describe('Leave Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        const leaveRoutes = require('../../routes/leaveRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/leave', leaveRoutes);

        driverToken = signAccessToken({ userId: 1, email: 'driver@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE leave_requests, drivers, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES (1, 'driver@test.com', 'hash', 2, true)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Driver One', 2)`);
        await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (1, 'L1', CURRENT_DATE)`);
    });

    it('GET /api/leave/me without a token -> 403', async () => {
        const res = await request(app).get('/api/leave/me');
        assert.strictEqual(res.status, 403);
    });

    it('POST /api/leave -> 201, then GET /api/leave/me lists it', async () => {
        const createRes = await request(app)
            .post('/api/leave')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ leaveDate: '2026-10-10', leaveType: 'paid', reason: 'sick' });

        assert.strictEqual(createRes.status, 201);
        assert.strictEqual(createRes.body.leave.leave_type, 'paid');

        const listRes = await request(app).get('/api/leave/me?month=10&year=2026').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(listRes.status, 200);
        assert.strictEqual(listRes.body.leaves.length, 1);
    });

    it('POST /api/leave with an invalid leaveType -> 400', async () => {
        const res = await request(app)
            .post('/api/leave')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ leaveDate: '2026-10-10', leaveType: 'holiday' });

        assert.strictEqual(res.status, 400);
    });

    it('GET /api/leave/summary -> 200 with computed working_days', async () => {
        await request(app).post('/api/leave').set('Authorization', `Bearer ${driverToken}`).send({ leaveDate: '2026-10-01', leaveType: 'unpaid' });

        const res = await request(app).get('/api/leave/summary?month=10&year=2026').set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(Number(res.body.unpaid_days), 1);
    });

    it('DELETE /api/leave/:id for a future leave -> 200, removes it', async () => {
        const createRes = await request(app)
            .post('/api/leave')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ leaveDate: '2099-01-01', leaveType: 'paid' });

        const res = await request(app).delete(`/api/leave/${createRes.body.leave.id}`).set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        const listRes = await request(app).get('/api/leave/me?month=1&year=2099').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(listRes.body.leaves.length, 0);
    });

    it('DELETE /api/leave/:id for a past leave -> 422 (business rule enforced at repository level)', async () => {
        await pool.query(`INSERT INTO leave_requests (id, driver_id, leave_date, leave_type, status) VALUES (99, 1, '2000-01-01', 'paid', 'approved')`);

        const res = await request(app).delete('/api/leave/99').set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 422);
    });
});
