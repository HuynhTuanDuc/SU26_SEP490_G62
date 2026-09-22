/**
 * L1 Unit Test — expenseService
 *
 * Trọng tâm: BR-018/BR-DRV-018 (bắt buộc ảnh chứng từ), BR-DRV-019 (danh mục loại chi),
 * BR-DRV-020 (số tiền > 0), BR-DRV-017 (chuyến phải còn hiệu lực) cùng 2 ngoại lệ thật
 * của hệ thống: tài xế bị điều chuyển giữa chuyến, và chuyến đã kết thúc nhưng phiếu thu
 * đang bị từ chối.
 */
jest.mock('../../repositories/expenseRepository');
jest.mock('../../repositories/tripRepository');
jest.mock('../../repositories/profileRepository');
jest.mock('../../repositories/roleRepository');
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
}));

const expenseRepository = require('../../repositories/expenseRepository');
const tripRepository = require('../../repositories/tripRepository');
const profileRepository = require('../../repositories/profileRepository');
const roleRepository = require('../../repositories/roleRepository');
const notificationService = require('../../services/notificationService');
const expenseService = require('../../services/expenseService');

const KHOAN_CHI_HOP_LE = {
    shipmentId: 100, expenseType: 'fuel', amount: 500_000,
    description: '  Đổ dầu Long Thành  ', receiptUrl: 'https://cdn/hoadon.jpg',
};

beforeEach(() => {
    jest.clearAllMocks();
    tripRepository.getTripById.mockResolvedValue({ id: 100, owner_driver_id: 5, status: 'transit' });
    tripRepository.getDriverVehicleId.mockResolvedValue(22);
    expenseRepository.createExpense.mockResolvedValue({ id: 61, expense_type: 'fuel' });
    expenseRepository.addExpenseAttachment.mockResolvedValue(undefined);
    expenseRepository.getShipmentExpenses.mockResolvedValue([{ id: 61 }]);
    profileRepository.getProfileById.mockResolvedValue({ full_name: 'Phạm Văn Tài' });
    roleRepository.getUserIdsByRole.mockResolvedValue([30, 31]);
});

describe('expenseService.createExpense', () => {
    it('TC-UNIT-ExpenseService-001 — a valid expense is stored with the vehicle, the description trimmed, and the trip expense list returned', async () => {
        const result = await expenseService.createExpense(5, KHOAN_CHI_HOP_LE);

        expect(expenseRepository.createExpense).toHaveBeenCalledWith({
            shipmentId: 100,
            vehicleId: 22,
            driverId: 5,
            expenseType: 'fuel',
            amount: 500_000,
            description: 'Đổ dầu Long Thành',
            clientRequestId: null,
        });
        expect(expenseRepository.addExpenseAttachment).toHaveBeenCalledWith(61, 'https://cdn/hoadon.jpg');
        expect(result).toEqual([{ id: 61 }]);
    });

    it('TC-UNIT-ExpenseService-002 — rejects a missing proof photo (BR-DRV-018)', async () => {
        await expect(expenseService.createExpense(5, { ...KHOAN_CHI_HOP_LE, receiptUrl: null }))
            .rejects.toThrow('Ảnh bằng chứng là bắt buộc');

        expect(expenseRepository.createExpense).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ExpenseService-003 — rejects an expense type outside the catalogue (BR-DRV-019)', async () => {
        await expect(expenseService.createExpense(5, { ...KHOAN_CHI_HOP_LE, expenseType: 'an_trua' }))
            .rejects.toThrow('Loại chi phí không hợp lệ');

        expect(expenseRepository.createExpense).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ExpenseService-004 — rejects a zero amount (BR-DRV-020)', async () => {
        await expect(expenseService.createExpense(5, { ...KHOAN_CHI_HOP_LE, amount: 0 }))
            .rejects.toThrow('Số tiền phải lớn hơn 0');

        expect(expenseRepository.createExpense).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ExpenseService-005 — rejects a negative amount', async () => {
        await expect(expenseService.createExpense(5, { ...KHOAN_CHI_HOP_LE, amount: -1 }))
            .rejects.toThrow('Số tiền phải lớn hơn 0');
    });

    it('TC-UNIT-ExpenseService-006 — rejects a trip that does not exist', async () => {
        tripRepository.getTripById.mockResolvedValue(null);

        await expect(expenseService.createExpense(5, KHOAN_CHI_HOP_LE))
            .rejects.toThrow('Chuyến không tồn tại');
    });

    it('TC-UNIT-ExpenseService-007 — an unrelated driver cannot file an expense against the trip', async () => {
        tripRepository.getTripById.mockResolvedValue({ id: 100, owner_driver_id: 9, status: 'transit' });
        expenseRepository.wasDriverAssignedToShipment.mockResolvedValue(false);

        await expect(expenseService.createExpense(5, KHOAN_CHI_HOP_LE))
            .rejects.toThrow('Bạn không có quyền thêm chi phí cho chuyến này');

        expect(expenseRepository.createExpense).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ExpenseService-008 — a driver who previously held the trip, after a reassignment, may still file expenses', async () => {
        tripRepository.getTripById.mockResolvedValue({ id: 100, owner_driver_id: 9, status: 'transit' });
        expenseRepository.wasDriverAssignedToShipment.mockResolvedValue(true);

        await expenseService.createExpense(5, KHOAN_CHI_HOP_LE);

        expect(expenseRepository.createExpense).toHaveBeenCalled();
    });

    it('TC-UNIT-ExpenseService-009 — a completed trip accepts no further expenses (BR-DRV-017)', async () => {
        tripRepository.getTripById.mockResolvedValue({ id: 100, owner_driver_id: 5, status: 'completed' });
        expenseRepository.hasRejectedReceiptRequest.mockResolvedValue(false);

        await expect(expenseService.createExpense(5, KHOAN_CHI_HOP_LE))
            .rejects.toThrow('Không thể thêm chi phí khi chuyến đã kết thúc');

        expect(expenseRepository.createExpense).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ExpenseService-010 — a finished trip reopens for extra expenses while its receipt request stands rejected', async () => {
        tripRepository.getTripById.mockResolvedValue({ id: 100, owner_driver_id: 5, status: 'completed' });
        expenseRepository.hasRejectedReceiptRequest.mockResolvedValue(true);

        await expenseService.createExpense(5, KHOAN_CHI_HOP_LE);

        expect(expenseRepository.createExpense).toHaveBeenCalled();
    });

    it('TC-UNIT-ExpenseService-011 — filing an expense asks the coordinator to approve it', async () => {
        await expenseService.createExpense(5, KHOAN_CHI_HOP_LE);

        expect(roleRepository.getUserIdsByRole).toHaveBeenCalledWith('coordinator');
        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [30, 31],
            expect.objectContaining({ type: 'EXPENSE_SUBMITTED', entityId: 61 }),
            { displayMode: 'silent' },
        );
    });

    it('TC-UNIT-ExpenseService-012 — a replayed offline action does not duplicate the photo or the notification', async () => {
        expenseRepository.createExpense.mockResolvedValue({ id: 61, _daTonTai: true });

        const result = await expenseService.createExpense(5, { ...KHOAN_CHI_HOP_LE, clientRequestId: 'abc-123' });

        expect(expenseRepository.addExpenseAttachment).not.toHaveBeenCalled();
        expect(notificationService.createForUsers).not.toHaveBeenCalled();
        expect(result).toEqual({ id: 61 });
        expect(result).not.toHaveProperty('_daTonTai');
    });

    it('TC-UNIT-ExpenseService-013 — a whitespace-only description is stored as null', async () => {
        await expenseService.createExpense(5, { ...KHOAN_CHI_HOP_LE, description: '    ' });

        expect(expenseRepository.createExpense).toHaveBeenCalledWith(
            expect.objectContaining({ description: null }),
        );
    });
});

