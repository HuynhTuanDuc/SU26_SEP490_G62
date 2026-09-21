const { api, authHeader, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

describe('GET /api/drivers/me/vehicle', () => {
    it('TC-INT-DriverController-001 — returns the vehicle assigned to the authenticated driver', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/drivers/me/vehicle')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.vehicle).toMatchObject({
            plate_number: '51C-100.01',
            vehicle_group_name: '5m2',
        });
    });
});

runRouteGuardSuite(ctx, 'DriverController', routeGuardCases.DriverController);

describe('GET /api/drivers', () => {
    it('TC-INT-DriverController-002 — lets staff roles list the currently seeded drivers with vehicle assignments', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/drivers')
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBe(200);
        expect(res.body.drivers).toEqual(expect.arrayContaining([
            expect.objectContaining({
                email: 'driver1@l2.test',
                plate_number: '51C-100.01',
            }),
            expect.objectContaining({
                email: 'driver2@l2.test',
                plate_number: '51C-100.02',
            }),
        ]));
    });
});
