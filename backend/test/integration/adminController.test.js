const { api, authHeader, getPool, getRoleName, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'AdminController', routeGuardCases.AdminController);

const readAccount = async (id) => {
    const { rows } = await getPool().query(
        `SELECT a.id, a.email, a.is_active, p.full_name, p.phone
           FROM accounts a JOIN profiles p ON p.id = a.id
          WHERE a.id = $1`,
        [id],
    );
    return rows[0];
};

describe('POST /api/admin/users', () => {
    it('TC-INT-AdminController-002 — the manager creates a staff account and the profile is stored in the database', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/admin/users')
            .set(authHeader(accounts.manager.token))
            .send({
                email: 'tai.moi@l2.test',
                full_name: 'Tài Xế Mới',
                phone: '0901000777',
                role: 'driver',
            });

        expect(res.status).toBe(201);
        expect(res.body.welcome_email_sent).toBe(true);
        // Có email thì mật khẩu đi theo đường mail — cố ý KHÔNG trả về response/log.
        expect(res.body.initial_password).toBeNull();

        const createdAccount = await readAccount(res.body.id);
        expect(createdAccount.email).toBe('tai.moi@l2.test');
        expect(createdAccount.is_active).toBe(true);
        expect(await getRoleName(res.body.id)).toBe('driver');
    });

    it('TC-INT-AdminController-007 — a staff member without an email gets the initial password returned once so it can be handed over in person', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/admin/users')
            .set(authHeader(accounts.manager.token))
            .send({ full_name: 'Nhân Viên Kho', phone: '0901000780', role: 'coordinator' });

        expect(res.status).toBe(201);
        expect(res.body.welcome_email_sent).toBe(false);
        expect(res.body.initial_password).toEqual(expect.any(String));
        expect(res.body.initial_password.length).toBeGreaterThan(0);

        const createdAccount = await readAccount(res.body.id);
        expect(createdAccount.email).toBeNull();
        expect(await getRoleName(res.body.id)).toBe('coordinator');
    });

    it('TC-INT-AdminController-003 — a missing role is refused and no account row is created', async () => {
        const { accounts } = await seedDriverWorld();
        const { rows: before } = await getPool().query('SELECT COUNT(*)::int AS n FROM accounts');

        const res = await api(ctx.app)
            .post('/api/admin/users')
            .set(authHeader(accounts.manager.token))
            .send({ email: 'thieu.role@l2.test', full_name: 'Thiếu Vai Trò', phone: '0901000778' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Thiếu thông tin bắt buộc \(role\)/i);

        const { rows: after } = await getPool().query('SELECT COUNT(*)::int AS n FROM accounts');
        expect(after[0].n).toBe(before[0].n);
    });

    it('TC-INT-AdminController-004 — an existing email returns 409 and no duplicate row is created', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/admin/users')
            .set(authHeader(accounts.manager.token))
            .send({
                email: 'driver1@l2.test',
                full_name: 'Trùng Email',
                phone: '0901000779',
                role: 'driver',
            });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Email đã tồn tại/i);

        const { rows } = await getPool().query(
            'SELECT COUNT(*)::int AS n FROM accounts WHERE email = $1', ['driver1@l2.test'],
        );
        expect(rows[0].n).toBe(1);
    });
});

describe('PATCH /api/admin/users/:id/status', () => {
    it('TC-INT-AdminController-005 — locking a driver account flips is_active to false in the database', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .patch(`/api/admin/users/${accounts.driver.id}/status`)
            .set(authHeader(accounts.manager.token))
            .send({ is_active: false });

        expect(res.status).toBe(200);
        expect((await readAccount(accounts.driver.id)).is_active).toBe(false);
    });

    it('TC-INT-AdminController-006 — the manager cannot lock their own account', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .patch(`/api/admin/users/${accounts.manager.id}/status`)
            .set(authHeader(accounts.manager.token))
            .send({ is_active: false });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Không thể tự khóa tài khoản của chính mình/i);
        expect((await readAccount(accounts.manager.id)).is_active).toBe(true);
    });
});

describe('GET /api/admin/users', () => {
    it('TC-INT-AdminController-001 — the manager lists every user across all roles', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/admin/users')
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBe(200);
        expect(res.body.users).toEqual(expect.arrayContaining([
            expect.objectContaining({ email: accounts.driver.email }),
            expect.objectContaining({ email: accounts.coordinator.email }),
            expect.objectContaining({ email: accounts.accountant.email }),
        ]));
    });
});
