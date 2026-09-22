const { api, authHeader, upsertCompanyInfo, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

describe('GET /api/company/info', () => {
    it('TC-INT-CompanyController-001 — returns the stored company banking information to authenticated users', async () => {
        const { accounts } = await seedDriverWorld();
        await upsertCompanyInfo({
            companyName: 'LogisCount HQ',
            hotline: '19009999',
            bankName: 'ACB',
            bankAccountNumber: '999999',
            bankAccountName: 'LOGISCOUNT HQ',
            updatedBy: accounts.manager.id,
        });

        const res = await api(ctx.app)
            .get('/api/company/info')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.info).toMatchObject({
            company_name: 'LogisCount HQ',
            hotline: '19009999',
            bank_name: 'ACB',
        });
    });
});

runRouteGuardSuite(ctx, 'CompanyController', routeGuardCases.CompanyController);

describe('PUT /api/company/info', () => {
    it('TC-INT-CompanyController-002 — allows the manager to upsert company information through the protected route', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .put('/api/company/info')
            .set(authHeader(accounts.manager.token))
            .send({
                company_name: 'Cong ty Van tai Moi',
                hotline: '19001212',
                bank_name: 'VCB',
                bank_account_number: '123123123',
                bank_account_name: 'CTY VAN TAI MOI',
            });

        expect(res.status).toBe(200);
        expect(res.body.info).toMatchObject({
            company_name: 'Cong ty Van tai Moi',
            hotline: '19001212',
            bank_name: 'VCB',
        });
    });
});
