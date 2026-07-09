const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('./helpers/testDb');
const { signAccessToken } = require('./helpers/authToken');

let pool;
let teardown;
let app;
let coordinatorToken;
let driverToken;

describe('Coordinator Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        const coordinatorRoutes = require('../routes/coordinatorRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/coordinator', coordinatorRoutes);

        coordinatorToken = signAccessToken({ userId: 1, email: 'coord@test.com', role: 'coordinator' });
        driverToken = signAccessToken({ userId: 2, email: 'driver1@test.com', role: 'driver' });
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
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'coord@test.com', 'hash', 1), (2, 'driver1@test.com', 'hash', 2)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Coordinator One', 1), (2, 'Driver One', 2)`);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Truck 5T', 15000)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '29A-11111', 1, 2, 'active')`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (2, 1, 'L123', CURRENT_DATE)`);
        await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1, 'individual', 'Nguyen Van A', '0912345678')`);
        await pool.query(`INSERT INTO orders (id, customer_id, created_by, cargo_name, payment_type, total_estimated_price) VALUES (1, 1, 1, 'Cargo', 'cash', 1000000)`);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_distance_km, actual_distance_km, status)
            VALUES (1, 1, 1, 1, 100, 100, 'completed')
        `);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (1, 2, 1, 1, 'initial_assign')
        `);
    });

    // ── GET /vehicle-groups ─────────────────────────────────────────────────
    describe('GET /api/coordinator/vehicle-groups', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/coordinator/vehicle-groups');
            assert.strictEqual(res.status, 403);
        });

        it('as a driver (wrong role) -> 403', async () => {
            const res = await request(app)
                .get('/api/coordinator/vehicle-groups')
                .set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('as coordinator -> 200 with vehicleGroups list', async () => {
            const res = await request(app)
                .get('/api/coordinator/vehicle-groups')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.vehicleGroups.length, 1);
            assert.strictEqual(res.body.vehicleGroups[0].name, 'Truck 5T');
        });
    });

    // ── GET /partners ───────────────────────────────────────────────────────
    describe('GET /api/coordinator/partners', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/coordinator/partners');
            assert.strictEqual(res.status, 403);
        });

        it('as coordinator -> 200 with partners list', async () => {
            await pool.query(`INSERT INTO partners (id, company_name, contact_person, phone) VALUES (1, 'ACME Corp', 'Mr. A', '0900000000')`);

            const res = await request(app)
                .get('/api/coordinator/partners')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.partners.length, 1);
            assert.strictEqual(res.body.partners[0].company_name, 'ACME Corp');
        });
    });

    // ── GET /incidents ──────────────────────────────────────────────────────
    describe('GET /api/coordinator/incidents', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/coordinator/incidents');
            assert.strictEqual(res.status, 403);
        });

        it('as coordinator -> 200 with incidents list', async () => {
            await pool.query(`
                INSERT INTO incidents (id, shipment_id, reported_by, incident_type, severity_level, description, status)
                VALUES (1, 1, 2, 'vehicle_breakdown', 'high', 'Xe hong giua duong', 'open')
            `);

            const res = await request(app)
                .get('/api/coordinator/incidents?status=open')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.incidents.length, 1);
            assert.strictEqual(res.body.incidents[0].incident_type, 'vehicle_breakdown');
        });
    });

    // ── GET /receipt-requests ───────────────────────────────────────────────
    describe('GET /api/coordinator/receipt-requests', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/coordinator/receipt-requests');
            assert.strictEqual(res.status, 403);
        });

        it('as coordinator -> 200 with driver/order/customer info', async () => {
            await pool.query(`
                INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
                VALUES (1, 1, 1, 2, 'pending')
            `);

            const res = await request(app)
                .get('/api/coordinator/receipt-requests?kind=requests')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.requests.length, 1);
            assert.strictEqual(res.body.requests[0].driver_name, 'Driver One');
            assert.strictEqual(res.body.requests[0].customer_name, 'Nguyen Van A');
            assert.strictEqual(res.body.pagination.total, 1);
        });
    });

    // ── GET /receipt-requests/:id ───────────────────────────────────────────
    describe('GET /api/coordinator/receipt-requests/:id', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/coordinator/receipt-requests/1');
            assert.strictEqual(res.status, 403);
        });

        it('with a non-numeric id -> 400', async () => {
            const res = await request(app)
                .get('/api/coordinator/receipt-requests/abc')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 400);
        });

        it('with a non-existent id -> 404', async () => {
            const res = await request(app)
                .get('/api/coordinator/receipt-requests/999999')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 404);
        });

        it('with an existing id -> 200 with computed revenue summary', async () => {
            await pool.query(`
                INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
                VALUES (1, 1, 1, 2, 'pending')
            `);

            const res = await request(app)
                .get('/api/coordinator/receipt-requests/1')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.summary.total_actual_price, 100 * 15000);
            assert.strictEqual(res.body.request.driver_name, 'Driver One');
        });
    });

    // ── POST /receipt-requests/:id/approve ──────────────────────────────────
    describe('POST /api/coordinator/receipt-requests/:id/approve', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/coordinator/receipt-requests/1/approve').send({});
            assert.strictEqual(res.status, 403);
        });

        it('with a non-existent id -> 404', async () => {
            const res = await request(app)
                .post('/api/coordinator/receipt-requests/999999/approve')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({});
            assert.strictEqual(res.status, 404);
        });

        it('happy path -> 201 creates a pending-payment-type receipt', async () => {
            await pool.query(`
                INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
                VALUES (1, 1, 1, 2, 'pending')
            `);

            const res = await request(app)
                .post('/api/coordinator/receipt-requests/1/approve')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({ notes: 'ok', expenses: [] });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.receipt.total_actual_price, 100 * 15000);

            const row = await pool.query('SELECT status, processed_by FROM order_receipt_requests WHERE id = 1');
            assert.strictEqual(row.rows[0].status, 'approved');
            assert.strictEqual(row.rows[0].processed_by, 1);
        });

        it('an already-approved request -> 409', async () => {
            await pool.query(`
                INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status, processed_by, processed_at)
                VALUES (1, 1, 1, 2, 'approved', 1, NOW())
            `);

            const res = await request(app)
                .post('/api/coordinator/receipt-requests/1/approve')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({});
            assert.strictEqual(res.status, 409);
        });
    });

    // ── POST /receipt-requests/:id/reject ───────────────────────────────────
    describe('POST /api/coordinator/receipt-requests/:id/reject', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/coordinator/receipt-requests/1/reject').send({});
            assert.strictEqual(res.status, 403);
        });

        it('with a non-existent id -> 404', async () => {
            const res = await request(app)
                .post('/api/coordinator/receipt-requests/999999/reject')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({});
            assert.strictEqual(res.status, 404);
        });

        it('happy path -> 200, marks rejected with coordinator notes', async () => {
            await pool.query(`
                INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
                VALUES (1, 1, 1, 2, 'pending')
            `);

            const res = await request(app)
                .post('/api/coordinator/receipt-requests/1/reject')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({ notes: 'thieu chung tu' });

            assert.strictEqual(res.status, 200);
            const row = await pool.query('SELECT status, coordinator_notes FROM order_receipt_requests WHERE id = 1');
            assert.strictEqual(row.rows[0].status, 'rejected');
            assert.strictEqual(row.rows[0].coordinator_notes, 'thieu chung tu');
        });

        it('an already-rejected request -> 500 (controller only maps "đã được" messages to 409; the reject-service error text is "đã bị từ chối rồi", so it falls through to the generic 500 branch)', async () => {
            await pool.query(`
                INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status, processed_by, processed_at)
                VALUES (1, 1, 1, 2, 'rejected', 1, NOW())
            `);

            const res = await request(app)
                .post('/api/coordinator/receipt-requests/1/reject')
                .set('Authorization', `Bearer ${coordinatorToken}`)
                .send({});
            assert.strictEqual(res.status, 500);
            assert.match(res.body.error, /đã bị từ chối rồi/);
        });
    });

    // ── GET /receipt-requests/:id/scan-expenses ─────────────────────────────
    describe('GET /api/coordinator/receipt-requests/:id/scan-expenses', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/coordinator/receipt-requests/1/scan-expenses');
            assert.strictEqual(res.status, 403);
        });

        it('with a non-existent id -> 500 (getReceiptRequestDetail throws, caught by generic catch)', async () => {
            const res = await request(app)
                .get('/api/coordinator/receipt-requests/999999/scan-expenses')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 500);
        });

        it('with an existing request that has no expenses -> 200 with empty results', async () => {
            await pool.query(`
                INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
                VALUES (1, 1, 1, 2, 'pending')
            `);

            const res = await request(app)
                .get('/api/coordinator/receipt-requests/1/scan-expenses')
                .set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 200);
            assert.deepStrictEqual(res.body.results, []);
        });
    });
});
