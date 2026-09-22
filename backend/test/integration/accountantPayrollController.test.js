const { api, authHeader, getNotificationsForUsers, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'AccountantPayrollController', routeGuardCases.AccountantPayrollController);

const now = new Date();

const insertSalaryAdvance = async (driverId, status = 'approved', amount = 2_000_000) => {
    const { rows } = await getPool().query(
        `INSERT INTO salary_advances (driver_id, amount, reason, request_month, request_year, status)
         VALUES ($1, $2, 'Ung luong test', $3, $4, $5) RETURNING id`,
        [driverId, amount, now.getMonth() + 1, now.getFullYear(), status],
    );
    return rows[0].id;
};

const readSalaryAdvance = async (id) => {
    const { rows } = await getPool().query(
        'SELECT status, paid_by, paid_at FROM salary_advances WHERE id = $1', [id],
    );
    return rows[0];
};

describe('GET /accountant/payroll/advances', () => {
    it('TC-INT-AccountantPayrollController-001 — accountant filters approved salary advances waiting for disbursement', async () => {
        const { accounts } = await seedDriverWorld();
        const approvedLeave = await insertSalaryAdvance(accounts.driver.id, 'approved');
        const conCho = await insertSalaryAdvance(accounts.driver2.id, 'pending');

        const res = await api(ctx.app)
            .get('/accountant/payroll/advances?status=approved')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(200);
        const ids = res.body.advances.map((a) => Number(a.id));
        expect(ids).toContain(Number(approvedLeave));
        expect(ids).not.toContain(Number(conCho));
    });

    it('TC-INT-AccountantPayrollController-002 — a status filter outside the allowed set is rejected', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/accountant/payroll/advances?status=dang_cho_sep')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Trạng thái ứng lương/i);
    });

    it('TC-INT-AccountantPayrollController-003 — filtering by month without a year returns an explicit error', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/accountant/payroll/advances?month=8')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/cung cấp năm khi lọc theo tháng/i);
    });
});

describe('PATCH /accountant/payroll/advances/:id/disburse', () => {
    it('TC-INT-AccountantPayrollController-004 — disbursing an approved advance sets it to paid, records the payer and notifies the driver', async () => {
        const { accounts } = await seedDriverWorld();
        const advanceId = await insertSalaryAdvance(accounts.driver.id, 'approved', 1_500_000);

        const res = await api(ctx.app)
            .patch(`/accountant/payroll/advances/${advanceId}/disburse`)
            .set(authHeader(accounts.accountant.token))
            .send({ notes: 'Chi tien mat tai van phong' });

        expect(res.status).toBe(200);

        const after = await readSalaryAdvance(advanceId);
        expect(after.status).toBe('paid');
        expect(Number(after.paid_by)).toBe(accounts.accountant.id);
        expect(after.paid_at).not.toBeNull();

        const tb = await getNotificationsForUsers([accounts.driver.id]);
        expect(tb.map((n) => n.title)).toContain('Ứng lương đã được giải ngân');
    });

    it('TC-INT-AccountantPayrollController-005 — an advance the manager has not approved cannot be disbursed', async () => {
        const { accounts } = await seedDriverWorld();
        const advanceId = await insertSalaryAdvance(accounts.driver.id, 'pending');

        const res = await api(ctx.app)
            .patch(`/accountant/payroll/advances/${advanceId}/disburse`)
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body.error).toMatch(/chưa được manager duyệt/i);
        expect((await readSalaryAdvance(advanceId)).status).toBe('pending');
    });

    it('TC-INT-AccountantPayrollController-006 — a note longer than 500 characters is rejected before touching the database', async () => {
        const { accounts } = await seedDriverWorld();
        const advanceId = await insertSalaryAdvance(accounts.driver.id, 'approved');

        const res = await api(ctx.app)
            .patch(`/accountant/payroll/advances/${advanceId}/disburse`)
            .set(authHeader(accounts.accountant.token))
            .send({ notes: 'x'.repeat(501) });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/không được vượt quá 500 ký tự/i);
        expect((await readSalaryAdvance(advanceId)).status).toBe('approved');
    });
});

describe('GET /accountant/payroll', () => {
    it('TC-INT-AccountantPayrollController-007 — the payroll list responds successfully on an empty dataset', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/accountant/payroll')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.any(Object));
    });
});
