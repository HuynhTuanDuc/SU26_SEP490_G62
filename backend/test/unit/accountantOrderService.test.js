/**
 * L1 Unit Test — accountantOrderService (nhập đơn doanh thu ngoài)
 *
 * Trọng tâm là flushKpiRecalc: recalculateDriverKPI quét lại CẢ THÁNG rồi ghi đè, nên
 * với cùng (tài xế, tháng) gọi 1 lần hay 500 lần đều ra cùng con số — 499 lần còn lại
 * là quét lại vô ích và từng làm mẻ import lớn đụng trần timeout, khiến doanh thu import
 * không bao giờ tới bảng lương. Test dưới đây khoá lại đúng luật gộp đó.
 */
jest.mock('../../repositories/accountantOrderRepository');
jest.mock('../../repositories/accountantPaymentRepository');
jest.mock('../../repositories/accountantLookupRepository');
jest.mock('../../repositories/orderRepository');
jest.mock('../../services/kpiService', () => ({
    recalculateAfterCompletion: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/roleNotificationService', () => ({
    notifyRoles: jest.fn().mockResolvedValue([]),
    notifyRolesSafe: jest.fn(),
}));

const orderRepo = require('../../repositories/accountantOrderRepository');
const paymentRepo = require('../../repositories/accountantPaymentRepository');
const lookupRepo = require('../../repositories/accountantLookupRepository');
const kpiService = require('../../services/kpiService');
const { notifyRolesSafe } = require('../../services/roleNotificationService');
const service = require('../../services/accountantOrderService');

const T8 = '2026-08-10T00:00:00Z';
const T7 = '2026-07-10T00:00:00Z';

beforeEach(() => {
    jest.clearAllMocks();
    orderRepo.createOrderWithShipments.mockResolvedValue({ id: 900, kpiTriggers: [] });
});

describe('accountantOrderService.flushKpiRecalc — gộp trigger', () => {
    it('TC-UNIT-AccountantOrderService-001 — 500 rows for the same driver in the same month recalculate KPI only once', async () => {
        const triggers = Array.from({ length: 500 }, () => ({ driverId: 5, completedAt: T8 }));

        await service.flushKpiRecalc(triggers);

        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledTimes(1);
        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledWith(5, expect.any(Date));
    });

    it('TC-UNIT-AccountantOrderService-002 — the same driver in different months is recalculated per period', async () => {
        await service.flushKpiRecalc([
            { driverId: 5, completedAt: T8 },
            { driverId: 5, completedAt: T7 },
        ]);

        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledTimes(2);
    });

    it('TC-UNIT-AccountantOrderService-003 — different drivers are recalculated separately', async () => {
        await service.flushKpiRecalc([
            { driverId: 5, completedAt: T8 },
            { driverId: 6, completedAt: T8 },
        ]);

        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledTimes(2);
        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledWith(5, expect.any(Date));
        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledWith(6, expect.any(Date));
    });

    it('TC-UNIT-AccountantOrderService-004 — a row without a driver is skipped', async () => {
        await service.flushKpiRecalc([
            { driverId: null, completedAt: T8 },
            { driverId: 0, completedAt: T8 },
            { driverId: undefined, completedAt: T8 },
        ]);

        expect(kpiService.recalculateAfterCompletion).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AccountantOrderService-005 — an empty list calls nothing', async () => {
        await service.flushKpiRecalc([]);
        await service.flushKpiRecalc();

        expect(kpiService.recalculateAfterCompletion).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AccountantOrderService-006 — falls back to the current moment when the completion time is missing', async () => {
        await service.flushKpiRecalc([{ driverId: 5, completedAt: null }]);

        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledWith(5, expect.any(Date));
    });

    it('TC-UNIT-AccountantOrderService-007 — the timestamp passed down carries the month of the trigger', async () => {
        await service.flushKpiRecalc([{ driverId: 5, completedAt: T7 }]);

        const [, moc] = kpiService.recalculateAfterCompletion.mock.calls[0];
        expect(moc.getFullYear()).toBe(2026);
        expect(moc.getMonth()).toBe(6); // tháng 7 (0-indexed)
    });
});

describe('accountantOrderService.createOrder', () => {
    it('TC-UNIT-AccountantOrderService-008 — a single order recalculates KPI at once and strips the kpiTriggers flag from the result', async () => {
        orderRepo.createOrderWithShipments.mockResolvedValue({
            id: 900, kpiTriggers: [{ driverId: 5, completedAt: T8 }],
        });

        const result = await service.createOrder({ created_by: 20 });

        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledTimes(1);
        expect(result).not.toHaveProperty('kpiTriggers');
        expect(result).toMatchObject({ id: 900 });
    });

    it('TC-UNIT-AccountantOrderService-009 — creating an order refreshes the lookup cache', async () => {
        await service.createOrder({ created_by: 20 });

        expect(lookupRepo.invalidateLookupCache).toHaveBeenCalledTimes(1);
    });

    it('TC-UNIT-AccountantOrderService-010 — notifies coordinators and managers, excluding the creator', async () => {
        await service.createOrder({ created_by: 20 });

        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['coordinator', 'manager'],
            expect.objectContaining({ type: 'ORDER_CREATED', entityId: 900 }),
            { excludeUserId: 20, displayMode: 'toast' },
        );
    });

    it('TC-UNIT-AccountantOrderService-011 — the suppress_notifications flag keeps it silent, used during import', async () => {
        await service.createOrder({ created_by: 20, suppress_notifications: true });

        expect(notifyRolesSafe).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AccountantOrderService-012 — passing collectKpiInto DEFERS the KPI work and only collects the triggers', async () => {
        orderRepo.createOrderWithShipments.mockResolvedValue({
            id: 900, kpiTriggers: [{ driverId: 5, completedAt: T8 }],
        });
        const gom = [];

        await service.createOrder({ created_by: 20 }, { collectKpiInto: gom });

        expect(kpiService.recalculateAfterCompletion).not.toHaveBeenCalled();
        expect(gom).toEqual([{ driverId: 5, completedAt: T8 }]);
    });
});

