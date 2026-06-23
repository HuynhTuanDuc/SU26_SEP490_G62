const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const expenseService = require('../../services/expenseService');
const expenseRepository = require('../../repositories/expenseRepository');
const tripRepository = require('../../repositories/tripRepository');

describe('Expense Service Unit Tests (L1)', () => {
    beforeEach(() => {
        mock.restoreAll();
    });

    it('L1-EXP-01: createExpense - should throw if no receipt', async () => {
        await assert.rejects(
            expenseService.createExpense(1, { expenseType: 'fuel', amount: 100 }),
            /Ảnh bằng chứng là bắt buộc/
        );
    });

    it('L1-EXP-02: createExpense - should throw if missing type', async () => {
        await assert.rejects(
            expenseService.createExpense(1, { receiptUrl: 'url', amount: 100 }),
            /Loại chi phí không hợp lệ/
        );
    });

    it('L1-EXP-03: createExpense - should throw if invalid type', async () => {
        await assert.rejects(
            expenseService.createExpense(1, { expenseType: 'food', amount: 100, receiptUrl: 'url' }),
            /Loại chi phí không hợp lệ/
        );
    });

    it('L1-EXP-04: createExpense - should throw if zero amount', async () => {
        await assert.rejects(
            expenseService.createExpense(1, { expenseType: 'fuel', amount: 0, receiptUrl: 'url' }),
            /Số tiền phải lớn hơn 0/
        );
    });

    it('L1-EXP-05: createExpense - should throw if shipment not found', async () => {
        mock.method(tripRepository, 'getTripById', async () => null);
        await assert.rejects(
            expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 100, receiptUrl: 'url' }),
            /Chuyến không tồn tại/
        );
    });

    it('L1-EXP-06: createExpense - should throw if wrong driver', async () => {
        mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 2 }));
        await assert.rejects(
            expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 100, receiptUrl: 'url' }),
            /Bạn không có quyền thêm chi phí cho chuyến này/
        );
    });

    it('L1-EXP-07: createExpense - should throw if shipment ended', async () => {
        mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'completed' }));
        await assert.rejects(
            expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 100, receiptUrl: 'url' }),
            /Không thể thêm chi phí khi chuyến đã kết thúc/
        );
    });

    it('L1-EXP-08: createExpense - should call repositories on success', async () => {
        mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'transit' }));
        mock.method(tripRepository, 'getDriverVehicleId', async () => 99);
        mock.method(expenseRepository, 'createExpense', async () => ({ id: 5 }));
        mock.method(expenseRepository, 'addExpenseAttachment', async () => {});
        mock.method(expenseRepository, 'getShipmentExpenses', async () => [{ id: 5 }]);

        const res = await expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 100, receiptUrl: 'url' });
        assert.strictEqual(res.length, 1);
        assert.strictEqual(expenseRepository.addExpenseAttachment.mock.calls[0].arguments[0], 5);
    });

    it('L1-EXP-09: getShipmentExpenses - should throw if 404 trip', async () => {
        mock.method(tripRepository, 'getTripById', async () => null);
        await assert.rejects(
            expenseService.getShipmentExpenses(1, 1),
            /Chuyến không tồn tại/
        );
    });

    it('L1-EXP-10: getShipmentExpenses - should throw if wrong driver', async () => {
        mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 2 }));
        await assert.rejects(
            expenseService.getShipmentExpenses(1, 1),
            /Bạn không có quyền xem chi phí này/
        );
    });

    it('L1-EXP-11: getShipmentExpenses - should succeed', async () => {
        mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1 }));
        mock.method(expenseRepository, 'getShipmentExpenses', async () => [{ id: 1 }]);
        const res = await expenseService.getShipmentExpenses(1, 1);
        assert.strictEqual(res.length, 1);
    });
});
