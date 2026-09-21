/**
 * L1 Unit Test — paymentService
 *
 * Trọng tâm: BR-018 (bắt buộc ảnh biên lai), SEC-DRV-002 (chỉ thao tác trên chuyến
 * mình sở hữu), chặn thu tiền mặt với đơn khách chuyển khoản, và 2 nhánh ghi nhận
 * (xác nhận phiếu thu treo sẵn / tạo phiếu thu mới).
 */
jest.mock('../../repositories/paymentRepository');
jest.mock('../../repositories/tripRepository');

const paymentRepository = require('../../repositories/paymentRepository');
const tripRepository = require('../../repositories/tripRepository');
const paymentService = require('../../services/paymentService');

const CHUYEN_CUA_TAI_XE_5 = {
    id: 100, owner_driver_id: 5, status: 'arrived', order_id: 900,
};

beforeEach(() => {
    jest.clearAllMocks();
    tripRepository.getTripById.mockResolvedValue({ ...CHUYEN_CUA_TAI_XE_5 });
    paymentRepository.getShipmentFinancialSummary.mockResolvedValue({
        order_payment_type: 'cash', estimated_price: '2000000', total_collected: '0',
    });
    paymentRepository.getPendingReceiptShell.mockResolvedValue(null);
    paymentRepository.recordCashPayment.mockResolvedValue({ payment: { id: 55, amount: 2_000_000 } });
    paymentRepository.addPaymentReceipt.mockResolvedValue(undefined);
    paymentRepository.createDriverDebt.mockResolvedValue({ id: 12 });
});

