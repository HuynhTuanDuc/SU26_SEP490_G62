import React from 'react';
import { render, screen, fireEvent } from './test-utils';
import { useLocalSearchParams } from 'expo-router';

import { LeaderboardScreen } from '@/features/driver/leaderboard-screen';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import type { LeaderboardRow } from '@/services/kpi-service';

jest.mock('@/hooks/use-leaderboard');

const mockUseLeaderboard = useLeaderboard as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;

function makeRow(overrides: Partial<LeaderboardRow> = {}): LeaderboardRow {
    return {
        driver_id: 1,
        driver_name: 'Nguyễn Văn A',
        completed_shipments: 10,
        total_revenue: '5000000',
        incident_count: 0,
        revenue_rank: 1,
        trips_rank: 1,
        is_me: false,
        ...overrides,
    } as LeaderboardRow;
}

describe('LeaderboardScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUseLocalSearchParams.mockReturnValue({});
    });

    it('G62-FE-102: hiển thị "Chưa có dữ liệu" khi bảng xếp hạng rỗng', async () => {
        mockUseLeaderboard.mockReturnValue({
            data: { vehicle_group_name: '5m2', total_in_group: 0, leaderboard: [] },
            isLoading: false, error: null, reload: jest.fn(),
        });

        await render(<LeaderboardScreen />);

        expect(screen.getByText('Chưa có dữ liệu')).toBeTruthy();
    });

    it('G62-FE-103: hiển thị banner lỗi khi có error', async () => {
        mockUseLeaderboard.mockReturnValue({ data: null, isLoading: false, error: 'Không thể tải bảng xếp hạng', reload: jest.fn() });

        await render(<LeaderboardScreen />);

        expect(screen.getByText('Không thể tải bảng xếp hạng')).toBeTruthy();
    });

    it('G62-FE-104: hiển thị đúng tên nhóm xe và danh sách driver, không so sánh khác nhóm xe (BR-028)', async () => {
        const rows = [makeRow({ driver_id: 1, driver_name: 'Tài A', revenue_rank: 1 }), makeRow({ driver_id: 2, driver_name: 'Tài B', revenue_rank: 2 })];
        mockUseLeaderboard.mockReturnValue({
            data: { vehicle_group_name: '8m2', total_in_group: 2, leaderboard: rows },
            isLoading: false, error: null, reload: jest.fn(),
        });

        await render(<LeaderboardScreen />);

        expect(screen.getByText('Nhóm xe: 8m2')).toBeTruthy();
        expect(screen.getByText(/Tài A/)).toBeTruthy();
        expect(screen.getByText(/Tài B/)).toBeTruthy();
    });

    it('G62-FE-105: đánh dấu chính mình bằng nhãn "(Tôi)" và style nổi bật', async () => {
        const rows = [makeRow({ driver_id: 1, driver_name: 'Tôi Đây', is_me: true, revenue_rank: 1 })];
        mockUseLeaderboard.mockReturnValue({
            data: { vehicle_group_name: '5m2', total_in_group: 1, leaderboard: rows },
            isLoading: false, error: null, reload: jest.fn(),
        });

        await render(<LeaderboardScreen />);

        expect(screen.getByText(/Tôi Đây\s*\(Tôi\)/)).toBeTruthy();
        expect(screen.getByText('Xếp hạng của tôi:')).toBeTruthy();
    });

    it('G62-FE-106: hiển thị "Hiển thị top 20" khi danh sách đúng 20 driver', async () => {
        const rows = Array.from({ length: 20 }, (_, i) => makeRow({ driver_id: i + 1, driver_name: `Driver ${i + 1}`, revenue_rank: i + 1 }));
        mockUseLeaderboard.mockReturnValue({
            data: { vehicle_group_name: '5m2', total_in_group: 20, leaderboard: rows },
            isLoading: false, error: null, reload: jest.fn(),
        });

        await render(<LeaderboardScreen />);

        expect(screen.getByText('Hiển thị top 20')).toBeTruthy();
    });

    it('G62-FE-107: chuyển tiêu chí xếp hạng từ Doanh thu sang Số chuyến (BR-028)', async () => {
        const rows = [makeRow({
            driver_id: 1, driver_name: 'Tài A', is_me: true,
            revenue_rank: 2, trips_rank: 1, completed_shipments: 15,
        })];
        mockUseLeaderboard.mockReturnValue({
            data: { vehicle_group_name: '5m2', total_in_group: 1, leaderboard: rows },
            isLoading: false, error: null, reload: jest.fn(),
        });

        await render(<LeaderboardScreen />);
        // Mặc định sort theo doanh thu → "Xếp hạng của tôi" hiển thị revenue_rank = #2
        expect(screen.getByText('#2')).toBeTruthy();

        await fireEvent.press(screen.getByText('Số chuyến'));

        // Sau khi đổi sort mode, xếp hạng hiển thị dùng trips_rank = #1 thay vì revenue_rank
        expect(screen.getByText('#1')).toBeTruthy();
    });

    it('G62-FE-108: nhận month/year từ route params khi mở từ màn KPI', async () => {
        mockUseLocalSearchParams.mockReturnValue({ month: '3', year: '2025' });
        mockUseLeaderboard.mockReturnValue({
            data: { vehicle_group_name: '5m2', total_in_group: 0, leaderboard: [] },
            isLoading: false, error: null, reload: jest.fn(),
        });

        await render(<LeaderboardScreen />);

        expect(mockUseLeaderboard).toHaveBeenCalledWith(3, 2025);
    });

    it('G62-FE-109: gọi reload() khi mount', async () => {
        const reload = jest.fn();
        mockUseLeaderboard.mockReturnValue({ data: null, isLoading: false, error: null, reload });

        await render(<LeaderboardScreen />);

        expect(reload).toHaveBeenCalledTimes(1);
    });
});
