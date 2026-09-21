const { api, authHeader, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'AccountantDebtController', routeGuardCases.AccountantDebtController);

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const dayOffsetFromToday = (soNgay) => {
    const d = new Date();
    d.setDate(d.getDate() + soNgay);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const manualDebtPayload = (driverId, ghiDe = {}) => ({
    debt_type: 'driver',
    owner_id: driverId,
    total_amount: 1_200_000,
    incurred_on: dayOffsetFromToday(-10),
    due_date: dayOffsetFromToday(20),
    notes: 'Tai xe lam vo hang, tru dan vao luong',
    ...ghiDe,
});

const countDebts = async () => {
    const { rows } = await getPool().query('SELECT COUNT(*)::int AS n FROM debts');
    return rows[0].n;
};

describe('POST /accountant/debts/manual', () => {
    it('TC-INT-AccountantDebtController-001 — accountant records a manual driver debt and the row lands in the debts table', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/accountant/debts/manual')
            .set(authHeader(accounts.accountant.token))
            .send(manualDebtPayload(accounts.driver.id));

        expect(res.status).toBe(201);
        expect(res.body.message).toMatch(/Đã ghi nhận công nợ/i);

        const { rows } = await getPool().query(
            'SELECT debt_type, driver_id, total_amount, notes FROM debts WHERE id = $1',
            [res.body.debt.id],
        );
        expect(rows[0].debt_type).toBe('driver');
        expect(Number(rows[0].driver_id)).toBe(accounts.driver.id);
        expect(Number(rows[0].total_amount)).toBe(1_200_000);
    });

    it('TC-INT-AccountantDebtController-002 — a future incurred date is rejected so debt age can never be negative', async () => {
        const { accounts } = await seedDriverWorld();
        const before = await countDebts();

        const res = await api(ctx.app)
            .post('/accountant/debts/manual')
            .set(authHeader(accounts.accountant.token))
            .send(manualDebtPayload(accounts.driver.id, { incurred_on: dayOffsetFromToday(3) }));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Ngày phát sinh không được ở tương lai/i);
        expect(await countDebts()).toBe(before);
    });

    it('TC-INT-AccountantDebtController-003 — a due date earlier than the incurred date is rejected', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/accountant/debts/manual')
            .set(authHeader(accounts.accountant.token))
            .send(manualDebtPayload(accounts.driver.id, {
                incurred_on: today(),
                due_date: dayOffsetFromToday(-5),
            }));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Hạn thanh toán không được trước ngày phát sinh/i);
    });

    it('TC-INT-AccountantDebtController-004 — a manual debt without a written reason is refused', async () => {
        const { accounts } = await seedDriverWorld();
        const before = await countDebts();

        const res = await api(ctx.app)
            .post('/accountant/debts/manual')
            .set(authHeader(accounts.accountant.token))
            .send(manualDebtPayload(accounts.driver.id, { notes: '   ' }));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Cần ghi rõ lý do \/ diễn giải/i);
        expect(await countDebts()).toBe(before);
    });

    it('TC-INT-AccountantDebtController-005 — a zero or negative debt amount is rejected', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/accountant/debts/manual')
            .set(authHeader(accounts.accountant.token))
            .send(manualDebtPayload(accounts.driver.id, { total_amount: 0 }));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Số tiền công nợ/i);
    });
});

describe('GET /accountant/debts/owners', () => {
    it('TC-INT-AccountantDebtController-006 — the debt owner picker finds drivers that exist in the system', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/accountant/debts/owners?type=driver')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toMatch(/Tài Xế Một/);
    });

    it('TC-INT-AccountantDebtController-007 — a missing type parameter returns an input error instead of breaking the query', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/accountant/debts/owners')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
    });
});

describe('DELETE /accountant/debts/manual/:id', () => {
    it('TC-INT-AccountantDebtController-008 — a manual debt with no payment yet can be deleted', async () => {
        const { accounts } = await seedDriverWorld();
        const createRes = await api(ctx.app)
            .post('/accountant/debts/manual')
            .set(authHeader(accounts.accountant.token))
            .send(manualDebtPayload(accounts.driver.id));

        const res = await api(ctx.app)
            .delete(`/accountant/debts/manual/${createRes.body.debt.id}`)
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(200);
        const { rows } = await getPool().query(
            'SELECT COUNT(*)::int AS n FROM debts WHERE id = $1', [createRes.body.debt.id],
        );
        expect(rows[0].n).toBe(0);
    });
});
