const { api, authHeader, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

describe('GET /api/payroll/me', () => {
    it('TC-INT-PayrollController-001 — returns the payroll list of the authenticated driver even when it is still empty', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/payroll/me')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.payrolls)).toBe(true);
    });
});

runRouteGuardSuite(ctx, 'PayrollController', routeGuardCases.PayrollController);

describe('POST /api/payroll/advance', () => {
    it('TC-INT-PayrollController-002 — validates required month and year before salary-advance rules are applied', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/payroll/advance')
            .set(authHeader(accounts.driver.token))
            .send({ amount: 1000000, reason: 'Ung luong gap' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Tháng và năm là bắt buộc/i);
    });
});

describe('GET /api/payroll/advance', () => {
    it('TC-INT-PayrollController-003 — returns the current driver salary-advance history endpoint successfully on an empty dataset', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/payroll/advance')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.advances)).toBe(true);
    });
});

// ─── UC-DRV-13 / BR-DRV-029, BR-DRV-030, BR-DRV-031 — ứng lương ────────────────────
describe('POST /api/payroll/advance — salary advance rules', () => {
    // requestSalaryAdvance đọc new Date().getDate() để chốt "ngày 25". Chỉ giả lập đúng
    // getDate: fake timer toàn cục sẽ đóng băng cả timeout của driver pg đang mở kết nối.
    const pinClockToDay25 = () => jest.spyOn(Date.prototype, 'getDate').mockReturnValue(25);

    const currentMonthAndYear = () => {
        const now = new Date();
        return { requestMonth: now.getMonth() + 1, requestYear: now.getFullYear() };
    };

    const countAdvanceRequests = async (driverId) => {
        const { rows } = await getPool().query(
            'SELECT id, amount, status FROM salary_advances WHERE driver_id = $1 ORDER BY id',
            [driverId],
        );
        return rows;
    };

    it('TC-INT-PayrollController-004 — an amount above the 5,000,000 VND cap is rejected and no row is written', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/payroll/advance')
            .set(authHeader(accounts.driver.token))
            .send({ amount: 5_000_001, reason: 'Ung qua han muc', ...currentMonthAndYear() });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/tối đa là 5\.000\.000/i);
        expect(await countAdvanceRequests(accounts.driver.id)).toHaveLength(0);
    });

    it('TC-INT-PayrollController-005 — a zero or negative amount is rejected ahead of every other rule', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/payroll/advance')
            .set(authHeader(accounts.driver.token))
            .send({ amount: 0, reason: 'Ung 0 dong', ...currentMonthAndYear() });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Số tiền phải lớn hơn 0/i);
        expect(await countAdvanceRequests(accounts.driver.id)).toHaveLength(0);
    });

    it('TC-INT-PayrollController-006 — an advance request cannot be submitted on any day other than the 25th', async () => {
        const { accounts } = await seedDriverWorld();
        const spy = jest.spyOn(Date.prototype, 'getDate').mockReturnValue(24);
        try {
            const res = await api(ctx.app)
                .post('/api/payroll/advance')
                .set(authHeader(accounts.driver.token))
                .send({ amount: 1_000_000, reason: 'Ung som', ...currentMonthAndYear() });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/chỉ được thực hiện vào ngày 25/i);
            expect(await countAdvanceRequests(accounts.driver.id)).toHaveLength(0);
        } finally {
            spy.mockRestore();
        }
    });

    it('TC-INT-PayrollController-007 — on the 25th and within the cap the request is created as pending and the manager is notified', async () => {
        const { accounts } = await seedDriverWorld();
        const spy = pinClockToDay25();
        try {
            const res = await api(ctx.app)
                .post('/api/payroll/advance')
                .set(authHeader(accounts.driver.token))
                .send({ amount: 3_000_000, reason: 'Ung luong thang nay', ...currentMonthAndYear() });

            expect(res.status).toBe(201);
            expect(res.body.message).toMatch(/Yêu cầu ứng lương đã được gửi/i);

            const stored = await countAdvanceRequests(accounts.driver.id);
            expect(stored).toHaveLength(1);
            expect(Number(stored[0].amount)).toBe(3_000_000);
            expect(stored[0].status).toBe('pending');

            const { rows: tb } = await getPool().query(
                `SELECT user_id, type FROM notifications
                  WHERE type = 'SALARY_ADVANCE_REQUESTED'`,
            );
            expect(tb.map((r) => Number(r.user_id))).toContain(accounts.manager.id);
        } finally {
            spy.mockRestore();
        }
    });

    it('TC-INT-PayrollController-008 — a second request that pushes the monthly total over the cap is rejected and the first stays untouched', async () => {
        const { accounts } = await seedDriverWorld();
        const spy = pinClockToDay25();
        try {
            const firstRequest = await api(ctx.app)
                .post('/api/payroll/advance')
                .set(authHeader(accounts.driver.token))
                .send({ amount: 3_000_000, reason: 'Lan 1', ...currentMonthAndYear() });
            expect(firstRequest.status).toBe(201);

            const after = await api(ctx.app)
                .post('/api/payroll/advance')
                .set(authHeader(accounts.driver.token))
                .send({ amount: 2_500_000, reason: 'Lan 2', ...currentMonthAndYear() });

            expect(after.status).toBe(400);
            expect(after.body.error).toMatch(/Tổng tiền ứng lương trong tháng không được vượt quá/i);
            expect(after.body.error).toMatch(/Còn có thể ứng: 2\.000\.000đ/);

            const stored = await countAdvanceRequests(accounts.driver.id);
            expect(stored).toHaveLength(1);
            expect(Number(stored[0].amount)).toBe(3_000_000);
        } finally {
            spy.mockRestore();
        }
    });

    it('TC-INT-PayrollController-009 — an advance may only target the current month, any other month is rejected', async () => {
        const { accounts } = await seedDriverWorld();
        const spy = pinClockToDay25();
        try {
            const { requestMonth, requestYear } = currentMonthAndYear();
            const thangKhac = requestMonth === 12 ? 1 : requestMonth + 1;

            const res = await api(ctx.app)
                .post('/api/payroll/advance')
                .set(authHeader(accounts.driver.token))
                .send({ amount: 1_000_000, reason: 'Ung thang sau', requestMonth: thangKhac, requestYear });

            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/Chi duoc ung luong cho thang hien tai/i);
            expect(await countAdvanceRequests(accounts.driver.id)).toHaveLength(0);
        } finally {
            spy.mockRestore();
        }
    });
});
