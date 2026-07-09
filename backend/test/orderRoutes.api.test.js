const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('./helpers/testDb');
const { signAccessToken } = require('./helpers/authToken');

// NOTE: orderRoutes.js is mounted TWICE in production (routes/index.js): once at '/orders'
// and once at '/api/orders'. For these route tests we only mount it at '/api/orders' (the
// primary API path used by the frontend) — behavior is identical under either prefix since
// it's the same router/middleware/controllers, so we don't duplicate every test for both.

let pool;
let teardown;
let app;
let coordinatorToken;
let driverToken;
let otherDriverToken;

describe('Order Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        const orderRoutes = require('../routes/orderRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/orders', orderRoutes);

        coordinatorToken = signAccessToken({ userId: 1, email: 'coord@test.com', role: 'coordinator' });
        driverToken = signAccessToken({ userId: 2, email: 'driver1@test.com', role: 'driver' });
        otherDriverToken = signAccessToken({ userId: 3, email: 'driver2@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE incidents, expenses, shipment_receipts, order_receipt_requests, trip_stops,
                     shipment_assignment_history, order_shipments, orders, customers, partners,
                     vehicles, vehicle_groups, drivers, profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`INSERT INTO roles (id, name) VALUES (1, 'coordinator'), (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES
            (1, 'coord@test.com', 'hash', 1),
            (2, 'driver1@test.com', 'hash', 2),
            (3, 'driver2@test.com', 'hash', 2)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Coordinator One', 1),
            (2, 'Driver One', 2),
            (3, 'Driver Two', 2)
        `);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Truck 5T', 15000)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '29A-11111', 1, 2, 'active')`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (2, 1, 'L123', CURRENT_DATE), (3, NULL, 'L124', CURRENT_DATE)`);
        await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1, 'individual', 'Nguyen Van A', '0912345678')`);
        await pool.query(`INSERT INTO orders (id, customer_id, created_by, cargo_name, payment_type, total_estimated_price) VALUES (1, 1, 1, 'Cargo', 'cash', 1500000)`);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_distance_km, status)
            VALUES (1, 1, 1, 1, 100, 'completed')
        `);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (1, 2, 1, 1, 'initial_assign')
        `);
    });

    // ── GET / (coordinator/admin only) ──────────────────────────────────────
    describe('GET /api/orders', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/orders');
            assert.strictEqual(res.status, 403);
        });

        it('as a driver (wrong role) -> 403', async () => {
            const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('as coordinator -> 200 with paginated orders', async () => {
            const res = await request(app)
                .get('/api/orders?page=1&limit=10')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.pagination.total, 1);
            assert.strictEqual(res.body.orders[0].id, 1);
        });
    });

    // ── POST / (coordinator/admin only) ─────────────────────────────────────
    describe('POST /api/orders', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/orders').send({});
            assert.strictEqual(res.status, 403);
        });

        it('as a driver (wrong role) -> 403', async () => {
            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01', trips: [{ distance: 50, vehicle_group_id: 1 }] });
            assert.strictEqual(res.status, 403);
        });

        it('missing pickup/delivery address -> 400', async () => {
            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({ pickup_address: '', delivery_address: 'B', arrived_at: '2999-01-01', trips: [] });
            assert.strictEqual(res.status, 400);
            assert.match(res.body.error, /Thiếu điểm nhận hoặc điểm đến/);
        });

        it('happy path -> 201 creates an order with an unassigned AVAILABLE shipment', async () => {
            const res = await request(app)
                .post('/api/orders')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({
                    customer_name: 'Tran Van B',
                    customer_phone: '0987654321',
                    pickup_address: 'HN',
                    delivery_address: 'HCM',
                    arrived_at: '2999-01-01',
                    payment_type: 'cash',
                    trips: [{ distance: 100, vehicle_group_id: 1 }],
                });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(Number(res.body.order.estimated_price), 1_500_000);

            const shipment = await pool.query('SELECT status FROM order_shipments WHERE order_id = $1', [res.body.order.id]);
            assert.strictEqual(shipment.rows[0].status, 'available');
        });
    });

    // ── PATCH /:id (coordinator/admin only) ─────────────────────────────────
    describe('PATCH /api/orders/:id', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).patch('/api/orders/1').send({});
            assert.strictEqual(res.status, 403);
        });

        it('as a driver (wrong role) -> 403', async () => {
            const res = await request(app)
                .patch('/api/orders/1')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({});
            assert.strictEqual(res.status, 403);
        });

        it('an order whose shipments are all completed -> 422 (cannot edit finished order)', async () => {
            const res = await request(app)
                .patch('/api/orders/1')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({
                    pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01',
                    trips: [{ distance: 120, vehicle_group_id: 1 }],
                });
            assert.strictEqual(res.status, 422);
            assert.match(res.body.error, /Không thể chỉnh sửa đơn đã hoàn tất hoặc đã hủy/);
        });

        it('happy path -> 200 recalculates estimated price', async () => {
            await pool.query(`UPDATE order_shipments SET status = 'available' WHERE id = 1`);

            const res = await request(app)
                .patch('/api/orders/1')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({
                    pickup_address: 'HN', delivery_address: 'HCM', arrived_at: '2999-01-01',
                    trips: [{ distance: 120, vehicle_group_id: 1 }],
                });

            assert.strictEqual(res.status, 200);
            const shipment = await pool.query('SELECT estimated_price, estimated_distance_km FROM order_shipments WHERE order_id = 1');
            assert.strictEqual(Number(shipment.rows[0].estimated_distance_km), 120);
            assert.strictEqual(Number(shipment.rows[0].estimated_price), 120 * 15000);
        });
    });

    // ── DELETE /:id (coordinator/admin only) ────────────────────────────────
    describe('DELETE /api/orders/:id', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).delete('/api/orders/1');
            assert.strictEqual(res.status, 403);
        });

        it('as a driver (wrong role) -> 403', async () => {
            const res = await request(app).delete('/api/orders/1').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('an order whose shipment is already completed -> 422', async () => {
            const res = await request(app)
                .delete('/api/orders/1')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({ reason: 'khach huy don' });
            assert.strictEqual(res.status, 422);
            assert.match(res.body.error, /Không thể hủy đơn đã hoàn tất hoặc đã hủy/);
        });

        it('happy path -> 200 cancels the order and its shipment', async () => {
            await pool.query(`UPDATE order_shipments SET status = 'available' WHERE id = 1`);

            const res = await request(app)
                .delete('/api/orders/1')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({ reason: 'khach huy don' });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.order.order_status, 'cancelled');
            const shipment = await pool.query('SELECT status, cancel_reason FROM order_shipments WHERE order_id = 1');
            assert.strictEqual(shipment.rows[0].status, 'cancelled');
            assert.strictEqual(shipment.rows[0].cancel_reason, 'khach huy don');
        });

        it('a non-existent order -> 404', async () => {
            const res = await request(app)
                .delete('/api/orders/999999')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({ reason: 'n/a' });
            assert.strictEqual(res.status, 404);
        });
    });

    // ── POST /:id/request-receipt (driver only) ─────────────────────────────
    describe('POST /api/orders/:id/request-receipt', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/orders/1/request-receipt').send({});
            assert.strictEqual(res.status, 403);
        });

        it('as coordinator (wrong role) -> 403', async () => {
            const res = await request(app)
                .post('/api/orders/1/request-receipt')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({ shipment_id: 1, actual_km: 100 });
            assert.strictEqual(res.status, 403);
        });

        it('missing shipment_id -> 400', async () => {
            const res = await request(app)
                .post('/api/orders/1/request-receipt')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ actual_km: 100 });
            assert.strictEqual(res.status, 400);
            assert.match(res.body.error, /shipment_id là bắt buộc/);
        });

        it('driver who does not own the shipment -> 403', async () => {
            const res = await request(app)
                .post('/api/orders/1/request-receipt')
                .set('Authorization', `Bearer ${otherDriverToken}`)
                .send({ shipment_id: 1, actual_km: 100 });
            assert.strictEqual(res.status, 403);
        });

        it('happy path -> 201, is final shipment of a cash order, creates a receipt request', async () => {
            const res = await request(app)
                .post('/api/orders/1/request-receipt')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ shipment_id: 1, actual_km: 100 });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.receipt_request_created, true);
            assert.strictEqual(res.body.km_saved, true);

            const shipment = await pool.query('SELECT actual_distance_km FROM order_shipments WHERE id = 1');
            assert.strictEqual(Number(shipment.rows[0].actual_distance_km), 100);

            const requestRow = await pool.query('SELECT status FROM order_receipt_requests WHERE order_id = 1');
            assert.strictEqual(requestRow.rows[0].status, 'pending');
        });

        it('a second request for the same order -> 409 (BR-018: only one request per order)', async () => {
            await request(app)
                .post('/api/orders/1/request-receipt')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ shipment_id: 1, actual_km: 100 });

            const res = await request(app)
                .post('/api/orders/1/request-receipt')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ shipment_id: 1, actual_km: 100 });

            assert.strictEqual(res.status, 409);
        });
    });

    // ── GET /:id/receipt-request (driver only) ──────────────────────────────
    describe('GET /api/orders/:id/receipt-request', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/orders/1/receipt-request');
            assert.strictEqual(res.status, 403);
        });

        it('as coordinator (wrong role) -> 403', async () => {
            const res = await request(app)
                .get('/api/orders/1/receipt-request')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('an order with no request yet -> 200 with request: null', async () => {
            const res = await request(app)
                .get('/api/orders/1/receipt-request')
                .set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.request, null);
        });

        it('an order with an existing request -> 200 with the request payload', async () => {
            await pool.query(`
                INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
                VALUES (1, 1, 1, 2, 'pending')
            `);

            const res = await request(app)
                .get('/api/orders/1/receipt-request')
                .set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.request.status, 'pending');
            assert.strictEqual(res.body.request.order_id, 1);
        });
    });
});
