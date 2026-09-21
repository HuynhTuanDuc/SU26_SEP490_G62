/**
 * L1 Unit Test — attendanceService
 *
 * Hai cụm quyết định chính:
 *  1. resolveDayStatus (qua getMonthlyGrid) — ngày lễ ĐÈ lên mọi trạng thái khác
 *     (Điều V.1 chính sách lương).
 *  2. markAttendance — chặn chấm tương lai, chặn kỳ lương đã chốt, chặn trạng thái
 *     mâu thuẫn với ngày lễ và với đơn nghỉ đã duyệt.
 */
jest.mock('../../repositories/attendanceRepository');
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
}));

const attendanceRepository = require('../../repositories/attendanceRepository');
const notificationService = require('../../services/notificationService');
const attendanceService = require('../../services/attendanceService');

const HOM_NAY_ICT = new Date('2026-08-18T03:00:00Z'); // 18/08/2026 giờ VN

/** 1 dòng lưới thô như repository trả về */
const dongLuoi = (overrides = {}) => ({
    driver_id: 5, full_name: 'Lê Văn Tài', plate_number: '51C-123.45', vehicle_group_name: '5m2',
    work_date: '2026-08-01', override_id: null, override_status: null, override_notes: null,
    leave_request_id: null, leave_type: null, holiday_name: null, has_completed_trip: false,
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(HOM_NAY_ICT);
    attendanceRepository.getPayrollStatus.mockResolvedValue('pending');
    attendanceRepository.isHoliday.mockResolvedValue(null);
    attendanceRepository.findApprovedLeave.mockResolvedValue(null);
    attendanceRepository.upsertOverride.mockResolvedValue({ id: 900, status: 'present' });
    attendanceRepository.deleteOverride.mockResolvedValue({ id: 900 });
});

afterEach(() => jest.useRealTimers());

describe('attendanceService.getMonthlyGrid — trạng thái ngày hiệu lực', () => {
    it('TC-UNIT-AttendanceService-001 — counts an unmarked ordinary day as present', async () => {
        attendanceRepository.getMonthlyGrid.mockResolvedValue([dongLuoi()]);

        const { drivers } = await attendanceService.getMonthlyGrid({ month: 8, year: 2026 });

        expect(drivers[0].days[0].status).toBe('present');
        expect(drivers[0].days[0].status_label).toBe('Có mặt');
        expect(drivers[0].summary.present).toBe(1);
    });

    it('TC-UNIT-AttendanceService-002 — a public holiday not worked is still paid in full', async () => {
        attendanceRepository.getMonthlyGrid.mockResolvedValue([dongLuoi({ holiday_name: 'Quốc khánh' })]);

        const { drivers } = await attendanceService.getMonthlyGrid({ month: 9, year: 2026 });

        expect(drivers[0].days[0].status).toBe('holiday');
    });

    it('TC-UNIT-AttendanceService-003 — a public holiday with a completed trip counts at 200%', async () => {
        attendanceRepository.getMonthlyGrid.mockResolvedValue([
            dongLuoi({ holiday_name: 'Quốc khánh', has_completed_trip: true }),
        ]);

        const { drivers } = await attendanceService.getMonthlyGrid({ month: 9, year: 2026 });

        expect(drivers[0].days[0].status).toBe('holiday_worked');
        expect(drivers[0].summary.holiday_worked).toBe(1);
    });

    it('TC-UNIT-AttendanceService-004 — a public holiday OVERRIDES an absence mark, so no workday is deducted', async () => {
        attendanceRepository.getMonthlyGrid.mockResolvedValue([
            dongLuoi({ holiday_name: 'Tết', override_status: 'absent_unexcused' }),
        ]);

        const { drivers } = await attendanceService.getMonthlyGrid({ month: 2, year: 2026 });

        expect(drivers[0].days[0].status).toBe('holiday');
        expect(drivers[0].summary.absent_unexcused).toBe(0);
    });

    it('TC-UNIT-AttendanceService-005 — a manual mark beats the default status on an ordinary day', async () => {
        attendanceRepository.getMonthlyGrid.mockResolvedValue([dongLuoi({ override_status: 'half_day' })]);

        const { drivers } = await attendanceService.getMonthlyGrid({ month: 8, year: 2026 });

        expect(drivers[0].days[0].status).toBe('half_day');
        expect(drivers[0].summary.half_day).toBe(1);
    });

    it('TC-UNIT-AttendanceService-006 — a paid leave request yields the paid-leave status', async () => {
        attendanceRepository.getMonthlyGrid.mockResolvedValue([
            dongLuoi({ leave_request_id: 12, leave_type: 'paid' }),
        ]);

        const { drivers } = await attendanceService.getMonthlyGrid({ month: 8, year: 2026 });

        expect(drivers[0].days[0].status).toBe('leave_paid');
    });

    it('TC-UNIT-AttendanceService-007 — an unpaid leave request yields the unpaid-leave status', async () => {
        attendanceRepository.getMonthlyGrid.mockResolvedValue([
            dongLuoi({ leave_request_id: 12, leave_type: 'unpaid' }),
        ]);

        const { drivers } = await attendanceService.getMonthlyGrid({ month: 8, year: 2026 });

        expect(drivers[0].days[0].status).toBe('leave_unpaid');
    });

    it('TC-UNIT-AttendanceService-008 — several days of the same driver are merged into one record', async () => {
        attendanceRepository.getMonthlyGrid.mockResolvedValue([
            dongLuoi({ work_date: '2026-08-01' }),
            dongLuoi({ work_date: '2026-08-02', override_status: 'absent_unexcused' }),
            dongLuoi({ driver_id: 6, full_name: 'Trần B', work_date: '2026-08-01' }),
        ]);

        const { drivers } = await attendanceService.getMonthlyGrid({ month: 8, year: 2026 });

        expect(drivers).toHaveLength(2);
        expect(drivers[0].days).toHaveLength(2);
        expect(drivers[0].summary).toMatchObject({ present: 1, absent_unexcused: 1 });
    });

    it('TC-UNIT-AttendanceService-009 — rejects the query for month 13', async () => {
        await expect(attendanceService.getMonthlyGrid({ month: 13, year: 2026 }))
            .rejects.toThrow('Tháng không hợp lệ (1-12)');

        expect(attendanceRepository.getMonthlyGrid).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AttendanceService-010 — rejects the query for year 2019', async () => {
        await expect(attendanceService.getMonthlyGrid({ month: 8, year: 2019 }))
            .rejects.toThrow('Năm không hợp lệ');

        expect(attendanceRepository.getMonthlyGrid).not.toHaveBeenCalled();
    });
});

