/**
 * L1 Unit Test — notificationBus (fan-out realtime qua Postgres LISTEN/NOTIFY)
 *
 * Dùng createNotificationBus với query + clientFactory GIẢ — đúng ý đồ dependency
 * injection của module, không cần Postgres thật.
 *
 * Điểm chết người được khoá ở đây: publish() trả true là NHẬN TRÁCH NHIỆM giao hàng,
 * bên gọi sẽ không gửi local nữa. Nếu kết nối LISTEN chết mà bus vẫn báo "sống" thì
 * mọi thông báo rơi vào hư không trong im lặng — đúng triệu chứng "tài xế được gán
 * đơn nhưng không nhận được gì". Ba lớp phát hiện (error / end / heartbeat) đều có
 * test riêng.
 */
jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../config/dbConfig', () => ({ buildDbConfig: () => ({}) }));
jest.mock('../../config/logger', () => ({
    warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const { EventEmitter } = require('events');
const { createNotificationBus } = require('../../services/notificationBus');

/** Client pg giả: phát được 'notification' / 'error' / 'end' như client thật */
const taoClientGia = () => {
    const c = new EventEmitter();
    c.connect = jest.fn().mockResolvedValue(undefined);
    c.query = jest.fn().mockResolvedValue({ rows: [] });
    c.end = jest.fn().mockResolvedValue(undefined);
    return c;
};

const log = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };

/** Dựng bus đã subscribe xong (client đã connect + LISTEN) */
const dungBus = async (opts = {}) => {
    const client = taoClientGia();
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const handler = jest.fn();
    const bus = createNotificationBus({
        query,
        clientFactory: () => client,
        heartbeatMs: 0,
        log,
        ...opts,
    });
    bus.subscribe(handler);
    await Promise.resolve();
    await Promise.resolve();
    return { bus, client, query, handler };
};

beforeEach(() => {
    jest.clearAllMocks();
    log.warn.mockClear();
    log.error.mockClear();
});

describe('notificationBus.publish — hợp đồng trả về', () => {
    it('TC-UNIT-NotificationBus-001 — returns false before any subscribe, so the caller delivers locally', () => {
        const bus = createNotificationBus({ query: jest.fn(), clientFactory: taoClientGia, log });

        expect(bus.publish({ scope: 'user', key: '5', payload: {} })).toBe(false);
    });

    it('TC-UNIT-NotificationBus-002 — with the bus alive it returns true and publishes through pg_notify', async () => {
        const { bus, query } = await dungBus();

        const message = { scope: 'user', key: '5', payload: { type: 'x' } };
        expect(bus.publish(message)).toBe(true);
        expect(query).toHaveBeenCalledWith('SELECT pg_notify($1, $2)', ['ws_fanout', JSON.stringify(message)]);
    });

    it('TC-UNIT-NotificationBus-003 — a payload over 7500 bytes returns false and never calls pg_notify', async () => {
        const { bus, query } = await dungBus();

        const qua = { scope: 'user', key: '5', payload: { text: 'x'.repeat(8000) } };
        expect(bus.publish(qua)).toBe(false);
        expect(query).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationBus-004 — a payload just under the threshold is still published (boundary)', async () => {
        const { bus, query } = await dungBus();

        const vua = { scope: 'user', key: '5', payload: { text: 'x'.repeat(7000) } };
        expect(bus.publish(vua)).toBe(true);
        expect(query).toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationBus-005 — a pg_notify failure still delivers to local sockets and logs a warning', async () => {
        const { bus, handler, query } = await dungBus();
        query.mockRejectedValue(new Error('connection reset'));

        const message = { scope: 'user', key: '5', payload: { type: 'x' } };
        bus.publish(message);
        await new Promise(process.nextTick);

        expect(handler).toHaveBeenCalledWith(message);
        expect(log.warn).toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationBus-006 — uses exactly the channel it was given', async () => {
        const { bus, query } = await dungBus({ channel: 'kenh_rieng' });

        bus.publish({ a: 1 });

        expect(query).toHaveBeenCalledWith('SELECT pg_notify($1, $2)', ['kenh_rieng', '{"a":1}']);
    });
});

describe('notificationBus.subscribe — nhận message từ bus', () => {
    it('TC-UNIT-NotificationBus-007 — opens a dedicated connection and LISTENs on the right channel', async () => {
        const { client } = await dungBus();

        expect(client.connect).toHaveBeenCalled();
        expect(client.query).toHaveBeenCalledWith('LISTEN ws_fanout');
    });

    it('TC-UNIT-NotificationBus-008 — a message on the right channel is parsed and handed to the handler', async () => {
        const { client, handler } = await dungBus();

        client.emit('notification', { channel: 'ws_fanout', payload: '{"scope":"user","key":"5"}' });

        expect(handler).toHaveBeenCalledWith({ scope: 'user', key: '5' });
    });

    it('TC-UNIT-NotificationBus-009 — a message on another channel is ignored', async () => {
        const { client, handler } = await dungBus();

        client.emit('notification', { channel: 'kenh_khac', payload: '{"scope":"user"}' });

        expect(handler).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationBus-010 — a payload with broken JSON is ignored and never escapes', async () => {
        const { client, handler } = await dungBus();

        expect(() => client.emit('notification', { channel: 'ws_fanout', payload: 'khong-phai-json' }))
            .not.toThrow();
        expect(handler).not.toHaveBeenCalled();
    });

    it('TC-UNIT-NotificationBus-011 — a throwing handler is swallowed and logged, the process survives', async () => {
        const client = taoClientGia();
        const bus = createNotificationBus({
            query: jest.fn(), clientFactory: () => client, heartbeatMs: 0, log,
        });
        bus.subscribe(() => { throw new Error('handler hỏng'); });
        await Promise.resolve();
        await Promise.resolve();

        expect(() => client.emit('notification', { channel: 'ws_fanout', payload: '{"a":1}' }))
            .not.toThrow();
        expect(log.error).toHaveBeenCalled();
    });
});

describe('notificationBus — ba lớp phát hiện kết nối chết', () => {
    it('TC-UNIT-NotificationBus-012 — an error event marks the bus dead and publish falls back to false', async () => {
        const { bus, client } = await dungBus();
        expect(bus.isLive()).toBe(true);

        client.emit('error', new Error('ECONNRESET'));

        expect(bus.isLive()).toBe(false);
        expect(bus.publish({ a: 1 })).toBe(false);
    });

    it('TC-UNIT-NotificationBus-013 — an end event, a clean Postgres close, must mark the bus dead too', async () => {
        // Đây là nhánh dễ bỏ sót nhất: pg chỉ bắn 'end' chứ không bắn 'error' khi
        // server đóng đúng cách. Thiếu nhánh này là bus "sống giả" và nuốt thông báo.
        const { bus, client } = await dungBus();

        client.emit('end');

        expect(bus.isLive()).toBe(false);
        expect(bus.publish({ a: 1 })).toBe(false);
    });

    it('TC-UNIT-NotificationBus-014 — a failing heartbeat detects the silent death, with neither error nor end', async () => {
        jest.useFakeTimers();
        const client = taoClientGia();
        const bus = createNotificationBus({
            query: jest.fn().mockResolvedValue({}), clientFactory: () => client,
            heartbeatMs: 60_000, reconnectDelayMs: 999_999, log,
        });
        bus.subscribe(jest.fn());
        await Promise.resolve();
        await Promise.resolve();
        expect(bus.isLive()).toBe(true);

        client.query.mockRejectedValue(new Error('socket đã đứt'));
        jest.advanceTimersByTime(60_000);
        await Promise.resolve();
        await Promise.resolve();

        expect(bus.isLive()).toBe(false);
        jest.useRealTimers();
    });

    it('TC-UNIT-NotificationBus-015 — the heartbeat knocks with SELECT 1 on schedule', async () => {
        jest.useFakeTimers();
        const client = taoClientGia();
        const bus = createNotificationBus({
            query: jest.fn(), clientFactory: () => client, heartbeatMs: 60_000, log,
        });
        bus.subscribe(jest.fn());
        await Promise.resolve();
        await Promise.resolve();
        client.query.mockClear();

        jest.advanceTimersByTime(60_000);

        expect(client.query).toHaveBeenCalledWith('SELECT 1');
        await bus.stop();
        jest.useRealTimers();
    });

    it('TC-UNIT-NotificationBus-016 — losing the connection closes the old client and logs a warning', async () => {
        const { client } = await dungBus({ reconnectDelayMs: 999_999 });

        client.emit('error', new Error('ECONNRESET'));

        expect(client.end).toHaveBeenCalled();
        expect(log.warn).toHaveBeenCalledWith('[ws-bus] mất kết nối LISTEN, sẽ nối lại', expect.any(Object));
    });

    it('TC-UNIT-NotificationBus-017 — repeat events from an already discarded client cause no side effects', async () => {
        const { bus, client } = await dungBus({ reconnectDelayMs: 999_999 });

        client.emit('error', new Error('lần 1'));
        client.end.mockClear();
        client.emit('end');
        client.emit('error', new Error('lần 3'));

        expect(client.end).not.toHaveBeenCalled();
        expect(bus.isLive()).toBe(false);
    });

    it('TC-UNIT-NotificationBus-018 — a connection that cannot be opened marks the bus dead without throwing', async () => {
        const client = taoClientGia();
        client.connect.mockRejectedValue(new Error('không tới được DB'));
        const bus = createNotificationBus({
            query: jest.fn(), clientFactory: () => client, heartbeatMs: 0,
            reconnectDelayMs: 999_999, log,
        });

        expect(() => bus.subscribe(jest.fn())).not.toThrow();
        await Promise.resolve();
        await Promise.resolve();

        expect(bus.isLive()).toBe(false);
        expect(bus.publish({ a: 1 })).toBe(false);
        expect(log.warn).toHaveBeenCalled();
    });
});

describe('notificationBus.stop', () => {
    it('TC-UNIT-NotificationBus-019 — stopping the bus closes the connection and publish returns false', async () => {
        const { bus, client } = await dungBus();

        await bus.stop();

        expect(client.end).toHaveBeenCalled();
        expect(bus.isLive()).toBe(false);
        expect(bus.publish({ a: 1 })).toBe(false);
    });
});
