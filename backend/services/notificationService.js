const notificationRepository = require('../repositories/notificationRepository');
const notificationGateway    = require('./notificationGateway');
const fcmService             = require('./fcmService');
const pool                   = require('../config/database');

const createForUser = async (userId, payload, options = {}) => {
    if (!userId) throw new Error('userId is required');
    if (!payload?.title) throw new Error('Notification title is required');

    const notification = await notificationRepository.createNotification({
        userId,
        title: payload.title,
        message: payload.message ?? payload.body ?? '',
        type: payload.type ?? 'SYSTEM_ALERT',
        entityType: payload.entityType ?? payload.entity_type ?? null,
        entityId: payload.entityId ?? payload.entity_id ?? payload.target_id ?? null,
    });

    notificationGateway.notifyCreated(notification, {
        displayMode: options.displayMode ?? payload.displayMode ?? 'toast',
    });

    // ITEM 6 — Also fire FCM push if device token is registered (never throws)
    fcmService.sendNotification(userId, {
        title: payload.title,
        body: payload.message ?? payload.body ?? '',
        data: {
            type: payload.type ?? 'SYSTEM_ALERT',
            entityType: payload.entityType ?? payload.entity_type ?? '',
            entityId: String(payload.entityId ?? payload.entity_id ?? ''),
        },
    }).catch(() => {});

    return notification;
};

const createForUsers = async (userIds, payload, options = {}) => {
    const uniqueIds = [...new Set((userIds ?? []).filter(Boolean).map(Number))];
    return Promise.all(uniqueIds.map((userId) => createForUser(userId, payload, options)));
};

const listForUser = async (userId, { limit = 20, page = 1 } = {}) => {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const safePage = Math.max(1, Number(page) || 1);
    const [notifications, unreadCount, total] = await Promise.all([
        notificationRepository.listByUser(userId, {
            limit: safeLimit,
            offset: (safePage - 1) * safeLimit,
        }),
        notificationRepository.countUnread(userId),
        notificationRepository.countAll(userId),
    ]);

    return {
        notifications,
        unreadCount,
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
    };
};

const markAsRead = async (userId, notificationId) => {
    const notification = await notificationRepository.markAsRead(userId, notificationId);
    if (notification) notificationGateway.notifyRead(userId, notificationId);
    return notification;
};

const markAllAsRead = async (userId) => {
    await notificationRepository.markAllAsRead(userId);
    notificationGateway.notifyAllRead(userId);
};

// ─── Gửi tới toàn bộ user đang online theo role ───────────────────────────────
// Dùng cho coordinator / manager / accountant nhận alert real-time
// mà không cần query DB lấy danh sách userId trước.
//
// Lưu ý: KHÔNG lưu vào DB — chỉ push WS real-time.
// Dùng createForUsers() nếu cần lưu lịch sử notification.
const broadcastToRole = (role, payload) => {
    notificationGateway.broadcastToRole(role, {
        type: 'notification.created',
        notification: {
            id:           null,
            title:        payload.title,
            message:      payload.message ?? '',
            type:         payload.type    ?? 'SYSTEM_ALERT',
            entity_type:  payload.entityType ?? null,
            target_id:    payload.entityId   ?? null,
            is_read:      false,
            created_at:   new Date().toISOString(),
            display_mode: payload.displayMode ?? 'toast',
        },
    });
};

// ─── Lấy tất cả userId theo role để dùng với createForUsers() ─────────────────
const getUserIdsByRole = async (role) => {
    const result = await pool.query(
        `SELECT p.id FROM profiles p
         JOIN roles r ON r.id = p.role_id
         WHERE r.name = $1`,
        [role],
    );
    return result.rows.map((r) => r.id);
};

const getById = async (userId, notificationId) => {
    const notification = await notificationRepository.getById(userId, notificationId);
    if (!notification) return null;
    if (!notification.is_read) {
        await notificationRepository.markAsRead(userId, notificationId);
        notification.is_read = true;
    }
    return notification;
};

module.exports = {
    createForUser,
    createForUsers,
    broadcastToRole,
    getUserIdsByRole,
    listForUser,
    markAsRead,
    markAllAsRead,
    getById,
};
