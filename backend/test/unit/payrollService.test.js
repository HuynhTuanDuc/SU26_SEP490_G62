/**
 * L1 Unit Test — payrollService
 *
 * Mock toàn bộ dependency. notificationService phải mock bằng factory (không dùng
 * automock) vì service gọi `createForUsers(...).catch(...)` — automock trả undefined
 * sẽ ném TypeError chứ không phản ánh hành vi thật.
 *
 * Quy tắc ngày 25 (BR-DRV-030) phụ thuộc đồng hồ hệ thống → dùng fake timer.
 */
jest.mock('../../repositories/payrollRepository');
jest.mock('../../repositories/profileRepository');
jest.mock('../../repositories/roleRepository');
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
}));

const payrollRepository = require('../../repositories/payrollRepository');
const profileRepository = require('../../repositories/profileRepository');
const roleRepository = require('../../repositories/roleRepository');
const notificationService = require('../../services/notificationService');
const payrollService = require('../../services/payrollService');

/** Ngày 25/08/2026 theo giờ máy chạy test — thoả BR-DRV-030 */
const NGAY_25 = new Date(2026, 7, 25, 9, 0, 0);
/** Ngày 24/08/2026 — vi phạm BR-DRV-030 */
const NGAY_24 = new Date(2026, 7, 24, 9, 0, 0);

const donUngHopLe = { amount: 1_000_000, reason: '  Con nhập học  ', requestMonth: 8, requestYear: 2026 };

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NGAY_25);
    payrollRepository.createSalaryAdvance.mockResolvedValue({ id: 77, amount: 1_000_000, status: 'pending' });
    profileRepository.getProfileById.mockResolvedValue({ full_name: 'Nguyễn Văn Tài' });
    roleRepository.getUserIdsByRole.mockResolvedValue([10, 11]);
    notificationService.createForUsers.mockResolvedValue([]);
});

afterEach(() => jest.useRealTimers());

