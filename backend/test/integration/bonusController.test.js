const { api, authHeader, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'BonusController', routeGuardCases.BonusController);

const readBonus = async (id) => {
    const { rows } = await getPool().query(
        'SELECT id, driver_id, type, amount, status FROM driver_bonuses WHERE id = $1', [id],
    );
    return rows[0];
};

const createWelfareBonus = (app, token, body) => api(app)
    .post('/api/bonuses')
    .set(authHeader(token))
    .send(body);

describe('POST /api/bonuses', () => {
    it('TC-INT-BonusController-001 — birthday welfare is fixed at 200,000 VND and ignores any amount sent by the client', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await createWelfareBonus(ctx.app, accounts.manager.token, {
            driver_id: accounts.driver.id,
            type: 'welfare_birthday',
            amount: 9_999_999,
            notes: 'Sinh nhat thang nay',
        });

        expect(res.status).toBe(201);
        const stored = await readBonus(res.body.bonus.id);
        expect(Number(stored.amount)).toBe(200_000);
        expect(Number(stored.driver_id)).toBe(accounts.driver.id);
        // Quản lý tự tạo thì hệ thống duyệt luôn, không bắt duyệt lại phiếu của chính mình.
        expect(stored.status).toBe('approved');
    });

    it('TC-INT-BonusController-002 — wedding welfare is fixed at 1,000,000 VND', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await createWelfareBonus(ctx.app, accounts.manager.token, {
            driver_id: accounts.driver.id,
            type: 'welfare_wedding',
        });

        expect(res.status).toBe(201);
        expect(Number((await readBonus(res.body.bonus.id)).amount)).toBe(1_000_000);
    });

    it('TC-INT-BonusController-003 — funeral welfare without the family relation cannot resolve an amount and is refused', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await createWelfareBonus(ctx.app, accounts.manager.token, {
            driver_id: accounts.driver.id,
            type: 'welfare_funeral',
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body.error).toMatch(/quan hệ người thân/i);
    });

    it('TC-INT-BonusController-004 — a bonus type outside the catalogue is rejected at the controller', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await createWelfareBonus(ctx.app, accounts.manager.token, {
            driver_id: accounts.driver.id,
            type: 'thuong_tuy_hung',
            amount: 500000,
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Loại thưởng không hợp lệ/i);
    });

    it('TC-INT-BonusController-005 — Tet bonus must go through the batch generator and cannot be created one by one', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await createWelfareBonus(ctx.app, accounts.manager.token, {
            driver_id: accounts.driver.id,
            type: 'tet_annual',
            amount: 3_000_000,
        });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body.error).toMatch(/tạo hàng loạt/i);
    });
});

describe('Bonus approval and payout workflow', () => {
    it('TC-INT-BonusController-006 — a bonus raised by the accountant waits for approval and moves pending to approved to paid', async () => {
        const { accounts } = await seedDriverWorld();
        const createRes = await createWelfareBonus(ctx.app, accounts.accountant.token, {
            driver_id: accounts.driver.id,
            type: 'special',
            amount: 750_000,
            notes: 'Thuong chuyen kho',
        });
        expect(createRes.status).toBe(201);
        const bonusId = createRes.body.bonus.id;
        expect((await readBonus(bonusId)).status).toBe('pending');

        const approveRes = await api(ctx.app)
            .patch(`/api/bonuses/${bonusId}/approve`)
            .set(authHeader(accounts.manager.token));
        expect(approveRes.status).toBe(200);
        expect((await readBonus(bonusId)).status).toBe('approved');

        const payRes = await api(ctx.app)
            .patch(`/api/bonuses/${bonusId}/pay`)
            .set(authHeader(accounts.accountant.token));
        expect(payRes.status).toBe(200);
        expect((await readBonus(bonusId)).status).toBe('paid');
    });

    it('TC-INT-BonusController-010 — a bonus raised by the manager is approved immediately with no redundant approval step', async () => {
        const { accounts } = await seedDriverWorld();

        const createRes = await createWelfareBonus(ctx.app, accounts.manager.token, {
            driver_id: accounts.driver.id, type: 'special', amount: 600_000,
        });

        expect(createRes.status).toBe(201);
        expect(createRes.body.message).toMatch(/Tạo và duyệt/i);
        expect((await readBonus(createRes.body.bonus.id)).status).toBe('approved');
    });

    it('TC-INT-BonusController-007 — rejecting a bonus requires a written reason', async () => {
        const { accounts } = await seedDriverWorld();
        const createRes = await createWelfareBonus(ctx.app, accounts.accountant.token, {
            driver_id: accounts.driver.id, type: 'special', amount: 400_000,
        });

        const res = await api(ctx.app)
            .patch(`/api/bonuses/${createRes.body.bonus.id}/reject`)
            .set(authHeader(accounts.manager.token))
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Cần ghi lý do từ chối/i);
        expect((await readBonus(createRes.body.bonus.id)).status).toBe('pending');
    });

    it('TC-INT-BonusController-008 — the accountant cannot approve a bonus in the manager place', async () => {
        const { accounts } = await seedDriverWorld();
        const createRes = await createWelfareBonus(ctx.app, accounts.accountant.token, {
            driver_id: accounts.driver.id, type: 'special', amount: 400_000,
        });

        const res = await api(ctx.app)
            .patch(`/api/bonuses/${createRes.body.bonus.id}/approve`)
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(403);
        expect((await readBonus(createRes.body.bonus.id)).status).toBe('pending');
    });
});

describe('GET /api/bonuses/my', () => {
    it('TC-INT-BonusController-009 — a driver only sees their own bonus records', async () => {
        const { accounts } = await seedDriverWorld();
        const driver1Bonus = await createWelfareBonus(ctx.app, accounts.manager.token, {
            driver_id: accounts.driver.id, type: 'welfare_birthday',
        });
        const driver2Bonus = await createWelfareBonus(ctx.app, accounts.manager.token, {
            driver_id: accounts.driver2.id, type: 'welfare_birthday',
        });

        const res = await api(ctx.app)
            .get('/api/bonuses/my')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        const ids = res.body.bonuses.map((b) => Number(b.id));
        expect(ids).toContain(Number(driver1Bonus.body.bonus.id));
        expect(ids).not.toContain(Number(driver2Bonus.body.bonus.id));
    });
});
