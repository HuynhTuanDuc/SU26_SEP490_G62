const { api, authHeader, getNotificationsForUsers, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'ManagerController', routeGuardCases.ManagerController);

const now = new Date();

/** Ghi thẳng yêu cầu ứng lương ở trạng thái pending — bỏ qua luật "chỉ ngày 25" của
 *  luồng tạo, vì ca này kiểm luồng DUYỆT của manager chứ không phải luồng gửi. */
const insertSalaryAdvance = async (driverId, { amount = 2_000_000, status = 'pending' } = {}) => {
    const { rows } = await getPool().query(
        `INSERT INTO salary_advances (driver_id, amount, reason, request_month, request_year, status)
         VALUES ($1, $2, 'Ung luong test', $3, $4, $5) RETURNING id`,
        [driverId, amount, now.getMonth() + 1, now.getFullYear(), status],
    );
    return rows[0].id;
};

const readSalaryAdvance = async (id) => {
    const { rows } = await getPool().query(
        'SELECT id, status, approved_by, amount FROM salary_advances WHERE id = $1', [id],
    );
    return rows[0];
};

describe('GET /api/manager/salary-advances', () => {
    it('TC-INT-ManagerController-002 — the manager sees the driver salary advance waiting for approval', async () => {
        const { accounts } = await seedDriverWorld();
        const advanceId = await insertSalaryAdvance(accounts.driver.id);

        const res = await api(ctx.app)
            .get('/api/manager/salary-advances')
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBe(200);
        expect(res.body.advances.map((a) => Number(a.id))).toContain(Number(advanceId));
    });
});

describe('PATCH /api/manager/salary-advances/:id/approve', () => {
    it('TC-INT-ManagerController-003 — approving an advance sets it to approved and notifies the driver', async () => {
        const { accounts } = await seedDriverWorld();
        const advanceId = await insertSalaryAdvance(accounts.driver.id, { amount: 2_500_000 });

        const res = await api(ctx.app)
            .patch(`/api/manager/salary-advances/${advanceId}/approve`)
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Đã phê duyệt yêu cầu ứng lương/i);

        const after = await readSalaryAdvance(advanceId);
        expect(after.status).toBe('approved');
        expect(Number(after.approved_by)).toBe(accounts.manager.id);

        const tb = await getNotificationsForUsers([accounts.driver.id], 'SALARY_ADVANCE_APPROVED');
        expect(tb).toHaveLength(1);
    });

    it('TC-INT-ManagerController-004 — an advance already processed cannot be approved again', async () => {
        const { accounts } = await seedDriverWorld();
        const advanceId = await insertSalaryAdvance(accounts.driver.id, { status: 'approved' });

        const res = await api(ctx.app)
            .patch(`/api/manager/salary-advances/${advanceId}/approve`)
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body.error).toMatch(/đã được xử lý/i);
    });

    it('TC-INT-ManagerController-005 — approving a non-existent advance returns a business error, not a server error', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .patch('/api/manager/salary-advances/999999/approve')
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
        expect(res.body.error).toMatch(/không tồn tại/i);
    });
});

describe('PATCH /api/manager/salary-advances/:id/reject', () => {
    it('TC-INT-ManagerController-006 — rejecting an advance sets it to rejected and the driver is notified', async () => {
        const { accounts } = await seedDriverWorld();
        const advanceId = await insertSalaryAdvance(accounts.driver.id);

        const res = await api(ctx.app)
            .patch(`/api/manager/salary-advances/${advanceId}/reject`)
            .set(authHeader(accounts.manager.token))
            .send({ reason: 'Thang nay da ung roi' });

        expect(res.status).toBe(200);
        expect((await readSalaryAdvance(advanceId)).status).toBe('rejected');

        const tb = await getNotificationsForUsers([accounts.driver.id]);
        expect(tb.map((n) => n.type)).toContain('SALARY_ADVANCE_REJECTED');
    });
});

describe('GET /api/manager/dashboard', () => {
    it('TC-INT-ManagerController-007 — the manager dashboard runs on an empty business dataset', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/manager/dashboard')
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.any(Object));
    });
});

describe('POST /api/manager/partners', () => {
    it('TC-INT-ManagerController-008 — the manager creates a carrier partner and the row is stored in the database', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/manager/partners')
            .set(authHeader(accounts.manager.token))
            .send({
                company_name: 'Nhà xe Đối Tác A',
                phone: '0977000111',
                address: 'Hà Nội',
                payment_term_days: 30,
            });

        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);

        const { rows } = await getPool().query(
            'SELECT company_name, phone, payment_term_days FROM partners WHERE company_name = $1',
            ['Nhà xe Đối Tác A'],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].phone).toBe('0977000111');
        expect(Number(rows[0].payment_term_days)).toBe(30);
    });

    it('TC-INT-ManagerController-009 — a missing partner name is refused and no row is written', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/manager/partners')
            .set(authHeader(accounts.manager.token))
            .send({ phone: '0977000112' });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body.error).toMatch(/Tên đối tác là bắt buộc/i);

        const { rows } = await getPool().query('SELECT COUNT(*)::int AS n FROM partners');
        expect(rows[0].n).toBe(0);
    });

    it('TC-INT-ManagerController-010 — a payment term outside 0-365 days is rejected', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/manager/partners')
            .set(authHeader(accounts.manager.token))
            .send({ company_name: 'Đối Tác Hạn Lỗi', payment_term_days: 400 });

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body.error).toMatch(/Hạn thanh toán không hợp lệ/i);
    });
});