describe('payrollService.requestSalaryAdvance', () => {
    it('TC-UNIT-PayrollService-001 — creates the salary advance request when the form is valid and today is the 25th', async () => {
        const result = await payrollService.requestSalaryAdvance(5, donUngHopLe);

        expect(payrollRepository.createSalaryAdvance).toHaveBeenCalledWith({
            driverId: 5,
            amount: 1_000_000,
            reason: 'Con nhập học',
            requestMonth: 8,
            requestYear: 2026,
        });
        expect(result).toEqual({ id: 77, amount: 1_000_000, status: 'pending' });
    });

    it('TC-UNIT-PayrollService-002 — notifies every manager once the request is created', async () => {
        await payrollService.requestSalaryAdvance(5, donUngHopLe);

        expect(roleRepository.getUserIdsByRole).toHaveBeenCalledWith('manager');
        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [10, 11],
            expect.objectContaining({
                type: 'SALARY_ADVANCE_REQUESTED',
                entityType: 'salary_advances',
                entityId: 77,
            }),
            { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-PayrollService-003 — rejects a zero amount and creates no request', async () => {
        await expect(payrollService.requestSalaryAdvance(5, { ...donUngHopLe, amount: 0 }))
            .rejects.toThrow('Số tiền phải lớn hơn 0');

        expect(payrollRepository.createSalaryAdvance).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PayrollService-004 — rejects a negative amount and creates no request', async () => {
        await expect(payrollService.requestSalaryAdvance(5, { ...donUngHopLe, amount: -1 }))
            .rejects.toThrow('Số tiền phải lớn hơn 0');

        expect(payrollRepository.createSalaryAdvance).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PayrollService-005 — accepts an advance of exactly 5.000.000đ, the cap (upper boundary)', async () => {
        await payrollService.requestSalaryAdvance(5, { ...donUngHopLe, amount: 5_000_000 });

        expect(payrollRepository.createSalaryAdvance).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 5_000_000 }),
        );
    });

    it('TC-UNIT-PayrollService-006 — rejects an advance 1đ over the cap, 5.000.001đ (BR-DRV-029)', async () => {
        await expect(payrollService.requestSalaryAdvance(5, { ...donUngHopLe, amount: 5_000_001 }))
            .rejects.toThrow('Số tiền ứng lương tối đa là 5.000.000₫');

        expect(payrollRepository.createSalaryAdvance).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PayrollService-007 — rejects month 13', async () => {
        await expect(payrollService.requestSalaryAdvance(5, { ...donUngHopLe, requestMonth: 13 }))
            .rejects.toThrow('Tháng không hợp lệ (1-12)');

        expect(payrollRepository.createSalaryAdvance).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PayrollService-008 — rejects year 2019, below the 2020 floor', async () => {
        await expect(payrollService.requestSalaryAdvance(5, { ...donUngHopLe, requestYear: 2019 }))
            .rejects.toThrow('Năm không hợp lệ');

        expect(payrollRepository.createSalaryAdvance).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PayrollService-009 — rejects any day other than the 25th of the month (BR-DRV-030)', async () => {
        jest.setSystemTime(NGAY_24);

        await expect(payrollService.requestSalaryAdvance(5, donUngHopLe))
            .rejects.toThrow('Ứng lương chỉ được thực hiện vào ngày 25 hàng tháng');

        expect(payrollRepository.createSalaryAdvance).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PayrollService-010 — rejects an advance requested for a month other than the current one', async () => {
        await expect(payrollService.requestSalaryAdvance(5, { ...donUngHopLe, requestMonth: 7 }))
            .rejects.toThrow('Chi duoc ung luong cho thang hien tai');

        expect(payrollRepository.createSalaryAdvance).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PayrollService-011 — stores null when no reason is given', async () => {
        await payrollService.requestSalaryAdvance(5, { ...donUngHopLe, reason: undefined });

        expect(payrollRepository.createSalaryAdvance).toHaveBeenCalledWith(
            expect.objectContaining({ reason: null }),
        );
    });

    it('TC-UNIT-PayrollService-012 — a notification failure does not invalidate the request already created', async () => {
        notificationService.createForUsers.mockRejectedValue(new Error('WS sập'));

        const result = await payrollService.requestSalaryAdvance(5, donUngHopLe);

        expect(result).toEqual({ id: 77, amount: 1_000_000, status: 'pending' });
    });
});

describe('payrollService.getMyPayrolls', () => {
    it('TC-UNIT-PayrollService-013 — accepts month 12 (upper boundary)', async () => {
        payrollRepository.getDriverPayrolls.mockResolvedValue([]);

        await payrollService.getMyPayrolls(5, { month: 12, year: 2026 });

        expect(payrollRepository.getDriverPayrolls).toHaveBeenCalledWith(5, { month: 12, year: 2026 });
    });

    it('TC-UNIT-PayrollService-014 — rejects month 13 without querying the repository', async () => {
        await expect(payrollService.getMyPayrolls(5, { month: 13 }))
            .rejects.toThrow('Tháng không hợp lệ (1-12)');

        expect(payrollRepository.getDriverPayrolls).not.toHaveBeenCalled();
    });

    it('TC-UNIT-PayrollService-015 — queries every payroll period when no filter is supplied', async () => {
        payrollRepository.getDriverPayrolls.mockResolvedValue([]);

        await payrollService.getMyPayrolls(5);

        expect(payrollRepository.getDriverPayrolls).toHaveBeenCalledWith(5, { month: null, year: null });
    });
});

describe('payrollService.getPayrollEstimate', () => {
    it('TC-UNIT-PayrollService-016 — falls back to the current period when month and year are missing', async () => {
        payrollRepository.getPayrollEstimate.mockResolvedValue({});

        await payrollService.getPayrollEstimate(5, {});

        expect(payrollRepository.getPayrollEstimate).toHaveBeenCalledWith(5, { month: 8, year: 2026 });
    });

    it('TC-UNIT-PayrollService-017 — rejects month 13 for the payroll estimate', async () => {
        await expect(payrollService.getPayrollEstimate(5, { month: 13, year: 2026 }))
            .rejects.toThrow('Tháng không hợp lệ');

        expect(payrollRepository.getPayrollEstimate).not.toHaveBeenCalled();
    });
});
