/**
 * L1 Unit Test — roleNotificationService
 * Gom user theo nhiều vai trò, khử trùng, và loại người vừa gây ra sự kiện
 * (không ai muốn nhận thông báo về hành động của chính mình).
 */
jest.mock('../../services/notificationService', () => ({
    getUserIdsByRole: jest.fn(),
    createForUsers: jest.fn().mockResolvedValue([]),
    createForUser: jest.fn().mockResolvedValue(undefined),
}));

const notificationService = require('../../services/notificationService');
const roleNotificationService = require('../../services/roleNotificationService');

const PAYLOAD = { title: 'Sự cố mới', message: 'Xe 51C hỏng phanh', type: 'INCIDENT_CREATED' };

beforeEach(() => {
    jest.clearAllMocks();
    notificationService.createForUsers.mockResolvedValue([]);
});

describe('roleNotificationService.notifyRoles', () => {
    it('TC-UNIT-RoleNotificationService-001 — merges several roles and removes duplicate recipients', async () => {
        notificationService.getUserIdsByRole.mockImplementation(async (role) =>
            (role === 'manager' ? [1, 2] : [2, 3]));

        await roleNotificationService.notifyRoles(['manager', 'accountant'], PAYLOAD);

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [1, 2, 3], PAYLOAD, { displayMode: 'toast' },
        );
    });

    it('TC-UNIT-RoleNotificationService-002 — looks a duplicated role up only once', async () => {
        notificationService.getUserIdsByRole.mockResolvedValue([1]);

        await roleNotificationService.notifyRoles(['manager', 'manager'], PAYLOAD);

        expect(notificationService.getUserIdsByRole).toHaveBeenCalledTimes(1);
    });

    it('TC-UNIT-RoleNotificationService-003 — excludes the user who triggered the event from the recipients', async () => {
        notificationService.getUserIdsByRole.mockResolvedValue([1, 2, 3]);

        await roleNotificationService.notifyRoles(['manager'], PAYLOAD, { excludeUserId: 2 });

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [1, 3], PAYLOAD, { displayMode: 'toast' },
        );
    });

    it('TC-UNIT-RoleNotificationService-004 — drops invalid ids (0, negative, null)', async () => {
        notificationService.getUserIdsByRole.mockResolvedValue([1, 0, -5, null]);

        await roleNotificationService.notifyRoles(['manager'], PAYLOAD);

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [1], PAYLOAD, expect.anything(),
        );
    });

    it('TC-UNIT-RoleNotificationService-005 — skips sending entirely when no recipient is left', async () => {
        notificationService.getUserIdsByRole.mockResolvedValue([2]);

        const result = await roleNotificationService.notifyRoles(['manager'], PAYLOAD, { excludeUserId: 2 });

        expect(result).toEqual([]);
        expect(notificationService.createForUsers).not.toHaveBeenCalled();
    });

    it('TC-UNIT-RoleNotificationService-006 — honours the displayMode passed in', async () => {
        notificationService.getUserIdsByRole.mockResolvedValue([1]);

        await roleNotificationService.notifyRoles(['manager'], PAYLOAD, { displayMode: 'alert' });

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [1], PAYLOAD, { displayMode: 'alert' },
        );
    });
});

describe('roleNotificationService.notifyRolesSafe', () => {
    it('TC-UNIT-RoleNotificationService-007 — a notification failure never escapes into the business flow', async () => {
        notificationService.getUserIdsByRole.mockRejectedValue(new Error('DB sập'));
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

        expect(() => roleNotificationService.notifyRolesSafe(['manager'], PAYLOAD)).not.toThrow();
        await new Promise(process.nextTick);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});
