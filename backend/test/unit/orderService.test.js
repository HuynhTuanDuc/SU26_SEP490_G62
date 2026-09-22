/**
 * L1 Unit Test — orderService (phần hợp lệ ở mức unit)
 *
 * PHẠM VI CÓ CHỦ Ý: createOrder / updateOrder / importOrdersFromExcel là orchestrator
 * giao dịch — chúng tự mở client từ pool rồi chạy BEGIN/COMMIT/ROLLBACK quanh hàng
 * chục lời gọi repository. Kiểm thử chúng bằng cách mock cả vòng đời transaction sẽ
 * biến test thành bản sao của implementation (mock setup nhiều hơn phần logic được đo)
 * — đúng dấu hiệu mà writing-good-tests bảo phải chuyển sang integration test. Chúng
 * thuộc Level 2 (Report 5.2), không phải Level 1.
 *
 * Ở đây phủ các method còn lại: huỷ đơn kèm hoàn tiền ứng trước, và luồng xác nhận /
 * từ chối tiền trả trước.
 */
jest.mock('../../config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../config/logger', () => ({
    warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));
jest.mock('../../repositories/orderRepository');
jest.mock('../../services/notificationGateway', () => ({
    broadcastToRole: jest.fn(), broadcastToUser: jest.fn(), notifyCreated: jest.fn(),
}));
jest.mock('../../services/roleNotificationService', () => ({
    notifyRoles: jest.fn().mockResolvedValue([]),
    notifyRolesSafe: jest.fn(),
}));
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
    getUserIdsByRole: jest.fn().mockResolvedValue([]),
}));

const orderRepository = require('../../repositories/orderRepository');
const notificationGateway = require('../../services/notificationGateway');
const { notifyRolesSafe } = require('../../services/roleNotificationService');
const orderService = require('../../services/orderService');

const DON = { id: 900, order_code: 'DH900', prepaid_amount: 2_000_000 };

beforeEach(() => {
    jest.clearAllMocks();
    orderRepository.cancelOrder.mockResolvedValue({ order: { ...DON }, refund: null });
    orderRepository.confirmPrepaid.mockResolvedValue({ ...DON });
    orderRepository.rejectPrepaid.mockResolvedValue({ ...DON });
});

describe('orderService.cancelOrder', () => {
    it('TC-UNIT-OrderService-001 — a successful cancellation pushes realtime to the coordinator', async () => {
        const kq = await orderService.cancelOrder(900, 'Khách đổi ý', 10);

        expect(orderRepository.cancelOrder).toHaveBeenCalledWith(900, 'Khách đổi ý', 10);
        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('coordinator',
            expect.objectContaining({ type: 'coordinator.orders.changed', action: 'cancelled', orderId: 900 }));
        expect(kq).toMatchObject({ id: 900, refund: null });
    });

    it('TC-UNIT-OrderService-002 — falls back to the default reason when none is written', async () => {
        await orderService.cancelOrder(900, '   ', 10);

        expect(orderRepository.cancelOrder).toHaveBeenCalledWith(900, 'Coordinator cancelled order', 10);
    });

    it('TC-UNIT-OrderService-003 — the reason is trimmed', async () => {
        await orderService.cancelOrder(900, '  Khách đổi ý  ', 10);

        expect(orderRepository.cancelOrder).toHaveBeenCalledWith(900, 'Khách đổi ý', 10);
    });

    it('TC-UNIT-OrderService-004 — returns null and sends no notification when the order cannot be cancelled', async () => {
        orderRepository.cancelOrder.mockResolvedValue(null);

        expect(await orderService.cancelOrder(900, 'x', 10)).toBeNull();
        expect(notificationGateway.broadcastToRole).not.toHaveBeenCalled();
        expect(notifyRolesSafe).not.toHaveBeenCalled();
    });

    it('TC-UNIT-OrderService-005 — an order with a prepayment asks accounting to issue the refund voucher', async () => {
        orderRepository.cancelOrder.mockResolvedValue({
            order: { ...DON },
            refund: { amount: 2_000_000, payee: 'Công ty ABC', voucherId: 70 },
        });

        const kq = await orderService.cancelOrder(900, 'Khách đổi ý', 10);

        expect(notifyRolesSafe).toHaveBeenCalledWith(['accountant'], expect.objectContaining({
            type: 'PREPAID_REFUND_REQUESTED',
            entityType: 'payment_vouchers',
            entityId: 70,
            message: expect.stringContaining('2.000.000đ'),
        }));
        expect(kq.refund).toEqual({ amount: 2_000_000, payee: 'Công ty ABC', voucherId: 70 });
    });

    it('TC-UNIT-OrderService-006 — an order without a prepayment does NOT ask accounting for a refund', async () => {
        await orderService.cancelOrder(900, 'Khách đổi ý', 10);

        // Huỷ đơn luôn có thông báo "đơn đã huỷ" chung; chỗ cần khoanh là thông báo
        // HOÀN TIỀN — bắn nhầm cái này là kế toán đi chi một khoản không tồn tại.
        const loaiDaBan = notifyRolesSafe.mock.calls.map((c) => c[1]?.type);
        expect(loaiDaBan).not.toContain('PREPAID_REFUND_REQUESTED');
    });

    it('TC-UNIT-OrderService-007 — the refund payee is named in the notification', async () => {
        orderRepository.cancelOrder.mockResolvedValue({
            order: { ...DON },
            refund: { amount: 500_000, payee: 'Nguyễn Văn B', voucherId: 71 },
        });

        await orderService.cancelOrder(900, 'x', 10);

        expect(notifyRolesSafe).toHaveBeenCalledWith(['accountant'],
            expect.objectContaining({ message: expect.stringContaining('Nguyễn Văn B') }));
    });
});

