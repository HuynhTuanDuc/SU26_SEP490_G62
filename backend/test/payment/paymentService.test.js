const { mock } = require('../helpers/nodeTestMock');
const assert = require('node:assert');

const paymentRepository = require('../../repositories/paymentRepository');
const tripRepository = require('../../repositories/tripRepository');

const paymentService = require('../../services/paymentService');

describe('Payment Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    describe('recordDriverCashPayment() — BR-018', () => {
        it('requires a receipt photo', async () => {
            await assert.rejects(
                () => paymentService.recordDriverCashPayment(1, 10, { amount: 100000 }, null),
                { message: 'Ảnh biên lai thanh toán là bắt buộc (BR-018)' },
            );
        });

        it('requires a positive amount', async () => {
            await assert.rejects(
                () => paymentService.recordDriverCashPayment(1, 10, { amount: -500 }, 'url'),
                { message: 'Số tiền phải lớn hơn 0' },
            );
        });

        it('throws if the shipment does not exist', async () => {
            mock.method(tripRepository, 'getTripById', async () => null);

            await assert.rejects(
                () => paymentService.recordDriverCashPayment(1, 10, { amount: 100000 }, 'url'),
                { message: 'Chuyến không tồn tại' },
            );
        });

        it('throws if the driver is not the owner of the shipment', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 2, status: 'arrived' }));

            await assert.rejects(
                () => paymentService.recordDriverCashPayment(1, 10, { amount: 100000 }, 'url'),
                { message: 'Bạn không có quyền ghi nhận thanh toán cho chuyến này' },
            );
        });

        it('throws if the shipment is not in an allowed status', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'available' }));

            await assert.rejects(
                () => paymentService.recordDriverCashPayment(1, 10, { amount: 100000 }, 'url'),
                { message: 'Chỉ có thể ghi nhận thanh toán khi chuyến đang thực hiện hoặc đã giao' },
            );
        });

        it('throws if the order is paid by bank_transfer (driver should not collect cash)', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'arrived', order_id: 501 }));
            mock.method(paymentRepository, 'getShipmentFinancialSummary', async () => ({ order_payment_type: 'bank_transfer' }));

            await assert.rejects(
                () => paymentService.recordDriverCashPayment(1, 10, { amount: 100000 }, 'url'),
                (err) => err.message.includes('khách thanh toán chuyển khoản trực tiếp'),
            );
        });

        it('records the payment and creates a driver debt for a cash order', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'arrived', order_id: 501 }));
            mock.method(paymentRepository, 'getShipmentFinancialSummary', async () => ({ order_payment_type: 'cash' }));
            mock.method(paymentRepository, 'getPendingReceiptShell', async () => null);
            mock.method(paymentRepository, 'recordCashPayment', async () => ({ payment: { id: 1 } }));
            mock.method(paymentRepository, 'addPaymentReceipt', async () => {});
            mock.method(paymentRepository, 'createDriverDebt', async () => {});

            const { payment } = await paymentService.recordDriverCashPayment(1, 10, { amount: 300000 }, 'url');

            assert.strictEqual(payment.id, 1);
            assert.strictEqual(paymentRepository.createDriverDebt.mock.calls.length, 1);
            assert.strictEqual(paymentRepository.createDriverDebt.mock.calls[0].arguments[0].amount, 300000);
        });

        it('confirms a pending receipt shell instead of creating a new one, when one already exists', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'arrived', order_id: 501 }));
            mock.method(paymentRepository, 'getShipmentFinancialSummary', async () => ({ order_payment_type: 'cash' }));
            mock.method(paymentRepository, 'getPendingReceiptShell', async () => ({ id: 5 }));
            mock.method(paymentRepository, 'confirmReceiptShell', async (opts) => {
                assert.strictEqual(opts.paymentId, 5);
                return { id: 5, status: 'confirmed' };
            });
            mock.method(paymentRepository, 'addPaymentReceipt', async () => {});
            mock.method(paymentRepository, 'createDriverDebt', async () => {});

            const { payment } = await paymentService.recordDriverCashPayment(1, 10, { amount: 300000 }, 'url');

            assert.strictEqual(payment.id, 5);
            assert.strictEqual(paymentRepository.recordCashPayment.mock?.calls?.length ?? 0, 0);
        });
    });

    describe('getShipmentPayments() / getShipmentPaymentSummary()', () => {
        it('throws if not the owner', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 2 }));

            await assert.rejects(
                () => paymentService.getShipmentPayments(10, 1),
                { message: 'Bạn không có quyền xem thanh toán của chuyến này' },
            );
        });

        it('returns the payments list for the owner', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1 }));
            mock.method(paymentRepository, 'getShipmentPayments', async () => [{ id: 1 }]);

            const result = await paymentService.getShipmentPayments(10, 1);

            assert.strictEqual(result.length, 1);
        });

        it('throws on summary if not the owner', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 2 }));

            await assert.rejects(
                () => paymentService.getShipmentPaymentSummary(10, 1),
                { message: 'Bạn không có quyền xem thông tin tài chính chuyến này' },
            );
        });
    });

    describe('updateCashPayment()', () => {
        it('throws if the payment does not exist', async () => {
            mock.method(paymentRepository, 'getPaymentById', async () => null);

            await assert.rejects(
                () => paymentService.updateCashPayment(1, 10, 5, { newAmount: 200000 }),
                { message: 'Bản ghi thanh toán không tồn tại' },
            );
        });

        it('throws if payment does not belong to the given shipment', async () => {
            mock.method(paymentRepository, 'getPaymentById', async () => ({ id: 5, shipment_id: 99, collected_by: 1 }));

            await assert.rejects(
                () => paymentService.updateCashPayment(1, 10, 5, { newAmount: 200000 }),
                { message: 'Thanh toán không thuộc chuyến này' },
            );
        });

        it('throws if the driver did not collect this payment', async () => {
            mock.method(paymentRepository, 'getPaymentById', async () => ({ id: 5, shipment_id: 10, collected_by: 2 }));

            await assert.rejects(
                () => paymentService.updateCashPayment(1, 10, 5, { newAmount: 200000 }),
                { message: 'Bạn không có quyền sửa ghi nhận này' },
            );
        });

        it('rejects a non-positive new amount', async () => {
            mock.method(paymentRepository, 'getPaymentById', async () => ({ id: 5, shipment_id: 10, collected_by: 1 }));

            await assert.rejects(
                () => paymentService.updateCashPayment(1, 10, 5, { newAmount: 0 }),
                { message: 'Số tiền phải lớn hơn 0' },
            );
        });

        it('updates amount and replaces the receipt when a new one is provided', async () => {
            let callCount = 0;
            mock.method(paymentRepository, 'getPaymentById', async () => {
                callCount += 1;
                return callCount === 1
                    ? { id: 5, shipment_id: 10, collected_by: 1 }
                    : { id: 5, shipment_id: 10, collected_by: 1, amount: 350000 };
            });
            mock.method(paymentRepository, 'updateShipmentPayment', async () => {});
            mock.method(paymentRepository, 'replacePaymentReceipts', async () => {});

            const { payment } = await paymentService.updateCashPayment(1, 10, 5, { newAmount: 350000, newReceiptUrl: 'new-url' });

            assert.strictEqual(payment.amount, 350000);
            assert.strictEqual(paymentRepository.replacePaymentReceipts.mock.calls.length, 1);
        });
    });
});
