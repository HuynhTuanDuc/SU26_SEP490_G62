const { api, authHeader, seedDriverWorld, setAccountActive, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

describe('POST /auth/login', () => {
    it('TC-INT-AuthController-001 — logs in with a correct email and password and returns cookies for the session', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/auth/login')
            .send({ identifier: accounts.driver.email, password: accounts.driver.password });

        expect(res.status).toBe(200);
        expect(res.body.token).toEqual(expect.any(String));
        expect(res.body.user).toMatchObject({
            id: accounts.driver.id,
            email: accounts.driver.email,
            role: 'driver',
        });
        expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
            expect.stringContaining('auth_token='),
            expect.stringContaining('refresh_token='),
            expect.stringContaining('csrf_token='),
        ]));
    });

    it('TC-INT-AuthController-002A — logs in by local phone number format 0901000001', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/auth/login')
            .send({ identifier: '0901000001', password: accounts.driver.password });

        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({
            id: accounts.driver.id,
            role: 'driver',
        });
    });

    it('TC-INT-AuthController-002B — logs in by international phone number format +84901000001', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/auth/login')
            .send({ identifier: '+84901000001', password: accounts.driver.password });

        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({
            id: accounts.driver.id,
            role: 'driver',
        });
    });

    it('TC-INT-AuthController-003 — rejects a locked account before issuing any session token', async () => {
        const { accounts } = await seedDriverWorld();
        await setAccountActive(accounts.driver.id, false);

        const res = await api(ctx.app)
            .post('/auth/login')
            .send({ identifier: accounts.driver.email, password: accounts.driver.password });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/khóa/i);
        expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('TC-INT-AuthController-004 — validates the password field at the route layer and returns 400 when it is missing', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/auth/login')
            .send({ identifier: accounts.driver.email });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Mật khẩu là bắt buộc/i);
    });
});

runRouteGuardSuite(ctx, 'AuthController', routeGuardCases.AuthController);

describe('GET /auth/me', () => {
    it('TC-INT-AuthController-005 — refuses a request with no access token', async () => {
        await seedDriverWorld();

        const res = await api(ctx.app).get('/auth/me');

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'NO_TOKEN' });
    });

    it('TC-INT-AuthController-006 — returns the profile of the authenticated account', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/auth/me')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            id: accounts.driver.id,
            email: accounts.driver.email,
            role: 'driver',
            phone: '0901000001',
        });
    });
});