describe('accountantOrderService.importOrders', () => {
    it('TC-UNIT-AccountantOrderService-013 — importing many rows for the same driver and month recalculates KPI once at the end', async () => {
        orderRepo.createOrderWithShipments.mockImplementation(async () => ({
            id: 900, kpiTriggers: [{ driverId: 5, completedAt: T8 }],
        }));

        await service.importOrders([{}, {}, {}], 20);

        expect(orderRepo.createOrderWithShipments).toHaveBeenCalledTimes(3);
        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledTimes(1);
    });

    it('TC-UNIT-AccountantOrderService-014 — every imported row carries the creator and has its individual notice suppressed', async () => {
        await service.importOrders([{ code: 'A' }], 20);

        expect(orderRepo.createOrderWithShipments).toHaveBeenCalledWith({
            code: 'A', created_by: 20, suppress_notifications: true,
        });
    });

    it('TC-UNIT-AccountantOrderService-015 — the lookup cache is refreshed once for the whole batch', async () => {
        await service.importOrders([{}, {}, {}], 20);

        expect(lookupRepo.invalidateLookupCache).toHaveBeenCalledTimes(1);
    });

    it('TC-UNIT-AccountantOrderService-016 — the import summary reports the exact number of orders', async () => {
        await service.importOrders([{}, {}, {}], 20);

        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['coordinator', 'manager'],
            expect.objectContaining({
                type: 'ORDER_IMPORTED',
                message: 'Kế toán vừa import thành công 3 đơn hàng.',
            }),
            { excludeUserId: 20, displayMode: 'toast' },
        );
    });

    it('TC-UNIT-AccountantOrderService-017 — importing an empty list announces nothing', async () => {
        const result = await service.importOrders([], 20);

        expect(result).toEqual([]);
        expect(notifyRolesSafe).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AccountantOrderService-018 — importing several drivers recalculates each of them once', async () => {
        let i = 0;
        orderRepo.createOrderWithShipments.mockImplementation(async () => ({
            id: 900 + i, kpiTriggers: [{ driverId: [5, 5, 6][i++], completedAt: T8 }],
        }));

        await service.importOrders([{}, {}, {}], 20);

        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledTimes(2);
    });
});

describe('accountantOrderService.updateOrder', () => {
    it('TC-UNIT-AccountantOrderService-019 — a successful update notifies coordinators and managers', async () => {
        orderRepo.updateOrder.mockResolvedValue({ id: 900 });

        const result = await service.updateOrder(900, { updated_by: 20 });

        expect(result).toEqual({ id: 900 });
        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['coordinator', 'manager'],
            expect.objectContaining({ type: 'ORDER_UPDATED', entityId: 900 }),
            { excludeUserId: 20, displayMode: 'toast' },
        );
    });

    it('TC-UNIT-AccountantOrderService-020 — returns 404 and sends NO misleading notice when no order was updated', async () => {
        orderRepo.updateOrder.mockResolvedValue(null);

        await expect(service.updateOrder(900, { updated_by: 20 }))
            .rejects.toMatchObject({ message: 'Không tìm thấy đơn hàng.', status: 404 });

        expect(notifyRolesSafe).not.toHaveBeenCalled();
    });
});

describe('accountantOrderService — ghi nhận thanh toán', () => {
    it('TC-UNIT-AccountantOrderService-021 — recording a payment notifies managers, excluding the actor', async () => {
        paymentRepo.recordPaymentWithOverflow.mockResolvedValue({ ok: true });

        await service.recordPayment(900, { createdBy: 20, amount: 1_000_000 });

        expect(paymentRepo.recordPaymentWithOverflow).toHaveBeenCalledWith(900, { createdBy: 20, amount: 1_000_000 });
        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['manager', 'coordinator'],
            expect.objectContaining({ type: 'ORDER_PAYMENT_RECORDED', entityId: 900 }),
            { excludeUserId: 20, displayMode: 'toast' },
        );
    });

    it('TC-UNIT-AccountantOrderService-022 — confirming driver-collected cash notifies by shipment id', async () => {
        paymentRepo.confirmDriverPayment.mockResolvedValue({ ok: true });

        await service.confirmDriverPayment(100, 'collected', 2_000_000, 'cash', 40);

        expect(paymentRepo.confirmDriverPayment)
            .toHaveBeenCalledWith(100, 'collected', 2_000_000, 'cash', 40);
        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['manager', 'coordinator'],
            expect.objectContaining({ type: 'DRIVER_PAYMENT_CONFIRMED', entityId: 100 }),
            { excludeUserId: 40, displayMode: 'toast' },
        );
    });
});

describe('accountantOrderService.notifyImportSummary', () => {
    it('TC-UNIT-AccountantOrderService-023 — an order count of 0 sends no summary', () => {
        service.notifyImportSummary({ count: 0, actorId: 20 });

        expect(notifyRolesSafe).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AccountantOrderService-024 — a non-zero count sends the summary with the number included', () => {
        service.notifyImportSummary({ count: 12, actorId: 20 });

        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['coordinator', 'manager'],
            expect.objectContaining({ message: 'Kế toán vừa import thành công 12 đơn hàng.' }),
            { excludeUserId: 20, displayMode: 'toast' },
        );
    });
});
