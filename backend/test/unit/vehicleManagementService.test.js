/**
 * L1 Unit Test — vehicleManagementService
 *
 * Hai cụm nghiệp vụ nặng nhất được phủ ở đây:
 *
 * 1. Ẩn nhóm xe — phải chặn khi nhóm còn xe đang dùng. Bỏ chặn là sinh ra "xe ma":
 *    xe vẫn active, vẫn có tài xế, nhưng điều phối không chọn được nhóm nên xe vĩnh
 *    viễn không có việc mới.
 *
 * 2. Gán tài xế cho xe — hiện thực của BR-DRV-003 (1 tài xế = 1 xe). Gồm cả 3 chốt
 *    chặn: tài đang có chuyến, tài còn đợt bảo dưỡng chưa được xác nhận, và tài đã
 *    thuộc về xe khác.
 */
jest.mock('../../repositories/vehicleManagementRepository');
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
    getUserIdsByRole: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/notificationGateway', () => ({
    broadcastToRole: jest.fn(), broadcastToUser: jest.fn(), notifyCreated: jest.fn(),
}));
jest.mock('../../services/roleNotificationService', () => ({
    notifyRoles: jest.fn().mockResolvedValue([]),
    notifyRolesSafe: jest.fn(),
}));

const repo = require('../../repositories/vehicleManagementRepository');
const notificationGateway = require('../../services/notificationGateway');
const { notifyRolesSafe } = require('../../services/roleNotificationService');
const service = require('../../services/vehicleManagementService');

const NHOM_XE = { id: 3, name: '5m2', status: 'active', price_per_km: 12000 };
const XE = {
    id: 22, plate_number: '51C-123.45', vehicle_group_id: 3, status: 'active',
    assigned_driver_id: null, brand: 'Hyundai', model: 'Mighty',
    load_capacity_kg: 5000, manufacture_year: 2020, purchase_date: '2020-01-01',
};
const TAI_XE_RANH = { id: 5, vehicle_id: null, active_shipment_count: 0, unverified_maintenance_count: 0 };

const nhomXeHopLe = { name: '  5m2  ', price_per_km: 12000, max_load_weight_kg: 5000, upgrade_allowed: 1 };

beforeEach(() => {
    jest.clearAllMocks();
    repo.getVehicleGroupByName.mockResolvedValue(null);
    repo.getVehicleGroupById.mockResolvedValue({ ...NHOM_XE });
    repo.createVehicleGroup.mockResolvedValue(3);
    repo.updateVehicleGroup.mockResolvedValue(undefined);
    repo.deleteVehicleGroup.mockResolvedValue(undefined);
    repo.restoreVehicleGroup.mockResolvedValue(undefined);
    repo.listInUseVehiclesInGroup.mockResolvedValue([]);
    repo.getVehicleGroupDetail?.mockResolvedValue?.({ ...NHOM_XE });
    repo.getVehicleById.mockResolvedValue({ ...XE });
    repo.getDriverById.mockResolvedValue({ ...TAI_XE_RANH });
    repo.updateVehicle.mockResolvedValue(undefined);
    repo.insertVehicleAssignmentHistory.mockResolvedValue(undefined);
    repo.listVehicleStatusHistory.mockResolvedValue([]);
    repo.listVehicleMaintenanceRecords.mockResolvedValue([]);
});