describe('attendanceService.markAttendance', () => {
    it('TC-UNIT-AttendanceService-011 — saves a valid present mark and notifies the driver', async () => {
        const result = await attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-08-17', status: 'present', notes: 'ok' }, 30,
        );

        expect(attendanceRepository.upsertOverride).toHaveBeenCalledWith({
            driverId: 5, workDate: '2026-08-17', status: 'present', notes: 'ok', markedBy: 30,
        });
        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5, expect.objectContaining({ type: 'ATTENDANCE_UPDATED' }), { displayMode: 'alert' },
        );
        expect(result).toEqual({ id: 900, status: 'present' });
    });

    it('TC-UNIT-AttendanceService-012 — marking today itself is still allowed (boundary)', async () => {
        await attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-08-18', status: 'present' }, 30,
        );

        expect(attendanceRepository.upsertOverride).toHaveBeenCalled();
    });

    it('TC-UNIT-AttendanceService-013 — blocks marking a day in the future', async () => {
        await expect(attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-08-19', status: 'present' }, 30,
        )).rejects.toThrow('Không thể chấm công cho ngày trong tương lai');

        expect(attendanceRepository.upsertOverride).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AttendanceService-014 — rejects a missing driver_id', async () => {
        await expect(attendanceService.markAttendance({ workDate: '2026-08-17', status: 'present' }, 30))
            .rejects.toThrow('driver_id là bắt buộc');
    });

    it('TC-UNIT-AttendanceService-015 — rejects a missing work_date', async () => {
        await expect(attendanceService.markAttendance({ driverId: 5, status: 'present' }, 30))
            .rejects.toThrow('work_date là bắt buộc');
    });

    it('TC-UNIT-AttendanceService-016 — rejects a status outside the 4 allowed values', async () => {
        await expect(attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-08-17', status: 'leave_paid' }, 30,
        )).rejects.toThrow('Trạng thái không hợp lệ');

        expect(attendanceRepository.upsertOverride).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AttendanceService-017 — rejects a wrongly formatted date', async () => {
        await expect(attendanceService.markAttendance(
            { driverId: 5, workDate: '17/08/2026', status: 'present' }, 30,
        )).rejects.toThrow('Ngày chấm công không hợp lệ (định dạng YYYY-MM-DD)');
    });

    it('TC-UNIT-AttendanceService-018 — blocks editing attendance once the payroll period is closed', async () => {
        attendanceRepository.getPayrollStatus.mockResolvedValue('paid');

        await expect(attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-07-10', status: 'present' }, 30,
        )).rejects.toThrow('Bảng lương tháng 7/2026 đã chốt (paid)');

        expect(attendanceRepository.upsertOverride).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AttendanceService-019 — forbids marking an absence on a public holiday', async () => {
        attendanceRepository.isHoliday.mockResolvedValue('Quốc khánh');

        await expect(attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-08-17', status: 'absent_unexcused' }, 30,
        )).rejects.toThrow('là ngày lễ (Quốc khánh)');

        expect(attendanceRepository.upsertOverride).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AttendanceService-020 — forbids marking a half-day on a public holiday', async () => {
        attendanceRepository.isHoliday.mockResolvedValue('Quốc khánh');

        await expect(attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-08-17', status: 'half_day' }, 30,
        )).rejects.toThrow('không trừ công');
    });

    it('TC-UNIT-AttendanceService-021 — worked-on-holiday is only valid on an actual public holiday', async () => {
        attendanceRepository.isHoliday.mockResolvedValue(null);

        await expect(attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-08-17', status: 'holiday_worked' }, 30,
        )).rejects.toThrow('Chỉ đánh dấu "Đi làm ngày lễ" cho ngày nằm trong danh mục ngày lễ');
    });

    it('TC-UNIT-AttendanceService-022 — records 200% when the driver works on a real public holiday', async () => {
        attendanceRepository.isHoliday.mockResolvedValue('Quốc khánh');

        await attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-08-17', status: 'holiday_worked' }, 30,
        );

        expect(attendanceRepository.upsertOverride).toHaveBeenCalled();
    });

    it('TC-UNIT-AttendanceService-023 — blocks an absence mark on a day that already has approved leave', async () => {
        attendanceRepository.findApprovedLeave.mockResolvedValue({ id: 12 });

        await expect(attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-08-17', status: 'absent_unexcused' }, 30,
        )).rejects.toThrow('đã có đơn nghỉ được duyệt');

        expect(attendanceRepository.upsertOverride).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AttendanceService-024 — a present mark may still override a day that already has approved leave', async () => {
        attendanceRepository.findApprovedLeave.mockResolvedValue({ id: 12 });

        await attendanceService.markAttendance(
            { driverId: 5, workDate: '2026-08-17', status: 'present' }, 30,
        );

        expect(attendanceRepository.findApprovedLeave).not.toHaveBeenCalled();
        expect(attendanceRepository.upsertOverride).toHaveBeenCalled();
    });
});

