const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const pool = require('../config/database');
const bonusRepository = require('../repositories/bonusRepository');
const notificationService = require('../services/notificationService');
const bonusService = require('../services/bonusService');

describe('Bonus Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it('previewTet() rejects a year outside 2020-2100', async () => {
        await assert.rejects(
            () => bonusService.previewTet(2019),
            { message: 'Năm không hợp lệ (2020–2100)' },
        );
    });

    it('previewTet() delegates to the repository for a valid year', async () => {
        mock.method(bonusRepository, 'previewTetBonuses', async () => ([{ driver_id: 1 }]));

        const result = await bonusService.previewTet(2025);
        assert.deepStrictEqual(result, [{ driver_id: 1 }]);
    });

    it('generateTet() rejects an invalid year without calling the repository', async () => {
        mock.method(bonusRepository, 'generateTetBonuses', async () => { throw new Error('should not be called'); });

        await assert.rejects(() => bonusService.generateTet(1999, 1), { message: 'Năm không hợp lệ (2020–2100)' });
    });

    it('generateTet() notifies managers only when at least one bonus was inserted', async () => {
        mock.method(bonusRepository, 'generateTetBonuses', async () => ({ inserted: 3, skipped: 1 }));
        mock.method(pool, 'query', async () => ({ rows: [{ id: 10 }, { id: 11 }] }));
        mock.method(notificationService, 'createForUsers', async () => []);

        const result = await bonusService.generateTet(2025, 1);

        assert.deepStrictEqual(result, { inserted: 3, skipped: 1 });
        assert.strictEqual(notificationService.createForUsers.mock.calls.length, 1);
        assert.deepStrictEqual(notificationService.createForUsers.mock.calls[0].arguments[0], [10, 11]);
    });

    it('generateTet() skips notification when nothing was inserted', async () => {
        mock.method(bonusRepository, 'generateTetBonuses', async () => ({ inserted: 0, skipped: 5 }));
        mock.method(notificationService, 'createForUsers', async () => { throw new Error('should not be called'); });

        const result = await bonusService.generateTet(2025, 1);
        assert.strictEqual(result.inserted, 0);
    });

    it('getAll() passes filters through to the repository', async () => {
        mock.method(bonusRepository, 'getAll', async (filters) => filters);

        const result = await bonusService.getAll({ type: 'special', status: 'pending' });
        assert.deepStrictEqual(result, { type: 'special', status: 'pending' });
    });

    it('getStats() delegates to the repository for the given year', async () => {
        mock.method(bonusRepository, 'getStats', async (year) => ({ year, total_count: 5 }));

        const result = await bonusService.getStats(2025);
        assert.deepStrictEqual(result, { year: 2025, total_count: 5 });
    });

    it('getByDriver() delegates to the repository for the given driver', async () => {
        mock.method(bonusRepository, 'getByDriver', async (driverId) => ([{ id: 1, driver_id: driverId }]));

        const result = await bonusService.getByDriver(7);
        assert.deepStrictEqual(result, [{ id: 1, driver_id: 7 }]);
    });

    it('getById() rejects when the bonus does not exist', async () => {
        mock.method(bonusRepository, 'getById', async () => null);

        await assert.rejects(() => bonusService.getById(999), { message: 'Không tìm thấy khoản thưởng/phúc lợi' });
    });

    it('createWelfare() rejects tet_annual (must use the bulk generator)', async () => {
        await assert.rejects(
            () => bonusService.createWelfare({ driver_id: 1, type: 'tet_annual' }, 2),
            { message: 'Thưởng Tết phải dùng chức năng tạo hàng loạt' },
        );
    });

    it('createWelfare() rejects when the driver does not exist', async () => {
        mock.method(pool, 'query', async () => ({ rows: [] }));

        await assert.rejects(
            () => bonusService.createWelfare({ driver_id: 999, type: 'welfare_birthday' }, 2),
            { message: 'Tài xế #999 không tồn tại' },
        );
    });

    it('createWelfare() auto-computes the fixed amount for welfare_birthday', async () => {
        mock.method(pool, 'query', async () => ({ rows: [{ profile_id: 1 }] }));
        mock.method(bonusRepository, 'create', async (data) => ({ id: 1, driver_id: data.driver_id, type: data.type, amount: data.amount }));
        mock.method(notificationService, 'createForUsers', async () => []);

        const bonus = await bonusService.createWelfare({ driver_id: 1, type: 'welfare_birthday' }, 2);

        assert.strictEqual(Number(bonus.amount), 200_000);
        assert.strictEqual(bonusRepository.create.mock.calls[0].arguments[0].amount, 200_000);
    });

    it('createWelfare() auto-computes the fixed amount for welfare_wedding', async () => {
        mock.method(pool, 'query', async () => ({ rows: [{ profile_id: 1 }] }));
        mock.method(bonusRepository, 'create', async (data) => ({ id: 1, amount: data.amount }));
        mock.method(notificationService, 'createForUsers', async () => []);

        const bonus = await bonusService.createWelfare({ driver_id: 1, type: 'welfare_wedding' }, 2);
        assert.strictEqual(Number(bonus.amount), 1_000_000);
    });

    it('createWelfare() requires beneficiary_relation for welfare_funeral', async () => {
        mock.method(pool, 'query', async () => ({ rows: [{ profile_id: 1 }] }));

        await assert.rejects(
            () => bonusService.createWelfare({ driver_id: 1, type: 'welfare_funeral' }, 2),
            { message: 'Cần ghi rõ quan hệ người thân (beneficiary_relation)' },
        );
    });

    it('createWelfare() resolves welfare_funeral amount by beneficiary_relation', async () => {
        mock.method(pool, 'query', async () => ({ rows: [{ profile_id: 1 }] }));
        mock.method(bonusRepository, 'create', async (data) => ({ id: 1, amount: data.amount }));
        mock.method(notificationService, 'createForUsers', async () => []);

        const bonus = await bonusService.createWelfare({ driver_id: 1, type: 'welfare_funeral', beneficiary_relation: 'self' }, 2);
        assert.strictEqual(Number(bonus.amount), 1_000_000);
    });

    it('createWelfare() requires a positive amount for special/other bonus types', async () => {
        mock.method(pool, 'query', async () => ({ rows: [{ profile_id: 1 }] }));

        await assert.rejects(
            () => bonusService.createWelfare({ driver_id: 1, type: 'special', amount: 0 }, 2),
            { message: 'Số tiền phải lớn hơn 0' },
        );
    });

    it('createWelfare() excludes the creator from the manager notification list', async () => {
        mock.method(pool, 'query', async () => ({ rows: [{ profile_id: 1 }, { id: 2 }, { id: 3 }] }));
        mock.method(bonusRepository, 'create', async (data) => ({ id: 1, amount: data.amount }));
        mock.method(notificationService, 'createForUsers', async () => []);

        await bonusService.createWelfare({ driver_id: 1, type: 'special', amount: 500000 }, 2);

        const notifiedIds = notificationService.createForUsers.mock.calls[0].arguments[0];
        assert.ok(!notifiedIds.includes(2));
    });

    it('approve() rejects a non-positive adjusted amount', async () => {
        await assert.rejects(
            () => bonusService.approve(1, 5, 0),
            { message: 'Số tiền điều chỉnh phải lớn hơn 0' },
        );
    });

    it('approve() notifies accountants and the driver on success', async () => {
        mock.method(bonusRepository, 'approve', async () => ({ id: 1, driver_id: 7, type: 'special', amount: 500000 }));
        mock.method(pool, 'query', async () => ({ rows: [{ id: 9 }] }));
        mock.method(notificationService, 'createForUsers', async () => []);
        mock.method(notificationService, 'createForUser', async () => ({}));

        const bonus = await bonusService.approve(1, 5, null);

        assert.strictEqual(bonus.id, 1);
        assert.strictEqual(notificationService.createForUsers.mock.calls.length, 1);
        assert.strictEqual(notificationService.createForUser.mock.calls[0].arguments[0], 7);
    });

    it('reject() requires a non-empty reason', async () => {
        await assert.rejects(() => bonusService.reject(1, 5, '   '), { message: 'Cần ghi lý do từ chối' });
    });

    it('reject() notifies the driver with the trimmed reason', async () => {
        mock.method(bonusRepository, 'reject', async (id, rejectedBy, reason) => ({ id, driver_id: 7, type: 'special', reason }));
        mock.method(notificationService, 'createForUser', async () => ({}));

        await bonusService.reject(1, 5, '  invalid receipt  ');

        assert.strictEqual(bonusRepository.reject.mock.calls[0].arguments[2], 'invalid receipt');
    });

    it('pay() notifies the driver once payment is recorded', async () => {
        mock.method(bonusRepository, 'pay', async () => ({ id: 1, driver_id: 7, type: 'special', amount: 500000 }));
        mock.method(notificationService, 'createForUser', async () => ({}));

        const bonus = await bonusService.pay(1, 9);

        assert.strictEqual(bonus.id, 1);
        assert.strictEqual(notificationService.createForUser.mock.calls[0].arguments[0], 7);
    });
});
