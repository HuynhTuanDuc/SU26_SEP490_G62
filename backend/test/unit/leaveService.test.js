/**
 * L1 Unit Test — leaveService
 *
 * createLeave chốt chặn theo "hôm nay" giờ Việt Nam → fake timer.
 * Mốc test: 18/08/2026 (ICT) ⇒ cửa sổ hợp lệ = [18/05/2026 .. 18/11/2026].
 */
jest.mock('../../repositories/leaveRepository');

const leaveRepository = require('../../repositories/leaveRepository');
const leaveService = require('../../services/leaveService');

const HOM_NAY_ICT = new Date('2026-08-18T03:00:00Z'); // 10:00 ngày 18/08/2026 giờ VN

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(HOM_NAY_ICT);
    leaveRepository.getPayrollStatus.mockResolvedValue('pending');
    leaveRepository.findBlockingAttendance.mockResolvedValue(null);
    leaveRepository.createLeave.mockResolvedValue({ id: 1, leave_date: '2026-08-20' });
});

afterEach(() => jest.useRealTimers());

describe('leaveService.createLeave', () => {
    it('TC-UNIT-LeaveService-001 — records a valid leave request', async () => {
        const result = await leaveService.createLeave(7, {
            leaveDate: '2026-08-20', leaveType: 'paid', reason: 'Việc gia đình',
        });

        expect(leaveRepository.createLeave).toHaveBeenCalledWith(7, {
            leaveDate: '2026-08-20', leaveType: 'paid', reason: 'Việc gia đình',
        });
        expect(result).toEqual({ id: 1, leave_date: '2026-08-20' });
    });

    it('TC-UNIT-LeaveService-002 — truncates a full ISO timestamp down to the date part', async () => {
        await leaveService.createLeave(7, {
            leaveDate: '2026-08-20T15:30:00.000Z', leaveType: 'unpaid', reason: null,
        });

        expect(leaveRepository.createLeave).toHaveBeenCalledWith(7, {
            leaveDate: '2026-08-20', leaveType: 'unpaid', reason: null,
        });
    });

    it('TC-UNIT-LeaveService-003 — rejects a missing leave date', async () => {
        await expect(leaveService.createLeave(7, { leaveType: 'paid' }))
            .rejects.toThrow('Ngày nghỉ là bắt buộc');

        expect(leaveRepository.createLeave).not.toHaveBeenCalled();
    });

    it('TC-UNIT-LeaveService-004 — rejects a leave type outside {paid, unpaid}', async () => {
        await expect(leaveService.createLeave(7, { leaveDate: '2026-08-20', leaveType: 'sick' }))
            .rejects.toThrow('Loại nghỉ không hợp lệ (paid / unpaid)');

        expect(leaveRepository.createLeave).not.toHaveBeenCalled();
    });

    it('TC-UNIT-LeaveService-005 — rejects a wrongly formatted date (DD-MM-YYYY)', async () => {
        await expect(leaveService.createLeave(7, { leaveDate: '20-08-2026', leaveType: 'paid' }))
            .rejects.toThrow('Ngày nghỉ không hợp lệ (định dạng YYYY-MM-DD)');

        expect(leaveRepository.createLeave).not.toHaveBeenCalled();
    });

    it('TC-UNIT-LeaveService-006 — accepts leave exactly 3 months ahead, 18/11 (boundary)', async () => {
        await leaveService.createLeave(7, { leaveDate: '2026-11-18', leaveType: 'paid' });

        expect(leaveRepository.createLeave).toHaveBeenCalled();
    });

    it('TC-UNIT-LeaveService-007 — rejects leave one day past the 3-month window, 19/11', async () => {
        await expect(leaveService.createLeave(7, { leaveDate: '2026-11-19', leaveType: 'paid' }))
            .rejects.toThrow('Chỉ đăng ký nghỉ trong vòng 3 tháng tới');

        expect(leaveRepository.createLeave).not.toHaveBeenCalled();
    });

    it('TC-UNIT-LeaveService-008 — accepts leave exactly 3 months back, 18/05 (boundary)', async () => {
        await leaveService.createLeave(7, { leaveDate: '2026-05-18', leaveType: 'paid' });

        expect(leaveRepository.createLeave).toHaveBeenCalled();
    });

    it('TC-UNIT-LeaveService-009 — rejects leave one day beyond 3 months back, 17/05', async () => {
        await expect(leaveService.createLeave(7, { leaveDate: '2026-05-17', leaveType: 'paid' }))
            .rejects.toThrow('Không đăng ký nghỉ lùi quá 3 tháng');

        expect(leaveRepository.createLeave).not.toHaveBeenCalled();
    });

    it('TC-UNIT-LeaveService-010 — blocks backdated leave once the payroll period is closed', async () => {
        leaveRepository.getPayrollStatus.mockResolvedValue('paid');

        await expect(leaveService.createLeave(7, { leaveDate: '2026-07-10', leaveType: 'paid' }))
            .rejects.toThrow('Bảng lương tháng 7/2026 đã chốt');

        expect(leaveRepository.createLeave).not.toHaveBeenCalled();
    });

    it('TC-UNIT-LeaveService-011 — allows registration while the payroll period is still pending', async () => {
        leaveRepository.getPayrollStatus.mockResolvedValue('pending');

        await leaveService.createLeave(7, { leaveDate: '2026-07-10', leaveType: 'paid' });

        expect(leaveRepository.getPayrollStatus).toHaveBeenCalledWith(7, 7, 2026);
        expect(leaveRepository.createLeave).toHaveBeenCalled();
    });

    it('TC-UNIT-LeaveService-012 — blocks a day already marked half-day and names that status', async () => {
        leaveRepository.findBlockingAttendance.mockResolvedValue({ status: 'half_day' });

        await expect(leaveService.createLeave(7, { leaveDate: '2026-08-20', leaveType: 'paid' }))
            .rejects.toThrow('Ngày 2026-08-20 đã được chấm công "nửa công"');

        expect(leaveRepository.createLeave).not.toHaveBeenCalled();
    });

    it('TC-UNIT-LeaveService-013 — blocks a day already marked unexcused absence and names that status', async () => {
        leaveRepository.findBlockingAttendance.mockResolvedValue({ status: 'absent' });

        await expect(leaveService.createLeave(7, { leaveDate: '2026-08-20', leaveType: 'paid' }))
            .rejects.toThrow('đã được chấm công "vắng không phép"');

        expect(leaveRepository.createLeave).not.toHaveBeenCalled();
    });
});

describe('leaveService.getSummary', () => {
    it('TC-UNIT-LeaveService-014 — falls back to the current period when month and year are missing', async () => {
        leaveRepository.getAttendanceSummary.mockResolvedValue({});

        await leaveService.getSummary(7, {});

        expect(leaveRepository.getAttendanceSummary).toHaveBeenCalledWith(7, { month: 8, year: 2026 });
    });

    it('TC-UNIT-LeaveService-015 — coerces string month and year into numbers', async () => {
        leaveRepository.getAttendanceSummary.mockResolvedValue({});

        await leaveService.getSummary(7, { month: '3', year: '2025' });

        expect(leaveRepository.getAttendanceSummary).toHaveBeenCalledWith(7, { month: 3, year: 2025 });
    });
});

describe('leaveService.getMyLeaves', () => {
    it('TC-UNIT-LeaveService-016 — passes null for both month and year when no filter is given', async () => {
        leaveRepository.getDriverLeaves.mockResolvedValue([]);

        await leaveService.getMyLeaves(7);

        expect(leaveRepository.getDriverLeaves).toHaveBeenCalledWith(7, { month: null, year: null });
    });
});
