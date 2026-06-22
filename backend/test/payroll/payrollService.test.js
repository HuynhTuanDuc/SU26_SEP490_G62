const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert');
const payrollService = require('../../services/payrollService');
const payrollRepository = require('../../repositories/payrollRepository');

describe('Payroll Service Unit Tests (L1)', () => {
    beforeEach(() => {
        mock.restoreAll();
    });

    it('getMyPayrolls - should throw on invalid month', async () => {
        await assert.rejects(
            payrollService.getMyPayrolls(1, { month: 13 }),
            /Tháng không hợp lệ/
        );
    });

    it('getMyPayrolls - should call repo', async () => {
        mock.method(payrollRepository, 'getDriverPayrolls', async () => []);
        const res = await payrollService.getMyPayrolls(1, { month: 5, year: 2025 });
        assert.deepStrictEqual(res, []);
    });

    it('requestSalaryAdvance - should throw if amount <= 0', async () => {
        await assert.rejects(
            payrollService.requestSalaryAdvance(1, { amount: 0, requestMonth: 5, requestYear: 2025 }),
            /Số tiền phải lớn hơn 0/
        );
    });

    it('requestSalaryAdvance - should throw if amount exceeds limit', async () => {
        await assert.rejects(
            payrollService.requestSalaryAdvance(1, { amount: 100000000, requestMonth: 5, requestYear: 2025 }),
            /Số tiền ứng lương tối đa/
        );
    });

    it('requestSalaryAdvance - should throw if not 25th', async () => {
        const RealDate = Date;
        global.Date = class extends RealDate {
            constructor() {
                super();
                return new RealDate('2025-05-10T00:00:00Z'); // Not the 25th
            }
            getDate() { return 10; }
        };

        try {
            await assert.rejects(
                payrollService.requestSalaryAdvance(1, { amount: 100000, requestMonth: 5, requestYear: 2025 }),
                /Ứng lương chỉ được thực hiện vào ngày 25 hàng tháng/
            );
        } finally {
            global.Date = RealDate;
        }
    });

    it('requestSalaryAdvance - should call repo if valid', async () => {
        const RealDate = Date;
        global.Date = class extends RealDate {
            constructor() {
                super();
                return new RealDate('2025-05-25T00:00:00Z'); // 25th
            }
            getDate() { return 25; }
        };

        try {
            mock.method(payrollRepository, 'createSalaryAdvance', async () => ({ id: 1 }));
            const res = await payrollService.requestSalaryAdvance(1, { amount: 100000, requestMonth: 5, requestYear: 2025 });
            assert.strictEqual(res.id, 1);
        } finally {
            global.Date = RealDate;
        }
    });
});
