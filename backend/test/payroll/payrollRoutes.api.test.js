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

describe('Payroll Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        const payrollRoutes = require('../../routes/payrollRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/payroll', payrollRoutes);

        driverToken = signAccessToken({ userId: 1, email: 'driver@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE payrolls, salary_advances, drivers, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES (1, 'driver@test.com', 'hash', 2, true)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Driver One', 2)`);
        await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (1, 'L1', CURRENT_DATE)`);
    });

    it('GET /api/payroll/me without a token -> 403', async () => {
        const res = await request(app).get('/api/payroll/me');
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/payroll/me -> 200 with the driver\'s own payroll history', async () => {
        await pool.query(`
            INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service)
            VALUES (1, 6, 2026, 8000000, 3)
        `);

        const res = await request(app).get('/api/payroll/me?month=6&year=2026').set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.payrolls.length, 1);
    });

    it('GET /api/payroll/estimate -> 200 with an estimate computed from live data', async () => {
        const res = await request(app).get('/api/payroll/estimate').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 200);
    });

    it('POST /api/payroll/advance missing requestMonth/requestYear -> 400', async () => {
        const res = await request(app)
            .post('/api/payroll/advance')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ amount: 1000000 });

        assert.strictEqual(res.status, 400);
    });

    it('POST /api/payroll/advance outside the 25th -> 400 (business rule: only allowed on the 25th)', async () => {
        const res = await request(app)
            .post('/api/payroll/advance')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ amount: 1000000, reason: 'test', requestMonth: 6, requestYear: 2026 });

        // This test may coincidentally run ON the 25th — assert whichever branch is actually correct.
        if (new Date().getDate() === 25) {
            assert.strictEqual(res.status, 201);
        } else {
            assert.strictEqual(res.status, 400);
            assert.match(res.body.error, /ngày 25/);
        }
    });

    it('POST /api/payroll/advance on the 25th -> 201, then GET /api/payroll/advance lists it (BR-029)', async () => {
        const RealDate = Date;
        global.Date = class extends RealDate {
            constructor(...args) {
                if (args.length) return new RealDate(...args);
                return new RealDate('2026-06-25T00:00:00Z');
            }
            static now() { return new RealDate('2026-06-25T00:00:00Z').getTime(); }
        };

        try {
            const createRes = await request(app)
                .post('/api/payroll/advance')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ amount: 1000000, reason: 'test', requestMonth: 6, requestYear: 2026 });

            assert.strictEqual(createRes.status, 201);
            assert.strictEqual(createRes.body.advance.status, 'pending');

            const listRes = await request(app).get('/api/payroll/advance').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(listRes.status, 200);
            assert.strictEqual(listRes.body.advances.length, 1);
        } finally {
            global.Date = RealDate;
        }
    });

    it('POST /api/payroll/advance over the max amount -> 400', async () => {
        const res = await request(app)
            .post('/api/payroll/advance')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ amount: 999999999, requestMonth: 6, requestYear: 2026 });

        assert.strictEqual(res.status, 400);
    });
});
