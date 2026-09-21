/**
 * L1 Unit Test — debtService
 *
 * notificationGateway được mock bằng factory: service destructure `broadcastToUser`
 * ngay lúc load module nên automock trả undefined sẽ không gắn được spy.
 */
jest.mock('../../repositories/debtRepository');
jest.mock('../../repositories/profileRepository');
jest.mock('../../repositories/roleRepository');
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/notificationGateway', () => ({
    broadcastToUser: jest.fn(),
    notifyCreated: jest.fn(),
    notifyRead: jest.fn(),
    notifyAllRead: jest.fn(),
    broadcastToRole: jest.fn(),
}));

const debtRepository = require('../../repositories/debtRepository');
const profileRepository = require('../../repositories/profileRepository');
const roleRepository = require('../../repositories/roleRepository');
const notificationService = require('../../services/notificationService');
const notificationGateway = require('../../services/notificationGateway');
const debtService = require('../../services/debtService');

beforeEach(() => {
    jest.clearAllMocks();
    profileRepository.getProfileById.mockResolvedValue({ full_name: 'Trần Văn Xe' });
    roleRepository.getUserIdsByRole.mockImplementation(async (role) => (role === 'manager' ? [1, 2] : [3]));
    notificationService.createForUsers.mockResolvedValue([]);
    notificationService.createForUser.mockResolvedValue(undefined);
});

