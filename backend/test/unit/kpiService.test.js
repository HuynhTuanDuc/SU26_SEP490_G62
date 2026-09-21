/**
 * L1 Unit Test — kpiService
 *
 * Phần nặng nhất: setDriverDefaultVehicleGroup — đổi nhóm xe kéo theo tính lại KPI,
 * nhưng CHỈ cho kỳ lương chưa chốt. Sai ở đây thì bảng lương và bảng xếp hạng lệch nhau.
 */
jest.mock('../../repositories/kpiRepository');
jest.mock('../../config/logger', () => ({
    warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const kpiRepository = require('../../repositories/kpiRepository');
const logger = require('../../config/logger');
const kpiService = require('../../services/kpiService');

const BAY_GIO = new Date(2026, 7, 18, 10, 0, 0); // 18/08/2026

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(BAY_GIO);
});

afterEach(() => jest.useRealTimers());

describe('kpiService.getMyKPI', () => {
    it('TC-UNIT-KpiService-001 — rejects month 13', async () => {
        await expect(kpiService.getMyKPI(5, { month: 13 })).rejects.toThrow('Tháng không hợp lệ (1-12)');

        expect(kpiRepository.getDriverKPI).not.toHaveBeenCalled();
    });

    it('TC-UNIT-KpiService-002 — rejects year 2019', async () => {
        await expect(kpiService.getMyKPI(5, { year: 2019 })).rejects.toThrow('Năm không hợp lệ (tối thiểu 2020)');
    });

    it('TC-UNIT-KpiService-003 — passes null when no filter is given, the repository chooses the period', async () => {
        kpiRepository.getDriverKPI.mockResolvedValue({});

        await kpiService.getMyKPI(5);

        expect(kpiRepository.getDriverKPI).toHaveBeenCalledWith(5, { month: null, year: null });
    });
});

describe('kpiService.getLeaderboard', () => {
    it('TC-UNIT-KpiService-004 — ranks only within the vehicle group of the driver (BR-DRV-028)', async () => {
        kpiRepository.getDriverVehicleGroupId.mockResolvedValue({ vehicle_group_id: 3, vehicle_group_name: '5m2' });
        kpiRepository.getLeaderboard.mockResolvedValue([{ driver_id: 5, total_in_group: '4' }]);

        const result = await kpiService.getLeaderboard(5, {});

        expect(kpiRepository.getLeaderboard).toHaveBeenCalledWith(5, 3, { month: 8, year: 2026 });
        expect(result).toMatchObject({ vehicle_group_name: '5m2', month: 8, year: 2026, total_in_group: 4 });
    });

    it('TC-UNIT-KpiService-005 — a driver with no vehicle cannot see the leaderboard', async () => {
        kpiRepository.getDriverVehicleGroupId.mockResolvedValue(null);

        await expect(kpiService.getLeaderboard(5, {}))
            .rejects.toThrow('Driver chưa được gán xe — không thể xem bảng xếp hạng');

        expect(kpiRepository.getLeaderboard).not.toHaveBeenCalled();
    });

    it('TC-UNIT-KpiService-006 — an empty group totals 0 rather than NaN', async () => {
        kpiRepository.getDriverVehicleGroupId.mockResolvedValue({ vehicle_group_id: 3, vehicle_group_name: '5m2' });
        kpiRepository.getLeaderboard.mockResolvedValue([]);

        const result = await kpiService.getLeaderboard(5, {});

        expect(result.total_in_group).toBe(0);
        expect(result.leaderboard).toEqual([]);
    });

    it('TC-UNIT-KpiService-007 — rejects month 13 for the leaderboard', async () => {
        await expect(kpiService.getLeaderboard(5, { month: 13, year: 2026 }))
            .rejects.toThrow('Tháng không hợp lệ (1-12)');

        expect(kpiRepository.getDriverVehicleGroupId).not.toHaveBeenCalled();
    });

    it('TC-UNIT-KpiService-023 — month 0 is read as no filter and falls back to the current month', async () => {
        // month = 0 là falsy nên không đi qua nhánh validate — hành vi thật của hệ thống.
        // Pin lại để nếu ai đổi sang Number(month) ?? currentMonth() thì test báo ngay.
        kpiRepository.getDriverVehicleGroupId.mockResolvedValue({ vehicle_group_id: 3, vehicle_group_name: '5m2' });
        kpiRepository.getLeaderboard.mockResolvedValue([]);

        const result = await kpiService.getLeaderboard(5, { month: 0, year: 2026 });

        expect(result.month).toBe(8);
        expect(kpiRepository.getLeaderboard).toHaveBeenCalledWith(5, 3, { month: 8, year: 2026 });
    });
});

describe('kpiService.setDriverDefaultVehicleGroup', () => {
    beforeEach(() => {
        kpiRepository.getDriverDefaultVehicleGroup.mockResolvedValue({ default_vehicle_group_id: 2 });
        kpiRepository.getVehicleGroupById.mockResolvedValue({ id: 3, name: '7m4', status: 'active' });
        kpiRepository.setDriverDefaultVehicleGroup.mockResolvedValue({ profile_id: 5, default_vehicle_group_id: 3 });
        kpiRepository.listUnlockedPayrollPeriods.mockResolvedValue([]);
        kpiRepository.getPayrollStatus.mockResolvedValue(null);
        kpiRepository.recalculateDriverKPI.mockResolvedValue({ id: 1 });
        kpiRepository.logDriverGroupChange.mockResolvedValue(undefined);
    });

    it('TC-UNIT-KpiService-008 — changing the group while payroll is open recalculates KPI for the current month', async () => {
        const result = await kpiService.setDriverDefaultVehicleGroup(5, 3, 30, 'Chuyển biên chế');

        expect(kpiRepository.setDriverDefaultVehicleGroup).toHaveBeenCalledWith(5, 3);
        expect(kpiRepository.recalculateDriverKPI).toHaveBeenCalledWith(5, 8, 2026, { syncVehicleGroup: true });
        expect(result).toMatchObject({ kpi_synced: true, applied_periods: ['8/2026'], payroll_locked: false });
    });

    it('TC-UNIT-KpiService-009 — a closed payroll for the current month means KPI is NOT recalculated', async () => {
        kpiRepository.getPayrollStatus.mockResolvedValue('paid');

        const result = await kpiService.setDriverDefaultVehicleGroup(5, 3, 30);

        expect(kpiRepository.recalculateDriverKPI).not.toHaveBeenCalled();
        expect(result).toMatchObject({ kpi_synced: false, payroll_locked: true, payroll_status: 'paid' });
        expect(result.message).toContain('nhóm mới áp dụng từ kỳ sau');
    });

    it('TC-UNIT-KpiService-010 — every payroll period still pending is recalculated, not just the current month', async () => {
        kpiRepository.listUnlockedPayrollPeriods.mockResolvedValue([{ month: 7, year: 2026 }]);

        const result = await kpiService.setDriverDefaultVehicleGroup(5, 3, 30);

        expect(kpiRepository.recalculateDriverKPI).toHaveBeenCalledWith(5, 7, 2026, { syncVehicleGroup: true });
        expect(kpiRepository.recalculateDriverKPI).toHaveBeenCalledWith(5, 8, 2026, { syncVehicleGroup: true });
        expect(result.applied_periods).toEqual(['7/2026', '8/2026']);
    });

    it('TC-UNIT-KpiService-011 — a period the repository refuses (_kyDaChot) does not count as synchronised', async () => {
        kpiRepository.recalculateDriverKPI.mockResolvedValue({ _kyDaChot: true });

        const result = await kpiService.setDriverDefaultVehicleGroup(5, 3, 30);

        expect(result.kpi_synced).toBe(false);
        expect(result.applied_periods).toEqual([]);
    });

    it('TC-UNIT-KpiService-012 — a driver already in that group causes no further writes', async () => {
        kpiRepository.getDriverDefaultVehicleGroup.mockResolvedValue({ default_vehicle_group_id: 3 });

        const result = await kpiService.setDriverDefaultVehicleGroup(5, 3, 30);

        expect(kpiRepository.setDriverDefaultVehicleGroup).not.toHaveBeenCalled();
        expect(kpiRepository.recalculateDriverKPI).not.toHaveBeenCalled();
        expect(result).toMatchObject({ kpi_synced: false });
    });

    it('TC-UNIT-KpiService-013 — a hidden vehicle group cannot be assigned', async () => {
        kpiRepository.getVehicleGroupById.mockResolvedValue({ id: 3, name: '7m4', status: 'inactive' });

        await expect(kpiService.setDriverDefaultVehicleGroup(5, 3, 30))
            .rejects.toThrow('Nhóm xe "7m4" đang bị ẩn — không gán được cho tài xế');

        expect(kpiRepository.setDriverDefaultVehicleGroup).not.toHaveBeenCalled();
    });

    it('TC-UNIT-KpiService-014 — rejects a vehicle group that does not exist', async () => {
        kpiRepository.getVehicleGroupById.mockResolvedValue(null);

        await expect(kpiService.setDriverDefaultVehicleGroup(5, 3, 30)).rejects.toThrow('Nhóm xe không tồn tại');
    });

    it('TC-UNIT-KpiService-015 — rejects a driver that does not exist', async () => {
        kpiRepository.getDriverDefaultVehicleGroup.mockResolvedValue(null);

        await expect(kpiService.setDriverDefaultVehicleGroup(5, 3, 30)).rejects.toThrow('Không tìm thấy tài xế');
    });

    it('TC-UNIT-KpiService-016 — rejects a missing driverId or vehicle group', async () => {
        await expect(kpiService.setDriverDefaultVehicleGroup(0, 3)).rejects.toThrow('Driver ID là bắt buộc');
        await expect(kpiService.setDriverDefaultVehicleGroup(5, 0)).rejects.toThrow('Nhóm xe là bắt buộc');
    });

    it('TC-UNIT-KpiService-017 — audits who changed the group and from which group to which', async () => {
        await kpiService.setDriverDefaultVehicleGroup(5, 3, 30, 'Chuyển biên chế');

        expect(kpiRepository.logDriverGroupChange).toHaveBeenCalledWith(expect.objectContaining({
            driverId: 5, fromGroupId: 2, toGroupId: 3, changedBy: 30,
            reason: 'Chuyển biên chế', kpiSynced: true,
        }));
    });

    it('TC-UNIT-KpiService-018 — an audit-log failure must not block the group change', async () => {
        kpiRepository.logDriverGroupChange.mockRejectedValue(new Error('bảng log lỗi'));

        await expect(kpiService.setDriverDefaultVehicleGroup(5, 3, 30)).resolves.toMatchObject({ kpi_synced: true });
    });
});

describe('kpiService.recalculateAfterCompletion', () => {
    it('TC-UNIT-KpiService-019 — recalculates for the month of the completion time and removes duplicate drivers', async () => {
        kpiRepository.recalculateDriverKPI.mockResolvedValue({ id: 1 });

        await kpiService.recalculateAfterCompletion([5, 5, 6], new Date(2026, 6, 20));

        expect(kpiRepository.recalculateDriverKPI).toHaveBeenCalledTimes(2);
        expect(kpiRepository.recalculateDriverKPI).toHaveBeenCalledWith(5, 7, 2026);
        expect(kpiRepository.recalculateDriverKPI).toHaveBeenCalledWith(6, 7, 2026);
    });

    it('TC-UNIT-KpiService-020 — accepts a single id rather than an array', async () => {
        kpiRepository.recalculateDriverKPI.mockResolvedValue({ id: 1 });

        await kpiService.recalculateAfterCompletion(5, new Date(2026, 7, 1));

        expect(kpiRepository.recalculateDriverKPI).toHaveBeenCalledWith(5, 8, 2026);
    });

    it('TC-UNIT-KpiService-021 — a null from the repository (no vehicle group / closed period) must be logged as a warning', async () => {
        kpiRepository.recalculateDriverKPI.mockResolvedValue(null);

        await kpiService.recalculateAfterCompletion([5], new Date(2026, 7, 1));

        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('[KPI]'),
            expect.objectContaining({ driverId: 5, month: 8, year: 2026 }),
        );
    });

    it('TC-UNIT-KpiService-022 — a KPI failure must not break already committed business work, but it must be logged', async () => {
        kpiRepository.recalculateDriverKPI.mockRejectedValue(new Error('deadlock'));

        await expect(kpiService.recalculateAfterCompletion([5])).resolves.toEqual([null]);

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('[KPI]'),
            expect.objectContaining({ driverId: 5, message: 'deadlock' }),
        );
    });
});