describe('orderService.confirmPrepaid', () => {
    it('TC-UNIT-OrderService-008 — confirming cash books it and notifies accounting and the coordinator', async () => {
        const kq = await orderService.confirmPrepaid(900, 10, { paymentMethod: 'cash', proofUrl: 'https://cdn/a.jpg' });

        expect(orderRepository.confirmPrepaid).toHaveBeenCalledWith(900, 10, {
            paymentMethod: 'cash', proofUrl: 'https://cdn/a.jpg',
        });
        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['accountant', 'coordinator'],
            expect.objectContaining({
                type: 'PREPAID_CONFIRMED',
                entityId: 900,
                message: '2.000.000đ (tiền mặt) đã ghi sổ.',
            }),
            { excludeUserId: 10 },
        );
        expect(kq).toMatchObject({ id: 900 });
    });

    it('TC-UNIT-OrderService-009 — the bank transfer method is labelled correctly in the notification', async () => {
        await orderService.confirmPrepaid(900, 10, { paymentMethod: 'bank_transfer' });

        expect(notifyRolesSafe).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ message: '2.000.000đ (chuyển khoản) đã ghi sổ.' }),
            expect.anything(),
        );
    });

    it('TC-UNIT-OrderService-010 — a missing prepaid amount shows 0d rather than NaN', async () => {
        orderRepository.confirmPrepaid.mockResolvedValue({ id: 900, prepaid_amount: null });

        await orderService.confirmPrepaid(900, 10, { paymentMethod: 'cash' });

        expect(notifyRolesSafe).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ message: expect.stringContaining('0đ') }),
            expect.anything(),
        );
    });

    it('TC-UNIT-OrderService-011 — returns null and sends no notification when the confirmation fails', async () => {
        orderRepository.confirmPrepaid.mockResolvedValue(null);

        expect(await orderService.confirmPrepaid(900, 10, { paymentMethod: 'cash' })).toBeNull();
        expect(notificationGateway.broadcastToRole).not.toHaveBeenCalled();
        expect(notifyRolesSafe).not.toHaveBeenCalled();
    });

    it('TC-UNIT-OrderService-012 — the actor receives no notification about their own action', async () => {
        await orderService.confirmPrepaid(900, 42, { paymentMethod: 'cash' });

        expect(notifyRolesSafe).toHaveBeenCalledWith(
            expect.anything(), expect.anything(), { excludeUserId: 42 },
        );
    });

    it('TC-UNIT-OrderService-013 — the call works without an options argument', async () => {
        await expect(orderService.confirmPrepaid(900, 10)).resolves.toMatchObject({ id: 900 });
    });
});

describe('orderService.rejectPrepaid', () => {
    it('TC-UNIT-OrderService-014 — a successful rejection pushes realtime to the coordinator', async () => {
        await orderService.rejectPrepaid(900, 10);

        expect(orderRepository.rejectPrepaid).toHaveBeenCalledWith(900);
        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('coordinator',
            expect.objectContaining({ action: 'updated', orderId: 900 }));
    });

    it('TC-UNIT-OrderService-015 — no realtime event is pushed when no order changed', async () => {
        orderRepository.rejectPrepaid.mockResolvedValue(null);

        expect(await orderService.rejectPrepaid(900, 10)).toBeNull();
        expect(notificationGateway.broadcastToRole).not.toHaveBeenCalled();
    });
});

describe('orderService — truy vấn uỷ quyền xuống repository', () => {
    it('TC-UNIT-OrderService-016 — the order list passes the filter straight down to the repository', async () => {
        orderRepository.listOrders.mockResolvedValue({ rows: [], total: 0 });

        await orderService.listOrders({ status: 'pending', page: 2 });

        expect(orderRepository.listOrders).toHaveBeenCalledWith({ status: 'pending', page: 2 });
    });

    it('TC-UNIT-OrderService-017 — calling with no argument applies an empty filter', async () => {
        orderRepository.listOrders.mockResolvedValue({ rows: [], total: 0 });

        await orderService.listOrders();

        expect(orderRepository.listOrders).toHaveBeenCalledWith({});
    });
});
