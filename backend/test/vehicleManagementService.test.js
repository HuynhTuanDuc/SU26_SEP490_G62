const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const vehicleManagementRepository = require('../repositories/vehicleManagementRepository');
const vehicleManagementService = require('../services/vehicleManagementService');
const notificationService = require('../services/notificationService');
const notificationGateway = require('../services/notificationGateway');

describe('Vehicle Management Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it('should allow unassigning driver from vehicle in maintenance status', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 10,
            plate_number: '51A-00001',
            vehicle_group_id: 2,
            brand: 'Isuzu',
            model: 'NQR',
            load_capacity_kg: 2000,
            manufacture_year: 2020,
            purchase_date: '2020-01-01',
            assigned_driver_id: 7,
            status: 'maintenance',
        }));
        mock.method(vehicleManagementRepository, 'updateVehicle', async () => ({}));
        mock.method(vehicleManagementRepository, 'listVehicleStatusHistory', async () => []);

        const vehicle = await vehicleManagementService.setVehicleDriverAssignment(10, { assigned_driver_id: null });

        assert.strictEqual(vehicle.assigned_driver_id, 7);
        assert.strictEqual(vehicleManagementRepository.updateVehicle.mock.calls.length, 1);
        assert.strictEqual(
            vehicleManagementRepository.updateVehicle.mock.calls[0].arguments[1].assigned_driver_id,
            null,
        );
    });

    it('should reject assigning a driver to a broken vehicle', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 10,
            plate_number: '51A-00001',
            vehicle_group_id: 2,
            brand: 'Isuzu',
            model: 'NQR',
            load_capacity_kg: 2000,
            manufacture_year: 2020,
            purchase_date: '2020-01-01',
            assigned_driver_id: null,
            status: 'broken',
        }));

        await assert.rejects(
            () => vehicleManagementService.setVehicleDriverAssignment(10, { assigned_driver_id: 7 }),
            (err) => err.statusCode === 409 && err.message === 'Cannot assign a driver when vehicle status is broken',
        );
    });

    it('should reject assigning a driver with unverified maintenance to another vehicle', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 12,
            plate_number: '51A-00002',
            vehicle_group_id: 2,
            brand: 'Hino',
            model: 'XZU',
            load_capacity_kg: 1800,
            manufacture_year: 2021,
            purchase_date: '2021-03-01',
            assigned_driver_id: null,
            status: 'active',
        }));
        mock.method(vehicleManagementRepository, 'getDriverById', async () => ({
            id: 7,
            vehicle_id: null,
            active_shipment_count: 0,
            unverified_maintenance_count: 1,
        }));

        await assert.rejects(
            () => vehicleManagementService.setVehicleDriverAssignment(12, { assigned_driver_id: 7 }),
            (err) => err.statusCode === 409 && err.message === 'Assigned driver has an unverified maintenance record and cannot be assigned yet',
        );
    });

    it('should reject assigning a driver with active shipments to a vehicle', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 14,
            plate_number: '51A-00003',
            vehicle_group_id: 2,
            brand: 'Hyundai',
            model: 'Mighty',
            load_capacity_kg: 1500,
            manufacture_year: 2022,
            purchase_date: '2022-05-01',
            assigned_driver_id: null,
            status: 'active',
        }));
        mock.method(vehicleManagementRepository, 'getDriverById', async () => ({
            id: 9,
            vehicle_id: null,
            active_shipment_count: 2,
            unverified_maintenance_count: 0,
        }));

        await assert.rejects(
            () => vehicleManagementService.setVehicleDriverAssignment(14, { assigned_driver_id: 9 }),
            (err) => err.statusCode === 409 && err.message === 'Assigned driver must not have active shipments',
        );
    });

    it('should list drivers with assignment blockers from shipments and maintenance verification', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 15,
            assigned_driver_id: 3,
            status: 'active',
        }));
        mock.method(vehicleManagementRepository, 'listDriverOptions', async () => ([
            {
                id: 3,
                current_vehicle_id: 15,
                active_shipment_count: 0,
                unverified_maintenance_count: 1,
            },
            {
                id: 4,
                current_vehicle_id: null,
                active_shipment_count: 1,
                unverified_maintenance_count: 0,
            },
            {
                id: 5,
                current_vehicle_id: null,
                active_shipment_count: 0,
                unverified_maintenance_count: 0,
            },
        ]));

        const drivers = await vehicleManagementService.listAssignableDrivers(15);

        assert.strictEqual(drivers[0].is_assignable, true);
        assert.strictEqual(drivers[0].has_unverified_maintenance, true);
        assert.strictEqual(drivers[1].is_assignable, false);
        assert.strictEqual(drivers[1].has_active_shipment, true);
        assert.strictEqual(drivers[2].is_assignable, true);
    });

    it('should block pending-maintenance drivers from new vehicle assignment options', async () => {
        mock.method(vehicleManagementRepository, 'listDriverOptions', async () => ([
            {
                id: 3,
                current_vehicle_id: null,
                active_shipment_count: 0,
                unverified_maintenance_count: 1,
            },
        ]));

        const drivers = await vehicleManagementService.listAssignableDrivers();

        assert.strictEqual(drivers[0].is_assignable, false);
        assert.strictEqual(drivers[0].has_unverified_maintenance, true);
    });

    it('should allow sending a broken vehicle to maintenance when breakdown is still open', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 18,
            plate_number: '51A-00018',
            vehicle_group_id: 2,
            assigned_driver_id: 7,
            active_failure_id: 44,
            status: 'broken',
        }));
        mock.method(vehicleManagementRepository, 'getDriverById', async () => ({
            id: 7,
            vehicle_id: 18,
            active_shipment_count: 0,
            unverified_maintenance_count: 0,
        }));
        mock.method(vehicleManagementRepository, 'moveBrokenVehicleToMaintenance', async () => ({}));
        mock.method(vehicleManagementRepository, 'listVehicleStatusHistory', async () => []);

        await vehicleManagementService.sendVehicleToMaintenance(18, 3, {
            maintenance_type: 'repair',
            description: 'Repair after breakdown',
            maintenance_date: '2026-06-12',
            performed_by: 7,
        });

        assert.strictEqual(vehicleManagementRepository.moveBrokenVehicleToMaintenance.mock.calls.length, 1);
    });

    it('should reject sending a broken vehicle to maintenance when no open breakdown incident exists', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 19,
            plate_number: '51A-00019',
            vehicle_group_id: 2,
            assigned_driver_id: 7,
            active_failure_id: null,
            status: 'broken',
        }));
        mock.method(vehicleManagementRepository, 'getDriverById', async () => ({
            id: 7,
            vehicle_id: 19,
            active_shipment_count: 0,
            unverified_maintenance_count: 0,
        }));

        await assert.rejects(
            () => vehicleManagementService.sendVehicleToMaintenance(19, 3, {
                maintenance_type: 'repair',
                description: 'Repair after breakdown',
                maintenance_date: '2026-06-12',
                performed_by: 7,
            }),
            (err) => err.statusCode === 409 && err.message === 'Cannot send broken vehicle to maintenance without an open breakdown incident',
        );
    });

    it('should create an active vehicle with normalized payload and initial active status only', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleGroupReferenceById', async () => ({ id: 2, name: 'Truck' }));
        mock.method(vehicleManagementRepository, 'getVehicleByPlateNumber', async () => null);
        mock.method(vehicleManagementRepository, 'getDriverById', async () => ({
            id: 7,
            vehicle_id: null,
            active_shipment_count: 0,
            unverified_maintenance_count: 0,
        }));
        mock.method(vehicleManagementRepository, 'createVehicle', async () => 22);
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 22,
            plate_number: '51A-22222',
            vehicle_group_id: 2,
            brand: 'Hino',
            model: '300',
            load_capacity_kg: 3500,
            manufacture_year: 2022,
            purchase_date: '2022-01-01',
            assigned_driver_id: 7,
            status: 'active',
        }));
        mock.method(vehicleManagementRepository, 'listVehicleStatusHistory', async () => []);

        const vehicle = await vehicleManagementService.createVehicle({
            plate_number: ' 51A-22222 ',
            vehicle_group_id: '2',
            brand: ' Hino ',
            model: ' 300 ',
            load_capacity_kg: '3500',
            manufacture_year: '2022',
            purchase_date: '2022-01-01',
            assigned_driver_id: '7',
        });

        assert.strictEqual(vehicle.id, 22);
        assert.strictEqual(vehicleManagementRepository.createVehicle.mock.calls.length, 1);
        assert.deepStrictEqual(
            vehicleManagementRepository.createVehicle.mock.calls[0].arguments[0],
            {
                plate_number: '51A-22222',
                vehicle_group_id: 2,
                brand: 'Hino',
                model: '300',
                load_capacity_kg: 3500,
                manufacture_year: 2022,
                purchase_date: '2022-01-01',
                assigned_driver_id: 7,
                status: 'active',
            },
        );
    });

    it('should reject creating a vehicle with a non-active initial status', async () => {
        await assert.rejects(
            () => vehicleManagementService.createVehicle({
                plate_number: '51A-33333',
                vehicle_group_id: 2,
                status: 'maintenance',
            }),
            (err) => err.statusCode === 400 && err.message === 'Vehicle creation only supports initial status ACTIVE. Use manager actions for later lifecycle changes.',
        );
    });

    it('should reject updating vehicle status directly', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 25,
            plate_number: '51A-00025',
            vehicle_group_id: 2,
            brand: 'Isuzu',
            model: 'NQR',
            load_capacity_kg: 2000,
            manufacture_year: 2020,
            purchase_date: '2020-01-01',
            assigned_driver_id: 7,
            status: 'active',
        }));

        await assert.rejects(
            () => vehicleManagementService.updateVehicle(25, {
                plate_number: '51A-00025',
                vehicle_group_id: 2,
                status: 'broken',
            }),
            (err) => err.statusCode === 400 && err.message === 'Vehicle status cannot be edited directly. Use lifecycle actions instead.',
        );
    });

    it('should reject updating an active vehicle with a future manufacture year', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 26,
            plate_number: '51A-00026',
            vehicle_group_id: 2,
            brand: 'Isuzu',
            model: 'NQR',
            load_capacity_kg: 2000,
            manufacture_year: 2020,
            purchase_date: '2020-01-01',
            assigned_driver_id: 7,
            status: 'active',
        }));
        mock.method(vehicleManagementRepository, 'getVehicleGroupReferenceById', async () => ({ id: 2, name: 'Truck' }));
        mock.method(vehicleManagementRepository, 'getVehicleByPlateNumber', async () => null);
        mock.method(vehicleManagementRepository, 'getDriverById', async () => ({
            id: 7,
            vehicle_id: 26,
            active_shipment_count: 0,
            unverified_maintenance_count: 0,
        }));

        await assert.rejects(
            () => vehicleManagementService.updateVehicle(26, {
                plate_number: '51A-00026',
                vehicle_group_id: 2,
                assigned_driver_id: 7,
                manufacture_year: new Date().getFullYear() + 1,
            }),
            (err) => err.statusCode === 400 && err.message === 'Manufacture year cannot be in the future',
        );
    });

    it('should notify the assigned maintenance driver when sending an active vehicle to maintenance', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 27,
            plate_number: '51A-00027',
            vehicle_group_id: 2,
            assigned_driver_id: 7,
            status: 'active',
        }));
        mock.method(vehicleManagementRepository, 'getDriverById', async () => ({
            id: 7,
            vehicle_id: 27,
            active_shipment_count: 0,
            unverified_maintenance_count: 0,
        }));
        mock.method(vehicleManagementRepository, 'createMaintenanceRecordAndSetStatus', async () => ({
            maintenanceId: 91,
            previousStatus: 'active',
        }));
        mock.method(vehicleManagementRepository, 'listVehicleStatusHistory', async () => []);
        mock.method(notificationService, 'createForUser', async () => ({}));
        mock.method(notificationGateway, 'broadcastToUser', () => {});

        await vehicleManagementService.sendVehicleToMaintenance(27, 3, {
            maintenance_type: 'repair',
            description: 'Replace brakes',
            maintenance_date: '2026-06-13',
            performed_by: 7,
        });

        assert.strictEqual(vehicleManagementRepository.createMaintenanceRecordAndSetStatus.mock.calls.length, 1);
        assert.strictEqual(notificationService.createForUser.mock.calls.length, 1);
        assert.strictEqual(notificationService.createForUser.mock.calls[0].arguments[0], 7);
        assert.strictEqual(notificationGateway.broadcastToUser.mock.calls.length, 1);
        assert.deepStrictEqual(notificationGateway.broadcastToUser.mock.calls[0].arguments, [
            7,
            {
                type: 'maintenance.assigned',
                vehicleId: 27,
                maintenanceRecordId: 91,
            },
        ]);
    });

    it('should verify maintenance with the provided verification note', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 28,
            plate_number: '51A-00028',
            vehicle_group_id: 2,
            assigned_driver_id: 7,
            status: 'maintenance',
            active_maintenance_id: 41,
            active_maintenance_status: 'pending_verification',
        }));
        mock.method(vehicleManagementRepository, 'verifyMaintenanceRecordAndSetStatus', async () => ({
            maintenanceId: 41,
            previousStatus: 'maintenance',
        }));
        mock.method(vehicleManagementRepository, 'listVehicleStatusHistory', async () => []);

        await vehicleManagementService.verifyMaintenance(28, 3, {
            maintenance_record_id: 41,
            verification_note: 'All checks passed',
        });

        assert.strictEqual(vehicleManagementRepository.verifyMaintenanceRecordAndSetStatus.mock.calls.length, 1);
        assert.deepStrictEqual(
            vehicleManagementRepository.verifyMaintenanceRecordAndSetStatus.mock.calls[0].arguments[0],
            {
                vehicleId: 28,
                maintenanceRecordId: 41,
                managerId: 3,
                note: 'All checks passed',
            },
        );
    });

    it('should reject verifying maintenance when no active maintenance record exists', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 29,
            plate_number: '51A-00029',
            vehicle_group_id: 2,
            assigned_driver_id: 7,
            status: 'maintenance',
            active_maintenance_id: null,
            active_maintenance_status: null,
        }));

        await assert.rejects(
            () => vehicleManagementService.verifyMaintenance(29, 3, {}),
            (err) => err.statusCode === 404 && err.message === 'No active maintenance record found for this vehicle',
        );
    });

    it('should map repository bill-required verification errors to a 400 response', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 30,
            plate_number: '51A-00030',
            vehicle_group_id: 2,
            assigned_driver_id: 7,
            status: 'maintenance',
            active_maintenance_id: 42,
            active_maintenance_status: 'pending_verification',
        }));
        mock.method(vehicleManagementRepository, 'verifyMaintenanceRecordAndSetStatus', async () => {
            const error = new Error('bill required');
            error.code = 'MAINTENANCE_BILL_REQUIRED';
            throw error;
        });

        await assert.rejects(
            () => vehicleManagementService.verifyMaintenance(30, 3, {}),
            (err) => err.statusCode === 400 && err.message === 'Maintenance bill evidence is required before verification',
        );
    });

    it('should route active to broken transitions through markVehicleAsBroken', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 31,
            plate_number: '51A-00031',
            vehicle_group_id: 2,
            assigned_driver_id: 7,
            status: 'active',
        }));
        mock.method(vehicleManagementRepository, 'createFailureRecordAndSetStatus', async () => ({
            failureId: 55,
            previousStatus: 'active',
        }));
        mock.method(vehicleManagementRepository, 'listVehicleStatusHistory', async () => []);

        await vehicleManagementService.changeVehicleStatus(31, 3, {
            status: 'broken',
            failure_type: 'engine',
            description: 'Engine overheated',
            severity_level: 'high',
        });

        assert.strictEqual(vehicleManagementRepository.createFailureRecordAndSetStatus.mock.calls.length, 1);
        assert.deepStrictEqual(
            vehicleManagementRepository.createFailureRecordAndSetStatus.mock.calls[0].arguments[0],
            {
                vehicleId: 31,
                managerId: 3,
                failureType: 'engine',
                description: 'Engine overheated',
                severityLevel: 'high',
                occurredAt: null,
                note: 'Engine overheated',
            },
        );
    });

    it('should reject invalid status transitions', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async () => ({
            id: 32,
            plate_number: '51A-00032',
            vehicle_group_id: 2,
            assigned_driver_id: 7,
            status: 'maintenance',
        }));

        await assert.rejects(
            () => vehicleManagementService.changeVehicleStatus(32, 3, { status: 'broken' }),
            (err) => err.statusCode === 409 && err.message === 'Invalid status transition from maintenance to broken',
        );
    });

    it('should retire an active vehicle through changeVehicleStatus', async () => {
        mock.method(vehicleManagementRepository, 'getVehicleById', async (id) => ({
            id,
            plate_number: '51A-00033',
            vehicle_group_id: 2,
            assigned_driver_id: id === 33 ? 7 : null,
            status: id === 33 ? 'active' : 'retired',
        }));
        mock.method(vehicleManagementRepository, 'retireVehicle', async () => ({
            previousStatus: 'active',
        }));
        mock.method(vehicleManagementRepository, 'listVehicleStatusHistory', async () => []);

        await vehicleManagementService.changeVehicleStatus(33, 3, {
            status: 'retired',
            note: 'End of service life',
        });

        assert.strictEqual(vehicleManagementRepository.retireVehicle.mock.calls.length, 1);
        assert.deepStrictEqual(
            vehicleManagementRepository.retireVehicle.mock.calls[0].arguments[0],
            {
                vehicleId: 33,
                managerId: 3,
                note: 'End of service life',
            },
        );
    });
});
