/**
 * L1 Unit Test — fcmService (push nền qua Expo Push Service)
 *
 * Mock hai thứ ngoài tiến trình: pool (Postgres) và fetch (HTTP tới Expo).
 * Toàn bộ logic lọc token, đóng gói message, chia lô, phân loại ticket/receipt chạy thật.
 *
 * Luật xuyên suốt: push là tính năng PHỤ — hỏng kiểu gì cũng không được ném lỗi ra
 * ngoài làm sập nghiệp vụ chính. Nhưng "không ném" khác "không ghi lại": mọi nhánh
 * hỏng đều phải có log, nếu không thì tài xế báo "thông báo về chậm" mà không có
 * một dòng bằng chứng nào để lần.
 */
jest.mock('../../config/database', () => ({ query: jest.fn() }));
jest.mock('../../config/logger', () => ({
    warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn(),
}));

const pool = require('../../config/database');
const logger = require('../../config/logger');
const fcmService = require('../../services/fcmService');

const TOKEN_1 = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_2 = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

/** Điều khiển pool.query theo nội dung SQL — service dùng nhiều câu khác nhau */
const dungDb = ({ tokens = [TOKEN_1], tickets = [] } = {}) => {
    pool.query.mockImplementation(async (sql) => {
        if (/SELECT token FROM device_tokens/.test(sql)) {
            return { rows: tokens.map((t) => ({ token: t })) };
        }
        if (/FROM push_tickets/.test(sql)) return { rows: tickets };
        return { rows: [], rowCount: 0 };
    });
};

const dungFetch = (body, ok = true, status = 200) => {
    global.fetch = jest.fn().mockResolvedValue({
        ok, status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    });
};

/** Lấy các câu SQL đã chạy để kiểm tra side-effect */
const sqlDaChay = () => pool.query.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
    jest.clearAllMocks();
    dungDb();
    dungFetch({ data: [{ status: 'ok', id: 'ticket-1' }] });
});

afterEach(() => { delete global.fetch; });

