/**
 * L1 Unit Test — notificationService
 *
 * Điểm dễ vỡ nhất: createForUser PHẢI await fcmService.sendNotification (Cloud Run bóp
 * CPU ngay khi response đi ra — bắn-rồi-quên là push không bao giờ tới), và lỗi push
 * không được làm hỏng notification đã ghi DB.
 */
jest.mock('../../repositories/notificationRepository');
jest.mock('../../repositories/roleRepository');
jest.mock('../../services/notificationGateway', () => ({
    notifyCreated: jest.fn(),
    notifyRead: jest.fn(),
    notifyAllRead: jest.fn(),
    broadcastToRole: jest.fn(),
    broadcastToUser: jest.fn(),
}));
jest.mock('../../services/fcmService', () => ({
    sendNotification: jest.fn().mockResolvedValue({ sent: 1 }),
}));

const notificationRepository = require('../../repositories/notificationRepository');
const roleRepository = require('../../repositories/roleRepository');
const notificationGateway = require('../../services/notificationGateway');
const fcmService = require('../../services/fcmService');
const notificationService = require('../../services/notificationService');

beforeEach(() => {
    jest.clearAllMocks();
    notificationRepository.createNotification.mockImplementation(async (input) => ({ id: 1, ...input }));
    fcmService.sendNotification.mockResolvedValue({ sent: 1 });
});

describe('notificationService.createForUser', () => {
    it('TC-UNIT-NotificationService-001 — creating a notification writes to the database, pushes over WebSocket and sends a push', async () => {
        const result = await notificationService.createForUser(5, {
            title: 'Chuyến mới', message: 'Bạn có chuyến mới', type: 'TRIP_QUEUED',
            entityType: 'trips', entityId: 77,
        }, { displayMode: 'alert' });

        expect(notificationRepository.createNotification).toHaveBeenCalledWith({
            userId: 5, title: 'Chuyến mới', message: 'Bạn có chuyến mới',
            type: 'TRIP_QUEUED', entityType: 'trips', entityId: 77,
        });
        expect(notificationGateway.notifyCreated).toHaveBeenCalledWith(
            expect.objectContaining({ id: 1 }), { displayMode: 'alert' },
        );
        expect(fcmService.sendNotification).toHaveBeenCalledWith(5, expect.objectContaining({
            title: 'Chuyến mới', body: 'Bạn có chuyến mới',
        }));
        expect(result).toMatchObject({ id: 1 });
    });

    it('TC-UNIT-NotificationService-002 — rejects a missing userId and writes nothing', async () => {
        await expect(notificationService.createForUser(null, { title: 'X' }))
            .rejects.toThrow('userId is required');

        expect(notificationRepository.createNotification).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationService-003 — rejects a missing title and writes nothing', async () => {
        await expect(notificationService.createForUser(5, { message: 'không có title' }))
            .rejects.toThrow('Notification title is required');

        expect(notificationRepository.createNotification).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationService-004 — a missing type defaults to SYSTEM_ALERT and displayMode defaults to toast', async () => {
        await notificationService.createForUser(5, { title: 'X' });

        expect(notificationRepository.createNotification).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'SYSTEM_ALERT', message: '', entityType: null, entityId: null }),
        );
        expect(notificationGateway.notifyCreated).toHaveBeenCalledWith(expect.anything(), { displayMode: 'toast' });
    });

    it('TC-UNIT-NotificationService-005 — accepts the legacy payload shape (body / entity_type / target_id)', async () => {
        await notificationService.createForUser(5, {
            title: 'X', body: 'nội dung cũ', entity_type: 'trips', target_id: 99,
        });

        expect(notificationRepository.createNotification).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'nội dung cũ', entityType: 'trips', entityId: 99 }),
        );
    });

    it('TC-UNIT-NotificationService-006 — a push failure still returns the notification already written', async () => {
        fcmService.sendNotification.mockRejectedValue(new Error('FCM token hết hạn'));

        await expect(notificationService.createForUser(5, { title: 'X' })).resolves.toMatchObject({ id: 1 });
    });

    it('TC-UNIT-NotificationService-007 — the push is awaited before returning, never fire-and-forget', async () => {
        let daGuiXong = false;
        fcmService.sendNotification.mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 10));
            daGuiXong = true;
        });

        await notificationService.createForUser(5, { title: 'X' });

        expect(daGuiXong).toBe(true);
    });
});

describe('notificationService.createForUsers', () => {
    it('TC-UNIT-NotificationService-008 — a duplicated recipient list is de-duplicated before sending', async () => {
        await notificationService.createForUsers([5, 5, 6], { title: 'X' });

        expect(notificationRepository.createNotification).toHaveBeenCalledTimes(2);
    });

    it('TC-UNIT-NotificationService-009 — empty or null ids are dropped', async () => {
        await notificationService.createForUsers([5, null, 0, undefined], { title: 'X' });

        expect(notificationRepository.createNotification).toHaveBeenCalledTimes(1);
        expect(notificationRepository.createNotification).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 5 }),
        );
    });

    it('TC-UNIT-NotificationService-010 — an empty or undefined list sends nothing', async () => {
        await notificationService.createForUsers([], { title: 'X' });
        await notificationService.createForUsers(undefined, { title: 'X' });

        expect(notificationRepository.createNotification).not.toHaveBeenCalled();
    });
});

