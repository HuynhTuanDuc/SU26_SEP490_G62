/**
 * Chiều 3 — Background Job (Testing Guide §2.2.1).
 *
 * Gọi THẲNG service method mà cron đăng ký, không đi qua node-cron: lịch chạy là việc
 * của hạ tầng, cái cần đo ở L2 là job đó tác động đúng vào DB hay không. Mỗi ca dựng
 * trạng thái DB "đã qua thời điểm X" bằng ngày tương đối rồi kiểm chứng DB sau khi chạy.
 *
 * JOB-01  cron/debtCron.js  05 0 * * *  → leaveService.rejectExpiredLeaveRequests()
 * JOB-02  cron/debtCron.js  0 8 * * *   → debtService.notifyOverdueDebts()
 */
const {
    getNotificationsForUsers,
    getPool,
    insertDriverDebt,
    insertLeaveRequest,
    seedDriverWorld,
    setupL2Suite,
} = require('./support');

const ctx = setupL2Suite();

const dayOffsetFromToday = (soNgay) => {
    const d = new Date();
    d.setDate(d.getDate() + soNgay);
    return d.toISOString().slice(0, 10);
};

const readLeave = async (id) => {
    const { rows } = await getPool().query('SELECT id, status, leave_date FROM leave_requests WHERE id = $1', [id]);
    return rows[0];
};

describe('JOB-01 — clear expired leave requests (debtCron 00:05 GMT+7)', () => {
    it('TC-SCH-JOB01-001 — the job runs against a database holding expired leave requests yet changes no status', async () => {
        const { accounts } = await seedDriverWorld();
        const expiredLeave = await insertLeaveRequest({
            driverId: accounts.driver.id,
            leaveDate: dayOffsetFromToday(-3),
            status: 'approved',
        });
        const futureLeave = await insertLeaveRequest({
            driverId: accounts.driver.id,
            leaveDate: dayOffsetFromToday(5),
            status: 'approved',
        });

        const leaveService = require('../../services/leaveService');
        const affectedRows = await leaveService.rejectExpiredLeaveRequests();

        expect(affectedRows).toBe(0);
        expect((await readLeave(expiredLeave.id)).status).toBe('approved');
        expect((await readLeave(futureLeave.id)).status).toBe('approved');
    });

    it("TC-SCH-JOB01-002 — [DEF-L2-001] leave_requests.status rejects 'pending', so the job filter can never match a row", async () => {
        const { accounts } = await seedDriverWorld();

        // Job lọc `WHERE status = 'pending'` (leaveRepository.rejectExpiredLeaveRequests).
        // Schema chỉ cho phép 'approved' | 'rejected' (DB script.sql — leave_requests_status_check),
        // nên không dòng nào có thể mang status 'pending' → nhánh UPDATE của job là code chết.
        await expect(insertLeaveRequest({
            driverId: accounts.driver.id,
            leaveDate: dayOffsetFromToday(-3),
            status: 'pending',
        })).rejects.toMatchObject({ code: '23514', constraint: 'leave_requests_status_check' });

        const { rows } = await getPool().query(
            `SELECT pg_get_constraintdef(oid) AS def
               FROM pg_constraint WHERE conname = 'leave_requests_status_check'`,
        );
        expect(rows[0].def).toMatch(/'approved'/);
        expect(rows[0].def).toMatch(/'rejected'/);
        expect(rows[0].def).not.toMatch(/'pending'/);

        const leaveService = require('../../services/leaveService');
        await expect(leaveService.rejectExpiredLeaveRequests()).resolves.toBe(0);
    });

    it('TC-SCH-JOB01-003 — on an empty database the job completes cleanly, returns 0 and throws nothing', async () => {
        await seedDriverWorld();

        const leaveService = require('../../services/leaveService');
        await expect(leaveService.rejectExpiredLeaveRequests()).resolves.toBe(0);
    });
});

describe('JOB-02 — overdue debt reminder (debtCron 08:00 GMT+7)', () => {
    it('TC-SCH-JOB02-001 — sends a DEBT_OVERDUE notification to both manager and accountant when an overdue debt exists', async () => {
        const { accounts } = await seedDriverWorld();
        await insertDriverDebt({
            driverId: accounts.driver.id,
            totalAmount: 750000,
            dueDate: dayOffsetFromToday(-7),
        });

        const debtService = require('../../services/debtService');
        const result = await debtService.notifyOverdueDebts();

        expect(result.notified).toBe(true);

        const notifications = await getNotificationsForUsers(
            [accounts.manager.id, accounts.accountant.id],
            'DEBT_OVERDUE',
        );
        expect(notifications.map((n) => Number(n.user_id)).sort()).toEqual(
            [accounts.manager.id, accounts.accountant.id].sort(),
        );
        expect(notifications[0].title).toBe('Công nợ quá hạn cần xử lý');
        expect(notifications[0].body).toMatch(/750\.000đ/);
    });

    it('TC-SCH-JOB02-002 — a debt not yet due leaves the job silent and creates no noise notification', async () => {
        const { accounts } = await seedDriverWorld();
        await insertDriverDebt({
            driverId: accounts.driver.id,
            totalAmount: 400000,
            dueDate: dayOffsetFromToday(15),
        });

        const debtService = require('../../services/debtService');
        const result = await debtService.notifyOverdueDebts();

        expect(result).toEqual({ notified: false });
        const notifications = await getNotificationsForUsers(
            [accounts.manager.id, accounts.accountant.id],
            'DEBT_OVERDUE',
        );
        expect(notifications).toHaveLength(0);
    });

    it('TC-SCH-JOB02-003 — the driver receives none of the debt notifications meant for the finance staff', async () => {
        const { accounts } = await seedDriverWorld();
        await insertDriverDebt({
            driverId: accounts.driver.id,
            totalAmount: 900000,
            dueDate: dayOffsetFromToday(-2),
        });

        const debtService = require('../../services/debtService');
        await debtService.notifyOverdueDebts();

        const driverNotifications = await getNotificationsForUsers([accounts.driver.id], 'DEBT_OVERDUE');
        expect(driverNotifications).toHaveLength(0);
    });
});

// ctx được setupL2Suite dựng sẵn (Postgres thật + app) — job đọc/ghi trên chính pool đó.
expect(ctx).toBeDefined();
