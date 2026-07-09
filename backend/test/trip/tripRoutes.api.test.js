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
            TRUNCATE shipment_receipts, order_receipt_requests, trip_stops, shipment_assignment_history,
                     order_shipments, orders, vehicles, vehicle_groups, drivers, profiles, roles, accounts
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

    it('GET /api/trips/stats -> 200 with today/month completed counters', async () => {
        const res = await request(app)
            .get('/api/trips/stats')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.ok('today_total' in res.body.stats);
        assert.ok('today_completed' in res.body.stats);
        assert.ok('month_completed' in res.body.stats);
    });

    it('GET /api/trips/history -> 200 with a completed order for the driver', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'picking' });
        await request(app)
            .post('/api/trips/1/start-transit')
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', Buffer.from('x'), { filename: 'p.jpg', contentType: 'image/jpeg' });
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'arrived' });
        await request(app)
            .post('/api/trips/1/complete')
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', Buffer.from('x'), { filename: 'd.jpg', contentType: 'image/jpeg' });

        const res = await request(app)
            .get('/api/trips/history')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.orders.length, 1);
        assert.strictEqual(res.body.pagination.total, 1);
    });

    it('GET /api/trips/orders/:orderId -> 200 with the driver\'s own shipments in that order', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);

        const res = await request(app)
            .get('/api/trips/orders/1')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.order.id, 1);
        assert.strictEqual(res.body.shipments.length, 1);
    });

    it('GET /api/trips/orders/:orderId when the driver has no shipment in that order -> 403', async () => {
        const res = await request(app)
            .get('/api/trips/orders/1')
            .set('Authorization', `Bearer ${otherDriverToken}`);

        assert.strictEqual(res.status, 403);
    });

    it('GET /api/trips/pool-shipment/:shipmentId -> 200 with the shipment detail while still available', async () => {
        const res = await request(app)
            .get('/api/trips/pool-shipment/1')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.shipment_id, 1);
    });

    it('GET /api/trips/pool-shipment/:shipmentId after it has been claimed -> 404', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);

        const res = await request(app)
            .get('/api/trips/pool-shipment/1')
            .set('Authorization', `Bearer ${otherDriverToken}`);

        assert.strictEqual(res.status, 404);
    });

    it('GET /api/trips/pool/:orderId -> 200 with the order detail while still open', async () => {
        const res = await request(app)
            .get('/api/trips/pool/1')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.order.id, 1);
        assert.strictEqual(res.body.shipments.length, 1);
    });

    it('GET /api/trips/pool/:orderId for a non-existent order -> 404', async () => {
        const res = await request(app)
            .get('/api/trips/pool/999999')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 404);
    });

    it('POST /api/trips/:id/release -> 200, returns a claimed shipment to the pool (CLAIMED is releasable)', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);

        const res = await request(app)
            .post('/api/trips/1/release')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ reason: 'đổi kế hoạch' });

        assert.strictEqual(res.status, 200);
        const shipment = await pool.query('SELECT status FROM order_shipments WHERE id = 1');
        assert.strictEqual(shipment.rows[0].status, 'available');
    });

    it('POST /api/trips/:id/release once the trip is already in transit -> 422 (only claimed/picking are releasable)', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'picking' });
        await request(app)
            .post('/api/trips/1/start-transit')
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', Buffer.from('x'), { filename: 'p.jpg', contentType: 'image/jpeg' });

        const res = await request(app)
            .post('/api/trips/1/release')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({});

        assert.strictEqual(res.status, 422);
    });

    it('POST /api/trips/:id/return-complete -> 200, RETURNING -> COMPLETED without a photo (photo optional)', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'picking' });
        await request(app)
            .post('/api/trips/1/start-transit')
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', Buffer.from('x'), { filename: 'p.jpg', contentType: 'image/jpeg' });
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'arrived' });
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'failed', reason: 'khách từ chối nhận hàng' });
        await request(app).patch('/api/trips/1/status').set('Authorization', `Bearer ${driverToken}`).send({ status: 'returning' });

        const res = await request(app)
            .post('/api/trips/1/return-complete')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.trip.status, 'completed');
    });

    it('GET /api/trips/:id/payments -> 200 with the recorded cash payments for the shipment', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        await pool.query(`
            INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by)
            VALUES (1, 'cash_collected', 500000, 1)
        `);

        const res = await request(app)
            .get('/api/trips/1/payments')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.payments.length, 1);
        assert.strictEqual(Number(res.body.payments[0].amount), 500000);
    });

    it('GET /api/trips/:id/payments as a driver who does not own the shipment -> 403', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);

        const res = await request(app)
            .get('/api/trips/1/payments')
            .set('Authorization', `Bearer ${otherDriverToken}`);

        assert.strictEqual(res.status, 403);
    });

    it('GET /api/trips/:id/payment-summary -> 200 with the shipment\'s financial summary', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        await pool.query(`UPDATE order_shipments SET estimated_price = 1000000 WHERE id = 1`);

        const res = await request(app)
            .get('/api/trips/1/payment-summary')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(Number(res.body.trip_value), 1000000);
    });

    it('PATCH /api/trips/:id/payments/:paymentId -> 200 updates the recorded amount', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        const inserted = await pool.query(`
            INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by)
            VALUES (1, 'cash_collected', 500000, 1) RETURNING id
        `);

        const res = await request(app)
            .patch(`/api/trips/1/payments/${inserted.rows[0].id}`)
            .set('Authorization', `Bearer ${driverToken}`)
            .field('amount', '600000');

        assert.strictEqual(res.status, 200);
        const row = await pool.query('SELECT amount FROM shipment_receipts WHERE id = $1', [inserted.rows[0].id]);
        assert.strictEqual(Number(row.rows[0].amount), 600000);
    });

    it('PATCH /api/trips/:id/payments/:paymentId recorded by another driver -> 403', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        const inserted = await pool.query(`
            INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by)
            VALUES (1, 'cash_collected', 500000, 1) RETURNING id
        `);

        const res = await request(app)
            .patch(`/api/trips/1/payments/${inserted.rows[0].id}`)
            .set('Authorization', `Bearer ${otherDriverToken}`)
            .field('amount', '600000');

        assert.strictEqual(res.status, 403);
    });

    it('GET /api/trips/pending-receipt -> 200 with order: null when nothing is pending', async () => {
        const res = await request(app)
            .get('/api/trips/pending-receipt')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.order, null);
    });

    it('GET /api/trips/receipts -> 200 with the driver\'s approved receipts', async () => {
        await pool.query(`UPDATE orders SET payment_type = 'cash' WHERE id = 1`);
        await pool.query(`
            INSERT INTO order_receipt_requests (order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 'approved')
        `);

        const res = await request(app)
            .get('/api/trips/receipts')
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.receipts.length, 1);
    });

    it('GET /api/trips/receipts/:receiptId -> 200 with the receipt detail (by order_receipt_request id)', async () => {
        await pool.query(`UPDATE orders SET payment_type = 'cash' WHERE id = 1`);
        const orr = await pool.query(`
            INSERT INTO order_receipt_requests (order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 'approved') RETURNING id
        `);

        const res = await request(app)
            .get(`/api/trips/receipts/${orr.rows[0].id}`)
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.receipt.order_id, 1);
    });

    it('POST /api/trips/receipt-request/:orrId/resubmit -> 200 for a rejected request', async () => {
        await pool.query(`UPDATE orders SET payment_type = 'cash' WHERE id = 1`);
        const orr = await pool.query(`
            INSERT INTO order_receipt_requests (order_id, requesting_shipment_id, driver_id, status, coordinator_notes)
            VALUES (1, 1, 1, 'rejected', 'thiếu chứng từ') RETURNING id
        `);

        const res = await request(app)
            .post(`/api/trips/receipt-request/${orr.rows[0].id}/resubmit`)
            .set('Authorization', `Bearer ${driverToken}`)
            .send({ driver_notes: 'đã bổ sung đầy đủ' });

        assert.strictEqual(res.status, 200);
        const row = await pool.query('SELECT status FROM order_receipt_requests WHERE id = $1', [orr.rows[0].id]);
        assert.strictEqual(row.rows[0].status, 'pending');
    });

    it('POST /api/trips/receipt-request/:orrId/resubmit for a request that is still pending -> 500 (real bug: case-mismatched substring check never maps to 404)', async () => {
        await pool.query(`UPDATE orders SET payment_type = 'cash' WHERE id = 1`);
        const orr = await pool.query(`
            INSERT INTO order_receipt_requests (order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 'pending') RETURNING id
        `);

        const res = await request(app)
            .post(`/api/trips/receipt-request/${orr.rows[0].id}/resubmit`)
            .set('Authorization', `Bearer ${driverToken}`)
            .send({});

        // NOTE (real bug): tripRepository.resubmitReceiptRequest throws
        // 'Không tìm thấy yêu cầu hoặc yêu cầu chưa bị từ chối' (capital "Không"), but
        // tripController.resubmitReceiptRequest checks err.message.includes('không tìm thấy')
        // (lowercase "không") — the case mismatch means the intended 404 never fires and this
        // always falls through to 500 instead.
        assert.strictEqual(res.status, 500);
    });

    it('POST /api/trips/receipts/:receiptId/record-collection without payment_type -> 400', async () => {
        await pool.query(`UPDATE order_shipments SET actual_price = 500000 WHERE id = 1`);
        await pool.query(`UPDATE orders SET payment_type = 'cash' WHERE id = 1`);
        const orr = await pool.query(`
            INSERT INTO order_receipt_requests (order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 'approved') RETURNING id
        `);
        await pool.query(`
            INSERT INTO shipment_receipts (shipment_id, amount, order_receipt_request_id)
            VALUES (1, 500000, $1)
        `, [orr.rows[0].id]);

        const res = await request(app)
            .post(`/api/trips/receipts/${orr.rows[0].id}/record-collection`)
            .set('Authorization', `Bearer ${driverToken}`)
            .field('notes', 'x');

        assert.strictEqual(res.status, 400);
    });

    it('POST /api/trips/receipts/:receiptId/record-collection with cash_collected but no proof photo -> 422 (BR-018/019)', async () => {
        await pool.query(`UPDATE order_shipments SET actual_price = 500000 WHERE id = 1`);
        await pool.query(`UPDATE orders SET payment_type = 'cash' WHERE id = 1`);
        const orr = await pool.query(`
            INSERT INTO order_receipt_requests (order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 'approved') RETURNING id
        `);
        await pool.query(`
            INSERT INTO shipment_receipts (shipment_id, amount, order_receipt_request_id)
            VALUES (1, 500000, $1)
        `, [orr.rows[0].id]);

        const res = await request(app)
            .post(`/api/trips/receipts/${orr.rows[0].id}/record-collection`)
            .set('Authorization', `Bearer ${driverToken}`)
            .field('payment_type', 'cash_collected');

        assert.strictEqual(res.status, 422);
    });

    it('POST /api/trips/receipts/:receiptId/record-collection WITH proof -> 200, records cash_collected (Cloudinary mocked)', async () => {
        await pool.query(`UPDATE order_shipments SET actual_price = 500000 WHERE id = 1`);
        await pool.query(`UPDATE orders SET payment_type = 'cash' WHERE id = 1`);
        const orr = await pool.query(`
            INSERT INTO order_receipt_requests (order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 'approved') RETURNING id
        `);
        await pool.query(`
            INSERT INTO shipment_receipts (shipment_id, amount, order_receipt_request_id)
            VALUES (1, 500000, $1)
        `, [orr.rows[0].id]);

        const res = await request(app)
            .post(`/api/trips/receipts/${orr.rows[0].id}/record-collection`)
            .set('Authorization', `Bearer ${driverToken}`)
            .field('payment_type', 'cash_collected')
            .attach('proof', Buffer.from('x'), { filename: 'proof.jpg', contentType: 'image/jpeg' });

        assert.strictEqual(res.status, 200);
        const debt = await pool.query(`SELECT debt_type FROM debts WHERE shipment_id = 1`);
        assert.strictEqual(debt.rows[0].debt_type, 'driver');
    });

    it('PATCH /api/trips/:id/stops/:stopId/arrive -> 200 marks the stop as arrived', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        const stop = await pool.query(`
            INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address)
            VALUES (1, 1, 'pickup', 'HN') RETURNING id
        `);

        const res = await request(app)
            .patch(`/api/trips/1/stops/${stop.rows[0].id}/arrive`)
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 200);
        assert.ok(res.body.stop.arrived_at);
    });

    it('PATCH /api/trips/:id/stops/:stopId/arrive by a driver who does not own the trip -> 403', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        const stop = await pool.query(`
            INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address)
            VALUES (1, 1, 'pickup', 'HN') RETURNING id
        `);

        const res = await request(app)
            .patch(`/api/trips/1/stops/${stop.rows[0].id}/arrive`)
            .set('Authorization', `Bearer ${otherDriverToken}`);

        assert.strictEqual(res.status, 403);
    });

    it('PATCH /api/trips/:id/stops/:stopId/complete -> 200 with a proof photo (BR-011: first stop has no predecessor)', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        const stop = await pool.query(`
            INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address)
            VALUES (1, 1, 'pickup', 'HN') RETURNING id
        `);

        const res = await request(app)
            .patch(`/api/trips/1/stops/${stop.rows[0].id}/complete`)
            .set('Authorization', `Bearer ${driverToken}`)
            .attach('proof', Buffer.from('x'), { filename: 'stop.jpg', contentType: 'image/jpeg' });

        assert.strictEqual(res.status, 200);
        assert.ok(res.body.stop.completed_at);
    });

    it('PATCH /api/trips/:id/stops/:stopId/complete out of order (BR-011) -> 422', async () => {
        await request(app).post('/api/trips/1/claim').set('Authorization', `Bearer ${driverToken}`);
        await pool.query(`
            INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address)
            VALUES (1, 1, 'pickup', 'HN')
        `);
        const stop2 = await pool.query(`
            INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address)
            VALUES (1, 2, 'delivery', 'HCM') RETURNING id
        `);

        const res = await request(app)
            .patch(`/api/trips/1/stops/${stop2.rows[0].id}/complete`)
            .set('Authorization', `Bearer ${driverToken}`);

        assert.strictEqual(res.status, 422);
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
