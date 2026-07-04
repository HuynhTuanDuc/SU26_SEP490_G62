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
let managerToken;

describe('Company Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        const companyRoutes = require('../../routes/companyRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/company', companyRoutes);

        driverToken  = signAccessToken({ userId: 1, email: 'driver@test.com', role: 'driver' });
        managerToken = signAccessToken({ userId: 2, email: 'manager@test.com', role: 'manager' });
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`UPDATE company_info SET company_name = NULL, bank_qr_url = NULL, updated_by = NULL WHERE id = 1`);
        await pool.query('TRUNCATE profiles, roles, accounts RESTART IDENTITY CASCADE');
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver'), (5, 'manager') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'driver@test.com', 'hash', 2, true),
            (2, 'manager@test.com', 'hash', 5, true)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Driver One', 2),
            (2, 'Manager One', 5)
        `);
    });

    it('GET /api/company/info without a token -> 403', async () => {
        const res = await request(app).get('/api/company/info');
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/company/info as a driver -> 200 (any authenticated user can read, e.g. to show the QR)', async () => {
        const res = await request(app).get('/api/company/info').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 200);
    });

    it('PUT /api/company/info as a driver -> 403 (managerOnly guard)', async () => {
        const res = await request(app)
            .put('/api/company/info')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ company_name: 'G62 Logistics' });

        assert.strictEqual(res.status, 403);
    });

    it('PUT /api/company/info as manager -> 200, persists the update', async () => {
        const res = await request(app)
            .put('/api/company/info')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ company_name: 'G62 Logistics', hotline: '19001234' });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.info.company_name, 'G62 Logistics');

        const row = await pool.query('SELECT company_name FROM company_info WHERE id = 1');
        assert.strictEqual(row.rows[0].company_name, 'G62 Logistics');
    });

    // NOTE: POST /bank-qr (manager-only QR upload) was removed from companyRoutes.js in commit
    // c5875fe "fix dead code(api error)" — no frontend caller referenced it. The service-layer
    // logic (companyService.uploadBankQr) still exists but is no longer reachable via HTTP.
});
