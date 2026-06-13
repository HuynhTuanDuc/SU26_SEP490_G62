import { kpiService } from '@/services/kpi-service';
import { apiClient }  from '@/lib/api-client';

jest.mock('@/lib/api-client');

const mockApi = apiClient as jest.Mocked<typeof apiClient>;

describe('kpiService', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('getMyKPI', () => {
        it('G62-FE-51: getMyKPI() → GET /api/kpi/me trả về records', async () => {
            mockApi.get = jest.fn().mockResolvedValue({
                kpi: [{ id: 1, completed_shipments: 10, total_revenue: '5000000' }],
            });

            const result = await kpiService.getMyKPI();

            expect(mockApi.get).toHaveBeenCalledWith('/api/kpi/me');
            expect(Array.isArray(result.kpi)).toBe(true);
            expect(result.kpi[0].total_revenue).toBe('5000000');
        });

        it('G62-FE-52: getMyKPI({month:6,year:2026}) → URL có ?month=6&year=2026', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ kpi: [] });

            await kpiService.getMyKPI({ month: 6, year: 2026 });

            const url: string = (mockApi.get as jest.Mock).mock.calls[0][0];
            expect(url).toContain('month=6');
            expect(url).toContain('year=2026');
        });
    });

    describe('getLeaderboard', () => {
        it('G62-FE-53: getLeaderboard() → GET /api/kpi/leaderboard trả về bảng xếp hạng', async () => {
            mockApi.get = jest.fn().mockResolvedValue({
                vehicle_group_name: '5m2',
                month: 6,
                year: 2026,
                total_in_group: 5,
                leaderboard: [{ driver_id: 1, driver_name: 'Tien', is_me: true }],
            });

            const result = await kpiService.getLeaderboard();

            expect(mockApi.get).toHaveBeenCalledWith('/api/kpi/leaderboard');
            expect(Array.isArray(result.leaderboard)).toBe(true);
            expect(result.vehicle_group_name).toBe('5m2');
        });

        it('G62-FE-54: getLeaderboard({month:6,year:2026}) → URL có params', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ leaderboard: [] });

            await kpiService.getLeaderboard({ month: 6, year: 2026 });

            const url: string = (mockApi.get as jest.Mock).mock.calls[0][0];
            expect(url).toContain('month=6');
            expect(url).toContain('year=2026');
        });
    });
});
