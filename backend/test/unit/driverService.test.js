/**
 * L1 Unit Test — driverService (luồng bảo dưỡng xe do tài xế thực hiện)
 *
 * Điểm nghiệp vụ nặng nhất: assertMaintenanceCostMatchesBills — chốt chặn cuối chống
 * khai khống tiền bảo dưỡng, có 3 nhánh (khớp tổng / khớp hoá đơn lớn nhất / fail-open
 * khi OCR không đọc được ảnh nào).
 */
jest.mock('../../repositories/driverRepository');
jest.mock('../../repositories/vehicleManagementRepository');
jest.mock('../../services/notificationService', () => ({
    getUserIdsByRole: jest.fn().mockResolvedValue([]),
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/notificationGateway', () => ({
    broadcastToRole: jest.fn(),
    broadcastToUser: jest.fn(),
    notifyCreated: jest.fn(),
}));
jest.mock('../../services/roleNotificationService', () => ({
    notifyRoles: jest.fn().mockResolvedValue([]),
    notifyRolesSafe: jest.fn(),
}));

const driverRepository = require('../../repositories/driverRepository');
const vehicleRepo = require('../../repositories/vehicleManagementRepository');
const notificationService = require('../../services/notificationService');
const notificationGateway = require('../../services/notificationGateway');
const expenseAiValidator = require('../../services/expenseAiValidator');
const driverService = require('../../services/driverService');

const XE = { id: 22, plate_number: '51C-123.45' };

beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    driverRepository.getDriverVehicle.mockResolvedValue({ ...XE });
    vehicleRepo.createMaintenanceRequest.mockResolvedValue({ maintenanceId: 300 });
    vehicleRepo.getVehicleById.mockResolvedValue({ ...XE, status: 'maintenance' });
    vehicleRepo.updateMaintenanceBillPics.mockResolvedValue(undefined);
    vehicleRepo.updateMaintenanceCost.mockResolvedValue(undefined);
    vehicleRepo.completeMaintenanceRecordAndSetStatus.mockResolvedValue(undefined);
    notificationService.getUserIdsByRole.mockResolvedValue([10]);
});

describe('driverService.requestMaintenance', () => {
    const YEU_CAU = { maintenance_type: 'repair', reason: '  Phanh kêu  ' };

    it('TC-UNIT-DriverService-001 — a valid request creates the maintenance ticket with the reason trimmed', async () => {
        const result = await driverService.requestMaintenance(5, YEU_CAU, ['https://cdn/bao-gia.jpg']);

        expect(vehicleRepo.createMaintenanceRequest).toHaveBeenCalledWith({
            vehicleId: 22, driverId: 5, maintenanceType: 'repair',
            reason: 'Phanh kêu', billPics: ['https://cdn/bao-gia.jpg'],
        });
        expect(result).toEqual({ maintenanceRecordId: 300 });
    });

    it('TC-UNIT-DriverService-002 — rejects a maintenance type outside the catalogue', async () => {
        await expect(driverService.requestMaintenance(5, { ...YEU_CAU, maintenance_type: 'rua_xe' }))
            .rejects.toMatchObject({ message: 'Loại bảo dưỡng không hợp lệ', statusCode: 400 });

        expect(vehicleRepo.createMaintenanceRequest).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DriverService-003 — rejects a missing reason', async () => {
        await expect(driverService.requestMaintenance(5, { maintenance_type: 'repair', reason: '   ' }))
            .rejects.toMatchObject({ message: 'Vui lòng nhập lý do yêu cầu bảo dưỡng', statusCode: 400 });

        expect(vehicleRepo.createMaintenanceRequest).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DriverService-004 — returns 404 when the driver has no vehicle', async () => {
        driverRepository.getDriverVehicle.mockResolvedValue(null);

        await expect(driverService.requestMaintenance(5, YEU_CAU))
            .rejects.toMatchObject({ message: 'Tài xế chưa được phân công xe', statusCode: 404 });
    });

    it('TC-UNIT-DriverService-005 — returns 409 when the vehicle already has an unfinished maintenance round', async () => {
        vehicleRepo.createMaintenanceRequest.mockRejectedValue(
            Object.assign(new Error('trùng'), { code: 'OPEN_MAINTENANCE_EXISTS' }),
        );

        await expect(driverService.requestMaintenance(5, YEU_CAU))
            .rejects.toMatchObject({ message: 'Xe đang có yêu cầu hoặc đợt bảo dưỡng chưa hoàn tất', statusCode: 409 });
    });

    it('TC-UNIT-DriverService-006 — an unexpected repository error is not swallowed into a 409', async () => {
        vehicleRepo.createMaintenanceRequest.mockRejectedValue(new Error('mất kết nối DB'));

        await expect(driverService.requestMaintenance(5, YEU_CAU)).rejects.toThrow('mất kết nối DB');
    });

    it('TC-UNIT-DriverService-007 — creation pushes realtime to managers and accountants', async () => {
        await driverService.requestMaintenance(5, YEU_CAU);

        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('manager', expect.objectContaining({
            action: 'maintenance_requested', vehicleId: 22, maintenanceRecordId: 300,
        }));
        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('accountant', expect.any(Object));
    });

    it('TC-UNIT-DriverService-008 — a notification failure does not invalidate the request already created', async () => {
        notificationService.getUserIdsByRole.mockRejectedValue(new Error('WS sập'));
        jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(driverService.requestMaintenance(5, YEU_CAU)).resolves.toEqual({ maintenanceRecordId: 300 });
    });
});