describe('fcmService.registerToken / removeToken', () => {
    it('TC-UNIT-FcmService-001 — registering a token upserts by token, so one user may hold several devices', async () => {
        await fcmService.registerToken(5, TOKEN_1, 'ios');

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO device_tokens/);
        expect(sql).toMatch(/ON CONFLICT \(token\) DO UPDATE/);
        expect(params).toEqual([5, TOKEN_1, 'ios']);
    });

    it('TC-UNIT-FcmService-002 — defaults the platform to android when none is given', async () => {
        await fcmService.registerToken(5, TOKEN_1);

        expect(pool.query.mock.calls[0][1]).toEqual([5, TOKEN_1, 'android']);
    });

    it('TC-UNIT-FcmService-003 — touches no database when the user or the token is missing', async () => {
        await fcmService.registerToken(null, TOKEN_1);
        await fcmService.registerToken(5, null);

        expect(pool.query).not.toHaveBeenCalled();
    });

    it('TC-UNIT-FcmService-004 — logout deletes every token of the user', async () => {
        await fcmService.removeToken(5);

        expect(pool.query).toHaveBeenCalledWith('DELETE FROM device_tokens WHERE user_id = $1', [5]);
    });

    it('TC-UNIT-FcmService-005 — deletes nothing when the user is missing', async () => {
        await fcmService.removeToken(null);

        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('fcmService.sendNotification', () => {
    it('TC-UNIT-FcmService-006 — sends the correct Expo payload for each device', async () => {
        dungDb({ tokens: [TOKEN_1] });

        await fcmService.sendNotification(5, { title: 'Chuyến mới', body: 'Bạn có chuyến', data: { type: 'TRIP' } });

        const [url, opts] = global.fetch.mock.calls[0];
        expect(url).toBe('https://exp.host/--/api/v2/push/send');
        expect(JSON.parse(opts.body)).toEqual([{
            to: TOKEN_1,
            title: 'Chuyến mới',
            body: 'Bạn có chuyến',
            data: { type: 'TRIP' },
            sound: 'default',
            priority: 'high',
            channelId: 'default',
        }]);
    });

    it('TC-UNIT-FcmService-007 — every data field is coerced to a string, as Expo requires', async () => {
        await fcmService.sendNotification(5, {
            title: 'X', body: 'Y', data: { entityId: 77, isRead: false, nested: null },
        });

        expect(JSON.parse(global.fetch.mock.calls[0][1].body)[0].data).toEqual({
            entityId: '77', isRead: 'false', nested: 'null',
        });
    });

    it('TC-UNIT-FcmService-008 — a missing body is sent as an empty string, never as undefined', async () => {
        await fcmService.sendNotification(5, { title: 'X' });

        expect(JSON.parse(global.fetch.mock.calls[0][1].body)[0].body).toBe('');
    });

    it('TC-UNIT-FcmService-009 — a token not in Expo format is filtered out', async () => {
        dungDb({ tokens: ['token-rac-cua-fcm-cu', TOKEN_1] });

        await fcmService.sendNotification(5, { title: 'X' });

        const gui = JSON.parse(global.fetch.mock.calls[0][1].body);
        expect(gui).toHaveLength(1);
        expect(gui[0].to).toBe(TOKEN_1);
    });

    it('TC-UNIT-FcmService-010 — a user with no registered device is skipped and logged', async () => {
        dungDb({ tokens: [] });

        await fcmService.sendNotification(5, { title: 'X' });

        expect(global.fetch).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
            '[push] bỏ qua — user chưa đăng ký thiết bị nào', { userId: 5 },
        );
    });

    it('TC-UNIT-FcmService-011 — queries nothing when the user is missing', async () => {
        await fcmService.sendNotification(null, { title: 'X' });

        expect(pool.query).not.toHaveBeenCalled();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('TC-UNIT-FcmService-012 — an ok ticket is stored so the cron can reconcile the receipt', async () => {
        dungFetch({ data: [{ status: 'ok', id: 'ticket-1' }] });

        await fcmService.sendNotification(5, { title: 'X' });

        expect(sqlDaChay().some((s) => /INSERT INTO push_tickets/.test(s))).toBe(true);
    });

    it('TC-UNIT-FcmService-013 — a device that uninstalled the app (DeviceNotRegistered) has its token cleaned up', async () => {
        dungFetch({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] });

        await fcmService.sendNotification(5, { title: 'X' });

        expect(pool.query).toHaveBeenCalledWith(
            'DELETE FROM device_tokens WHERE token = ANY($1)', [[TOKEN_1]],
        );
    });

    it('TC-UNIT-FcmService-014 — any other ticket error keeps the token and only logs a warning', async () => {
        dungFetch({ data: [{ status: 'error', details: { error: 'MessageTooBig' }, message: 'quá dài' }] });

        await fcmService.sendNotification(5, { title: 'X' });

        expect(sqlDaChay().some((s) => /DELETE FROM device_tokens WHERE token/.test(s))).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('[push] ticket lỗi', expect.objectContaining({
            code: 'MessageTooBig',
        }));
    });

    it('TC-UNIT-FcmService-015 — a rejected Expo request is logged and no ticket is stored', async () => {
        dungFetch({ error: 'unauthorized' }, false, 401);

        await fcmService.sendNotification(5, { title: 'X' });

        expect(logger.warn).toHaveBeenCalledWith('[push] Expo từ chối request gửi',
            expect.objectContaining({ userId: 5, status: 401 }));
        expect(sqlDaChay().some((s) => /INSERT INTO push_tickets/.test(s))).toBe(false);
    });

    it('TC-UNIT-FcmService-016 — a malformed Expo response is logged without crashing', async () => {
        dungFetch({ data: 'khong-phai-mang' });

        await expect(fcmService.sendNotification(5, { title: 'X' })).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith('[push] Expo trả về dữ liệu không đúng định dạng',
            expect.any(Object));
    });

    it('TC-UNIT-FcmService-017 — a network failure never escapes, but it must leave a log entry', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));

        await expect(fcmService.sendNotification(5, { title: 'X' })).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith('[push] gửi thất bại',
            expect.objectContaining({ userId: 5, message: 'ETIMEDOUT' }));
    });

    it('TC-UNIT-FcmService-018 — over 100 devices are split into several send batches', async () => {
        const nhieuToken = Array.from({ length: 250 }, (_, i) => `ExponentPushToken[${String(i).padStart(22, '0')}]`);
        dungDb({ tokens: nhieuToken });

        await fcmService.sendNotification(5, { title: 'X' });

        expect(global.fetch).toHaveBeenCalledTimes(3);
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toHaveLength(100);
        expect(JSON.parse(global.fetch.mock.calls[2][1].body)).toHaveLength(50);
    });

    it('TC-UNIT-FcmService-019 — logs how many devices succeeded and failed, so latency can be measured', async () => {
        dungDb({ tokens: [TOKEN_1, TOKEN_2] });
        dungFetch({ data: [{ status: 'ok', id: 't1' }, { status: 'error', details: { error: 'X' } }] });

        await fcmService.sendNotification(5, { title: 'X' });

        expect(logger.info).toHaveBeenCalledWith('[push] đã gửi', expect.objectContaining({
            userId: 5, thietBi: 2, ok: 1, loi: 1,
        }));
    });
});

