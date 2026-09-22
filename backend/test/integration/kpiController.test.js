const { api, authHeader, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

describe('GET /api/kpi/me', () => {
    it('TC-INT-KPIController-001 — returns the personal KPI payload for the authenticated driver', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        expect(driverVehicle.groupId).toBeTruthy();

        const res = await api(ctx.app)
            .get('/api/kpi/me')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('kpi');
    });
});

runRouteGuardSuite(ctx, 'KpiController', routeGuardCases.KpiController);

describe('GET /api/kpi/leaderboard', () => {
    it('TC-INT-KPIController-002 — returns the leaderboard of the authenticated driver vehicle group', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/kpi/leaderboard')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.vehicle_group_name).toBe('5m2');
        expect(Array.isArray(res.body.leaderboard)).toBe(true);
    });
});

describe('GET /api/kpi/driver/:driverId', () => {
    it('TC-INT-KPIController-003 — validates the driver id at the route layer for finance staff endpoints', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/kpi/driver/abc')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Driver ID không hợp lệ/i);
    });
});
