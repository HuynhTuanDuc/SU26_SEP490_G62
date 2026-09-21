const { api, authHeader, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'BonusRuleController', routeGuardCases.BonusRuleController);

const docRule = async (id) => {
    const { rows } = await getPool().query(
        'SELECT id, title, bonus_type, reward_amount, reward_multiplier, is_active FROM bonus_rules WHERE id = $1',
        [id],
    );
    return rows[0];
};

const countRules = async () => {
    const { rows } = await getPool().query('SELECT COUNT(*)::int AS n FROM bonus_rules');
    return rows[0].n;
};

describe('POST /api/bonus-rules', () => {
    it('TC-INT-BonusRuleController-001 — the manager creates a KPI bonus rule and the reward amount is stored correctly', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/bonus-rules')
            .set(authHeader(accounts.manager.token))
            .send({
                title: 'Thưởng KPI nhóm 5m2',
                bonus_type: 'kpi',
                vehicle_group_id: driverVehicle.groupId,
                reward_amount: 500000,
                conditions_json: { min_revenue: 20000000 },
            });

        expect(res.status).toBe(201);
        const stored = await docRule(res.body.rule.id);
        expect(stored.title).toBe('Thưởng KPI nhóm 5m2');
        expect(stored.bonus_type).toBe('kpi');
        expect(Number(stored.reward_amount)).toBe(500000);
        expect(stored.is_active).toBe(true);
    });

    it('TC-INT-BonusRuleController-002 — a bonus type outside the catalogue is rejected and no rule row is written', async () => {
        const { accounts } = await seedDriverWorld();
        const before = await countRules();

        const res = await api(ctx.app)
            .post('/api/bonus-rules')
            .set(authHeader(accounts.manager.token))
            .send({ title: 'Thưởng lạ', bonus_type: 'thuong_tet', reward_amount: 100000 });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Loại thưởng không hợp lệ/i);
        expect(await countRules()).toBe(before);
    });

    it('TC-INT-BonusRuleController-003 — a bonus type the payroll engine does not read cannot be enabled, keeping dead rules out of the database', async () => {
        const { accounts } = await seedDriverWorld();
        const before = await countRules();

        const res = await api(ctx.app)
            .post('/api/bonus-rules')
            .set(authHeader(accounts.manager.token))
            .send({ title: 'Thưởng top chuyến', bonus_type: 'top_trips', reward_amount: 300000 });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/chưa được bộ tính lương hỗ trợ/i);
        expect(res.body.error).toMatch(/kpi, top_revenue, holiday/);
        expect(await countRules()).toBe(before);
    });

    it('TC-INT-BonusRuleController-004 — an active rule with neither an amount nor a multiplier is rejected', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/bonus-rules')
            .set(authHeader(accounts.manager.token))
            .send({ title: 'Thưởng rỗng', bonus_type: 'kpi' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Cần nhập ít nhất Số tiền thưởng hoặc Hệ số thưởng/i);
    });

    it('TC-INT-BonusRuleController-005 — a rule created as inactive skips the content checks and is still stored', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/bonus-rules')
            .set(authHeader(accounts.manager.token))
            .send({ title: 'Thưởng top chuyến (tắt)', bonus_type: 'top_trips', is_active: false });

        expect(res.status).toBe(201);
        const stored = await docRule(res.body.rule.id);
        expect(stored.is_active).toBe(false);
        expect(stored.bonus_type).toBe('top_trips');
    });

    it('TC-INT-BonusRuleController-006 — the accountant has read access only and cannot create a bonus rule', async () => {
        const { accounts } = await seedDriverWorld();

        const readRes = await api(ctx.app)
            .get('/api/bonus-rules')
            .set(authHeader(accounts.accountant.token));
        expect(readRes.status).toBe(200);
        expect(readRes.body.bonusTypes.implemented).toEqual(['kpi', 'top_revenue', 'holiday']);

        const writeRes = await api(ctx.app)
            .post('/api/bonus-rules')
            .set(authHeader(accounts.accountant.token))
            .send({ title: 'Kế toán tự tạo', bonus_type: 'kpi', reward_amount: 100000 });
        expect(writeRes.status).toBe(403);
    });
});
