const { api, authHeader, seedDriverWorld, setupL2Suite } = require('./support');

const ctx = setupL2Suite();

describe('GET /accountant/finance/stats', () => {
    it('TC-INT-AccountantFinanceController-001 — the finance dashboard returns every total as a number even on an empty dataset', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/accountant/finance/stats')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            total_gross_revenue: expect.any(Number),
            total_revenue: expect.any(Number),
            total_receivables: expect.any(Number),
        });
    });
});