describe('driverService.uploadMaintenanceBill', () => {
    beforeEach(() => {
        vehicleRepo.getActiveMaintenanceRecordForDriver.mockResolvedValue({
            id: 300, status: 'open', cost: 2_000_000, bill_pics: ['https://cdn/cu.jpg'],
        });
        jest.spyOn(expenseAiValidator, 'scanMaintenanceReceipt').mockResolvedValue({ valid: true });
    });

    it('TC-UNIT-DriverService-009 — a valid photo is appended to the existing invoice list', async () => {
        const result = await driverService.uploadMaintenanceBill(5, 22, 'https://cdn/moi.jpg');

        expect(vehicleRepo.updateMaintenanceBillPics).toHaveBeenCalledWith(
            300, ['https://cdn/cu.jpg', 'https://cdn/moi.jpg'],
        );
        expect(result.bill_pics).toEqual(['https://cdn/cu.jpg', 'https://cdn/moi.jpg']);
    });

    it('TC-UNIT-DriverService-010 — a photo the AI rejects is NOT stored', async () => {
        expenseAiValidator.scanMaintenanceReceipt.mockResolvedValue({
            valid: false, reject_reason: 'Ảnh không phải hoá đơn',
        });

        await expect(driverService.uploadMaintenanceBill(5, 22, 'https://cdn/selfie.jpg'))
            .rejects.toMatchObject({ statusCode: 422, invalidBill: true });

        expect(vehicleRepo.updateMaintenanceBillPics).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DriverService-011 — a ticket still awaiting approval is not AI-scanned, the photo is a quote, not an invoice', async () => {
        vehicleRepo.getActiveMaintenanceRecordForDriver.mockResolvedValue({
            id: 300, status: 'requested', cost: null, bill_pics: [],
        });

        await driverService.uploadMaintenanceBill(5, 22, 'https://cdn/bao-gia.jpg');

        expect(expenseAiValidator.scanMaintenanceReceipt).not.toHaveBeenCalled();
        expect(vehicleRepo.updateMaintenanceBillPics).toHaveBeenCalledWith(300, ['https://cdn/bao-gia.jpg']);
    });

    it('TC-UNIT-DriverService-012 — rejects a vehicle_id that is not a positive integer', async () => {
        await expect(driverService.uploadMaintenanceBill(5, 0, 'https://cdn/a.jpg'))
            .rejects.toMatchObject({ message: 'vehicle_id must be a positive integer', statusCode: 400 });

        await expect(driverService.uploadMaintenanceBill(5, 'abc', 'https://cdn/a.jpg'))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    it('TC-UNIT-DriverService-013 — rejects a missing photo', async () => {
        await expect(driverService.uploadMaintenanceBill(5, 22, null))
            .rejects.toMatchObject({ message: 'Bill image is required', statusCode: 400 });
    });

    it('TC-UNIT-DriverService-014 — returns 404 when this driver has no open maintenance ticket', async () => {
        vehicleRepo.getActiveMaintenanceRecordForDriver.mockResolvedValue(null);

        await expect(driverService.uploadMaintenanceBill(5, 22, 'https://cdn/a.jpg'))
            .rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('driverService.updateMaintenanceCost', () => {
    beforeEach(() => {
        vehicleRepo.getActiveMaintenanceRecordForDriver.mockResolvedValue({ id: 300 });
    });

    it('TC-UNIT-DriverService-015 — a cost of 0 is accepted, maintenance under warranty is free', async () => {
        const result = await driverService.updateMaintenanceCost(5, 22, 0);

        expect(vehicleRepo.updateMaintenanceCost).toHaveBeenCalledWith(300, 0);
        expect(result).toEqual({ maintenanceRecordId: 300, cost: 0 });
    });

    it('TC-UNIT-DriverService-016 — rejects a negative cost', async () => {
        await expect(driverService.updateMaintenanceCost(5, 22, -1))
            .rejects.toMatchObject({ message: 'cost must be a non-negative number', statusCode: 400 });

        expect(vehicleRepo.updateMaintenanceCost).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DriverService-017 — rejects a non-numeric cost', async () => {
        await expect(driverService.updateMaintenanceCost(5, 22, 'nhieu tien'))
            .rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('driverService.completeMaintenance — đối chiếu tiền khai với hoá đơn', () => {
    beforeEach(() => {
        vehicleRepo.getActiveMaintenanceRecordForDriver.mockResolvedValue({
            id: 300, bill_pics: ['https://cdn/hd1.jpg', 'https://cdn/hd2.jpg'],
        });
    });

    it('TC-UNIT-DriverService-018 — a claim matching the SUM of the invoices completes the ticket', async () => {
        jest.spyOn(expenseAiValidator, 'readReceiptTotal')
            .mockResolvedValueOnce(1_200_000)
            .mockResolvedValueOnce(800_000);

        const result = await driverService.completeMaintenance(5, 22, { cost: 2_000_000 });

        expect(vehicleRepo.completeMaintenanceRecordAndSetStatus).toHaveBeenCalledWith(
            expect.objectContaining({ maintenanceRecordId: 300, cost: 2_000_000, performedBy: 5 }),
        );
        expect(result).toEqual({ maintenanceRecordId: 300 });
    });

    it('TC-UNIT-DriverService-019 — same invoice shot from several angles: matching the largest invoice is still accepted', async () => {
        jest.spyOn(expenseAiValidator, 'readReceiptTotal')
            .mockResolvedValueOnce(1_200_000)
            .mockResolvedValueOnce(1_200_000);

        await driverService.completeMaintenance(5, 22, { cost: 1_200_000 });

        expect(vehicleRepo.completeMaintenanceRecordAndSetStatus).toHaveBeenCalled();
    });

    it('TC-UNIT-DriverService-020 — an inflated claim, 5 million against a 200k invoice, is blocked with 422', async () => {
        jest.spyOn(expenseAiValidator, 'readReceiptTotal')
            .mockResolvedValueOnce(200_000)
            .mockResolvedValueOnce(0);

        await expect(driverService.completeMaintenance(5, 22, { cost: 5_000_000 }))
            .rejects.toMatchObject({ statusCode: 422, invalidBill: true });

        expect(vehicleRepo.completeMaintenanceRecordAndSetStatus).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DriverService-021 — when OCR reads no invoice at all it fails open, the manager decides last', async () => {
        jest.spyOn(expenseAiValidator, 'readReceiptTotal').mockResolvedValue(null);

        await driverService.completeMaintenance(5, 22, { cost: 5_000_000 });

        expect(vehicleRepo.completeMaintenanceRecordAndSetStatus).toHaveBeenCalled();
    });

    it('TC-UNIT-DriverService-022 — completion is refused while there is no invoice photo at all', async () => {
        vehicleRepo.getActiveMaintenanceRecordForDriver.mockResolvedValue({ id: 300, bill_pics: [] });

        await expect(driverService.completeMaintenance(5, 22, { cost: 1_000_000 }))
            .rejects.toMatchObject({
                message: 'At least one maintenance bill image is required before completion',
                statusCode: 400,
            });

        expect(vehicleRepo.completeMaintenanceRecordAndSetStatus).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DriverService-023 — a cost of 0 is rejected at completion, it must be above 0', async () => {
        await expect(driverService.completeMaintenance(5, 22, { cost: 0 }))
            .rejects.toMatchObject({ message: 'cost must be greater than 0', statusCode: 400 });
    });

    it('TC-UNIT-DriverService-024 — returns 404 when there is no open ticket', async () => {
        vehicleRepo.getActiveMaintenanceRecordForDriver.mockResolvedValue(null);

        await expect(driverService.completeMaintenance(5, 22, { cost: 1_000_000 }))
            .rejects.toMatchObject({ statusCode: 404 });
    });

    it('TC-UNIT-DriverService-025 — completion notifies managers with the plate number included', async () => {
        jest.spyOn(expenseAiValidator, 'readReceiptTotal').mockResolvedValue(null);

        await driverService.completeMaintenance(5, 22, { cost: 1_000_000 });

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [10],
            expect.objectContaining({
                type: 'MAINTENANCE_COMPLETED',
                message: expect.stringContaining('51C-123.45'),
            }),
        );
    });
});
