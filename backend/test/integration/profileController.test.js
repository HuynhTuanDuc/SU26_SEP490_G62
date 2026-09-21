const { api, authHeader, getPool, getRoleName, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

describe('GET /api/profile/me', () => {
    it('TC-INT-ProfileController-001 — returns only the authenticated user profile', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/profile/me')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.profile).toMatchObject({
            id: accounts.driver.id,
            full_name: 'Tài Xế Một',
            phone: '0901000001',
            role: 'driver',
        });
    });
});

runRouteGuardSuite(ctx, 'ProfileController', routeGuardCases.ProfileController);

describe('PATCH /api/profile/me', () => {
    it('TC-INT-ProfileController-002 — updates allowed fields but ignores role escalation fields supplied in the body', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .patch('/api/profile/me')
            .set(authHeader(accounts.driver.token))
            .send({
                full_name: 'Tài Xế Đã Đổi Tên',
                role: 'manager',
                is_active: false,
            });

        expect(res.status).toBe(200);
        expect(res.body.profile.full_name).toBe('Tài Xế Đã Đổi Tên');
        expect(await getRoleName(accounts.driver.id)).toBe('driver');

        const { rows } = await getPool().query('SELECT is_active FROM accounts WHERE id = $1', [accounts.driver.id]);
        expect(rows[0].is_active).toBe(true);
    });

    it('TC-INT-ProfileController-003 — rejects a phone number already used by another account', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .patch('/api/profile/me')
            .set(authHeader(accounts.driver.token))
            .send({ phone: '0901000002' });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Số điện thoại đã được sử dụng/i);
    });
});

describe('PATCH /api/profile/me/password', () => {
    it('TC-INT-ProfileController-004 — treats a wrong current password as a validation error, not an authentication loss', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .patch('/api/profile/me/password')
            .set(authHeader(accounts.driver.token))
            .send({
                currentPassword: 'SaiMatKhau@123',
                newPassword: 'MatKhauMoi@123',
            });

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/Mật khẩu hiện tại không đúng/i);
    });
});
