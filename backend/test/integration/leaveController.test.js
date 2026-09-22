const { api, authHeader, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

const tomorrow = () => {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
};

describe('POST /api/leave + GET /api/leave/me', () => {
    it('TC-INT-LeaveController-001 — creates a future leave request and returns it in the driver leave list', async () => {
        const { accounts } = await seedDriverWorld();
        const leaveDate = tomorrow();

        const created = await api(ctx.app)
            .post('/api/leave')
            .set(authHeader(accounts.driver.token))
            .send({ leaveDate, leaveType: 'paid', reason: 'Xin nghi viec gia dinh' });

        expect(created.status).toBe(201);
        expect(created.body.leave).toMatchObject({
            driver_id: accounts.driver.id,
            leave_type: 'paid',
            status: 'approved',
        });

        const listed = await api(ctx.app)
            .get('/api/leave/me')
            .set(authHeader(accounts.driver.token));

        expect(listed.status).toBe(200);
        expect(listed.body.leaves).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: created.body.leave.id,
                leave_type: 'paid',
            }),
        ]));
    });
});

runRouteGuardSuite(ctx, 'LeaveController', routeGuardCases.LeaveController);

describe('GET /api/leave/summary', () => {
    it('TC-INT-LeaveController-002 — summarizes approved unpaid leave of the current month', async () => {
        const { accounts } = await seedDriverWorld();
        const leaveDate = tomorrow();

        await api(ctx.app)
            .post('/api/leave')
            .set(authHeader(accounts.driver.token))
            .send({ leaveDate, leaveType: 'unpaid', reason: 'Nghi ca nhan' });

        const now = new Date();
        const res = await api(ctx.app)
            .get(`/api/leave/summary?month=${now.getMonth() + 1}&year=${now.getFullYear()}`)
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(Number(res.body.total_leaves)).toBeGreaterThanOrEqual(1);
        expect(Number(res.body.unpaid_days)).toBeGreaterThanOrEqual(1);
    });
});

describe('DELETE /api/leave/:id', () => {
    it('TC-INT-LeaveController-003 — cancels a future leave request owned by the driver', async () => {
        const { accounts } = await seedDriverWorld();
        const leaveDate = tomorrow();

        const created = await api(ctx.app)
            .post('/api/leave')
            .set(authHeader(accounts.driver.token))
            .send({ leaveDate, leaveType: 'paid', reason: 'Xin nghi mot ngay' });

        const res = await api(ctx.app)
            .delete(`/api/leave/${created.body.leave.id}`)
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Đã huỷ đăng ký nghỉ/i);

        const { rows } = await getPool().query('SELECT COUNT(*)::int AS count FROM leave_requests WHERE id = $1', [created.body.leave.id]);
        expect(rows[0].count).toBe(0);
    });
});

describe('GET /api/leave/me — personal data scope', () => {
    it('TC-INT-LeaveController-004 — returns only the leave requests of the signed-in driver, never another driver rows', async () => {
        const { accounts } = await seedDriverWorld();
        const leaveDate = tomorrow();

        const myLeave = await api(ctx.app)
            .post('/api/leave')
            .set(authHeader(accounts.driver.token))
            .send({ leaveDate, leaveType: 'unpaid', reason: 'Viec rieng' });
        expect(myLeave.status).toBe(201);

        const otherDriverLeave = await api(ctx.app)
            .post('/api/leave')
            .set(authHeader(accounts.driver2.token))
            .send({ leaveDate, leaveType: 'unpaid', reason: 'Viec rieng cua tai 2' });
        expect(otherDriverLeave.status).toBe(201);

        const res = await api(ctx.app)
            .get('/api/leave/me')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        const ids = res.body.leaves.map((l) => l.id);
        expect(ids).toContain(myLeave.body.leave.id);
        expect(ids).not.toContain(otherDriverLeave.body.leave.id);
        // Repository chỉ SELECT id/leave_date/leave_type/reason/status — phạm vi dữ liệu
        // được bảo đảm bằng mệnh đề WHERE driver_id, nên kiểm chứng bằng danh sách id.
        expect(res.body.leaves).toHaveLength(1);
    });
});
