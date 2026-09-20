/**
 * Dòng log cho trường hợp client bỏ cuộc trước khi máy chủ trả lời.
 *
 * Đây là khoảng mù đã làm lỗi "app báo hết thời gian chờ mà log không có 500" khó lần ra.
 * Log thật của một lần tài xế gặp lỗi chỉ còn lại đúng dòng này:
 *
 *   "POST /api/drivers/maintenance/100000/complete HTTP/1.1" - -
 *
 * Hai dấu gạch ngang là :status và :res[content-length] — morgan để trống vì máy chủ chưa
 * gửi đi byte nào. Nhìn vào đó, người đọc log kết luận "máy chủ không lỗi gì", trong khi
 * tài xế đang nhìn một câu báo lỗi trên điện thoại.
 */
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

jest.mock('../../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const logger = require('../../config/logger');
const { trackRequestTiming } = require('../../middleware/requestTiming');

const fakeReq = () => ({ method: 'POST', originalUrl: '/api/drivers/maintenance/100000/complete' });

/** res tối giản: chỉ cần phát được sự kiện 'close' và mang hai cờ mà middleware hỏi. */
const fakeRes = ({ headersSent = false, writableEnded = false } = {}) => {
    const res = new EventEmitter();
    res.headersSent = headersSent;
    res.writableEnded = writableEnded;
    return res;
};

beforeEach(() => {
    logger.warn.mockClear();
    logger.info.mockClear();
});

describe('trackRequestTiming', () => {
    it('đặt mốc request tới để các hạn chót bên trong đếm từ đó', () => {
        const req = fakeReq();
        const truoc = Date.now();

        trackRequestTiming(req, fakeRes(), () => {});

        assert.ok(req.receivedAt >= truoc && req.receivedAt <= Date.now());
    });

    it('client đóng kết nối giữa chừng → ghi rõ đường nào, sau bao nhiêu giây', () => {
        const req = fakeReq();
        const res = fakeRes();
        trackRequestTiming(req, res, () => {});
        // Giả lập app bỏ cuộc sau 30 giây — đúng hạn chờ mặc định của app đời cũ.
        req.receivedAt -= 30_000;

        res.emit('close');

        assert.strictEqual(logger.warn.mock.calls.length, 1);
        const line = logger.warn.mock.calls[0][0];
        assert.match(line, /bỏ dở/);
        assert.match(line, /POST \/api\/drivers\/maintenance\/100000\/complete/);
        // Con số giây là thứ chỉ đích danh thủ phạm: 30 giây = hạn của app đời cũ,
        // 60 = hạn của iOS, 120 = hạn của app hiện tại.
        assert.match(line, /30\.0s/);
    });

    it('trả lời xong bình thường thì KHÔNG ghi gì — morgan đã có dòng của nó', () => {
        const req = fakeReq();
        const res = fakeRes({ headersSent: true, writableEnded: true });
        trackRequestTiming(req, res, () => {});

        res.emit('close');

        assert.strictEqual(logger.warn.mock.calls.length, 0);
    });

    it('đã gửi header rồi mới đứt thì cũng không tính là bỏ dở — morgan có mã trạng thái', () => {
        const req = fakeReq();
        const res = fakeRes({ headersSent: true });
        trackRequestTiming(req, res, () => {});

        res.emit('close');

        assert.strictEqual(logger.warn.mock.calls.length, 0);
    });

    it('luôn gọi next() — không được chắn đường request nào', () => {
        let called = 0;
        trackRequestTiming(fakeReq(), fakeRes(), () => { called += 1; });

        assert.strictEqual(called, 1);
    });
});
