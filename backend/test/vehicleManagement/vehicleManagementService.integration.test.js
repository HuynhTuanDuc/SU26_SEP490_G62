const { describe, it, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const fs = require('fs');
const path = require('path');

let container;
let pool;
let vehicleManagementService;

describe('Vehicle Management Service Integration Tests (L2)', () => {
    before(async () => {
        container = await new PostgreSqlContainer("postgres:16-alpine").start();

        process.env.DB_HOST = container.getHost();
        process.env.DB_PORT = container.getPort();
        process.env.DB_NAME = container.getDatabase();
        process.env.DB_USER = container.getUsername();
        process.env.DB_PASSWORD = container.getPassword();

        pool = require('../../config/database');

        // Load the full schema
        const schemaPath = path.join(__dirname, '../../../DB script/DB script.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(schema);

        vehicleManagementService = require('../../services/vehicleManagementService');
    });

    after(async () => {
        if (pool) await pool.end();
        if (container) await container.stop();
    });

    beforeEach(async () => {
        // Clear data but keep schema
        const tables = [
            'vehicle_status_history', 'maintenance_records', 'incidents', 
            'vehicles', 'vehicle_groups', 'drivers', 'profiles', 'accounts'
        ];
        await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);

        // Seed basic required data
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES 
            (1, 'manager@test.com', 'hash', (SELECT id FROM roles WHERE name = 'manager')),
            (2, 'driver1@test.com', 'hash', (SELECT id FROM roles WHERE name = 'driver'))
        `);

        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES 
            (1, 'Manager User', (SELECT id FROM roles WHERE name = 'manager')),
            (2, 'Driver User', (SELECT id FROM roles WHERE name = 'driver'))
        `);

        await pool.query(`
            INSERT INTO drivers (profile_id, license_number, hire_date) VALUES 
            (2, 'DL-123456', CURRENT_DATE)
        `);
        
        await pool.query(`SELECT setval('accounts_id_seq', 3, true)`);
        await pool.query(`SELECT setval('vehicle_groups_id_seq', 100000, true)`);
        await pool.query(`SELECT setval('vehicles_id_seq', 100000, true)`);
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it('L2-VM-01 [Happy Path]: createVehicleGroup - should create a new vehicle group', async () => {
        const group = await vehicleManagementService.createVehicleGroup({
            name: 'Group A',
            max_load_weight_kg: 5000,
            price_per_km: 15000,
            upgrade_allowed: true
        });

        assert.ok(group.id);
        assert.strictEqual(group.name, 'Group A');
        assert.strictEqual(Number(group.price_per_km), 15000);
        
        const dbGroup = await pool.query('SELECT * FROM vehicle_groups WHERE id = $1', [group.id]);
        assert.strictEqual(dbGroup.rows.length, 1);
    });

    it('L2-VM-02 [Happy Path]: createVehicle - should create an active vehicle', async () => {
        const group = await vehicleManagementService.createVehicleGroup({
            name: 'Group B',
            price_per_km: 10000
        });

        const vehicle = await vehicleManagementService.createVehicle({
            plate_number: '29A-123.45',
            vehicle_group_id: group.id,
            brand: 'Toyota',
            status: 'active'
        });

        assert.ok(vehicle.id);
        assert.strictEqual(vehicle.plate_number, '29A-123.45');
        assert.strictEqual(vehicle.status, 'active');

        const dbVehicle = await pool.query('SELECT status FROM vehicles WHERE id = $1', [vehicle.id]);
        assert.strictEqual(dbVehicle.rows[0].status, 'active');
    });

    it('L2-VM-03 [Error Path]: createVehicle - duplicate plate number', async () => {
        const group = await vehicleManagementService.createVehicleGroup({
            name: 'Group C',
            price_per_km: 12000
        });

        await vehicleManagementService.createVehicle({
            plate_number: '29A-999.99',
            vehicle_group_id: group.id
        });

        await assert.rejects(
            () => vehicleManagementService.createVehicle({
                plate_number: '29a-999.99', // Case insensitive check
                vehicle_group_id: group.id
            }),
            (err) => err.statusCode === 409 && err.message === 'Plate number already exists'
        );
    });

    it('L2-VM-04 [Lifecycle]: sendVehicleToMaintenance - active -> maintenance', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group D', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({
            plate_number: '29D-111.11',
            vehicle_group_id: group.id
        });

        const updatedVehicle = await vehicleManagementService.changeVehicleStatus(vehicle.id, 1, {
            status: 'maintenance',
            maintenance_type: 'scheduled',
            description: 'Regular oil change',
            performed_by: 2
        });

        assert.strictEqual(updatedVehicle.status, 'maintenance');
        assert.ok(updatedVehicle.active_maintenance_id);

        const history = await pool.query('SELECT * FROM vehicle_status_history WHERE vehicle_id = $1 ORDER BY id DESC LIMIT 1', [vehicle.id]);
        assert.strictEqual(history.rows[0].from_status, 'active');
        assert.strictEqual(history.rows[0].to_status, 'maintenance');
    });

    it('L2-VM-05 [Lifecycle]: markVehicleAsBroken - active -> broken', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group E', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({
            plate_number: '29E-222.22',
            vehicle_group_id: group.id
        });

        const updatedVehicle = await vehicleManagementService.changeVehicleStatus(vehicle.id, 1, {
            status: 'broken',
            failure_type: 'engine_failure',
            description: 'Engine stopped working',
            severity_level: 'high'
        });

        assert.strictEqual(updatedVehicle.status, 'broken');
        assert.ok(updatedVehicle.active_failure_id);

        const incident = await pool.query('SELECT status FROM incidents WHERE id = $1', [updatedVehicle.active_failure_id]);
        assert.strictEqual(incident.rows[0].status, 'open');
    });

    it('L2-VM-06 [Lifecycle]: retireVehicle - cannot retire if in maintenance', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group F', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({
            plate_number: '29F-333.33',
            vehicle_group_id: group.id
        });

        await vehicleManagementService.changeVehicleStatus(vehicle.id, 1, {
            status: 'maintenance',
            maintenance_type: 'repair',
            description: 'Fixing brakes',
            performed_by: 2
        });

        await assert.rejects(
            () => vehicleManagementService.changeVehicleStatus(vehicle.id, 1, { status: 'retired' }),
            (err) => err.statusCode === 409 && err.message.includes('maintenance is still open')
        );
    });
    // --- Missing Coverage Integration Tests ---
    
    it('L2-VM-07 [Happy Path]: updateVehicleGroup - should update group name and price', async () => {
        const group = await vehicleManagementService.createVehicleGroup({
            name: 'Group G', price_per_km: 10000
        });

        const updated = await vehicleManagementService.updateVehicleGroup(group.id, {
            name: 'Group G Updated', price_per_km: 12000
        });

        assert.strictEqual(updated.name, 'Group G Updated');
        assert.strictEqual(Number(updated.price_per_km), 12000);
        
        const dbGroup = await pool.query('SELECT name FROM vehicle_groups WHERE id = $1', [group.id]);
        assert.strictEqual(dbGroup.rows[0].name, 'Group G Updated');
    });

    it('L2-VM-08 [Happy Path]: deleteVehicleGroup - should remove group from db', async () => {
        const group = await vehicleManagementService.createVehicleGroup({
            name: 'Group H', price_per_km: 10000
        });

        await vehicleManagementService.deleteVehicleGroup(group.id);

        const dbGroup = await pool.query('SELECT * FROM vehicle_groups WHERE id = $1', [group.id]);
        assert.strictEqual(dbGroup.rows.length, 0);
    });

    it('L2-VM-09 [Happy Path]: updateVehicle - should update vehicle properties', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group I', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({
            plate_number: '29I-111.11', vehicle_group_id: group.id
        });

        const updated = await vehicleManagementService.updateVehicle(vehicle.id, {
            plate_number: '29I-111.11',
            vehicle_group_id: group.id,
            brand: 'Honda',
            load_capacity_kg: 2000
        });

        assert.strictEqual(updated.brand, 'Honda');
        assert.strictEqual(Number(updated.load_capacity_kg), 2000);
    });

    it('L2-VM-10 [Query]: listVehicles - should return paginated list', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group J', price_per_km: 10000 });
        await vehicleManagementService.createVehicle({ plate_number: '29J-111', vehicle_group_id: group.id });
        await vehicleManagementService.createVehicle({ plate_number: '29J-222', vehicle_group_id: group.id });

        const result = await vehicleManagementService.listVehicles({ page: 1, limit: 10 });
        assert.ok(result.items.length >= 2);
        assert.ok(result.pagination.total >= 2);
    });

    it('L2-VM-11 [Lifecycle]: completeMaintenance & verifyMaintenance - full flow', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group K', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({
            plate_number: '29K-111.11', vehicle_group_id: group.id
        });

        const maintenanceVehicle = await vehicleManagementService.changeVehicleStatus(vehicle.id, 1, {
            status: 'maintenance', maintenance_type: 'repair', description: 'Fixing', performed_by: 2
        });

        const recordId = maintenanceVehicle.active_maintenance_id;

        // Complete
        await vehicleManagementService.completeMaintenance(vehicle.id, 1, {
            maintenance_record_id: recordId, bill_pics: ['url1'], performed_by: 2
        });

        // Set cost to allow verification
        await pool.query('UPDATE maintenance_records SET total_cost = 50000 WHERE id = $1', [recordId]);

        // Verify
        const verifiedVehicle = await vehicleManagementService.verifyMaintenance(vehicle.id, 1, {
            maintenance_record_id: recordId, verification_note: 'OK'
        });

        assert.strictEqual(verifiedVehicle.status, 'active');
        const dbRecord = await pool.query('SELECT status FROM maintenance_records WHERE id = $1', [recordId]);
        assert.strictEqual(dbRecord.rows[0].status, 'verified');
    });

    it('L2-VM-12 [Lifecycle]: restoreVehicle - broken -> active', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group L', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({
            plate_number: '29L-111.11', vehicle_group_id: group.id
        });

        const brokenVehicle = await vehicleManagementService.changeVehicleStatus(vehicle.id, 1, {
            status: 'broken', failure_type: 'engine_failure', description: 'Engine stopped'
        });

        const failureId = brokenVehicle.active_failure_id;

        const restoredVehicle = await vehicleManagementService.restoreVehicle(vehicle.id, 1, {
            failure_record_id: failureId, resolution_note: 'Fixed engine'
        });

        assert.strictEqual(restoredVehicle.status, 'active');
        const dbIncident = await pool.query('SELECT status FROM incidents WHERE id = $1', [failureId]);
        assert.strictEqual(dbIncident.rows[0].status, 'resolved');
    });

    it('L2-VM-13 [Driver]: setVehicleDriverAssignment - assign and unassign', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group M', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({
            plate_number: '29M-111.11', vehicle_group_id: group.id
        });

        // Assign driver 2
        const assignedVehicle = await vehicleManagementService.setVehicleDriverAssignment(vehicle.id, { assigned_driver_id: 2 });
        assert.strictEqual(assignedVehicle.assigned_driver_id, 2);

        const dbVehicle = await pool.query('SELECT assigned_driver_id FROM vehicles WHERE id = $1', [vehicle.id]);
        assert.strictEqual(dbVehicle.rows[0].assigned_driver_id, 2);

        // Unassign driver
        const unassignedVehicle = await vehicleManagementService.setVehicleDriverAssignment(vehicle.id, { assigned_driver_id: null });
        assert.strictEqual(unassignedVehicle.assigned_driver_id, null);
    });
});
