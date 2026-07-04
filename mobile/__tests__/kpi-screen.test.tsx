import React from 'react';
import { render, screen, fireEvent } from './test-utils';
import { router } from 'expo-router';

import { KpiScreen } from '@/features/driver/kpi-screen';
import { useKpi } from '@/hooks/use-kpi';
import type { KpiRecord } from '@/services/kpi-service';

jest.mock('@/hooks/use-kpi');

const mockUseKpi = useKpi as jest.Mock;

function makeRecord(overrides: Partial<KpiRecord> = {}): KpiRecord {
    return {
        id: 1,
        completed_shipments: 12,
        total_revenue: '15000000',
        incident_count: 0,
        major_incident_count: 0,
        critical_incident_count: 0,
        vehicle_group_name: '5m2',
        revenue_rank: 0,
        kpi_bonus_threshold: null,
        kpi_bonus_reward: null,
        kpi_bonus_achieved: false,
        top_driver_bonus_reward: null,
        ...overrides,
    } as KpiRecord;
}

describe('KpiScreen', () => {
    beforeEach(() => jest.clearAllMocks());

    it('G62-FE-81: hiển thị skeleton khi isLoading=true', async () => {
        mockUseKpi.mockReturnValue({ records: [], isLoading: true, error: null, reload: jest.fn() });

        await render(<KpiScreen />);

        expect(screen.queryByText('Chưa có dữ liệu')).toBeNull();
    });

    it('G62-FE-82: hiển thị banner lỗi khi error có giá trị', async () => {
        mockUseKpi.mockReturnValue({ records: [], isLoading: false, error: 'Không thể tải KPI', reload: jest.fn() });

        await render(<KpiScreen />);

        expect(screen.getByText('Không thể tải KPI')).toBeTruthy();
    });

    it('G62-FE-83: hiển thị EmptyMonth khi không có KPI cho tháng hiện tại', async () => {
        mockUseKpi.mockReturnValue({ records: [], isLoading: false, error: null, reload: jest.fn() });

        await render(<KpiScreen />);

        expect(screen.getByText('Chưa có dữ liệu')).toBeTruthy();
    });

    it('G62-FE-84: hiển thị đúng số chuyến hoàn thành và doanh thu khi có KPI', async () => {
        const record = makeRecord({ completed_shipments: 25, total_revenue: '20000000' });
        mockUseKpi.mockReturnValue({ records: [record], isLoading: false, error: null, reload: jest.fn() });

        await render(<KpiScreen />);

        expect(screen.getByText('25')).toBeTruthy();
        expect(screen.getByText('20.0M₫')).toBeTruthy();
    });

    it('G62-FE-85: KHÔNG hiển thị KpiBonusCard khi thiếu kpi_bonus_threshold/reward', async () => {
        const record = makeRecord({ kpi_bonus_threshold: null, kpi_bonus_reward: null });
        mockUseKpi.mockReturnValue({ records: [record], isLoading: false, error: null, reload: jest.fn() });

        await render(<KpiScreen />);

        expect(screen.queryByText('Thưởng vượt KPI')).toBeNull();
    });

    it('G62-FE-86: hiển thị KpiBonusCard với badge "ĐÃ ĐẠT" khi đã đạt ngưỡng', async () => {
        const record = makeRecord({
            kpi_bonus_threshold: '10000000',
            kpi_bonus_reward: '500000',
            kpi_bonus_achieved: true,
            total_revenue: '15000000',
        });
        mockUseKpi.mockReturnValue({ records: [record], isLoading: false, error: null, reload: jest.fn() });

        await render(<KpiScreen />);

        expect(screen.getByText('Thưởng vượt KPI')).toBeTruthy();
        expect(screen.getByText('ĐÃ ĐẠT')).toBeTruthy();
    });

    it('G62-FE-87: KHÔNG hiển thị TopDriverCard khi rank = 0 (chưa được xếp hạng)', async () => {
        const record = makeRecord({ revenue_rank: 0, top_driver_bonus_reward: '1000000' });
        mockUseKpi.mockReturnValue({ records: [record], isLoading: false, error: null, reload: jest.fn() });

        await render(<KpiScreen />);

        expect(screen.queryByText('Lái xe xuất sắc nhất')).toBeNull();
    });

    it('G62-FE-88: hiển thị TopDriverCard với badge "TOP 1" khi rank = 1', async () => {
        const record = makeRecord({ revenue_rank: 1, top_driver_bonus_reward: '1000000' });
        mockUseKpi.mockReturnValue({ records: [record], isLoading: false, error: null, reload: jest.fn() });

        await render(<KpiScreen />);

        expect(screen.getByText('Lái xe xuất sắc nhất')).toBeTruthy();
        expect(screen.getByText('TOP 1')).toBeTruthy();
    });

    it('G62-FE-89: bấm "Xếp hạng" trên header điều hướng sang /leaderboard kèm month/year', async () => {
        const record = makeRecord();
        mockUseKpi.mockReturnValue({ records: [record], isLoading: false, error: null, reload: jest.fn() });

        await render(<KpiScreen />);
        await fireEvent.press(screen.getByText('Xếp hạng'));

        const now = new Date();
        expect(router.push).toHaveBeenCalledWith({
            pathname: '/leaderboard',
            params: { month: String(now.getMonth() + 1), year: String(now.getFullYear()) },
        });
    });

    it('G62-FE-90: gọi reload() khi màn hình được mount', async () => {
        const reload = jest.fn();
        mockUseKpi.mockReturnValue({ records: [], isLoading: false, error: null, reload });

        await render(<KpiScreen />);

        expect(reload).toHaveBeenCalledTimes(1);
    });
});
