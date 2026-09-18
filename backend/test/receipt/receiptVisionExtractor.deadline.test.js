/**
 * Hạn chót của một lượt đọc Gemini — tính CẢ các lần thử lại.
 *
 * Trước đây mỗi lần gọi có hạn 45 giây nhưng được thử lại tới 3 lần, và với hóa đơn LỆCH
 * TRƯỜNG còn thêm một lượt đọc lại cũng 3 × 45 giây. Tài xế đứng chờ "Đang kiểm tra..." quá
 * hạn chờ của app — đúng ca người dùng báo lỗi "không thể kết nối" khi quét hóa đơn sai lệch.
 *
 * SDK Gemini được thay bằng một model giả: lỗi và độ trễ là thứ cần điều khiển ở đây.
 */
const assert = require('node:assert');

const image = { base64: 'ZmFrZQ==', mimeType: 'image/jpeg', sha256: 'abc' };

const loadExtractor = (generateContent) => {
    jest.resetModules();
    jest.doMock('@google/generative-ai', () => ({
        ...jest.requireActual('@google/generative-ai'),
        GoogleGenerativeAI: class {
            getGenerativeModel() { return { generateContent }; }
        },
    }));
    return require('../../services/receiptVisionExtractor');
};

const overloaded = () => Object.assign(new Error('[503 Service Unavailable] high demand'), { status: 503 });

let savedKey;
beforeEach(() => {
    savedKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
});
afterEach(() => {
    jest.dontMock('@google/generative-ai');
    if (savedKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = savedKey;
});

describe('receiptVisionExtractor — hạn chót của cả lượt đọc', () => {
    it('model treo thì lượt đọc dừng đúng hạn chót, không chờ đủ 45 giây', async () => {
        const extractor = loadExtractor(() => new Promise(() => {}));
        const startedAt = Date.now();

        const result = await extractor.extractReceipt('x.jpg', { image, deadlineAt: startedAt + 5_000 });

        assert.strictEqual(result.code, 'TIMEOUT');
        assert.ok(Date.now() - startedAt < 6_000, `mất ${Date.now() - startedAt}ms`);
    });

    it('không thử lại khi phần thời gian còn lại không đủ cho một lần gọi', async () => {
        let calls = 0;
        const extractor = loadExtractor(async () => { calls += 1; throw overloaded(); });

        const result = await extractor.extractReceipt('x.jpg', { image, deadlineAt: Date.now() + 4_200 });

        assert.strictEqual(result.code, 'SERVICE_UNAVAILABLE');
        assert.strictEqual(calls, 1);
        assert.strictEqual(result.meta.attempts, 1);
    });

    it('hết hạn chót từ trước thì không gọi model lần nào', async () => {
        let calls = 0;
        const extractor = loadExtractor(async () => { calls += 1; throw overloaded(); });

        const result = await extractor.extractReceipt('x.jpg', { image, deadlineAt: Date.now() + 1_000 });

        assert.strictEqual(result.code, 'TIMEOUT');
        assert.strictEqual(calls, 0);
    });

    it('không có hạn chót thì vẫn thử lại đủ 3 lần như cũ khi dịch vụ quá tải', async () => {
        let calls = 0;
        const extractor = loadExtractor(async () => { calls += 1; throw overloaded(); });

        const result = await extractor.extractReceipt('x.jpg', { image });

        assert.strictEqual(result.code, 'SERVICE_UNAVAILABLE');
        assert.strictEqual(calls, 3);
    });
});