describe('fcmService.sendToMany', () => {
    it('TC-UNIT-FcmService-020 — removes duplicate users and drops empty ids', async () => {
        dungDb({ tokens: [] });

        await fcmService.sendToMany([5, 5, null, 0, 6], { title: 'X' });

        const truyVanToken = sqlDaChay().filter((s) => /SELECT token FROM device_tokens/.test(s));
        expect(truyVanToken).toHaveLength(2);
    });

    it('TC-UNIT-FcmService-021 — sends nothing for an empty or undefined list', async () => {
        await fcmService.sendToMany([], { title: 'X' });
        await fcmService.sendToMany(undefined, { title: 'X' });

        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('fcmService.checkReceipts — đối chiếu máy có thật sự nhận', () => {
    it('TC-UNIT-FcmService-022 — returns zero and calls Expo not at all when no ticket is waiting', async () => {
        dungDb({ tickets: [] });

        expect(await fcmService.checkReceipts()).toEqual({ checked: 0, errors: 0 });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('TC-UNIT-FcmService-023 — an ok receipt is marked reconciled and counted as checked', async () => {
        dungDb({ tickets: [{ ticket_id: 't1', token: TOKEN_1 }] });
        dungFetch({ data: { t1: { status: 'ok' } } });

        const kq = await fcmService.checkReceipts();

        expect(kq).toEqual({ checked: 1, errors: 0 });
        expect(sqlDaChay().some((s) => /UPDATE push_tickets/.test(s))).toBe(true);
    });

    it('TC-UNIT-FcmService-024 — a DeviceNotRegistered receipt cleans up the dead token', async () => {
        dungDb({ tickets: [{ ticket_id: 't1', token: TOKEN_1 }] });
        dungFetch({ data: { t1: { status: 'error', details: { error: 'DeviceNotRegistered' } } } });

        const kq = await fcmService.checkReceipts();

        expect(kq.errors).toBe(1);
        expect(pool.query).toHaveBeenCalledWith(
            'DELETE FROM device_tokens WHERE token = ANY($1)', [[TOKEN_1]],
        );
    });

    it('TC-UNIT-FcmService-025 — any other receipt error is logged and the token is KEPT', async () => {
        dungDb({ tickets: [{ ticket_id: 't1', token: TOKEN_1 }] });
        dungFetch({ data: { t1: { status: 'error', details: { error: 'MessageRateExceeded' } } } });

        await fcmService.checkReceipts();

        expect(sqlDaChay().some((s) => /DELETE FROM device_tokens WHERE token/.test(s))).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith('[push] receipt báo lỗi', expect.objectContaining({
            code: 'MessageRateExceeded',
        }));
    });

    it('TC-UNIT-FcmService-026 — a receipt that is not ready yet is left for the next cron pass', async () => {
        dungDb({ tickets: [{ ticket_id: 't1', token: TOKEN_1 }] });
        dungFetch({ data: { t1: {} } });

        const kq = await fcmService.checkReceipts();

        expect(kq).toEqual({ checked: 0, errors: 0 });
    });

    it('TC-UNIT-FcmService-027 — a rejected Expo receipt request is logged without crashing', async () => {
        dungDb({ tickets: [{ ticket_id: 't1', token: TOKEN_1 }] });
        dungFetch({}, false, 500);

        await expect(fcmService.checkReceipts()).resolves.toEqual({ checked: 0, errors: 0 });
        expect(logger.warn).toHaveBeenCalledWith('[push] Expo từ chối request lấy receipt',
            expect.objectContaining({ status: 500 }));
    });

    it('TC-UNIT-FcmService-028 — a network failure while fetching receipts never escapes', async () => {
        dungDb({ tickets: [{ ticket_id: 't1', token: TOKEN_1 }] });
        global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));

        await expect(fcmService.checkReceipts()).resolves.toEqual({ checked: 0, errors: 0 });
        expect(logger.warn).toHaveBeenCalledWith('[push] lấy receipt thất bại', expect.any(Object));
    });
});

describe('fcmService.purgeOldTickets', () => {
    it('TC-UNIT-FcmService-029 — returns the number of rows purged', async () => {
        pool.query.mockResolvedValue({ rowCount: 42 });

        expect(await fcmService.purgeOldTickets()).toBe(42);
    });

    it('TC-UNIT-FcmService-030 — returns 0 instead of throwing when the database fails', async () => {
        pool.query.mockRejectedValue(new Error('DB sập'));

        expect(await fcmService.purgeOldTickets()).toBe(0);
    });
});
