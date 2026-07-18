const { mock } = require('../helpers/nodeTestMock');
const assert = require('node:assert');
const payrollService = require('../../services/payrollService');
const payrollRepository = require('../../repositories/payrollRepository');

describe('Payroll Service Unit Tests (L1)', () => {
    beforeEach(() => {
        mock.restoreAll();
    });

    it('L1-PAY-01: getMyPayrolls - default params', async () => {
        mock.method(payrollRepository, 'getDriverPayrolls', async () => []);
        await payrollService.getMyPayrolls(1, {});
        const call = payrollRepository.getDriverPayrolls.mock.calls[0];
        assert.deepStrictEqual(call.arguments[1], { month: null, year: null });
    });

    it('L1-PAY-02: getMyPayrolls - should throw on invalid month', async () => {
        await assert.rejects(
            payrollService.getMyPayrolls(1, { month: 13 }),
            /Tháng không hợp lệ/
        );
    });

    it('L1-PAY-03: getMyPayrolls - should call repo', async () => {
        mock.method(payrollRepository, 'getDriverPayrolls', async () => []);
        const res = await payrollService.getMyPayrolls(1, { month: 5, year: 2025 });
        assert.deepStrictEqual(res, []);
    });

    it('L1-PAY-04: requestSalaryAdvance - should throw if amount <= 0', async () => {
        await assert.rejects(
            payrollService.requestSalaryAdvance(1, { amount: 0, requestMonth: 5, requestYear: 2025 }),
            /Số tiền phải lớn hơn 0/
        );
    });

    it('L1-PAY-05: requestSalaryAdvance - should throw if amount exceeds limit', async () => {
        await assert.rejects(
            payrollService.requestSalaryAdvance(1, { amount: 100000000, requestMonth: 5, requestYear: 2025 }),
            /Số tiền ứng lương tối đa/
        );
    });

    it('L1-PAY-06: requestSalaryAdvance - should throw if invalid month', async () => {
        await assert.rejects(
            payrollService.requestSalaryAdvance(1, { amount: 10000, requestMonth: 15, requestYear: 2025 }),
            /Tháng không hợp lệ/
        );
    });

    it('L1-PAY-07: requestSalaryAdvance - should throw if invalid year', async () => {
        await assert.rejects(
            payrollService.requestSalaryAdvance(1, { amount: 10000, requestMonth: 5, requestYear: 2019 }),
            /Năm không hợp lệ/
        );
    });

    it('L1-PAY-08: requestSalaryAdvance - should throw if not 25th', async () => {
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

    it('L1-PAY-09: requestSalaryAdvance - should call repo if valid', async () => {
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
            // Nhánh notify manager sau khi tạo yêu cầu — chặn truy vấn DB thật
            const profileRepository = require('../../repositories/profileRepository');
            const roleRepository = require('../../repositories/roleRepository');
            const notificationService = require('../../services/notificationService');
            mock.method(profileRepository, 'getProfileById', async () => ({ id: 1, full_name: 'Tai Xe Test' }));
            mock.method(roleRepository, 'getUserIdsByRole', async () => []);
            mock.method(notificationService, 'createForUsers', async () => []);
            const res = await payrollService.requestSalaryAdvance(1, { amount: 100000, requestMonth: 5, requestYear: 2025 });
            assert.strictEqual(res.id, 1);
        } finally {
            global.Date = RealDate;
        }
    });

    it('L1-PAY-10: getMyAdvances - should call repo', async () => {
        mock.method(payrollRepository, 'getDriverAdvances', async () => [{ id: 1 }]);
        const res = await payrollService.getMyAdvances(1, { status: 'pending' });
        assert.strictEqual(res.length, 1);
    });

    it('L1-PAY-11: getPayrollEstimate - should throw if invalid month', async () => {
        await assert.rejects(
            payrollService.getPayrollEstimate(1, { month: -1 }),
            /Tháng không hợp lệ/
        );
    });

    it('L1-PAY-12: getPayrollEstimate - default params', async () => {
        mock.method(payrollRepository, 'getPayrollEstimate', async () => ({ total: 100 }));
        await payrollService.getPayrollEstimate(1, {});
        const call = payrollRepository.getPayrollEstimate.mock.calls[0];
        assert.strictEqual(call.arguments[1].month, new Date().getMonth() + 1);
        assert.strictEqual(call.arguments[1].year, new Date().getFullYear());
    });

    it('L1-PAY-13: getPayrollEstimate - success', async () => {
        mock.method(payrollRepository, 'getPayrollEstimate', async () => ({ total: 100 }));
        const res = await payrollService.getPayrollEstimate(1, { month: 5, year: 2025 });
        assert.strictEqual(res.total, 100);
        const call = payrollRepository.getPayrollEstimate.mock.calls[0];
        assert.strictEqual(call.arguments[1].month, 5);
        assert.strictEqual(call.arguments[1].year, 2025);
    });
});
