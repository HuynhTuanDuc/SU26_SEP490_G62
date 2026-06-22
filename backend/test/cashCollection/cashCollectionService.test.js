const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const cashCollectionService = require('../../services/cashCollectionService');
const repo = require('../../repositories/cashCollectionRepository');

describe('Cash Collection Service Unit Tests (L1)', () => {
    beforeEach(() => {
        mock.restoreAll();
    });

    it('getMyCollections - should call repo', async () => {
        mock.method(repo, 'getDriverCollections', async () => []);
        const res = await cashCollectionService.getMyCollections(1, { status: 'pending' });
        assert.deepStrictEqual(res, []);
        assert.strictEqual(repo.getDriverCollections.mock.calls[0].arguments[0], 1);
    });

    it('getMyCollection - should throw if not found', async () => {
        mock.method(repo, 'getCollectionById', async () => null);
        await assert.rejects(
            cashCollectionService.getMyCollection(1, 99),
            /Không tìm thấy bản ghi thu hộ/
        );
    });

    it('getMyCollection - should return collection if found', async () => {
        mock.method(repo, 'getCollectionById', async () => ({ id: 99 }));
        const res = await cashCollectionService.getMyCollection(1, 99);
        assert.strictEqual(res.id, 99);
    });

    it('createCollection - should throw if amount <= 0', async () => {
        await assert.rejects(
            cashCollectionService.createCollection(1, { amount: 0 }),
            /Số tiền phải lớn hơn 0/
        );
    });

    it('createCollection - should throw if invalid payment method', async () => {
        await assert.rejects(
            cashCollectionService.createCollection(1, { amount: 100, paymentMethod: 'bitcoin' }),
            /Hình thức thanh toán không hợp lệ/
        );
    });

    it('createCollection - should call repo on success', async () => {
        mock.method(repo, 'createCollection', async () => ({ id: 1 }));
        const res = await cashCollectionService.createCollection(1, { amount: 100, paymentMethod: 'cash' });
        assert.strictEqual(res.id, 1);
    });

    it('getSummary - should call repo', async () => {
        mock.method(repo, 'getCollectionSummary', async () => ({ total: 100 }));
        const res = await cashCollectionService.getSummary(1);
        assert.strictEqual(res.total, 100);
    });
});
