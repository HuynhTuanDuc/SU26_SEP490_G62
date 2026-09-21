/**
 * L1 Unit Test — notificationGateway (tầng WebSocket)
 *
 * Trọng tâm: sổ đăng ký socket theo user/role phải tự dọn khi client ngắt kết nối
 * (không dọn = rò bộ nhớ + gửi vào socket chết), và broadcast phải SUY GIẢM về gửi
 * local khi bus chưa sẵn sàng — nếu không, môi trường dev một tiến trình sẽ mất sạch
 * thông báo realtime.
 *
 * authService được mock để không kéo theo cấu hình JWT/OAuth khi nạp module.
 */
jest.mock('../../services/authService', () => ({
    verifyToken: jest.fn(),
    AUTH_COOKIE_NAME: 'auth_token',
}));
jest.mock('../../services/notificationBus', () => ({
    publish: jest.fn(() => false),
    subscribe: jest.fn(),
}));

const { EventEmitter } = require('events');
const notificationBus = require('../../services/notificationBus');
const gateway = require('../../services/notificationGateway');

const OPEN = 1;
const CLOSED = 3;

/** Socket giả tối thiểu đúng shape mà gateway dùng thật: readyState + send + sự kiện close */
const taoSocket = (readyState = OPEN) => {
    const s = new EventEmitter();
    s.readyState = readyState;
    s.send = jest.fn();
    return s;
};

const socketDaTao = [];
const dangKy = (userId, role, readyState = OPEN) => {
    const s = taoSocket(readyState);
    gateway.addClient(userId, role, s);
    socketDaTao.push(s);
    return s;
};

beforeEach(() => {
    jest.clearAllMocks();
    notificationBus.publish.mockReturnValue(false);
});

// Sổ đăng ký là state cấp module — trả socket về trạng thái đóng để module tự dọn,
// đúng cơ chế thật thay vì đụng vào biến nội bộ.
afterEach(() => {
    while (socketDaTao.length) socketDaTao.pop().emit('close');
});

describe('notificationGateway.readCookieValue', () => {
    it('TC-UNIT-NotificationGateway-001 — reads the right cookie by name out of a multi-cookie header', () => {
        expect(gateway.readCookieValue('a=1; auth_token=abc123; b=2', 'auth_token')).toBe('abc123');
    });

    it('TC-UNIT-NotificationGateway-002 — the value is URL-decoded', () => {
        expect(gateway.readCookieValue('auth_token=a%20b%2Bc', 'auth_token')).toBe('a b+c');
    });

    it('TC-UNIT-NotificationGateway-003 — returns null when the wanted cookie is absent', () => {
        expect(gateway.readCookieValue('other=1', 'auth_token')).toBeNull();
    });

    it('TC-UNIT-NotificationGateway-004 — returns null for an empty or missing header', () => {
        expect(gateway.readCookieValue('', 'auth_token')).toBeNull();
        expect(gateway.readCookieValue(undefined, 'auth_token')).toBeNull();
    });

    it('TC-UNIT-NotificationGateway-005 — does not mistakenly match a cookie whose name ends with the wanted one', () => {
        // 'x_auth_token' KHÔNG được coi là 'auth_token'
        expect(gateway.readCookieValue('x_auth_token=sai', 'auth_token')).toBeNull();
    });
});

describe('notificationGateway.sendJson', () => {
    it('TC-UNIT-NotificationGateway-006 — sends the JSON string while the socket is open', () => {
        const s = taoSocket(OPEN);

        gateway.sendJson(s, { type: 'ping' });

        expect(s.send).toHaveBeenCalledWith('{"type":"ping"}');
    });

    it('TC-UNIT-NotificationGateway-007 — sends nothing once the socket is closed', () => {
        const s = taoSocket(CLOSED);

        gateway.sendJson(s, { type: 'ping' });

        expect(s.send).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationGateway-008 — a socket that throws on send is swallowed and the calling flow survives', () => {
        const s = taoSocket(OPEN);
        s.send.mockImplementation(() => { throw new Error('socket hỏng'); });

        expect(() => gateway.sendJson(s, { type: 'ping' })).not.toThrow();
    });
});