describe('expenseService.approveExpense', () => {
    it('TC-UNIT-ExpenseService-014 — approving an expense notifies the driver who filed it', async () => {
        expenseRepository.approveExpense.mockResolvedValue({
            id: 61, created_by: 5, expense_type: 'fuel', amount: 500_000,
        });

        await expenseService.approveExpense(61, 30);

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5, expect.objectContaining({ type: 'EXPENSE_APPROVED', entityId: 61 }), { displayMode: 'silent' },
        );
    });
});

describe('expenseService.unapproveExpense', () => {
    it('TC-UNIT-ExpenseService-015 — a successful un-approval tells the driver to file it again', async () => {
        expenseRepository.unapproveExpense.mockResolvedValue({
            id: 61, created_by: 5, expense_type: 'fuel', amount: 500_000,
        });

        await expenseService.unapproveExpense(61, 30);

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5, expect.objectContaining({ type: 'EXPENSE_REJECTED' }), { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-ExpenseService-016 — reports an error when it cannot be un-approved, already reimbursed or the receipt is closed', async () => {
        expenseRepository.unapproveExpense.mockResolvedValue(null);

        await expect(expenseService.unapproveExpense(61, 30))
            .rejects.toThrow('Không gỡ duyệt được');

        expect(notificationService.createForUser).not.toHaveBeenCalled();
    });
});

describe('expenseService.rejectExpense', () => {
    it('TC-UNIT-ExpenseService-017 — a rejection with a reason carries that reason into the notification', async () => {
        expenseRepository.rejectExpense.mockResolvedValue({
            id: 61, created_by: 5, expense_type: 'fuel', amount: 500_000,
        });

        await expenseService.rejectExpense(61, 30, 'Hoá đơn mờ');

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5,
            expect.objectContaining({ message: expect.stringContaining('bị từ chối: Hoá đơn mờ') }),
            { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-ExpenseService-018 — reports an error on an expense that was already handled', async () => {
        expenseRepository.rejectExpense.mockResolvedValue(null);

        await expect(expenseService.rejectExpense(61, 30, 'x'))
            .rejects.toThrow('Không tìm thấy chi phí hoặc chi phí đã được xử lý');
    });
});

describe('expenseService.updateExpense', () => {
    it('TC-UNIT-ExpenseService-019 — rejects editing to an invalid expense type', async () => {
        await expect(expenseService.updateExpense(5, 61, { expenseType: 'an_trua' }))
            .rejects.toThrow('Loại chi phí không hợp lệ');

        expect(expenseRepository.updateExpense).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ExpenseService-020 — rejects editing the amount down to 0', async () => {
        await expect(expenseService.updateExpense(5, 61, { amount: 0 }))
            .rejects.toThrow('Số tiền phải lớn hơn 0');

        expect(expenseRepository.updateExpense).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ExpenseService-021 — leaving the amount untouched applies no above-zero rule', async () => {
        expenseRepository.updateExpense.mockResolvedValue({ id: 61 });

        await expenseService.updateExpense(5, 61, { description: 'ghi chú mới' });

        expect(expenseRepository.updateExpense).toHaveBeenCalled();
    });
});

describe('expenseService.getShipmentExpenses', () => {
    it('TC-UNIT-ExpenseService-022 — another driver cannot read the expenses of this trip', async () => {
        tripRepository.getTripById.mockResolvedValue({ id: 100, owner_driver_id: 9, status: 'transit' });

        await expect(expenseService.getShipmentExpenses(100, 5))
            .rejects.toThrow('Bạn không có quyền xem chi phí này');

        expect(expenseRepository.getShipmentExpenses).not.toHaveBeenCalled();
    });
});
