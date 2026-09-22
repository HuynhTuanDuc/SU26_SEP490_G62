const { api, authHeader, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'AttendanceController', routeGuardCases.AttendanceController);

const todayInVietnam = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const dayOffsetFromToday = (soNgay) => {
    const d = new Date();
    d.setDate(d.getDate() + soNgay);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const readAttendance = async (driverId, workDate) => {
    const { rows } = await getPool().query(
        'SELECT driver_id, work_date, status, notes, marked_by FROM attendance_overrides WHERE driver_id = $1 AND work_date = $2',
        [driverId, workDate],
    );
    return rows[0] ?? null;
};

describe('POST /api/attendance', () => {
    it('TC-INT-AttendanceController-001 — the coordinator marks a driver present today and the row records who marked it', async () => {
        const { accounts } = await seedDriverWorld();
        const ngay = todayInVietnam();

        const res = await api(ctx.app)
            .post('/api/attendance')
            .set(authHeader(accounts.coordinator.token))
            .send({ driver_id: accounts.driver.id, work_date: ngay, status: 'present', notes: 'Di lam day du' });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Đã chấm công/i);

        const stored = await readAttendance(accounts.driver.id, ngay);
        expect(stored.status).toBe('present');
        expect(stored.notes).toBe('Di lam day du');
        expect(Number(stored.marked_by)).toBe(accounts.coordinator.id);
    });

    it('TC-INT-AttendanceController-002 — a status outside the allowed set is rejected and no attendance row is written', async () => {
        const { accounts } = await seedDriverWorld();
        const ngay = todayInVietnam();

        const res = await api(ctx.app)
            .post('/api/attendance')
            .set(authHeader(accounts.manager.token))
            .send({ driver_id: accounts.driver.id, work_date: ngay, status: 'di_muon' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Trạng thái không hợp lệ/i);
        expect(await readAttendance(accounts.driver.id, ngay)).toBeNull();
    });

    it('TC-INT-AttendanceController-003 — attendance cannot be marked for a future date', async () => {
        const { accounts } = await seedDriverWorld();
        const tomorrow = dayOffsetFromToday(1);

        const res = await api(ctx.app)
            .post('/api/attendance')
            .set(authHeader(accounts.manager.token))
            .send({ driver_id: accounts.driver.id, work_date: tomorrow, status: 'present' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Không thể chấm công cho ngày trong tương lai/i);
        expect(await readAttendance(accounts.driver.id, tomorrow)).toBeNull();
    });

    it('TC-INT-AttendanceController-004 — marking the same day again overwrites the old status instead of adding a second row', async () => {
        const { accounts } = await seedDriverWorld();
        const ngay = todayInVietnam();

        await api(ctx.app).post('/api/attendance').set(authHeader(accounts.manager.token))
            .send({ driver_id: accounts.driver.id, work_date: ngay, status: 'half_day' });
        const res = await api(ctx.app).post('/api/attendance').set(authHeader(accounts.manager.token))
            .send({ driver_id: accounts.driver.id, work_date: ngay, status: 'present' });

        expect(res.status).toBe(200);
        const { rows } = await getPool().query(
            'SELECT status FROM attendance_overrides WHERE driver_id = $1 AND work_date = $2',
            [accounts.driver.id, ngay],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('present');
    });
});

describe('DELETE /api/attendance/:driverId/:workDate', () => {
    it('TC-INT-AttendanceController-005 — clearing a manual mark deletes the row and the day falls back to its default status', async () => {
        const { accounts } = await seedDriverWorld();
        const ngay = todayInVietnam();
        await api(ctx.app).post('/api/attendance').set(authHeader(accounts.manager.token))
            .send({ driver_id: accounts.driver.id, work_date: ngay, status: 'absent_unexcused' });
        expect(await readAttendance(accounts.driver.id, ngay)).not.toBeNull();

        const res = await api(ctx.app)
            .delete(`/api/attendance/${accounts.driver.id}/${ngay}`)
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBe(200);
        expect(await readAttendance(accounts.driver.id, ngay)).toBeNull();
    });
});

describe('GET /api/attendance/grid', () => {
    it('TC-INT-AttendanceController-006 — a month outside 1-12 is rejected before the attendance grid is queried', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/attendance/grid?month=13&year=2026')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Tháng không hợp lệ/i);
    });
});