describe('attendanceService.clearAttendance', () => {
    it('TC-UNIT-AttendanceService-025 — clearing a mark notifies the driver again', async () => {
        await attendanceService.clearAttendance(5, '2026-08-17');

        expect(attendanceRepository.deleteOverride).toHaveBeenCalledWith(5, '2026-08-17');
        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5, expect.objectContaining({ type: 'ATTENDANCE_UPDATED' }), { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-AttendanceService-026 — returns 404 when there is no mark to clear', async () => {
        attendanceRepository.deleteOverride.mockResolvedValue(null);

        await expect(attendanceService.clearAttendance(5, '2026-08-17'))
            .rejects.toMatchObject({ message: 'Không tìm thấy đánh dấu chấm công để xoá', status: 404 });

        expect(notificationService.createForUser).not.toHaveBeenCalled();
    });
});

describe('attendanceService.getMyMonth', () => {
    it('TC-UNIT-AttendanceService-027 — returns an empty grid rather than an error when the driver has no data', async () => {
        attendanceRepository.getMonthlyGrid.mockResolvedValue([]);

        const result = await attendanceService.getMyMonth(5, { month: 8, year: 2026 });

        expect(result).toEqual({ month: 8, year: 2026, days: [], summary: {}, status_labels: attendanceService.STATUS_LABEL });
    });

    it('TC-UNIT-AttendanceService-028 — returns data for the signed-in driver only', async () => {
        attendanceRepository.getMonthlyGrid.mockResolvedValue([dongLuoi()]);

        const result = await attendanceService.getMyMonth(5, { month: 8, year: 2026 });

        expect(attendanceRepository.getMonthlyGrid).toHaveBeenCalledWith(
            expect.objectContaining({ driverId: 5 }),
        );
        expect(result.days).toHaveLength(1);
    });
});
