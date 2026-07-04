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

describe('Kpi Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        const kpiRoutes = require('../../routes/kpiRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/kpi', kpiRoutes);

        driverToken = signAccessToken({ userId: 1, email: 'driver@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE kpi_records, vehicles, vehicle_groups, drivers, profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver'), (3, 'coordinator') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'driver@test.com', 'hash', 2, true),
            (2, 'coord@test.com', 'hash', 3, true)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Driver One', 2),
            (2, 'Coordinator One', 3)
        `);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, '5m2', 15000)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '29A-11111', 1, 1, 'active')`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (1, 1, 'L1', CURRENT_DATE)`);
        await pool.query(`
            INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue)
            VALUES (1, 1, 10, 2024, 5, 2000000)
        `);
    });

    it('GET /api/kpi/me without a token -> 403', async () => {
        const res = await request(app).get('/api/kpi/me');
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/kpi/me?month=10&year=2024 -> 200 with the driver\'s own record', async () => {
        const res = await request(app)
            .get('/api/kpi/me?month=10&year=2024')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.kpi.length, 1);
        assert.strictEqual(Number(res.body.kpi[0].completed_shipments), 5);
    });

    it('GET /api/kpi/leaderboard -> 200 (BR-028, ranked within the driver\'s vehicle group)', async () => {
        const res = await request(app)
            .get('/api/kpi/leaderboard?month=10&year=2024')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.vehicle_group_name, '5m2');
    });

    // NOTE: GET /all (staffOnly), GET /driver/:driverId (financeStaff), POST /recalculate
    // (staffOnly) — the coordinator/manager/accountant-facing KPI endpoints — were removed
    // from kpiRoutes.js in commit c5875fe "fix dead code(api error)" — no frontend caller
    // referenced them. The service-layer logic (kpiService.getAllDriversKPI/getDriverKPIById,
    // kpiRepository.recalculateDriverKPI) still exists and is covered at L1/L2, but is no
    // longer reachable via HTTP.
});
