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

/**
 * Hết hạn mức Gemini (429) — thứ KHÔNG to lên khi nâng cấu hình máy chủ.
 *
 * Máy chủ khoẻ hơn chỉ có nghĩa là hóa đơn được đẩy tới Gemini nhanh hơn, tức là chạm trần
 * hạn mức SỚM hơn. Và trước đây mỗi lần chạm trần lại đẻ thêm hai lời gọi thử lại nữa —
 * vào đúng cái hạn mức đang cạn. Cả hệ thống rơi vào vòng: càng gọi càng lún, báo "quá tải"
 * liên tục, không hóa đơn nào được đọc.
 */
describe('receiptVisionExtractor — hết hạn mức thì nghỉ, không lún thêm', () => {
    beforeEach(() => {
        const ext = require('../../services/receiptVisionExtractor');
        ext.resetRateLimitState();
    });

    const quotaError = () => Object.assign(new Error('[429 Too Many Requests] Resource has been exhausted'), { status: 429 });

    it('429 KHÔNG được thử lại — thử lại chỉ tốn thêm hạn mức đang cạn', async () => {
        let calls = 0;
        const extractor = loadExtractor(async () => { calls += 1; throw quotaError(); });

        const result = await extractor.extractReceipt('x.jpg', { image });

        assert.strictEqual(result.code, 'RATE_LIMIT');
        assert.strictEqual(calls, 1, 'chỉ được gọi đúng một lần');
    });

    it('503 quá tải nhất thời thì VẪN thử lại — nó hỏng ngay và lần sau thường qua', async () => {
        let calls = 0;
        const extractor = loadExtractor(async () => {
            calls += 1;
            throw Object.assign(new Error('[503 Service Unavailable] high demand'), { status: 503 });
        });

        await extractor.extractReceipt('x.jpg', { image });

        assert.strictEqual(calls, 3, 'giữ nguyên cách xử lý 503');
    });

    it('sau khi chạm trần, hóa đơn kế tiếp không gọi model nữa mà trả lời ngay', async () => {
        let calls = 0;
        const extractor = loadExtractor(async () => { calls += 1; throw quotaError(); });

        await extractor.extractReceipt('x.jpg', { image });
        const startedAt = Date.now();
        const second = await extractor.extractReceipt('y.jpg', { image });

        assert.strictEqual(calls, 1, 'hóa đơn sau không được gọi model lần nào');
        assert.strictEqual(second.code, 'RATE_LIMIT');
        assert.strictEqual(second.meta.rate_limited, true);
        // Tài xế không phải chờ: trả lời tức thì rồi chuyển sang cần người xem.
        assert.ok(Date.now() - startedAt < 50, `mất ${Date.now() - startedAt}ms`);
        assert.strictEqual(extractor.isRateLimited(), true);
    });

    it('khoảng nghỉ hết thì gọi lại, và gọi được là mở khoá ngay', async () => {
        let calls = 0;
        const extractor = loadExtractor(async () => {
            calls += 1;
            if (calls === 1) throw quotaError();
            return { response: { text: () => JSON.stringify({ is_document: true, doc_type: 'invoice', line_items: [], total: 1000 }) } };
        });

        await extractor.extractReceipt('x.jpg', { image });
        assert.strictEqual(extractor.isRateLimited(), true);

        // Giả lập khoảng nghỉ đã trôi qua.
        extractor.resetRateLimitState();
        const second = await extractor.extractReceipt('y.jpg', { image });

        assert.strictEqual(second.ok, true);
        assert.strictEqual(extractor.isRateLimited(), false, 'gọi được rồi thì không nghỉ nữa');
    });

    it('khoảng nghỉ tắt được bằng env, để môi trường có hạn mức trả phí không bị chặn oan', async () => {
        const saved = process.env.RECEIPT_VISION_RATE_LIMIT_COOLDOWN_MS;
        process.env.RECEIPT_VISION_RATE_LIMIT_COOLDOWN_MS = '0';
        try {
            let calls = 0;
            const extractor = loadExtractor(async () => { calls += 1; throw quotaError(); });

            await extractor.extractReceipt('x.jpg', { image });
            await extractor.extractReceipt('y.jpg', { image });

            assert.strictEqual(calls, 2, 'không nghỉ thì hóa đơn sau vẫn được thử');
        } finally {
            if (saved === undefined) delete process.env.RECEIPT_VISION_RATE_LIMIT_COOLDOWN_MS;
            else process.env.RECEIPT_VISION_RATE_LIMIT_COOLDOWN_MS = saved;
        }
    });
});