describe('notificationService.listForUser — chuẩn hoá phân trang', () => {
    beforeEach(() => {
        notificationRepository.listByUser.mockResolvedValue([]);
        notificationRepository.countUnread.mockResolvedValue(3);
        notificationRepository.countAll.mockResolvedValue(45);
    });

    it('TC-UNIT-NotificationService-011 — defaults to 20 rows on page 1', async () => {
        const result = await notificationService.listForUser(5);

        expect(notificationRepository.listByUser).toHaveBeenCalledWith(5, { limit: 20, offset: 0 });
        expect(result).toMatchObject({ page: 1, limit: 20, total: 45, unreadCount: 3, totalPages: 3 });
    });

    it('TC-UNIT-NotificationService-012 — a limit above 100 is clamped to 100 (upper boundary)', async () => {
        await notificationService.listForUser(5, { limit: 500 });

        expect(notificationRepository.listByUser).toHaveBeenCalledWith(5, { limit: 100, offset: 0 });
    });

    it('TC-UNIT-NotificationService-013 — a negative limit is clamped to 1 (lower boundary)', async () => {
        await notificationService.listForUser(5, { limit: -10 });

        expect(notificationRepository.listByUser).toHaveBeenCalledWith(5, { limit: 1, offset: 0 });
    });

    it('TC-UNIT-NotificationService-014 — page 0 or negative is clamped to page 1', async () => {
        await notificationService.listForUser(5, { page: 0 });

        expect(notificationRepository.listByUser).toHaveBeenCalledWith(5, { limit: 20, offset: 0 });
    });

    it('TC-UNIT-NotificationService-015 — the offset is computed from the page', async () => {
        await notificationService.listForUser(5, { limit: 10, page: 3 });

        expect(notificationRepository.listByUser).toHaveBeenCalledWith(5, { limit: 10, offset: 20 });
    });
});

describe('notificationService.markAsRead', () => {
    it('TC-UNIT-NotificationService-016 — a successful mark-as-read pushes over WebSocket', async () => {
        notificationRepository.markAsRead.mockResolvedValue({ id: 9 });

        await notificationService.markAsRead(5, 9);

        expect(notificationGateway.notifyRead).toHaveBeenCalledWith(5, 9);
    });

    it('TC-UNIT-NotificationService-017 — a notification not owned by the user pushes nothing', async () => {
        notificationRepository.markAsRead.mockResolvedValue(null);

        await notificationService.markAsRead(5, 9);

        expect(notificationGateway.notifyRead).not.toHaveBeenCalled();
    });
});

describe('notificationService.getById', () => {
    it('TC-UNIT-NotificationService-018 — opening an unread notification marks it read automatically', async () => {
        notificationRepository.getById.mockResolvedValue({ id: 9, is_read: false });

        const result = await notificationService.getById(5, 9);

        expect(notificationRepository.markAsRead).toHaveBeenCalledWith(5, 9);
        expect(result.is_read).toBe(true);
    });

    it('TC-UNIT-NotificationService-019 — an already read notification is not written again', async () => {
        notificationRepository.getById.mockResolvedValue({ id: 9, is_read: true });

        await notificationService.getById(5, 9);

        expect(notificationRepository.markAsRead).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationService-020 — returns null when nothing is found', async () => {
        notificationRepository.getById.mockResolvedValue(null);

        expect(await notificationService.getById(5, 9)).toBeNull();
    });
});

describe('notificationService.broadcastToRole', () => {
    it('TC-UNIT-NotificationService-021 — a role broadcast writes NOTHING to the database, it only pushes over WebSocket', () => {
        notificationService.broadcastToRole('coordinator', { title: 'Sự cố mới', message: 'Xe hỏng' });

        expect(notificationRepository.createNotification).not.toHaveBeenCalled();
        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('coordinator', expect.objectContaining({
            type: 'notification.created',
            notification: expect.objectContaining({ id: null, title: 'Sự cố mới', is_read: false }),
        }));
    });
});

describe('notificationService.getUserIdsByRole', () => {
    it('TC-UNIT-NotificationService-022 — looks user ids up by role through roleRepository', async () => {
        roleRepository.getUserIdsByRole.mockResolvedValue([1, 2]);

        expect(await notificationService.getUserIdsByRole('manager')).toEqual([1, 2]);
        expect(roleRepository.getUserIdsByRole).toHaveBeenCalledWith('manager');
    });
});
