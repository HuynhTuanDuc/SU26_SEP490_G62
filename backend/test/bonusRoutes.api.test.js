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
let accountantToken;
let driverToken;

describe('Bonus Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        const bonusRoutes = require('../routes/bonusRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/bonuses', bonusRoutes);

        managerToken    = signAccessToken({ userId: 1, email: 'manager@test.com', role: 'manager' });
        accountantToken = signAccessToken({ userId: 2, email: 'accountant@test.com', role: 'accountant' });
        driverToken     = signAccessToken({ userId: 3, email: 'driver@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE driver_bonuses, leave_requests, drivers, vehicles, vehicle_groups,
                     profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`INSERT INTO roles (id, name) VALUES (1, 'manager'), (2, 'driver'), (3, 'accountant') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'manager@test.com', 'hash', 1, true),
            (2, 'accountant@test.com', 'hash', 3, true),
            (3, 'driver@test.com', 'hash', 2, true)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Manager One', 1),
            (2, 'Accountant One', 3),
            (3, 'Driver One', 2)
        `);
        await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (3, 'L1', '2020-01-01')`);
    });

    // ─── GET /my (driver) ─────────────────────────────────────────────────────

    it('GET /api/bonuses/my without a token -> 403', async () => {
        const res = await request(app).get('/api/bonuses/my');
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/bonuses/my as manager -> 403 (driver only)', async () => {
        const res = await request(app).get('/api/bonuses/my').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/bonuses/my as driver -> 200 with own bonuses', async () => {
        await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'pending', 3)
        `);

        const res = await request(app).get('/api/bonuses/my').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.bonuses.length, 1);
        assert.strictEqual(res.body.bonuses[0].driver_id, 3);
    });

    // ─── GET / (manager, accountant) ──────────────────────────────────────────

    it('GET /api/bonuses/ as driver -> 403', async () => {
        const res = await request(app).get('/api/bonuses/').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/bonuses/ as manager -> 200 with a list', async () => {
        await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'pending', 3)
        `);

        const res = await request(app).get('/api/bonuses/').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.bonuses.length, 1);
    });

    it('GET /api/bonuses/ as accountant -> 200', async () => {
        const res = await request(app).get('/api/bonuses/').set('Authorization', `Bearer ${accountantToken}`);
        assert.strictEqual(res.status, 200);
    });

    it('GET /api/bonuses/?type=bogus -> 400 (invalid type)', async () => {
        const res = await request(app).get('/api/bonuses/?type=bogus').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 400);
    });

    it('GET /api/bonuses/?status=bogus -> 400 (invalid status)', async () => {
        const res = await request(app).get('/api/bonuses/?status=bogus').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 400);
    });

    // ─── GET /stats ───────────────────────────────────────────────────────────

    it('GET /api/bonuses/stats as driver -> 403', async () => {
        const res = await request(app).get('/api/bonuses/stats').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/bonuses/stats as manager -> 200 with counts', async () => {
        await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'pending', 3)
        `);

        const res = await request(app).get('/api/bonuses/stats?year=2026').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(Number(res.body.total_count), 1);
        assert.strictEqual(Number(res.body.pending_count), 1);
    });

    // ─── GET /tet/preview (must resolve BEFORE GET /:id despite being declared later) ──

    it('GET /api/bonuses/tet/preview as driver -> 403', async () => {
        const res = await request(app).get('/api/bonuses/tet/preview').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/bonuses/tet/preview as accountant -> 403 (manager only)', async () => {
        const res = await request(app).get('/api/bonuses/tet/preview').set('Authorization', `Bearer ${accountantToken}`);
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/bonuses/tet/preview as manager -> 200, resolves to the literal tet/preview route, NOT GET /:id (declared earlier)', async () => {
        const res = await request(app).get('/api/bonuses/tet/preview?year=2026').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.year, 2026);
        assert.ok(Array.isArray(res.body.previews));
        assert.strictEqual(res.body.previews.length, 1);
        assert.strictEqual(res.body.previews[0].driver_id, 3);
    });

    // ─── POST /tet/generate (manager) ─────────────────────────────────────────

    it('POST /api/bonuses/tet/generate as accountant -> 403 (manager only)', async () => {
        const res = await request(app)
            .post('/api/bonuses/tet/generate')
            .set('Authorization', `Bearer ${accountantToken}`)
            .send({ year: 2026 });
        assert.strictEqual(res.status, 403);
    });

    it('POST /api/bonuses/tet/generate as manager -> 201, creates tet_annual bonuses', async () => {
        const res = await request(app)
            .post('/api/bonuses/tet/generate')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ year: 2026 });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.inserted, 1);

        const row = await pool.query(`SELECT * FROM driver_bonuses WHERE type = 'tet_annual' AND driver_id = 3`);
        assert.strictEqual(row.rows.length, 1);
    });

    // ─── GET /:id ─────────────────────────────────────────────────────────────

    it('GET /api/bonuses/:id as driver -> 403', async () => {
        const res = await request(app).get('/api/bonuses/1').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/bonuses/:id on unknown id -> error (message "Không tìm thấy..." is capitalized, does not match _send\'s lowercase substring check, falls through to 500)', async () => {
        const res = await request(app).get('/api/bonuses/999').set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 500);
        assert.match(res.body.error, /Không tìm thấy/);
    });

    it('GET /api/bonuses/:id -> 200 with the bonus', async () => {
        const insertRes = await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'pending', 3)
            RETURNING id
        `);
        const id = insertRes.rows[0].id;

        const res = await request(app).get(`/api/bonuses/${id}`).set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.id, id);
        assert.strictEqual(Number(res.body.amount), 200000);
    });

    // ─── POST / (create welfare/special) ──────────────────────────────────────

    it('POST /api/bonuses/ as driver -> 403 (manager/accountant only)', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ driver_id: 3, type: 'welfare_birthday' });
        assert.strictEqual(res.status, 403);
    });

    it('POST /api/bonuses/ missing driver_id -> 400', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ type: 'welfare_birthday' });
        assert.strictEqual(res.status, 400);
    });

    it('POST /api/bonuses/ missing type -> 400', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 3 });
        assert.strictEqual(res.status, 400);
    });

    it('POST /api/bonuses/ with invalid type -> 400', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 3, type: 'bogus_type' });
        assert.strictEqual(res.status, 400);
    });

    it('POST /api/bonuses/ type=welfare_birthday -> 201, amount auto-computed to 200k', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 3, type: 'welfare_birthday' });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(Number(res.body.bonus.amount), 200000);
        assert.strictEqual(res.body.bonus.status, 'pending');
    });

    it('POST /api/bonuses/ type=welfare_wedding -> 201, amount auto-computed to 1,000,000', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 3, type: 'welfare_wedding' });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(Number(res.body.bonus.amount), 1000000);
    });

    it('POST /api/bonuses/ type=welfare_funeral without beneficiary_relation -> error (message doesn\'t match _send\'s substrings, falls through to 500)', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 3, type: 'welfare_funeral' });

        assert.strictEqual(res.status, 500);
        assert.match(res.body.error, /quan hệ người thân/);
    });

    it('POST /api/bonuses/ type=welfare_funeral with beneficiary_relation=self -> 201, amount looked up (1,000,000)', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 3, type: 'welfare_funeral', beneficiary_relation: 'self' });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(Number(res.body.bonus.amount), 1000000);
    });

    it('POST /api/bonuses/ type=welfare_funeral with beneficiary_relation=spouse -> 201, amount looked up (500,000)', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 3, type: 'welfare_funeral', beneficiary_relation: 'spouse' });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(Number(res.body.bonus.amount), 500000);
    });

    it('POST /api/bonuses/ type=special without amount -> 400', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 3, type: 'special' });

        assert.strictEqual(res.status, 400);
    });

    it('POST /api/bonuses/ type=special with amount -> 201, uses given amount', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 3, type: 'special', amount: 500000, notes: 'Xuất sắc' });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(Number(res.body.bonus.amount), 500000);
    });

    it('POST /api/bonuses/ type=tet_annual -> error (must use bulk generate)', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 3, type: 'tet_annual', amount: 1000000 });

        assert.strictEqual(res.status, 400);
    });

    it('POST /api/bonuses/ with unknown driver_id -> 404', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ driver_id: 999, type: 'welfare_birthday' });

        assert.strictEqual(res.status, 404);
    });

    it('POST /api/bonuses/ as accountant -> 201 (also allowed to create)', async () => {
        const res = await request(app)
            .post('/api/bonuses/')
            .set('Authorization', `Bearer ${accountantToken}`)
            .send({ driver_id: 3, type: 'welfare_birthday' });

        assert.strictEqual(res.status, 201);
    });

    // ─── PATCH /:id/approve (manager) ─────────────────────────────────────────

    it('PATCH /api/bonuses/:id/approve as accountant -> 403 (manager only)', async () => {
        const insertRes = await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'pending', 3)
            RETURNING id
        `);
        const id = insertRes.rows[0].id;

        const res = await request(app)
            .patch(`/api/bonuses/${id}/approve`)
            .set('Authorization', `Bearer ${accountantToken}`);
        assert.strictEqual(res.status, 403);
    });

    it('PATCH /api/bonuses/:id/approve on unknown id -> 400 (repository error message includes "không hợp lệ")', async () => {
        const res = await request(app)
            .patch('/api/bonuses/999/approve')
            .set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 400);
    });

    it('PATCH /api/bonuses/:id/approve -> 200, status becomes approved', async () => {
        const insertRes = await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'pending', 3)
            RETURNING id
        `);
        const id = insertRes.rows[0].id;

        const res = await request(app)
            .patch(`/api/bonuses/${id}/approve`)
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.bonus.status, 'approved');
    });

    it('PATCH /api/bonuses/:id/approve with adjusted amount -> 200, amount updated', async () => {
        const insertRes = await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'pending', 3)
            RETURNING id
        `);
        const id = insertRes.rows[0].id;

        const res = await request(app)
            .patch(`/api/bonuses/${id}/approve`)
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ amount: 250000 });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(Number(res.body.bonus.amount), 250000);
    });

    it('PATCH /api/bonuses/:id/approve when already approved -> 400 (repository requires status=pending)', async () => {
        const insertRes = await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'approved', 3)
            RETURNING id
        `);
        const id = insertRes.rows[0].id;

        const res = await request(app)
            .patch(`/api/bonuses/${id}/approve`)
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 400);
    });

    // ─── PATCH /:id/reject (manager) ──────────────────────────────────────────

    it('PATCH /api/bonuses/:id/reject without a reason -> 400', async () => {
        const insertRes = await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'pending', 3)
            RETURNING id
        `);
        const id = insertRes.rows[0].id;

        const res = await request(app)
            .patch(`/api/bonuses/${id}/reject`)
            .set('Authorization', `Bearer ${managerToken}`);

        assert.strictEqual(res.status, 400);
    });

    it('PATCH /api/bonuses/:id/reject with a reason -> 200, status becomes rejected', async () => {
        const insertRes = await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'pending', 3)
            RETURNING id
        `);
        const id = insertRes.rows[0].id;

        const res = await request(app)
            .patch(`/api/bonuses/${id}/reject`)
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ reason: 'Không đủ điều kiện' });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.bonus.status, 'rejected');
    });

    it('PATCH /api/bonuses/:id/reject as driver -> 403', async () => {
        const res = await request(app)
            .patch('/api/bonuses/1/reject')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ reason: 'test' });
        assert.strictEqual(res.status, 403);
    });

    // ─── PATCH /:id/pay (accountant) ──────────────────────────────────────────

    it('PATCH /api/bonuses/:id/pay as manager -> 403 (accountant only)', async () => {
        const insertRes = await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'approved', 3)
            RETURNING id
        `);
        const id = insertRes.rows[0].id;

        const res = await request(app)
            .patch(`/api/bonuses/${id}/pay`)
            .set('Authorization', `Bearer ${managerToken}`);
        assert.strictEqual(res.status, 403);
    });

    it('PATCH /api/bonuses/:id/pay on a non-approved bonus -> 400 (repository error message includes "không hợp lệ")', async () => {
        const insertRes = await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'pending', 3)
            RETURNING id
        `);
        const id = insertRes.rows[0].id;

        const res = await request(app)
            .patch(`/api/bonuses/${id}/pay`)
            .set('Authorization', `Bearer ${accountantToken}`);

        assert.strictEqual(res.status, 400);
    });

    it('PATCH /api/bonuses/:id/pay -> 200, status becomes paid', async () => {
        const insertRes = await pool.query(`
            INSERT INTO driver_bonuses (driver_id, type, year, amount, status, requested_by)
            VALUES (3, 'welfare_birthday', 2026, 200000, 'approved', 3)
            RETURNING id
        `);
        const id = insertRes.rows[0].id;

        const res = await request(app)
            .patch(`/api/bonuses/${id}/pay`)
            .set('Authorization', `Bearer ${accountantToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.bonus.status, 'paid');
    });
});
