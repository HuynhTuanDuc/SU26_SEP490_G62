const { mock } = require('../helpers/nodeTestMock');
const assert = require('node:assert');

const kpiRepository = require('../../repositories/kpiRepository');

const kpiService = require('../../services/kpiService');

describe('Kpi Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    describe('getMyKPI()', () => {
        it('rejects month out of 1-12 range', async () => {
            await assert.rejects(
                () => kpiService.getMyKPI(1, { month: 13 }),
                { message: 'Tháng không hợp lệ (1-12)' },
            );
        });

        it('rejects year before 2020', async () => {
            await assert.rejects(
                () => kpiService.getMyKPI(1, { year: 2019 }),
                { message: 'Năm không hợp lệ (tối thiểu 2020)' },
            );
        });

        it('returns the current KPI record for the driver', async () => {
            mock.method(kpiRepository, 'getDriverKPI', async (driverId, { month, year }) => {
                assert.strictEqual(driverId, 1);
                assert.strictEqual(month, 10);
                assert.strictEqual(year, 2024);
                return [{ completed_shipments: 5, total_revenue: '1000000' }];
            });

            const result = await kpiService.getMyKPI(1, { month: 10, year: 2024 });

            assert.strictEqual(result[0].completed_shipments, 5);
        });
    });

    describe('getLeaderboard() — BR-028', () => {
        it('rejects month out of range', async () => {
            await assert.rejects(
                () => kpiService.getLeaderboard(1, { month: 13 }),
                { message: 'Tháng không hợp lệ (1-12)' },
            );
        });

        it('throws when the driver has no vehicle group assigned', async () => {
            mock.method(kpiRepository, 'getDriverVehicleGroupId', async () => null);

            await assert.rejects(
                () => kpiService.getLeaderboard(1, { month: 10, year: 2024 }),
                { message: 'Driver chưa được gán xe — không thể xem bảng xếp hạng' },
            );
        });

        it('only compares drivers within the same vehicle group (BR-028)', async () => {
            mock.method(kpiRepository, 'getDriverVehicleGroupId', async () => ({ vehicle_group_id: 5, vehicle_group_name: '5m2' }));
            mock.method(kpiRepository, 'getLeaderboard', async (driverId, vehicleGroupId) => {
                assert.strictEqual(vehicleGroupId, 5);
                return [{ driver_id: 1, total_in_group: 3 }];
            });

            const result = await kpiService.getLeaderboard(1, { month: 10, year: 2024 });

            assert.strictEqual(result.vehicle_group_name, '5m2');
            assert.strictEqual(result.total_in_group, 3);
        });

        it('defaults to the current month/year when not provided', async () => {
            mock.method(kpiRepository, 'getDriverVehicleGroupId', async () => ({ vehicle_group_id: 5, vehicle_group_name: '5m2' }));
            mock.method(kpiRepository, 'getLeaderboard', async () => []);

            const now = new Date();
            const result = await kpiService.getLeaderboard(1, {});

            assert.strictEqual(result.month, now.getMonth() + 1);
            assert.strictEqual(result.year, now.getFullYear());
        });
    });

    describe('getAllDriversKPI()', () => {
        it('rejects month out of range', async () => {
            await assert.rejects(
                () => kpiService.getAllDriversKPI({ month: 15 }),
                { message: 'Tháng không hợp lệ (1-12)' },
            );
        });

        it('passes vehicleGroupId filter through when provided', async () => {
            mock.method(kpiRepository, 'getAllDriversKPI', async (opts) => {
                assert.strictEqual(opts.vehicleGroupId, 5);
                return [];
            });

            await kpiService.getAllDriversKPI({ month: 10, year: 2024, vehicleGroupId: 5 });
        });
    });

    describe('getDriverKPIById()', () => {
        it('requires a driverId', async () => {
            await assert.rejects(
                () => kpiService.getDriverKPIById(null, {}),
                { message: 'Driver ID là bắt buộc' },
            );
        });
    });

    describe('recalculateAfterCompletion() — BR-030 fire-and-forget', () => {
        it('triggers recalculation for each unique driver id, deduplicated', () => {
            const calls = [];
            mock.method(kpiRepository, 'recalculateDriverKPI', async (driverId, month, year) => {
                calls.push([driverId, month, year]);
            });

            kpiService.recalculateAfterCompletion([1, 1, 2], new Date('2024-10-15'));

            assert.deepStrictEqual(calls.sort(), [[1, 10, 2024], [2, 10, 2024]]);
        });

        it('accepts a single non-array driverId', () => {
            const calls = [];
            mock.method(kpiRepository, 'recalculateDriverKPI', async (driverId) => { calls.push(driverId); });

            kpiService.recalculateAfterCompletion(3, new Date('2024-10-15'));

            assert.deepStrictEqual(calls, [3]);
        });

        it('does not throw synchronously even if the repo call rejects (fire-and-forget)', () => {
            mock.method(kpiRepository, 'recalculateDriverKPI', async () => { throw new Error('DB down'); });

            assert.doesNotThrow(() => kpiService.recalculateAfterCompletion([1], new Date()));
        });
    });
});
