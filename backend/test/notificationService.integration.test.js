const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { setupTestDb } = require('./helpers/testDb');

let pool;
let teardown;
let notificationService;

describe('Notification Service Integration Tests (L2)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        notificationService = require('../services/notificationService');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE notifications, profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`
            INSERT INTO roles (id, name) VALUES (2, 'driver'), (3, 'coordinator')
            ON CONFLICT DO NOTHING
        `);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES
            (1, 'driver1@test.com', 'hash', 2),
            (2, 'driver2@test.com', 'hash', 2),
            (3, 'coordinator@test.com', 'hash', 3)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1, 'Driver One', 2),
            (2, 'Driver Two', 2),
            (3, 'Coordinator One', 3)
        `);
    });

    it('createForUser() persists a notification row for the given user', async () => {
        const notification = await notificationService.createForUser(1, {
            title: 'Chuyến mới', message: 'Bạn có chuyến mới', type: 'TRIP_ASSIGNED',
        });

        assert.strictEqual(notification.user_id, 1);
        assert.strictEqual(notification.title, 'Chuyến mới');
        assert.strictEqual(notification.is_read, false);

        const dbRow = await pool.query('SELECT * FROM notifications WHERE id = $1', [notification.id]);
        assert.strictEqual(dbRow.rows[0].body, 'Bạn có chuyến mới');
    });

    it('createForUser() requires a title', async () => {
        await assert.rejects(
            () => notificationService.createForUser(1, { message: 'no title' }),
            { message: 'Notification title is required' },
        );
    });

    it('createForUsers() fans out to multiple unique users, deduplicated', async () => {
        const results = await notificationService.createForUsers([1, 1, 2], {
            title: 'Bảo trì hệ thống', message: 'Hệ thống bảo trì lúc 22h',
        });

        assert.strictEqual(results.length, 2);

        const count = await pool.query('SELECT COUNT(*)::int AS c FROM notifications');
        assert.strictEqual(count.rows[0].c, 2);
    });

    it('listForUser() returns notifications with unread count and pagination info', async () => {
        await notificationService.createForUser(1, { title: 'A', message: 'first' });
        await notificationService.createForUser(1, { title: 'B', message: 'second' });

        const result = await notificationService.listForUser(1, { limit: 1, page: 1 });

        assert.strictEqual(result.notifications.length, 1);
        assert.strictEqual(result.unreadCount, 2);
        assert.strictEqual(result.total, 2);
        assert.strictEqual(result.totalPages, 2);
    });

    it('markAsRead() flips is_read for the owning user only', async () => {
        const notification = await notificationService.createForUser(1, { title: 'A', message: 'msg' });

        const otherUserResult = await notificationService.markAsRead(2, notification.id);
        assert.strictEqual(otherUserResult, null);

        const ownerResult = await notificationService.markAsRead(1, notification.id);
        assert.strictEqual(ownerResult.is_read, true);
    });

    it('markAllAsRead() clears unread count for the user without touching other users', async () => {
        await notificationService.createForUser(1, { title: 'A', message: 'a' });
        await notificationService.createForUser(1, { title: 'B', message: 'b' });
        await notificationService.createForUser(2, { title: 'C', message: 'c' });

        await notificationService.markAllAsRead(1);

        const user1 = await notificationService.listForUser(1);
        const user2 = await notificationService.listForUser(2);
        assert.strictEqual(user1.unreadCount, 0);
        assert.strictEqual(user2.unreadCount, 1);
    });

    it('getUserIdsByRole() returns profile ids scoped to the given role', async () => {
        const driverIds = await notificationService.getUserIdsByRole('driver');
        const coordinatorIds = await notificationService.getUserIdsByRole('coordinator');

        assert.deepStrictEqual(driverIds.sort(), [1, 2]);
        assert.deepStrictEqual(coordinatorIds, [3]);
    });

    it('getById() returns the notification and marks it read as a side effect', async () => {
        const created = await notificationService.createForUser(1, { title: 'A', message: 'msg' });

        const fetched = await notificationService.getById(1, created.id);
        assert.strictEqual(fetched.is_read, true);

        const dbRow = await pool.query('SELECT is_read FROM notifications WHERE id = $1', [created.id]);
        assert.strictEqual(dbRow.rows[0].is_read, true);
    });
});
