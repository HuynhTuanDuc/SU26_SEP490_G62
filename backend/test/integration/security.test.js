const jwt = require('jsonwebtoken');
const { api, authHeader, domain, getRoleName, seedDriverWorld, setupL2Suite } = require('./support');

const ctx = setupL2Suite();

describe('NFR-SEC — authentication', () => {
    it('TC-SEC-001 — GET /auth/me refuses an unauthenticated request', async () => {
        await seedDriverWorld();

        const res = await api(ctx.app).get('/auth/me');

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('NO_TOKEN');
    });

    it('TC-SEC-002 — GET /api/profile/me refuses an unauthenticated request', async () => {
        await seedDriverWorld();

        const res = await api(ctx.app).get('/api/profile/me');

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('NO_TOKEN');
    });

    it('TC-SEC-003 — GET /api/trips/pool refuses an unauthenticated request', async () => {
        await seedDriverWorld();

        const res = await api(ctx.app).get('/api/trips/pool');

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('NO_TOKEN');
    });

    it('TC-SEC-004 — GET /api/notifications refuses an unauthenticated request', async () => {
        await seedDriverWorld();

        const res = await api(ctx.app).get('/api/notifications');

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('NO_TOKEN');
    });

    it('TC-SEC-005 — a token signed with a foreign secret is refused instead of being treated as anonymous access', async () => {
        const { accounts } = await seedDriverWorld();
        const tokenGiaMao = jwt.sign(
            { userId: accounts.driver.id, email: accounts.driver.email, role: 'driver', tokenType: 'access' },
            'secret-gia-mao',
            { expiresIn: '1h' },
        );

        const res = await api(ctx.app)
            .get('/auth/me')
            .set(authHeader(tokenGiaMao));

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/invalid/i);
    });
});

describe('GB — role-based authorisation', () => {
    it('TC-SEC-006 — a driver cannot reach the coordinator trip pool endpoint', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/coordinator/trip-pool')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/Quyền hạn không đủ/i);
    });

    it('TC-SEC-007 — a coordinator cannot claim a trip through the driver-only endpoint', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
        });

        const res = await api(ctx.app)
            .post(`/api/trips/${shipment.shipmentId}/claim`)
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/Quyền hạn không đủ/i);
    });

    it('TC-SEC-008 — a driver cannot escalate their own role through the profile update endpoint', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .patch('/api/profile/me')
            .set(authHeader(accounts.driver.token))
            .send({ role: 'manager', role_id: 999, full_name: 'Driver Van La Driver' });

        expect(res.status).toBe(200);
        expect(res.body.profile.full_name).toBe('Driver Van La Driver');
        expect(await getRoleName(accounts.driver.id)).toBe('driver');
    });
});
