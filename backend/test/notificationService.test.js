const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const notificationRepository = require('../repositories/notificationRepository');
const notificationGateway = require('../services/notificationGateway');
const fcmService = require('../services/fcmService');
const pool = require('../config/database');
const notificationService = require('../services/notificationService');

describe('Notification Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it('createForUser() rejects when userId is missing', async () => {
        await assert.rejects(
            () => notificationService.createForUser(null, { title: 'A' }),
            { message: 'userId is required' },
        );
    });

    it('createForUser() rejects when title is missing', async () => {
        await assert.rejects(
            () => notificationService.createForUser(1, { message: 'no title' }),
            { message: 'Notification title is required' },
        );
    });

    it('createForUser() persists the notification, broadcasts over the gateway, and fires an FCM push', async () => {
        const created = { id: 5, user_id: 1, title: 'Chuyến mới', message: 'msg', is_read: false };
        mock.method(notificationRepository, 'createNotification', async () => created);
        mock.method(notificationGateway, 'notifyCreated', () => {});
        mock.method(fcmService, 'sendNotification', async () => {});

        const result = await notificationService.createForUser(1, {
            title: 'Chuyến mới', message: 'msg', type: 'TRIP_ASSIGNED', entityId: 42,
        });

        assert.strictEqual(result, created);
        assert.deepStrictEqual(notificationRepository.createNotification.mock.calls[0].arguments[0], {
            userId: 1, title: 'Chuyến mới', message: 'msg', type: 'TRIP_ASSIGNED', entityType: null, entityId: 42,
        });
        assert.strictEqual(notificationGateway.notifyCreated.mock.calls[0].arguments[0], created);
        assert.strictEqual(fcmService.sendNotification.mock.calls[0].arguments[0], 1);
    });

    it('createForUser() never rejects even if the FCM push fails', async () => {
        mock.method(notificationRepository, 'createNotification', async () => ({ id: 1, user_id: 1 }));
        mock.method(notificationGateway, 'notifyCreated', () => {});
        mock.method(fcmService, 'sendNotification', async () => { throw new Error('fcm down'); });

        const result = await notificationService.createForUser(1, { title: 'A' });
        assert.strictEqual(result.id, 1);
    });

    it('createForUsers() fans out to unique userIds only, dropping falsy entries', async () => {
        mock.method(notificationRepository, 'createNotification', async ({ userId }) => ({ id: userId }));
        mock.method(notificationGateway, 'notifyCreated', () => {});
        mock.method(fcmService, 'sendNotification', async () => {});

        const results = await notificationService.createForUsers([1, 1, 2, 0, null], { title: 'A' });

        assert.strictEqual(notificationRepository.createNotification.mock.calls.length, 2);
        assert.deepStrictEqual(results.map((r) => r.id).sort(), [1, 2]);
    });

    it('listForUser() clamps limit/page to safe bounds and computes totalPages', async () => {
        mock.method(notificationRepository, 'listByUser', async () => ([{ id: 1 }]));
        mock.method(notificationRepository, 'countUnread', async () => 3);
        mock.method(notificationRepository, 'countAll', async () => 25);

        const result = await notificationService.listForUser(1, { limit: 500, page: -2 });

        assert.strictEqual(result.limit, 100);
        assert.strictEqual(result.page, 1);
        assert.strictEqual(result.unreadCount, 3);
        assert.strictEqual(result.total, 25);
        assert.strictEqual(result.totalPages, 1);
    });

    it('markAsRead() notifies over the gateway only when a row was actually updated', async () => {
        mock.method(notificationRepository, 'markAsRead', async () => null);
        mock.method(notificationGateway, 'notifyRead', () => {});

        const result = await notificationService.markAsRead(2, 99);

        assert.strictEqual(result, null);
        assert.strictEqual(notificationGateway.notifyRead.mock.calls.length, 0);
    });

    it('markAsRead() broadcasts read status for the owning user', async () => {
        mock.method(notificationRepository, 'markAsRead', async () => ({ id: 99, is_read: true }));
        mock.method(notificationGateway, 'notifyRead', () => {});

        const result = await notificationService.markAsRead(1, 99);

        assert.strictEqual(result.is_read, true);
        assert.deepStrictEqual(notificationGateway.notifyRead.mock.calls[0].arguments, [1, 99]);
    });

    it('markAllAsRead() delegates to the repository and broadcasts a read-all event', async () => {
        mock.method(notificationRepository, 'markAllAsRead', async () => {});
        mock.method(notificationGateway, 'notifyAllRead', () => {});

        await notificationService.markAllAsRead(1);

        assert.strictEqual(notificationRepository.markAllAsRead.mock.calls[0].arguments[0], 1);
        assert.strictEqual(notificationGateway.notifyAllRead.mock.calls[0].arguments[0], 1);
    });

    it('broadcastToRole() pushes a real-time payload without touching the database', () => {
        mock.method(notificationGateway, 'broadcastToRole', () => {});

        notificationService.broadcastToRole('manager', { title: 'Alert', message: 'msg', entityId: 7 });

        const [role, payload] = notificationGateway.broadcastToRole.mock.calls[0].arguments;
        assert.strictEqual(role, 'manager');
        assert.strictEqual(payload.notification.id, null);
        assert.strictEqual(payload.notification.title, 'Alert');
        assert.strictEqual(payload.notification.target_id, 7);
        assert.strictEqual(payload.notification.is_read, false);
    });

    it('getUserIdsByRole() queries profiles joined with roles and returns a flat id list', async () => {
        mock.method(pool, 'query', async () => ({ rows: [{ id: 1 }, { id: 2 }] }));

        const ids = await notificationService.getUserIdsByRole('driver');

        assert.deepStrictEqual(ids, [1, 2]);
        assert.strictEqual(pool.query.mock.calls[0].arguments[1][0], 'driver');
    });

    it('getById() returns null when the notification does not exist or belongs to another user', async () => {
        mock.method(notificationRepository, 'getById', async () => null);

        const result = await notificationService.getById(1, 999);
        assert.strictEqual(result, null);
    });

    it('getById() marks an unread notification as read as a side effect', async () => {
        mock.method(notificationRepository, 'getById', async () => ({ id: 5, is_read: false }));
        mock.method(notificationRepository, 'markAsRead', async () => ({ id: 5, is_read: true }));

        const result = await notificationService.getById(1, 5);

        assert.strictEqual(result.is_read, true);
        assert.strictEqual(notificationRepository.markAsRead.mock.calls.length, 1);
    });

    it('getById() does not re-mark an already-read notification', async () => {
        mock.method(notificationRepository, 'getById', async () => ({ id: 5, is_read: true }));
        mock.method(notificationRepository, 'markAsRead', async () => { throw new Error('should not be called'); });

        const result = await notificationService.getById(1, 5);
        assert.strictEqual(result.is_read, true);
    });
});
