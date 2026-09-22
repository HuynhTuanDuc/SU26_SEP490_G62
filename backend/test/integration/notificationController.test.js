const { api, authHeader, getPool, insertNotification, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

describe('GET /api/notifications', () => {
    it('TC-INT-NotificationController-001 — returns only the notifications of the authenticated user with unread counters', async () => {
        const { accounts } = await seedDriverWorld();
        await insertNotification({ userId: accounts.driver.id, title: 'A', body: 'Driver 1 - A' });
        await insertNotification({ userId: accounts.driver.id, title: 'B', body: 'Driver 1 - B' });
        await insertNotification({ userId: accounts.driver2.id, title: 'C', body: 'Driver 2 - C' });

        const res = await api(ctx.app)
            .get('/api/notifications?page=1&limit=10')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.unreadCount).toBe(2);
        expect(res.body.total).toBe(2);
        expect(res.body.notifications).toHaveLength(2);
        expect(res.body.notifications.every((n) => Number(n.user_id) === accounts.driver.id)).toBe(true);
    });
});

runRouteGuardSuite(ctx, 'NotificationController', routeGuardCases.NotificationController);

describe('PATCH /api/notifications/read-all', () => {
    it('TC-INT-NotificationController-002 — marks all notifications of the current user as read without touching another user records', async () => {
        const { accounts } = await seedDriverWorld();
        await insertNotification({ userId: accounts.driver.id, title: 'A' });
        await insertNotification({ userId: accounts.driver.id, title: 'B' });
        const other = await insertNotification({ userId: accounts.driver2.id, title: 'C' });

        const res = await api(ctx.app)
            .patch('/api/notifications/read-all')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);

        const { rows } = await getPool().query(
            'SELECT user_id, is_read FROM notifications ORDER BY id',
        );
        expect(rows.filter((row) => Number(row.user_id) === accounts.driver.id).every((row) => row.is_read)).toBe(true);
        expect(rows.find((row) => Number(row.user_id) === accounts.driver2.id && other.id)).toBeTruthy();
        expect(rows.filter((row) => Number(row.user_id) === accounts.driver2.id).every((row) => row.is_read === false)).toBe(true);
    });
});

describe('GET /api/notifications/:id', () => {
    it('TC-INT-NotificationController-003 — opens one notification and auto-marks it as read for the owner only', async () => {
        const { accounts } = await seedDriverWorld();
        const notification = await insertNotification({ userId: accounts.driver.id, title: 'Mo thong bao' });

        const res = await api(ctx.app)
            .get(`/api/notifications/${notification.id}`)
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.notification).toMatchObject({
            id: notification.id,
            title: 'Mo thong bao',
            is_read: true,
        });

        const { rows } = await getPool().query('SELECT is_read FROM notifications WHERE id = $1', [notification.id]);
        expect(rows[0].is_read).toBe(true);
    });
});