describe('vehicleManagementService.createVehicleGroup — chuẩn hoá và validate', () => {
    it('TC-UNIT-VehicleManagementService-001 — a valid group is stored with the name trimmed', async () => {
        await service.createVehicleGroup(nhomXeHopLe);

        expect(repo.createVehicleGroup).toHaveBeenCalledWith({
            name: '5m2',
            description: null,
            max_load_weight_kg: 5000,
            price_per_km: 12000,
            upgrade_allowed: true,
        });
    });

    it('TC-UNIT-VehicleManagementService-002 — rejects a missing group name (400)', async () => {
        await expect(service.createVehicleGroup({ ...nhomXeHopLe, name: '   ' }))
            .rejects.toMatchObject({ message: 'Vehicle group name is required', statusCode: 400 });

        expect(repo.createVehicleGroup).not.toHaveBeenCalled();
    });

    it('TC-UNIT-VehicleManagementService-003 — rejects a missing price per km (400)', async () => {
        await expect(service.createVehicleGroup({ name: '5m2', price_per_km: '' }))
            .rejects.toMatchObject({ message: 'price_per_km is required', statusCode: 400 });
    });

    it('TC-UNIT-VehicleManagementService-004 — a price per km of 0 is still valid (lower boundary)', async () => {
        await service.createVehicleGroup({ name: '5m2', price_per_km: 0 });

        expect(repo.createVehicleGroup).toHaveBeenCalledWith(expect.objectContaining({ price_per_km: 0 }));
    });

    it('TC-UNIT-VehicleManagementService-005 — rejects a negative price per km', async () => {
        await expect(service.createVehicleGroup({ name: '5m2', price_per_km: -1 }))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    it('TC-UNIT-VehicleManagementService-006 — rejects a non-numeric price per km', async () => {
        await expect(service.createVehicleGroup({ name: '5m2', price_per_km: 'nhiều' }))
            .rejects.toMatchObject({ message: 'price_per_km must be a valid number', statusCode: 400 });
    });

    it('TC-UNIT-VehicleManagementService-007 — stores null when the load capacity is left blank', async () => {
        await service.createVehicleGroup({ name: '5m2', price_per_km: 12000, max_load_weight_kg: '' });

        expect(repo.createVehicleGroup).toHaveBeenCalledWith(
            expect.objectContaining({ max_load_weight_kg: null }),
        );
    });

    it('TC-UNIT-VehicleManagementService-008 — rejects a group name that already exists (409)', async () => {
        repo.getVehicleGroupByName.mockResolvedValue({ id: 9 });

        await expect(service.createVehicleGroup(nhomXeHopLe))
            .rejects.toMatchObject({ message: 'Vehicle group name already exists', statusCode: 409 });

        expect(repo.createVehicleGroup).not.toHaveBeenCalled();
    });

    it('TC-UNIT-VehicleManagementService-009 — creation notifies managers, accountants and coordinators', async () => {
        await service.createVehicleGroup(nhomXeHopLe);

        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['manager', 'accountant', 'coordinator'],
            expect.objectContaining({ type: 'VEHICLE_GROUP_CREATED', entityId: 3 }),
            { displayMode: 'toast' },
        );
    });
});

describe('vehicleManagementService.updateVehicleGroup', () => {
    it('TC-UNIT-VehicleManagementService-010 — the duplicate-name check EXCLUDES the group being edited', async () => {
        await service.updateVehicleGroup(3, nhomXeHopLe);

        expect(repo.getVehicleGroupByName).toHaveBeenCalledWith('5m2', 3);
    });

    it('TC-UNIT-VehicleManagementService-011 — returns 404 when the group does not exist', async () => {
        repo.getVehicleGroupById.mockResolvedValue(null);

        await expect(service.updateVehicleGroup(3, nhomXeHopLe))
            .rejects.toMatchObject({ message: 'Vehicle group not found', statusCode: 404 });

        expect(repo.updateVehicleGroup).not.toHaveBeenCalled();
    });

    it('TC-UNIT-VehicleManagementService-012 — rejects a group id that is not a positive integer', async () => {
        await expect(service.updateVehicleGroup(0, nhomXeHopLe)).rejects.toMatchObject({ statusCode: 400 });
        await expect(service.updateVehicleGroup('abc', nhomXeHopLe)).rejects.toMatchObject({ statusCode: 400 });

        expect(repo.getVehicleGroupById).not.toHaveBeenCalled();
    });
});

describe('vehicleManagementService.deleteVehicleGroup — chặn tạo "xe ma"', () => {
    it('TC-UNIT-VehicleManagementService-013 — an empty group can be hidden', async () => {
        const kq = await service.deleteVehicleGroup(3);

        expect(repo.deleteVehicleGroup).toHaveBeenCalledWith(3);
        expect(kq).toEqual({ id: 3 });
    });

    it('TC-UNIT-VehicleManagementService-014 — blocks hiding a group that still holds vehicles and lists their plates', async () => {
        repo.listInUseVehiclesInGroup.mockResolvedValue([
            { plate_number: '51C-123.45' }, { plate_number: '51C-678.90' },
        ]);

        await expect(service.deleteVehicleGroup(3)).rejects.toMatchObject({
            statusCode: 409,
            message: expect.stringContaining('còn 2 xe đang dùng: 51C-123.45, 51C-678.90'),
        });

        expect(repo.deleteVehicleGroup).not.toHaveBeenCalled();
    });

    it('TC-UNIT-VehicleManagementService-015 — a database foreign-key violation becomes a 409', async () => {
        repo.deleteVehicleGroup.mockRejectedValue(Object.assign(new Error('fk'), { code: '23503' }));

        await expect(service.deleteVehicleGroup(3)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('TC-UNIT-VehicleManagementService-016 — any other database error is not swallowed into a 409', async () => {
        repo.deleteVehicleGroup.mockRejectedValue(new Error('connection reset'));

        await expect(service.deleteVehicleGroup(3)).rejects.toThrow('connection reset');
    });

    it('TC-UNIT-VehicleManagementService-017 — returns 404 without checking vehicles when the group does not exist', async () => {
        repo.getVehicleGroupById.mockResolvedValue(null);

        await expect(service.deleteVehicleGroup(3)).rejects.toMatchObject({ statusCode: 404 });

        expect(repo.listInUseVehiclesInGroup).not.toHaveBeenCalled();
    });
});

describe('vehicleManagementService.restoreVehicleGroup', () => {
    it('TC-UNIT-VehicleManagementService-018 — a hidden group can be restored', async () => {
        repo.getVehicleGroupById.mockResolvedValue({ ...NHOM_XE, status: 'inactive' });

        await service.restoreVehicleGroup(3);

        expect(repo.restoreVehicleGroup).toHaveBeenCalledWith(3);
        expect(notifyRolesSafe).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ type: 'VEHICLE_GROUP_RESTORED' }),
            expect.anything(),
        );
    });

    it('TC-UNIT-VehicleManagementService-019 — a visible group needs no restoring (409)', async () => {
        repo.getVehicleGroupById.mockResolvedValue({ ...NHOM_XE, status: 'active' });

        await expect(service.restoreVehicleGroup(3))
            .rejects.toMatchObject({ message: 'Nhóm xe đang hiển thị, không cần bỏ ẩn', statusCode: 409 });

        expect(repo.restoreVehicleGroup).not.toHaveBeenCalled();
    });

    it('TC-UNIT-VehicleManagementService-020 — returns 404 when restoring a group that does not exist', async () => {
        repo.getVehicleGroupById.mockResolvedValue(null);

        await expect(service.restoreVehicleGroup(3)).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('vehicleManagementService.setVehicleDriverAssignment — BR-DRV-003 (1 tài xế = 1 xe)', () => {
    it('TC-UNIT-VehicleManagementService-021 — assigns a free driver to an active vehicle', async () => {
        await service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10);

        expect(repo.updateVehicle).toHaveBeenCalledWith(22, expect.objectContaining({
            plate_number: '51C-123.45', assigned_driver_id: 5,
        }));
    });

    it('TC-UNIT-VehicleManagementService-022 — rejects a driver ALREADY bound to another vehicle (409)', async () => {
        repo.getDriverById.mockResolvedValue({ ...TAI_XE_RANH, vehicle_id: 99 });

        await expect(service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10))
            .rejects.toMatchObject({
                message: 'Assigned driver is already assigned to another vehicle', statusCode: 409,
            });

        expect(repo.updateVehicle).not.toHaveBeenCalled();
    });

    it('TC-UNIT-VehicleManagementService-023 — rejects a driver who still has an active shipment', async () => {
        repo.getDriverById.mockResolvedValue({ ...TAI_XE_RANH, active_shipment_count: 1 });

        await expect(service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10))
            .rejects.toMatchObject({
                message: 'Assigned driver must not have active shipments', statusCode: 409,
            });
    });

    it('TC-UNIT-VehicleManagementService-024 — rejects a driver with an unverified maintenance record', async () => {
        repo.getDriverById.mockResolvedValue({ ...TAI_XE_RANH, unverified_maintenance_count: 1 });

        await expect(service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10))
            .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('unverified maintenance') });
    });

    it('TC-UNIT-VehicleManagementService-025 — re-assigning the driver already on this vehicle skips the two checks above', async () => {
        // Tài đang chạy chuyến TRÊN CHÍNH XE NÀY — gán lại là thao tác vô hại,
        // chặn thì quản lý không sửa nổi thông tin xe khi tài đang trên đường.
        repo.getVehicleById.mockResolvedValue({ ...XE, assigned_driver_id: 5 });
        repo.getDriverById.mockResolvedValue({
            ...TAI_XE_RANH, vehicle_id: 22, active_shipment_count: 1, unverified_maintenance_count: 1,
        });

        await service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10);

        expect(repo.updateVehicle).toHaveBeenCalledWith(22, expect.objectContaining({ assigned_driver_id: 5 }));
    });

    it('TC-UNIT-VehicleManagementService-026 — rejects a driver that does not exist (400)', async () => {
        repo.getDriverById.mockResolvedValue(null);

        await expect(service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10))
            .rejects.toMatchObject({ message: 'Assigned driver does not exist', statusCode: 400 });
    });

    it('TC-UNIT-VehicleManagementService-027 — rejects a missing assigned_driver_id (400)', async () => {
        await expect(service.setVehicleDriverAssignment(22, {}, 10))
            .rejects.toMatchObject({ message: 'assigned_driver_id is required', statusCode: 400 });

        expect(repo.updateVehicle).not.toHaveBeenCalled();
    });

    it('TC-UNIT-VehicleManagementService-028 — returns 404 when the vehicle does not exist', async () => {
        repo.getVehicleById.mockResolvedValue(null);

        await expect(service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10))
            .rejects.toMatchObject({ message: 'Vehicle not found', statusCode: 404 });
    });

    it.each([['maintenance'], ['broken'], ['retired']])(
        'TC-UNIT-VehicleManagementService-029 — refuses to assign a driver while the vehicle is in state %s',
        async (trangThai) => {
            repo.getVehicleById.mockResolvedValue({ ...XE, status: trangThai });

            await expect(service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10))
                .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Cannot assign a driver') });

            expect(repo.updateVehicle).not.toHaveBeenCalled();
        },
    );

    it.each([['active'], ['maintenance'], ['broken']])(
        'TC-UNIT-VehicleManagementService-030 — UNASSIGNING a driver still works while the vehicle is in state %s',
        async (trangThai) => {
            repo.getVehicleById.mockResolvedValue({ ...XE, status: trangThai, assigned_driver_id: 5 });

            await service.setVehicleDriverAssignment(22, { assigned_driver_id: null }, 10);

            expect(repo.updateVehicle).toHaveBeenCalledWith(22, expect.objectContaining({ assigned_driver_id: null }));
        },
    );

    it('TC-UNIT-VehicleManagementService-031 — a retired vehicle can no longer have its driver unassigned', async () => {
        repo.getVehicleById.mockResolvedValue({ ...XE, status: 'retired', assigned_driver_id: 5 });

        await expect(service.setVehicleDriverAssignment(22, { assigned_driver_id: null }, 10))
            .rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Cannot unassign a driver') });
    });

    it('TC-UNIT-VehicleManagementService-032 — unassigning does NOT need to look the driver up', async () => {
        repo.getVehicleById.mockResolvedValue({ ...XE, assigned_driver_id: 5 });

        await service.setVehicleDriverAssignment(22, { assigned_driver_id: null }, 10);

        expect(repo.getDriverById).not.toHaveBeenCalled();
    });

    it('TC-UNIT-VehicleManagementService-033 — the assignment history records the previous driver and the action', async () => {
        repo.getVehicleById.mockResolvedValue({ ...XE, assigned_driver_id: 8 });
        repo.getDriverById.mockResolvedValue({ ...TAI_XE_RANH, id: 5 });

        await service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10);

        expect(repo.insertVehicleAssignmentHistory).toHaveBeenCalledWith({
            vehicleId: 22, driverId: 5, previousDriverId: 8,
            action: 'assign', note: null, createdBy: 10,
        });
    });

    it('TC-UNIT-VehicleManagementService-034 — unassigning is recorded in history with the unassign action', async () => {
        repo.getVehicleById.mockResolvedValue({ ...XE, assigned_driver_id: 5 });

        await service.setVehicleDriverAssignment(22, { assigned_driver_id: null }, 10);

        expect(repo.insertVehicleAssignmentHistory).toHaveBeenCalledWith(
            expect.objectContaining({ driverId: null, previousDriverId: 5, action: 'unassign' }),
        );
    });

    it('TC-UNIT-VehicleManagementService-035 — changing the assignment pushes realtime to managers', async () => {
        await service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10);

        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('manager',
            expect.objectContaining({ type: 'manager.vehicles.changed', action: 'driver_assignment_changed' }));
    });

    it('TC-UNIT-VehicleManagementService-036 — every other vehicle field is preserved when only the driver changes', async () => {
        await service.setVehicleDriverAssignment(22, { assigned_driver_id: 5 }, 10);

        expect(repo.updateVehicle).toHaveBeenCalledWith(22, {
            plate_number: '51C-123.45',
            vehicle_group_id: 3,
            brand: 'Hyundai',
            model: 'Mighty',
            load_capacity_kg: 5000,
            manufacture_year: 2020,
            purchase_date: '2020-01-01',
            assigned_driver_id: 5,
        });
    });
});

describe('vehicleManagementService.getVehicleAssignmentHistory', () => {
    it('TC-UNIT-VehicleManagementService-037 — returns 404 when the vehicle does not exist', async () => {
        repo.getVehicleById.mockResolvedValue(null);

        await expect(service.getVehicleAssignmentHistory(22)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('TC-UNIT-VehicleManagementService-038 — rejects an invalid vehicle id before querying the database', async () => {
        await expect(service.getVehicleAssignmentHistory(-1)).rejects.toMatchObject({ statusCode: 400 });

        expect(repo.getVehicleById).not.toHaveBeenCalled();
    });
});
