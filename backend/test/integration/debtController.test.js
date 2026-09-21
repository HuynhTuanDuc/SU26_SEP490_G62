const { api, attachImage, authHeader, insertDriverDebt, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

const homQua = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('GET /api/debts/summary', () => {
    it('TC-INT-DebtController-001 — aggregates the remaining and overdue amount of driver debts', async () => {
        const { accounts } = await seedDriverWorld();
        await insertDriverDebt({
            driverId: accounts.driver.id,
            totalAmount: 550000,
            dueDate: homQua(),
        });

        const res = await api(ctx.app)
            .get('/api/debts/summary')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(Number(res.body.open_count)).toBe(1);
        expect(Number(res.body.total_remaining)).toBe(550000);
        expect(Number(res.body.overdue_remaining)).toBe(550000);
    });
});

runRouteGuardSuite(ctx, 'DebtController', routeGuardCases.DebtController);

describe('POST /api/debts/:id/repayments', () => {
    it('TC-INT-DebtController-002 — validates the required amount field before creating a debt repayment request', async () => {
        const { accounts } = await seedDriverWorld();
        const debt = await insertDriverDebt({
            driverId: accounts.driver.id,
            totalAmount: 550000,
            dueDate: homQua(),
        });

        const res = await attachImage(
            api(ctx.app)
                .post(`/api/debts/${debt.id}/repayments`)
                .set(authHeader(accounts.driver.token))
                .field('paymentMethod', 'cash'),
            'receipt',
        );

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Số tiền là bắt buộc/i);
    });
});

describe('GET /api/debts/repayments/pending', () => {
    it('TC-INT-DebtController-003 — lets finance roles inspect the global pending repayment queue', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/debts/repayments/pending')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.repayments)).toBe(true);
    });
});
