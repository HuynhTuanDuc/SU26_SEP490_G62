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

describe('Trip Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        uninstallCloudinaryMock = installCloudinaryMock();
        ({ pool, teardown } = await setupTestDb());

        const tripRoutes = require('../../routes/tripRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/trips', tripRoutes);
        app.use((err, req, res, next) => {
            res.status(500).json({ error: err.message });
        });

        driverToken      = signAccessToken({ userId: 1, email: 'driver1@test.com', role: 'driver' });
        otherDriverToken = signAccessToken({ userId: 2, email: 'driver2@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
        uninstallCloudinaryMock();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE shipment_assignment_history, order_shipments, orders, vehicles,
                     vehicle_groups, drivers, profiles, roles, accounts
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
        await pool.query(`
            INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES
            (1, '29A-11111', 1, 1, 'active'),
            (2, '29A-22222', 1, 2, 'active')
        `);
        await pool.query(`
            INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES
            (1, 1, 'L1', CURRENT_DATE),
            (2, 2, 'L2', CURRENT_DATE)
        `);
        await pool.query(`INSERT INTO orders (id, created_by, payment_type) VALUES (1, 1, 'cash')`);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status)
            VALUES (1, 1, 1, 1, 'available')
        `);
    });

    it('GET /api/trips/pool without a token -> 403 (no Authorization header)', async () => {
        const res = await request(app).get('/api/trips/pool');
        assert.strictEqual(res.status, 403);
    });

    it('GET /api/trips/pool with a valid driver token -> 200 with the available shipment', async () => {
        const res = await request(app)
            .get('/api/trips/pool')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.trips.length, 1);
    });

    it('GET /api/trips/active -> 200 with trip: null when the driver has no active trip', async () => {
        const res = await request(app)
            .get('/api/trips/active')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.trip, null);
    });

    it('POST /api/trips/:id/claim -> 200 and claims the shipment (BR-005)', async () => {
        const res = await request(app)
            .post('/api/trips/1/claim')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.trip.status, 'claimed');
    });

    it('POST /api/trips/:id/claim twice (2nd driver) -> 409 ALREADY_CLAIMED (BR-007)', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);

        const res = await request(app)
            .post('/api/trips/1/claim')
            .set('Authorization', `Bearer ${otherDriverToken}`);

        assert.strictEqual(res.status, 409);
    });

    it('PATCH /api/trips/:id/status claimed->picking -> 200 (BR-009)', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);

        const res = await request(app)
            .patch('/api/trips/1/status')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ status: 'picking' });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.trip.status, 'picking');
    });

    it('PATCH /api/trips/:id/status claimed->arrived (skip) -> 400 (BR-009)', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);

        const res = await request(app)
            .patch('/api/trips/1/status')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ status: 'arrived' });

        assert.strictEqual(res.status, 400);
    });

    it('PATCH /api/trips/:id/status by a driver who does not own the trip -> 4xx', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);

        const res = await request(app)
            .patch('/api/trips/1/status')
            .set('Authorization', `Bearer ${otherDriverToken}`)
            .send({ status: 'picking' });

        assert.ok(res.status >= 400 && res.status < 500);
    });

    it('POST /api/trips/:id/start-transit without a proof file -> 422 (BR-013, tripController maps "bắt buộc" errors to 422)', async () => {
        // Multer parses the (empty) multipart body before hitting the controller, so this
        // case is safe without touching Cloudinary — no file means no upload attempt.
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'picking' });

        const res = await request(app)
            .post('/api/trips/1/start-transit')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 422);
    });

    it('POST /api/trips/:id/start-transit WITH a proof file -> 200, transit (BR-012/013, Cloudinary mocked)', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'picking' });

        const res = await request(app)
            .post('/api/trips/1/start-transit')
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', Buffer.from('fake-image-bytes'), { filename: 'proof.jpg', contentType: 'image/jpeg' });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.trip.status, 'transit');
    });

    it('POST /api/trips/:id/complete without proof/receipt files -> 4xx (BR-015)', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'picking' });
        await request(app)
            .post('/api/trips/1/start-transit')
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', Buffer.from('fake-image-bytes'), { filename: 'proof.jpg', contentType: 'image/jpeg' });
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'arrived' });

        const res = await request(app)
            .post('/api/trips/1/complete')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.ok(res.status >= 400 && res.status < 500);
    });

    it('POST /api/trips/:id/complete WITH a delivery proof file -> 200, completed (BR-015, Cloudinary mocked)', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'picking' });
        await request(app)
            .post('/api/trips/1/start-transit')
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', Buffer.from('fake-image-bytes'), { filename: 'proof.jpg', contentType: 'image/jpeg' });
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'arrived' });

        const res = await request(app)
            .post('/api/trips/1/complete')
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', Buffer.from('fake-image-bytes'), { filename: 'delivery.jpg', contentType: 'image/jpeg' });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.trip.status, 'completed');
    });

    // NOTE: POST /api/trips/:id/payment (TH2 direct driver cash payment) and
    // POST /api/trips/:id/mark-unpaid (TH3) were removed from tripRoutes.js in commit
    // c5875fe "fix dead code(api error)" — no frontend/mobile caller referenced them
    // (mobile/src/hooks/use-record-payment.ts and use-mark-unpaid.ts were deleted in the same
    // commit). The service-layer logic (paymentService.recordDriverCashPayment/
    // updateCashPayment, tripService.markUnpaid) still exists and is covered at L1/L2, but is
    // no longer reachable via HTTP — the receipt-request + record-collection flow
    // (POST /receipts/:receiptId/record-collection, tested above) is the current path.
});
