const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const expenseService = require('../../services/expenseService');
const expenseRepository = require('../../repositories/expenseRepository');
const tripRepository = require('../../repositories/tripRepository');

describe('Expense Service Unit Tests (L1)', () => {
    beforeEach(() => {
        mock.restoreAll();
    });

    it('createExpense - should throw if no receipt', async () => {
        await assert.rejects(
            expenseService.createExpense(1, { expenseType: 'fuel', amount: 100 }),
            /Ảnh bằng chứng là bắt buộc/
        );
    });

    it('createExpense - should throw if invalid type', async () => {
        await assert.rejects(
            expenseService.createExpense(1, { expenseType: 'invalid', amount: 100, receiptUrl: 'url' }),
            /Loại chi phí không hợp lệ/
        );
    });

    it('createExpense - should throw if shipment not found', async () => {
        mock.method(tripRepository, 'getTripById', async () => null);
        await assert.rejects(
            expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 100, receiptUrl: 'url' }),
            /Chuyến không tồn tại/
        );
    });

    it('createExpense - should throw if wrong driver', async () => {
        mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 2 }));
        await assert.rejects(
            expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 100, receiptUrl: 'url' }),
            /Bạn không có quyền/
        );
    });

    it('createExpense - should throw if shipment ended', async () => {
        mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'completed' }));
        await assert.rejects(
            expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 100, receiptUrl: 'url' }),
            /Không thể thêm chi phí khi chuyến đã kết thúc/
        );
    });

    it('createExpense - should call repositories on success', async () => {
        mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'transit' }));
        mock.method(tripRepository, 'getDriverVehicleId', async () => 99);
        mock.method(expenseRepository, 'createExpense', async () => ({ id: 5 }));
        mock.method(expenseRepository, 'addExpenseAttachment', async () => {});
        mock.method(expenseRepository, 'getShipmentExpenses', async () => [{ id: 5 }]);

        const res = await expenseService.createExpense(1, { shipmentId: 1, expenseType: 'fuel', amount: 100, receiptUrl: 'url' });
        assert.strictEqual(res.length, 1);
        assert.strictEqual(expenseRepository.addExpenseAttachment.mock.calls[0].arguments[0], 5);
    });
});
