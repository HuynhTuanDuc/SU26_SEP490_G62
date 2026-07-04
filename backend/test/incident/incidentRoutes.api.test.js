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
let coordinatorToken;
let uninstallCloudinaryMock;

describe('Incident Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        uninstallCloudinaryMock = installCloudinaryMock();
        ({ pool, teardown } = await setupTestDb());

        const incidentRoutes = require('../../routes/incidentRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/incidents', incidentRoutes);

        driverToken      = signAccessToken({ userId: 1, email: 'driver@test.com', role: 'driver' });
        coordinatorToken = signAccessToken({ userId: 2, email: 'coord@test.com', role: 'coordinator' });
    });

    after(async () => {
        await teardown();
        uninstallCloudinaryMock();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE incident_evidences, incidents, notifications, shipment_assignment_history,
                     order_shipments, orders, vehicles, vehicle_groups, drivers, profiles,
                     roles, accounts
            RESTART IDENTITY CASCADE
        `);
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
        await pool.query(`INSERT INTO orders (id, created_by) VALUES (1, 1)`);
        await pool.query(`INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status) VALUES (1, 1, 1, 1, 'transit')`);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (1, 1, 1, 1, 'self_claim')
        `);
    });

    it('POST /api/incidents without a token -> 403', async () => {
        const res = await request(app).post('/api/incidents').send({ shipmentId: 1, incidentType: 'other', description: 'x' });
        assert.strictEqual(res.status, 403);
    });

    it('POST /api/incidents (no images attached) -> 201, creates the incident', async () => {
        const res = await request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('shipmentId', '1')
            .field('incidentType', 'vehicle_breakdown')
            .field('description', 'Xe bị hỏng động cơ giữa đường');

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.incident.status, 'open');
    });

    it('POST /api/incidents WITH evidence images -> 201, persists all attachments (Cloudinary mocked)', async () => {
        const res = await request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('shipmentId', '1')
            .field('incidentType', 'cargo_damage')
            .field('description', 'Hàng bị vỡ trong quá trình vận chuyển')
            .attach('images', Buffer.from('fake-image-bytes-1'), { filename: 'ev1.jpg', contentType: 'image/jpeg' })
            .attach('images', Buffer.from('fake-image-bytes-2'), { filename: 'ev2.jpg', contentType: 'image/jpeg' });

        assert.strictEqual(res.status, 201);
        const evidence = await pool.query('SELECT COUNT(*) FROM incident_evidences WHERE incident_id = $1', [res.body.incident.id]);
        assert.strictEqual(Number(evidence.rows[0].count), 2);
    });

    it('POST /api/incidents missing shipmentId -> 400', async () => {
        const res = await request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('incidentType', 'other')
            .field('description', 'no shipment id here');

        assert.strictEqual(res.status, 400);
    });

    it('GET /api/incidents/my/counts -> 200', async () => {
        const res = await request(app).get('/api/incidents/my/counts').set('Authorization', `Bearer ${driverToken}`);
        assert.strictEqual(res.status, 200);
    });

    it('BR-023: PATCH /api/incidents/:id/status as a driver -> 403 (coordinatorOnly guard)', async () => {
        await request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('shipmentId', '1')
            .field('incidentType', 'other')
            .field('description', 'Sự cố khác cần xử lý sớm');

        const res = await request(app)
            .patch('/api/incidents/100000/status')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ status: 'resolved' });

        assert.strictEqual(res.status, 403);
    });

    it('PATCH /api/incidents/:id/status as coordinator -> 200 resolves the incident', async () => {
        const create = await request(app)
            .post('/api/incidents')
            .set('Authorization', `Bearer ${driverToken}`)
            .field('shipmentId', '1')
            .field('incidentType', 'other')
            .field('description', 'Sự cố khác cần xử lý sớm');

        const res = await request(app)
            .patch(`/api/incidents/${create.body.incident.id}/status`)
            .set('Authorization', `Bearer ${coordinatorToken}`)
            .send({ status: 'resolved', resolution: 'Đã xử lý xong' });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.incident.status, 'resolved');
    });
});
