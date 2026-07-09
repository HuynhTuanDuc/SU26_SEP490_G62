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
let driverToken;

describe('Vehicle Management Routes API Tests (L3)', () => {
    before(async () => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';
        ({ pool, teardown } = await setupTestDb());

        // Production mounts both routers under the same /api/admin prefix (routes/index.js) —
        // mirror that here so route-collision behavior matches reality.
        const adminRoutes = require('../routes/adminRoutes');
        const vehicleManagementRoutes = require('../routes/vehicleManagementRoutes');
        app = express();
        app.use(express.json());
        app.use('/api/admin', adminRoutes);
        app.use('/api/admin', vehicleManagementRoutes);

        managerToken = signAccessToken({ userId: 1, email: 'manager@test.com', role: 'manager' });
        driverToken = signAccessToken({ userId: 2, email: 'driver@test.com', role: 'driver' });
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE vehicle_status_history, maintenance_records, incidents,
                     vehicles, vehicle_groups, drivers, profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`INSERT INTO roles (id, name) VALUES (2, 'driver'), (5, 'manager') ON CONFLICT DO NOTHING`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
            (1, 'manager@test.com', 'hash', 5, true),
            (2, 'driver@test.com', 'hash', 2, true)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Manager One', 5),
            (2, 'Driver One', 2)
        `);
        await pool.query(`
            INSERT INTO drivers (profile_id, license_number, hire_date) VALUES
            (2, 'DL-000001', CURRENT_DATE)
        `);
    });

    const createGroup = async (overrides = {}) => {
        const res = await request(app)
            .post('/api/admin/vehicle-groups')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ name: 'Group A', price_per_km: 10000, ...overrides });
        return res.body.vehicleGroup;
    };

    const createVehicle = async (groupId, overrides = {}) => {
        const res = await request(app)
            .post('/api/admin/vehicles')
            .set('Authorization', `Bearer ${managerToken}`)
            .send({ plate_number: '29A-111.11', vehicle_group_id: groupId, ...overrides });
        return res.body.vehicle;
    };

    describe('Vehicle Groups', () => {
        it('GET /vehicle-groups without a token -> 403', async () => {
            const res = await request(app).get('/api/admin/vehicle-groups');
            assert.strictEqual(res.status, 403);
        });

        it('GET /vehicle-groups as a driver (wrong role) -> 403', async () => {
            const res = await request(app).get('/api/admin/vehicle-groups').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('POST /vehicle-groups as manager -> 201 happy path', async () => {
            const res = await request(app)
                .post('/api/admin/vehicle-groups')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ name: 'Group 5m2', price_per_km: 15000, max_load_weight_kg: 5000 });
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.vehicleGroup.name, 'Group 5m2');
        });

        it('POST /vehicle-groups missing name -> 400', async () => {
            const res = await request(app)
                .post('/api/admin/vehicle-groups')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ price_per_km: 15000 });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.error, 'Vehicle group name is required');
        });

        it('GET /vehicle-groups -> 200 list', async () => {
            await createGroup();
            const res = await request(app).get('/api/admin/vehicle-groups').set('Authorization', `Bearer ${managerToken}`);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body.vehicleGroups));
            assert.strictEqual(res.body.vehicleGroups.length, 1);
        });

        it('GET /vehicle-groups/:id not found -> 404', async () => {
            const res = await request(app).get('/api/admin/vehicle-groups/999999').set('Authorization', `Bearer ${managerToken}`);
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error, 'Vehicle group not found');
        });

        it('GET /vehicle-groups/:id -> 200', async () => {
            const group = await createGroup();
            const res = await request(app).get(`/api/admin/vehicle-groups/${group.id}`).set('Authorization', `Bearer ${managerToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.vehicleGroup.id, group.id);
        });

        it('PUT /vehicle-groups/:id -> 200 happy path', async () => {
            const group = await createGroup();
            const res = await request(app)
                .put(`/api/admin/vehicle-groups/${group.id}`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ name: 'Group A Updated', price_per_km: 20000 });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.vehicleGroup.name, 'Group A Updated');
        });

        it('DELETE /vehicle-groups/:id -> 200, soft-deletes (status=hidden)', async () => {
            const group = await createGroup();
            const res = await request(app)
                .delete(`/api/admin/vehicle-groups/${group.id}`)
                .set('Authorization', `Bearer ${managerToken}`);
            assert.strictEqual(res.status, 200);

            const dbGroup = await pool.query('SELECT status FROM vehicle_groups WHERE id = $1', [group.id]);
            assert.strictEqual(dbGroup.rows[0].status, 'hidden');
        });
    });

    describe('Vehicles CRUD', () => {
        it('GET /vehicles without a token -> 403', async () => {
            const res = await request(app).get('/api/admin/vehicles');
            assert.strictEqual(res.status, 403);
        });

        it('GET /vehicles as a driver (wrong role) -> 403', async () => {
            const res = await request(app).get('/api/admin/vehicles').set('Authorization', `Bearer ${driverToken}`);
            assert.strictEqual(res.status, 403);
        });

        it('GET /vehicles/driver-options -> 200', async () => {
            const res = await request(app).get('/api/admin/vehicles/driver-options').set('Authorization', `Bearer ${managerToken}`);
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body.drivers));
        });

        it('POST /vehicles -> 201 happy path', async () => {
            const group = await createGroup();
            const res = await request(app)
                .post('/api/admin/vehicles')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ plate_number: '29B-222.22', vehicle_group_id: group.id, brand: 'Toyota' });
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.vehicle.plate_number, '29B-222.22');
            assert.strictEqual(res.body.vehicle.status, 'active');
        });

        it('POST /vehicles duplicate plate number -> 409', async () => {
            const group = await createGroup();
            await createVehicle(group.id, { plate_number: '29C-999.99' });

            const res = await request(app)
                .post('/api/admin/vehicles')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ plate_number: '29C-999.99', vehicle_group_id: group.id });
            assert.strictEqual(res.status, 409);
            assert.strictEqual(res.body.error, 'Plate number already exists');
        });

        it('GET /vehicles -> 200 paginated list', async () => {
            const group = await createGroup();
            await createVehicle(group.id, { plate_number: '29D-111.11' });

            const res = await request(app).get('/api/admin/vehicles').set('Authorization', `Bearer ${managerToken}`);
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.items.length >= 1);
            assert.ok(res.body.pagination);
        });

        it('GET /vehicles/:id not found -> 404', async () => {
            const res = await request(app).get('/api/admin/vehicles/999999').set('Authorization', `Bearer ${managerToken}`);
            assert.strictEqual(res.status, 404);
            assert.strictEqual(res.body.error, 'Vehicle not found');
        });

        it('GET /vehicles/:id -> 200 with status_history', async () => {
            const group = await createGroup();
            const vehicle = await createVehicle(group.id, { plate_number: '29E-222.22' });

            const res = await request(app).get(`/api/admin/vehicles/${vehicle.id}`).set('Authorization', `Bearer ${managerToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.vehicle.id, vehicle.id);
            assert.ok(Array.isArray(res.body.vehicle.status_history));
        });

        it('PUT /vehicles/:id -> 200 happy path', async () => {
            const group = await createGroup();
            const vehicle = await createVehicle(group.id, { plate_number: '29F-333.33' });

            const res = await request(app)
                .put(`/api/admin/vehicles/${vehicle.id}`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ plate_number: '29F-333.33', vehicle_group_id: group.id, brand: 'Honda' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.vehicle.brand, 'Honda');
        });
    });

    describe('Vehicle lifecycle transitions', () => {
        it('POST /vehicles/:id/send-to-maintenance -> 200, active -> maintenance', async () => {
            const group = await createGroup();
            const vehicle = await createVehicle(group.id, { plate_number: '29G-111.11' });

            const res = await request(app)
                .post(`/api/admin/vehicles/${vehicle.id}/send-to-maintenance`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ maintenance_type: 'scheduled', description: 'Oil change', performed_by: 2 });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.vehicle.status, 'maintenance');
        });

        it('POST /vehicles/:id/retire while under maintenance -> 409 conflict', async () => {
            const group = await createGroup();
            const vehicle = await createVehicle(group.id, { plate_number: '29H-222.22' });

            await request(app)
                .post(`/api/admin/vehicles/${vehicle.id}/send-to-maintenance`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ maintenance_type: 'repair', description: 'Fixing brakes', performed_by: 2 });

            const res = await request(app)
                .post(`/api/admin/vehicles/${vehicle.id}/retire`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({});
            assert.strictEqual(res.status, 409);
            assert.ok(res.body.error.includes('maintenance is still open'));
        });

        it('complete-maintenance + verify-maintenance -> 200, vehicle returns to active', async () => {
            const group = await createGroup();
            const vehicle = await createVehicle(group.id, { plate_number: '29I-333.33' });

            const sendRes = await request(app)
                .post(`/api/admin/vehicles/${vehicle.id}/send-to-maintenance`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ maintenance_type: 'repair', description: 'Fixing', performed_by: 2 });
            const recordId = sendRes.body.vehicle.active_maintenance_id;

            const completeRes = await request(app)
                .post(`/api/admin/vehicles/${vehicle.id}/complete-maintenance`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ maintenance_record_id: recordId, bill_pics: ['url1'], performed_by: 2 });
            assert.strictEqual(completeRes.status, 200);

            await pool.query('UPDATE maintenance_records SET cost = 50000 WHERE id = $1', [recordId]);

            const verifyRes = await request(app)
                .post(`/api/admin/vehicles/${vehicle.id}/verify-maintenance`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ maintenance_record_id: recordId, verification_note: 'OK' });
            assert.strictEqual(verifyRes.status, 200);
            assert.strictEqual(verifyRes.body.vehicle.status, 'active');
        });

        it('mark-broken + restore -> 200, active -> broken -> active', async () => {
            const group = await createGroup();
            const vehicle = await createVehicle(group.id, { plate_number: '29J-444.44' });

            const brokenRes = await request(app)
                .post(`/api/admin/vehicles/${vehicle.id}/mark-broken`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ failure_type: 'engine_failure', description: 'Engine stopped', severity_level: 'high' });
            assert.strictEqual(brokenRes.status, 200);
            assert.strictEqual(brokenRes.body.vehicle.status, 'broken');
            const failureId = brokenRes.body.vehicle.active_failure_id;

            const restoreRes = await request(app)
                .post(`/api/admin/vehicles/${vehicle.id}/restore`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ failure_record_id: failureId, resolution_note: 'Fixed' });
            assert.strictEqual(restoreRes.status, 200);
            assert.strictEqual(restoreRes.body.vehicle.status, 'active');
        });

        it('PATCH /vehicles/:id/status -> 200 (alias for lifecycle transitions)', async () => {
            const group = await createGroup();
            const vehicle = await createVehicle(group.id, { plate_number: '29K-555.55' });

            const res = await request(app)
                .patch(`/api/admin/vehicles/${vehicle.id}/status`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ status: 'maintenance', maintenance_type: 'scheduled', description: 'Check-up', performed_by: 2 });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.vehicle.status, 'maintenance');
        });

        it('PATCH /vehicles/:id/driver-assignment -> 200, assign then unassign', async () => {
            const group = await createGroup();
            const vehicle = await createVehicle(group.id, { plate_number: '29L-666.66' });

            const assignRes = await request(app)
                .patch(`/api/admin/vehicles/${vehicle.id}/driver-assignment`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ assigned_driver_id: 2 });
            assert.strictEqual(assignRes.status, 200);
            assert.strictEqual(assignRes.body.vehicle.assigned_driver_id, 2);

            const unassignRes = await request(app)
                .patch(`/api/admin/vehicles/${vehicle.id}/driver-assignment`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ assigned_driver_id: null });
            assert.strictEqual(unassignRes.status, 200);
            assert.strictEqual(unassignRes.body.vehicle.assigned_driver_id, null);
        });

        it('DELETE /vehicles/:id -> 200, soft-deletes (retires) the vehicle', async () => {
            const group = await createGroup();
            const vehicle = await createVehicle(group.id, { plate_number: '29M-777.77' });

            const res = await request(app)
                .delete(`/api/admin/vehicles/${vehicle.id}`)
                .set('Authorization', `Bearer ${managerToken}`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.vehicle.status, 'retired');
        });

        it('lifecycle endpoint as a driver (wrong role) -> 403', async () => {
            const group = await createGroup();
            const vehicle = await createVehicle(group.id, { plate_number: '29N-888.88' });

            const res = await request(app)
                .post(`/api/admin/vehicles/${vehicle.id}/mark-broken`)
                .set('Authorization', `Bearer ${driverToken}`)
                .send({ failure_type: 'engine_failure', description: 'x' });
            assert.strictEqual(res.status, 403);
        });
    });
});