describe('paymentService.recordDriverCashPayment', () => {
    it('TC-UNIT-PaymentService-001 — records the receipt, attaches the proof and opens the driver debt', async () => {
        const result = await paymentService.recordDriverCashPayment(
            5, 100, { amount: 2_000_000, notes: '  Khách trả đủ  ' }, 'https://cdn/bienlai.jpg',
        );

        expect(paymentRepository.recordCashPayment).toHaveBeenCalledWith({
            shipmentId: 100, amount: 2_000_000, collectedBy: 5, notes: 'Khách trả đủ',
        });
        expect(paymentRepository.addPaymentReceipt).toHaveBeenCalledWith(55, 'https://cdn/bienlai.jpg');
        expect(paymentRepository.createDriverDebt).toHaveBeenCalledWith({
            driverId: 5, shipmentId: 100, orderId: 900, amount: 2_000_000, notes: 'Khách trả đủ',
        });
        expect(result).toEqual({ payment: { id: 55, amount: 2_000_000 } });
    });

    it('TC-UNIT-PaymentService-002 — rejects a missing receipt photo (BR-018)', async () => {
        await expect(paymentService.recordDriverCashPayment(5, 100, { amount: 2_000_000 }, null))
            .rejects.toThrow('Ảnh biên lai thanh toán là bắt buộc (BR-018)');

        expect(tripRepository.getTripById).not.toHaveBeenCalled();
        expect(paymentRepository.recordCashPayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-003 — rejects a zero amount', async () => {
        await expect(paymentService.recordDriverCashPayment(5, 100, { amount: 0 }, 'https://cdn/a.jpg'))
            .rejects.toThrow('Số tiền phải lớn hơn 0');

        expect(paymentRepository.recordCashPayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-004 — rejects a negative amount', async () => {
        await expect(paymentService.recordDriverCashPayment(5, 100, { amount: -500 }, 'https://cdn/a.jpg'))
            .rejects.toThrow('Số tiền phải lớn hơn 0');

        expect(paymentRepository.recordCashPayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-005 — rejects a shipment that does not exist', async () => {
        tripRepository.getTripById.mockResolvedValue(null);

        await expect(paymentService.recordDriverCashPayment(5, 100, { amount: 100 }, 'https://cdn/a.jpg'))
            .rejects.toThrow('Chuyến không tồn tại');

        expect(paymentRepository.recordCashPayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-006 — blocks a driver who does not own the shipment (SEC-DRV-002)', async () => {
        tripRepository.getTripById.mockResolvedValue({ ...CHUYEN_CUA_TAI_XE_5, owner_driver_id: 9 });

        await expect(paymentService.recordDriverCashPayment(5, 100, { amount: 100 }, 'https://cdn/a.jpg'))
            .rejects.toThrow('Bạn không có quyền ghi nhận thanh toán cho chuyến này');

        expect(paymentRepository.recordCashPayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-007 — allows recording while the shipment is still in transit', async () => {
        tripRepository.getTripById.mockResolvedValue({ ...CHUYEN_CUA_TAI_XE_5, status: 'transit' });

        await paymentService.recordDriverCashPayment(5, 100, { amount: 100 }, 'https://cdn/a.jpg');

        expect(paymentRepository.recordCashPayment).toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-008 — refuses recording on a shipment that is only claimed', async () => {
        tripRepository.getTripById.mockResolvedValue({ ...CHUYEN_CUA_TAI_XE_5, status: 'claimed' });

        await expect(paymentService.recordDriverCashPayment(5, 100, { amount: 100 }, 'https://cdn/a.jpg'))
            .rejects.toThrow('Chỉ có thể ghi nhận thanh toán khi chuyến đang thực hiện hoặc đã giao');

        expect(paymentRepository.recordCashPayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-009 — stops when the financial summary cannot be read', async () => {
        paymentRepository.getShipmentFinancialSummary.mockResolvedValue(null);

        await expect(paymentService.recordDriverCashPayment(5, 100, { amount: 100 }, 'https://cdn/a.jpg'))
            .rejects.toThrow('Không thể lấy thông tin tài chính chuyến');

        expect(paymentRepository.recordCashPayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-010 — forbids cash collection on a bank-transfer order', async () => {
        paymentRepository.getShipmentFinancialSummary.mockResolvedValue({ order_payment_type: 'bank_transfer' });

        await expect(paymentService.recordDriverCashPayment(5, 100, { amount: 100 }, 'https://cdn/a.jpg'))
            .rejects.toThrow('khách thanh toán chuyển khoản trực tiếp cho công ty');

        expect(paymentRepository.recordCashPayment).not.toHaveBeenCalled();
        expect(paymentRepository.createDriverDebt).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-011 — confirms the pending receipt shell instead of creating a new one', async () => {
        paymentRepository.getPendingReceiptShell.mockResolvedValue({ id: 41 });
        paymentRepository.confirmReceiptShell.mockResolvedValue({ id: 41, amount: 2_000_000 });

        const result = await paymentService.recordDriverCashPayment(
            5, 100, { amount: 2_000_000, notes: null }, 'https://cdn/a.jpg',
        );

        expect(paymentRepository.confirmReceiptShell).toHaveBeenCalledWith({
            paymentId: 41, paymentType: 'cash_collected', amount: 2_000_000, collectedBy: 5, notes: null,
        });
        expect(paymentRepository.recordCashPayment).not.toHaveBeenCalled();
        expect(paymentRepository.addPaymentReceipt).toHaveBeenCalledWith(41, 'https://cdn/a.jpg');
        expect(result).toEqual({ payment: { id: 41, amount: 2_000_000 } });
    });

    it('TC-UNIT-PaymentService-012 — stops before opening the debt when no receipt could be created', async () => {
        paymentRepository.recordCashPayment.mockResolvedValue({ payment: null });

        await expect(paymentService.recordDriverCashPayment(5, 100, { amount: 100 }, 'https://cdn/a.jpg'))
            .rejects.toThrow('Không thể xác nhận phiếu thu cho chuyến này');

        expect(paymentRepository.addPaymentReceipt).not.toHaveBeenCalled();
        expect(paymentRepository.createDriverDebt).not.toHaveBeenCalled();
    });
});

describe('paymentService.getShipmentPayments', () => {
    it('TC-UNIT-PaymentService-013 — lets the owning driver read the payment list', async () => {
        paymentRepository.getShipmentPayments.mockResolvedValue([{ id: 55 }]);

        const result = await paymentService.getShipmentPayments(100, 5);

        expect(result).toEqual([{ id: 55 }]);
    });

    it('TC-UNIT-PaymentService-014 — hides the payment list from a driver who does not own the shipment', async () => {
        tripRepository.getTripById.mockResolvedValue({ ...CHUYEN_CUA_TAI_XE_5, owner_driver_id: 9 });

        await expect(paymentService.getShipmentPayments(100, 5))
            .rejects.toThrow('Bạn không có quyền xem thanh toán của chuyến này');

        expect(paymentRepository.getShipmentPayments).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-015 — raises an error when the shipment does not exist', async () => {
        tripRepository.getTripById.mockResolvedValue(null);

        await expect(paymentService.getShipmentPayments(100, 5)).rejects.toThrow('Chuyến không tồn tại');
    });
});

describe('paymentService.getShipmentPaymentSummary', () => {
    it('TC-UNIT-PaymentService-016 — hides the financial summary from a driver who does not own the shipment', async () => {
        tripRepository.getTripById.mockResolvedValue({ ...CHUYEN_CUA_TAI_XE_5, owner_driver_id: 9 });

        await expect(paymentService.getShipmentPaymentSummary(100, 5))
            .rejects.toThrow('Bạn không có quyền xem thông tin tài chính chuyến này');
    });
});

describe('paymentService.updateCashPayment', () => {
    beforeEach(() => {
        paymentRepository.getPaymentById.mockResolvedValue({ id: 55, shipment_id: 100, collected_by: 5 });
        paymentRepository.updateShipmentPayment.mockResolvedValue(undefined);
        paymentRepository.replacePaymentReceipts.mockResolvedValue(undefined);
    });

    it('TC-UNIT-PaymentService-017 — updates the amount on a receipt the driver recorded', async () => {
        await paymentService.updateCashPayment(5, 100, 55, { newAmount: 1_500_000 });

        expect(paymentRepository.updateShipmentPayment).toHaveBeenCalledWith(55, 1_500_000);
        expect(paymentRepository.replacePaymentReceipts).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-018 — replaces every old receipt image when a new photo is supplied', async () => {
        await paymentService.updateCashPayment(5, 100, 55, { newAmount: 1_500_000, newReceiptUrl: 'https://cdn/moi.jpg' });

        expect(paymentRepository.replacePaymentReceipts).toHaveBeenCalledWith(55, 'https://cdn/moi.jpg');
    });

    it('TC-UNIT-PaymentService-019 — rejects a payment record that does not exist', async () => {
        paymentRepository.getPaymentById.mockResolvedValue(null);

        await expect(paymentService.updateCashPayment(5, 100, 55, { newAmount: 100 }))
            .rejects.toThrow('Bản ghi thanh toán không tồn tại');

        expect(paymentRepository.updateShipmentPayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-020 — rejects a payment record belonging to another shipment', async () => {
        paymentRepository.getPaymentById.mockResolvedValue({ id: 55, shipment_id: 999, collected_by: 5 });

        await expect(paymentService.updateCashPayment(5, 100, 55, { newAmount: 100 }))
            .rejects.toThrow('Thanh toán không thuộc chuyến này');

        expect(paymentRepository.updateShipmentPayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-021 — forbids editing a payment recorded by someone else', async () => {
        paymentRepository.getPaymentById.mockResolvedValue({ id: 55, shipment_id: 100, collected_by: 9 });

        await expect(paymentService.updateCashPayment(5, 100, 55, { newAmount: 100 }))
            .rejects.toThrow('Bạn không có quyền sửa ghi nhận này');

        expect(paymentRepository.updateShipmentPayment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PaymentService-022 — rejects a new amount of zero', async () => {
        await expect(paymentService.updateCashPayment(5, 100, 55, { newAmount: 0 }))
            .rejects.toThrow('Số tiền phải lớn hơn 0');

        expect(paymentRepository.updateShipmentPayment).not.toHaveBeenCalled();
    });
});
