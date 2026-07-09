const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('./helpers/testDb');
const { signAccessToken } = require('./helpers/authToken');
const { installCloudinaryMock } = require('./helpers/cloudinaryMock');

let pool;
let teardown;
let app;
let driverToken;
let coordinatorToken;
let uninstallCloudinaryMock;

describe('Driver Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        uninstallCloudinaryMock = installCloudinaryMock();
        ({ pool, teardown } = await setupTestDb());

        const driverRoutes = require('../routes/driverRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/drivers', driverRoutes);

        driverToken = signAccessToken({ userId: 1, email: 'driver@test.com', role: 'driver' });
        coordinatorToken = signAccessToken({ userId: 2, email: 'coord@test.com', role: 'coordinator' });
    });

    after(async () => {
        await teardown();
        uninstallCloudinaryMock();
    });

    beforeEach(async () => {
        await pool.query('TRUNCATE maintenance_records, vehicle_status_history, drivers, vehicles, vehicle_groups, profiles, roles, accounts RESTART IDENTITY CASCADE');
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
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, '5m2', 10000)`);
        await pool.query(`
            INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status)
            VALUES (1, 'ABC-123', 1, 1, 'active')
        `);
        await pool.query(`
            INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date)
            VALUES (1, 1, 'LIC-001', '2020-01-01')
        `);
    });

    describe('GET /api/drivers', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/drivers');
            assert.strictEqual(res.status, 403);
        });

        it('as a driver -> 403 (coordinator/admin only)', async () => {
            const res = await request(app).get('/api/drivers').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('as a coordinator -> 200 with the seeded driver', async () => {
            const res = await request(app).get('/api/drivers').set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body.drivers));
            assert.strictEqual(res.body.drivers.length, 1);
            assert.strictEqual(res.body.drivers[0].plate_number, 'ABC-123');
        });
    });

    describe('GET /api/drivers/me/vehicle', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/drivers/me/vehicle');
            assert.strictEqual(res.status, 403);
        });

        it('as a coordinator -> 403 (driver only)', async () => {
            const res = await request(app).get('/api/drivers/me/vehicle').set('Authorization', `Bearer ${coordinatorToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('as the driver -> 200 with their assigned vehicle', async () => {
            const res = await request(app).get('/api/drivers/me/vehicle').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.vehicle.plate_number, 'ABC-123');
        });

        it('as a driver with no assigned vehicle -> 404', async () => {
            await pool.query('DELETE FROM drivers WHERE profile_id = 1');
            await pool.query(`INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (1, 'LIC-001', '2020-01-01')`);
            const res = await request(app).get('/api/drivers/me/vehicle').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error, 'Tài xế chưa được phân công xe');
        });
    });

    describe('GET /api/drivers/maintenance', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).get('/api/drivers/maintenance');
            assert.strictEqual(res.status, 403);
        });

        it('as the driver with no open maintenance -> 200 empty list', async () => {
            const res = await request(app).get('/api/drivers/maintenance').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.deepStrictEqual(res.body.records, []);
        });

        it('as the driver with an open maintenance record -> 200 lists it', async () => {
            await pool.query(`
                INSERT INTO maintenance_records (vehicle_id, maintenance_type, maintenance_date, performed_by, status)
                VALUES (1, 'repair', '2026-07-01', 1, 'open')
            `);
            const res = await request(app).get('/api/drivers/maintenance').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.records.length, 1);
            assert.strictEqual(res.body.records[0].vehicle_id, 1);
        });
    });

    describe('POST /api/drivers/maintenance/:vehicleId/bills', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/drivers/maintenance/1/bills');
            assert.strictEqual(res.status, 403);
        });

        it('without a bill file -> 400 (Bill image is required)', async () => {
            const res = await request(app)
                .post('/api/drivers/maintenance/1/bills')
                .set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Bill image is required');
        });

        it('with a bill file but no open maintenance record -> 404', async () => {
            const res = await request(app)
                .post('/api/drivers/maintenance/1/bills')
                .set('Authorization', `Bearer ${driverToken}`)
                .attach('bill', Buffer.from('fake-image-bytes'), { filename: 'bill.jpg', contentType: 'image/jpeg' });
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error, 'Open maintenance record for this driver and vehicle was not found');
        });

        it('with a bill file and an open maintenance record -> 200, appends bill_pics (Cloudinary mocked)', async () => {
            const insertRecord = await pool.query(`
                INSERT INTO maintenance_records (vehicle_id, maintenance_type, maintenance_date, performed_by, status)
                VALUES (1, 'repair', '2026-07-01', 1, 'open')
                RETURNING id
            `);
            const res = await request(app)
                .post('/api/drivers/maintenance/1/bills')
                .set('Authorization', `Bearer ${driverToken}`)
                .attach('bill', Buffer.from('fake-image-bytes'), { filename: 'bill.jpg', contentType: 'image/jpeg' });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.maintenanceRecordId, insertRecord.rows[0].id);
            assert.strictEqual(res.body.bill_pics.length, 1);
        });
    });

    describe('POST /api/drivers/maintenance/:vehicleId/complete', () => {
        it('without a token -> 403', async () => {
            const res = await request(app).post('/api/drivers/maintenance/1/complete');
            assert.strictEqual(res.status, 403);
        });

        it('without a cost -> 400', async () => {
            const res = await request(app)
                .post('/api/drivers/maintenance/1/complete')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({});
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'cost must be greater than 0');
        });

        it('with a valid cost but no open maintenance record -> 404', async () => {
            const res = await request(app)
                .post('/api/drivers/maintenance/1/complete')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ cost: 100000 });
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error, 'Open maintenance record for this driver and vehicle was not found');
        });

        it('with an open record but no bill pictures uploaded -> 400', async () => {
            await pool.query(`
                INSERT INTO maintenance_records (vehicle_id, maintenance_type, maintenance_date, performed_by, status)
                VALUES (1, 'repair', '2026-07-01', 1, 'open')
            `);
            const res = await request(app)
                .post('/api/drivers/maintenance/1/complete')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ cost: 100000 });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'At least one maintenance bill image is required before completion');
        });

        it('with an open record and bill pictures -> 200, marks ready for verification', async () => {
            const insertRecord = await pool.query(`
                INSERT INTO maintenance_records (vehicle_id, maintenance_type, maintenance_date, performed_by, status, bill_pics)
                VALUES (1, 'repair', '2026-07-01', 1, 'open', '["https://fake-cloudinary.test/bill.jpg"]'::jsonb)
                RETURNING id
            `);
            const res = await request(app)
                .post('/api/drivers/maintenance/1/complete')
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ cost: 100000 });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.message, 'Maintenance marked ready for verification');
            assert.strictEqual(res.body.maintenanceRecordId, insertRecord.rows[0].id);

            const row = await pool.query('SELECT status FROM maintenance_records WHERE id = $1', [insertRecord.rows[0].id]);
            assert.strictEqual(row.rows[0].status, 'pending_verification');
        });
    });
});
