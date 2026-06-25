const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const cashCollectionService = require('../../services/cashCollectionService');
const repo = require('../../repositories/cashCollectionRepository');

describe('Cash Collection Service Unit Tests (L1)', () => {
    beforeEach(() => {
        mock.restoreAll();
    });

    it('L1-CASH-01: getMyCollections - should call repo', async () => {
        mock.method(repo, 'getDriverCollections', async () => []);
        const res = await cashCollectionService.getMyCollections(1, { status: 'pending' });
        assert.deepStrictEqual(res, []);
        assert.strictEqual(repo.getDriverCollections.mock.calls[0].arguments[0], 1);
    });

    it('L1-CASH-02: getMyCollection - should throw if not found', async () => {
        mock.method(repo, 'getCollectionById', async () => null);
        await assert.rejects(
            cashCollectionService.getMyCollection(1, 99),
            /Không tìm thấy bản ghi thu hộ/
        );
    });

    it('L1-CASH-03: getMyCollection - should return collection if found', async () => {
        mock.method(repo, 'getCollectionById', async () => ({ id: 99 }));
        const res = await cashCollectionService.getMyCollection(1, 99);
        assert.strictEqual(res.id, 99);
    });

    it('L1-CASH-04: createCollection - should throw if amount is zero', async () => {
        await assert.rejects(
            cashCollectionService.createCollection(1, { amount: 0 }),
            /Số tiền phải lớn hơn 0/
        );
    });

    it('L1-CASH-05: createCollection - should throw if amount is negative', async () => {
        await assert.rejects(
            cashCollectionService.createCollection(1, { amount: -500 }),
            /Số tiền phải lớn hơn 0/
        );
    });

    it('L1-CASH-06: createCollection - should throw if invalid payment method', async () => {
        await assert.rejects(
            cashCollectionService.createCollection(1, { amount: 100, paymentMethod: 'bitcoin' }),
            /Hình thức thanh toán không hợp lệ/
        );
    });

    it('L1-CASH-07: createCollection - should call repo on success with shipmentId', async () => {
        mock.method(repo, 'createCollection', async () => ({ id: 1 }));
        const res = await cashCollectionService.createCollection(1, { shipmentId: "12", amount: 100, paymentMethod: 'cash' });
        assert.strictEqual(res.id, 1);
        const payload = repo.createCollection.mock.calls[0].arguments[1];
        assert.strictEqual(payload.shipmentId, 12);
    });

    it('L1-CASH-08: createCollection - should call repo on success without shipmentId', async () => {
        mock.method(repo, 'createCollection', async () => ({ id: 2 }));
        const res = await cashCollectionService.createCollection(1, { amount: 100, paymentMethod: 'bank_transfer' });
        assert.strictEqual(res.id, 2);
        const payload = repo.createCollection.mock.calls[0].arguments[1];
        assert.strictEqual(payload.shipmentId, null);
    });

    it('L1-CASH-09: getSummary - should call repo', async () => {
        mock.method(repo, 'getCollectionSummary', async () => ({ total: 100 }));
        const res = await cashCollectionService.getSummary(1);
        assert.strictEqual(res.total, 100);
    });
});
