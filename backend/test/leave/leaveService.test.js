const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const leaveService = require('../../services/leaveService');
const leaveRepository = require('../../repositories/leaveRepository');

describe('Leave Service Unit Tests (L1)', () => {
    beforeEach(() => {
        mock.restoreAll();
    });

    it('getMyLeaves - should call repository with parsed month/year', async () => {
        mock.method(leaveRepository, 'getDriverLeaves', async () => [{ id: 1 }]);
        const result = await leaveService.getMyLeaves(2, { month: '5', year: '2025' });
        assert.strictEqual(result.length, 1);
        const call = leaveRepository.getDriverLeaves.mock.calls[0];
        assert.strictEqual(call.arguments[0], 2);
        assert.deepStrictEqual(call.arguments[1], { month: 5, year: 2025 });
    });

    it('getSummary - should call repository with current month/year if not provided', async () => {
        mock.method(leaveRepository, 'getAttendanceSummary', async () => ({ working_days: 20 }));
        const result = await leaveService.getSummary(2, {});
        assert.strictEqual(result.working_days, 20);
        const call = leaveRepository.getAttendanceSummary.mock.calls[0];
        assert.strictEqual(call.arguments[1].month, new Date().getMonth() + 1);
        assert.strictEqual(call.arguments[1].year, new Date().getFullYear());
    });

    it('createLeave - should throw if missing date', async () => {
        await assert.rejects(
            leaveService.createLeave(2, { leaveType: 'paid' }),
            /Ngày nghỉ là bắt buộc/
        );
    });

    it('createLeave - should throw if invalid type', async () => {
        await assert.rejects(
            leaveService.createLeave(2, { leaveDate: '2025-10-10', leaveType: 'invalid' }),
            /Loại nghỉ không hợp lệ/
        );
    });

    it('createLeave - should call repo if valid', async () => {
        mock.method(leaveRepository, 'createLeave', async () => ({ id: 5 }));
        const result = await leaveService.createLeave(2, { leaveDate: '2025-10-10', leaveType: 'paid', reason: 'sick' });
        assert.strictEqual(result.id, 5);
    });

    it('deleteLeave - should call repo', async () => {
        mock.method(leaveRepository, 'deleteLeave', async () => ({ id: 1 }));
        const result = await leaveService.deleteLeave(2, 1);
        assert.strictEqual(result.id, 1);
    });
});