describe('debtService.submitRepayment', () => {
    beforeEach(() => {
        debtRepository.submitRepayment.mockResolvedValue({ id: 88, amount: 500_000 });
    });

    it('TC-UNIT-DebtService-001 — records a valid repayment report and returns the row', async () => {
        const result = await debtService.submitRepayment(
            7, 30, { amount: 500_000, paymentMethod: 'cash', notes: 'nộp quỹ' }, 'https://cdn/ct.jpg',
        );

        expect(debtRepository.submitRepayment).toHaveBeenCalledWith(7, 30, {
            amount: 500_000, paymentMethod: 'cash', notes: 'nộp quỹ', receiptUrl: 'https://cdn/ct.jpg',
        });
        expect(result).toEqual({ id: 88, amount: 500_000 });
    });

    it('TC-UNIT-DebtService-002 — notifies both managers and accountants after the report is filed', async () => {
        await debtService.submitRepayment(7, 30, { amount: 500_000 }, 'https://cdn/ct.jpg');

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [1, 2, 3],
            expect.objectContaining({ type: 'DEBT_REPAYMENT_SUBMITTED', entityId: 88 }),
            { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-DebtService-003 — rejects a zero amount', async () => {
        await expect(debtService.submitRepayment(7, 30, { amount: 0 }, 'https://cdn/ct.jpg'))
            .rejects.toThrow('Số tiền phải lớn hơn 0');

        expect(debtRepository.submitRepayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DebtService-004 — rejects a missing proof image', async () => {
        await expect(debtService.submitRepayment(7, 30, { amount: 500_000 }, null))
            .rejects.toThrow('Ảnh chứng từ là bắt buộc');

        expect(debtRepository.submitRepayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DebtService-005 — rejects an unknown payment method', async () => {
        await expect(debtService.submitRepayment(7, 30, { amount: 500_000, paymentMethod: 'momo' }, 'https://cdn/ct.jpg'))
            .rejects.toThrow('Hình thức thanh toán không hợp lệ');

        expect(debtRepository.submitRepayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DebtService-006 — accepts an omitted payment method', async () => {
        await debtService.submitRepayment(7, 30, { amount: 500_000, paymentMethod: undefined }, 'https://cdn/ct.jpg');

        expect(debtRepository.submitRepayment).toHaveBeenCalled();
    });

    it('TC-UNIT-DebtService-007 — accepts bank transfer as a valid payment method', async () => {
        await debtService.submitRepayment(7, 30, { amount: 500_000, paymentMethod: 'bank_transfer' }, 'https://cdn/ct.jpg');

        expect(debtRepository.submitRepayment).toHaveBeenCalled();
    });
});

describe('debtService.confirmRepayment', () => {
    it('TC-UNIT-DebtService-008 — confirming a driver debt pushes realtime and notifies the driver', async () => {
        debtRepository.confirmRepayment.mockResolvedValue({ driverId: 7, debtId: 30 });

        await debtService.confirmRepayment(88, 3);

        expect(notificationGateway.broadcastToUser).toHaveBeenCalledWith(7, { type: 'debt.updated', debtId: 30 });
        expect(notificationService.createForUser).toHaveBeenCalledWith(
            7, expect.objectContaining({ type: 'DEBT_REPAYMENT_CONFIRMED' }), { displayMode: 'toast' },
        );
    });

    it('TC-UNIT-DebtService-009 — a customer debt, having no driver, pushes no realtime event', async () => {
        debtRepository.confirmRepayment.mockResolvedValue({ driverId: null, debtId: 31 });

        await debtService.confirmRepayment(89, 3);

        expect(notificationGateway.broadcastToUser).not.toHaveBeenCalled();
        expect(notificationService.createForUser).not.toHaveBeenCalled();
    });
});

describe('debtService.rejectRepayment', () => {
    it('TC-UNIT-DebtService-010 — a rejection with a reason carries that reason into the notification', async () => {
        debtRepository.rejectRepayment.mockResolvedValue({ driverId: 7, debtId: 30 });

        await debtService.rejectRepayment(88, 3, 'Ảnh mờ');

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            7,
            expect.objectContaining({ message: 'Khoản nộp công nợ #88 bị từ chối: Ảnh mờ' }),
            { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-DebtService-011 — a rejection without a reason falls back to the default wording', async () => {
        debtRepository.rejectRepayment.mockResolvedValue({ driverId: 7, debtId: 30 });

        await debtService.rejectRepayment(88, 3, null);

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            7,
            expect.objectContaining({ message: 'Khoản nộp công nợ #88 bị từ chối.' }),
            { displayMode: 'alert' },
        );
    });
});

describe('debtService.voidRepayment', () => {
    it('TC-UNIT-DebtService-012 — blocks voiding a confirmation when no reason is written', async () => {
        await expect(debtService.voidRepayment(88, 3, '   '))
            .rejects.toThrow('Cần ghi lý do hủy xác nhận');

        expect(debtRepository.voidRepayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DebtService-013 — trims the void reason before saving it', async () => {
        debtRepository.voidRepayment.mockResolvedValue({ driverId: 7, debtId: 30 });

        await debtService.voidRepayment(88, 3, '  Ghi nhầm chuyến  ');

        expect(debtRepository.voidRepayment).toHaveBeenCalledWith(88, 3, 'Ghi nhầm chuyến');
        expect(notificationGateway.broadcastToUser).toHaveBeenCalledWith(7, { type: 'debt.updated', debtId: 30 });
    });
});

describe('debtService.cancelRepayment', () => {
    it('TC-UNIT-DebtService-014 — a driver cancelling a repayment report receives an acknowledgement', async () => {
        debtRepository.cancelRepayment.mockResolvedValue({ ok: true });

        const result = await debtService.cancelRepayment(7, 88);

        expect(debtRepository.cancelRepayment).toHaveBeenCalledWith(7, 88);
        expect(notificationService.createForUser).toHaveBeenCalledWith(
            7, expect.objectContaining({ type: 'DEBT_REPAYMENT_CANCELLED' }), { displayMode: 'toast' },
        );
        expect(result).toEqual({ ok: true });
    });
});

describe('debtService.notifyOverdueDebts', () => {
    it('TC-UNIT-DebtService-015 — sends nothing when there is no overdue debt', async () => {
        debtRepository.getOverdueDebtsSummary.mockResolvedValue([]);

        const result = await debtService.notifyOverdueDebts();

        expect(result).toEqual({ notified: false });
        expect(notificationService.createForUsers).not.toHaveBeenCalled();
    });

    it('TC-UNIT-DebtService-016 — merges overdue debts into a single notice for managers and accountants', async () => {
        debtRepository.getOverdueDebtsSummary.mockResolvedValue([
            { debt_type: 'driver', debt_count: 3, total_remaining: 4_500_000 },
            { debt_type: 'customer', debt_count: 2, total_remaining: 10_000_000 },
        ]);

        const result = await debtService.notifyOverdueDebts();

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [1, 2, 3],
            expect.objectContaining({
                type: 'DEBT_OVERDUE',
                message: '3 khoản công nợ tài xế quá hạn — tổng 4.500.000đ. 2 khoản công nợ khách hàng quá hạn — tổng 10.000.000đ',
            }),
            { displayMode: 'alert' },
        );
        expect(result.notified).toBe(true);
    });
});