describe('notificationGateway — sổ đăng ký socket', () => {
    it('TC-UNIT-NotificationGateway-009 — delivers to the registered user', () => {
        const s = dangKy(5, 'driver');

        gateway.deliverToUser(5, { type: 'x' });

        expect(s.send).toHaveBeenCalledWith('{"type":"x"}');
    });

    it('TC-UNIT-NotificationGateway-010 — one user on several devices receives it on all of them', () => {
        const dienThoai = dangKy(5, 'driver');
        const web = dangKy(5, 'driver');

        gateway.deliverToUser(5, { type: 'x' });

        expect(dienThoai.send).toHaveBeenCalled();
        expect(web.send).toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationGateway-011 — a numeric and a string userId point at the same person', () => {
        const s = dangKy('5', 'driver');

        gateway.deliverToUser(5, { type: 'x' });

        expect(s.send).toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationGateway-012 — never delivers to the wrong user', () => {
        const cua5 = dangKy(5, 'driver');
        const cua6 = dangKy(6, 'driver');

        gateway.deliverToUser(6, { type: 'x' });

        expect(cua5.send).not.toHaveBeenCalled();
        expect(cua6.send).toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationGateway-013 — a role broadcast reaches every client holding that role', () => {
        const dp1 = dangKy(30, 'coordinator');
        const dp2 = dangKy(31, 'coordinator');
        const tai = dangKy(5, 'driver');

        gateway.deliverToRole('coordinator', { type: 'x' });

        expect(dp1.send).toHaveBeenCalled();
        expect(dp2.send).toHaveBeenCalled();
        expect(tai.send).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationGateway-014 — a disconnected client is removed from the registry, nothing is sent to a dead socket', () => {
        const s = dangKy(5, 'driver');

        s.emit('close');
        gateway.deliverToUser(5, { type: 'x' });

        expect(s.send).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationGateway-015 — disconnecting also removes the client from its role group', () => {
        const s = dangKy(30, 'coordinator');

        s.emit('close');
        gateway.deliverToRole('coordinator', { type: 'x' });

        expect(s.send).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationGateway-016 — one device disconnecting does not affect the other devices of the same user', () => {
        const dienThoai = dangKy(5, 'driver');
        const web = dangKy(5, 'driver');

        dienThoai.emit('close');
        gateway.deliverToUser(5, { type: 'x' });

        expect(dienThoai.send).not.toHaveBeenCalled();
        expect(web.send).toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationGateway-017 — delivering to nobody is skipped without throwing', () => {
        expect(() => gateway.deliverToUser(999, { type: 'x' })).not.toThrow();
        expect(() => gateway.deliverToRole('admin', { type: 'x' })).not.toThrow();
    });

    it('TC-UNIT-NotificationGateway-018 — a client with no role still receives personal notifications', () => {
        const s = dangKy(5, null);

        gateway.deliverToUser(5, { type: 'x' });

        expect(s.send).toHaveBeenCalled();
    });
});

describe('notificationGateway.applyBusMessage', () => {
    it('TC-UNIT-NotificationGateway-019 — a scope=user message is delivered to the right person', () => {
        const s = dangKy(5, 'driver');

        gateway.applyBusMessage({ scope: 'user', key: '5', payload: { type: 'x' } });

        expect(s.send).toHaveBeenCalledWith('{"type":"x"}');
    });

    it('TC-UNIT-NotificationGateway-020 — a scope=role message is delivered to the right group', () => {
        const s = dangKy(30, 'coordinator');

        gateway.applyBusMessage({ scope: 'role', key: 'coordinator', payload: { type: 'x' } });

        expect(s.send).toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationGateway-021 — a malformed bus message is ignored without throwing', () => {
        const s = dangKy(5, 'driver');

        expect(() => gateway.applyBusMessage(null)).not.toThrow();
        expect(() => gateway.applyBusMessage('chuoi')).not.toThrow();
        expect(() => gateway.applyBusMessage({ scope: 'la', key: '5', payload: {} })).not.toThrow();
        expect(s.send).not.toHaveBeenCalled();
    });
});

describe('notificationGateway — broadcast và cơ chế suy giảm khi bus chưa sẵn sàng', () => {
    it('TC-UNIT-NotificationGateway-022 — with the bus alive it only publishes and does NOT deliver locally, avoiding duplicates', () => {
        notificationBus.publish.mockReturnValue(true);
        const s = dangKy(5, 'driver');

        gateway.broadcastToUser(5, { type: 'x' });

        expect(notificationBus.publish).toHaveBeenCalledWith({ scope: 'user', key: '5', payload: { type: 'x' } });
        expect(s.send).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationGateway-023 — with the bus not ready it delivers locally itself', () => {
        notificationBus.publish.mockReturnValue(false);
        const s = dangKy(5, 'driver');

        gateway.broadcastToUser(5, { type: 'x' });

        expect(s.send).toHaveBeenCalledWith('{"type":"x"}');
    });

    it('TC-UNIT-NotificationGateway-024 — a role broadcast degrades to local delivery too', () => {
        notificationBus.publish.mockReturnValue(false);
        const s = dangKy(30, 'coordinator');

        gateway.broadcastToRole('coordinator', { type: 'x' });

        expect(notificationBus.publish).toHaveBeenCalledWith({ scope: 'role', key: 'coordinator', payload: { type: 'x' } });
        expect(s.send).toHaveBeenCalled();
    });
});

describe('notificationGateway — gói tin thông báo', () => {
    it('TC-UNIT-NotificationGateway-025 — notifyCreated reaches the owner of the notification with the displayMode', () => {
        const s = dangKy(5, 'driver');

        gateway.notifyCreated({ id: 9, user_id: 5, title: 'X' }, { displayMode: 'alert' });

        const goi = JSON.parse(s.send.mock.calls[0][0]);
        expect(goi).toMatchObject({
            type: 'notification.created',
            notification: { id: 9, user_id: 5, display_mode: 'alert' },
        });
    });

    it('TC-UNIT-NotificationGateway-026 — displayMode defaults to toast when omitted', () => {
        const s = dangKy(5, 'driver');

        gateway.notifyCreated({ id: 9, user_id: 5, title: 'X' });

        expect(JSON.parse(s.send.mock.calls[0][0]).notification.display_mode).toBe('toast');
    });

    it('TC-UNIT-NotificationGateway-027 — notifyRead carries the id of the notification just read', () => {
        const s = dangKy(5, 'driver');

        gateway.notifyRead(5, 9);

        expect(JSON.parse(s.send.mock.calls[0][0])).toEqual({ type: 'notification.read', notificationId: 9 });
    });

    it('TC-UNIT-NotificationGateway-028 — notifyAllRead carries the read-everything signal', () => {
        const s = dangKy(5, 'driver');

        gateway.notifyAllRead(5);

        expect(JSON.parse(s.send.mock.calls[0][0])).toEqual({ type: 'notification.read_all' });
    });
});
