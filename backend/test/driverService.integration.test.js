const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupTestDb } = require('./helpers/testDb');

let pool;
let teardown;
let driverService;
let vehicleManagementService;

describe('Driver Service Integration Tests (L2)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        driverService = require('../services/driverService');
        vehicleManagementService = require('../services/vehicleManagementService');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE maintenance_records, vehicle_status_history, vehicles, vehicle_groups, drivers, profiles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES
            (1, 'manager@test.com', 'hash', (SELECT id FROM roles WHERE name = 'manager')),
            (2, 'driver@test.com', 'hash', (SELECT id FROM roles WHERE name = 'driver'))
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Manager One', (SELECT id FROM roles WHERE name = 'manager')),
            (2, 'Driver One', (SELECT id FROM roles WHERE name = 'driver'))
        `);
        await pool.query(`
            INSERT INTO drivers (profile_id, license_number, hire_date) VALUES (2, 'DL-999', CURRENT_DATE)
        `);
        await pool.query(`SELECT setval('accounts_id_seq', 3, true)`);
        await pool.query(`SELECT setval('vehicle_groups_id_seq', 100000, true)`);
        await pool.query(`SELECT setval('vehicles_id_seq', 100000, true)`);
    });

    it('getDriverVehicle() returns the vehicle currently assigned to the driver', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group DRV-1', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({ plate_number: '29X-111.11', vehicle_group_id: group.id });
        await pool.query('UPDATE drivers SET vehicle_id = $1 WHERE profile_id = 2', [vehicle.id]);

        const result = await driverService.getDriverVehicle(2);

        assert.strictEqual(result.plate_number, '29X-111.11');
        assert.strictEqual(result.vehicle_group_name, 'Group DRV-1');
    });

    it('getAllDrivers() lists drivers along with their assigned vehicle', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group DRV-2', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({ plate_number: '29X-222.22', vehicle_group_id: group.id });
        await pool.query('UPDATE drivers SET vehicle_id = $1 WHERE profile_id = 2', [vehicle.id]);

        const drivers = await driverService.getAllDrivers();

        const driver = drivers.find((d) => d.id === 2);
        assert.ok(driver, 'expected driver profile 2 in the list');
        assert.strictEqual(driver.plate_number, '29X-222.22');
    });

    it('uploadMaintenanceBill() appends a bill photo to the open maintenance record', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group DRV-3', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({ plate_number: '29X-333.33', vehicle_group_id: group.id });
        const maintVehicle = await vehicleManagementService.changeVehicleStatus(vehicle.id, 1, {
            status: 'maintenance', maintenance_type: 'repair', description: 'Thay dầu', performed_by: 2,
        });

        const result = await driverService.uploadMaintenanceBill(2, vehicle.id, 'https://bill1.jpg');

        assert.strictEqual(result.maintenanceRecordId, maintVehicle.active_maintenance_id);
        assert.deepStrictEqual(result.bill_pics, ['https://bill1.jpg']);

        const dbRecord = await pool.query('SELECT bill_pics FROM maintenance_records WHERE id = $1', [maintVehicle.active_maintenance_id]);
        assert.deepStrictEqual(dbRecord.rows[0].bill_pics, ['https://bill1.jpg']);
    });

    it('updateMaintenanceCost() persists the cost on the open maintenance record', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group DRV-4', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({ plate_number: '29X-444.44', vehicle_group_id: group.id });
        const maintVehicle = await vehicleManagementService.changeVehicleStatus(vehicle.id, 1, {
            status: 'maintenance', maintenance_type: 'repair', description: 'Sửa phanh', performed_by: 2,
        });

        await driverService.updateMaintenanceCost(2, vehicle.id, 350000);

        const dbRecord = await pool.query('SELECT cost FROM maintenance_records WHERE id = $1', [maintVehicle.active_maintenance_id]);
        assert.strictEqual(Number(dbRecord.rows[0].cost), 350000);
    });

    it('completeMaintenance() rejects when no bill photo has been uploaded yet', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group DRV-5', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({ plate_number: '29X-555.55', vehicle_group_id: group.id });
        await vehicleManagementService.changeVehicleStatus(vehicle.id, 1, {
            status: 'maintenance', maintenance_type: 'repair', description: 'Kiểm tra lốp', performed_by: 2,
        });

        await assert.rejects(
            () => driverService.completeMaintenance(2, vehicle.id, { cost: 100000 }),
            (err) => err.statusCode === 400 && err.message.includes('bill image is required'),
        );
    });

    it('completeMaintenance() completes the record once a bill photo and cost are provided', async () => {
        const group = await vehicleManagementService.createVehicleGroup({ name: 'Group DRV-6', price_per_km: 10000 });
        const vehicle = await vehicleManagementService.createVehicle({ plate_number: '29X-666.66', vehicle_group_id: group.id });
        const maintVehicle = await vehicleManagementService.changeVehicleStatus(vehicle.id, 1, {
            status: 'maintenance', maintenance_type: 'repair', description: 'Bảo dưỡng định kỳ', performed_by: 2,
        });
        await driverService.uploadMaintenanceBill(2, vehicle.id, 'https://bill-final.jpg');

        const result = await driverService.completeMaintenance(2, vehicle.id, { cost: 500000 });

        assert.strictEqual(result.maintenanceRecordId, maintVehicle.active_maintenance_id);

        const dbRecord = await pool.query(
            'SELECT status, cost FROM maintenance_records WHERE id = $1',
            [maintVehicle.active_maintenance_id],
        );
        assert.strictEqual(dbRecord.rows[0].status, 'pending_verification');
        assert.strictEqual(Number(dbRecord.rows[0].cost), 500000);
    });
});
