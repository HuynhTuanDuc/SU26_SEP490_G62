/**
 * Những việc dây chuyền quét làm mà KHÔNG ai cần tới — mỗi việc là vài trăm ms tới vài
 * giây trong lúc tài xế đứng chờ.
 *
 * Log máy chủ thật (20/9) là lý do có file này: một request "Hoàn thành bảo dưỡng" bị app
 * bỏ ở giây thứ 30, phần lớn thời gian nằm ở những việc không sinh ra kết quả nào.
 */
const assert = require('node:assert');
const { mock } = require('../helpers/nodeTestMock');

const imagePipeline = require('../../services/receiptImagePipeline');
const ocrScanner = require('../../services/receiptOcrScanner');
const extractor = require('../../services/receiptVisionExtractor');
const repository = require('../../repositories/receiptExtractionRepository');
const receiptService = require('../../services/receiptValidationService');

const CLOUD_URL = 'https://res.cloudinary.com/demo/image/upload/v1/g62/bill.jpg';

const anhGia = Buffer.from('anh-gia-du-lon'.repeat(400));

/** fetch giả: ghi lại thứ tự gọi và thời điểm gọi, trả ảnh sau `delay` ms. */
const stubFetch = (delay = 40) => {
    const calls = [];
    global.fetch = jest.fn(async (url) => {
        calls.push({ url: String(url), at: Date.now() });
        await new Promise((resolve) => { setTimeout(resolve, delay); });
        return {
            ok: true,
            headers: { get: (h) => (h === 'content-type' ? 'image/jpeg' : String(anhGia.length)) },
            arrayBuffer: async () => anhGia,
        };
    });
    return calls;
};

describe('Tải ảnh: hai biến thể đi song song', () => {
    let savedFetch;
    beforeEach(() => { savedFetch = global.fetch; });
    afterEach(() => { global.fetch = savedFetch; });

    it('biến thể cho model và cho OCR tải cùng lúc, không nối đuôi nhau', async () => {
        const calls = stubFetch(60);
        const startedAt = Date.now();

        const loaded = await imagePipeline.loadImage(CLOUD_URL);
        const elapsed = Date.now() - startedAt;

        assert.strictEqual(calls.length, 2);
        assert.ok(loaded.ocr.enhanced, 'phải dùng được biến thể tăng cường');
        // Hai lượt tải bắt đầu gần như cùng lúc; nối đuôi nhau thì tổng phải ~120ms.
        assert.ok(calls[1].at - calls[0].at < 30, `lệch nhau ${calls[1].at - calls[0].at}ms — vẫn đang nối đuôi`);
        assert.ok(elapsed < 110, `tổng ${elapsed}ms — vẫn đang nối đuôi`);
    });

    it('không cần biến thể OCR thì KHÔNG tải nó — tiết kiệm hẳn một lượt tải ảnh', async () => {
        const calls = stubFetch(10);

        const loaded = await imagePipeline.loadImage(CLOUD_URL, { withOcrVariant: false });

        assert.strictEqual(calls.length, 1, 'chỉ được tải biến thể cho model');
        assert.strictEqual(loaded.ocr, null);
    });

    it('biến thể OCR hỏng thì lượt quét vẫn chạy trên ảnh thường', async () => {
        // Phân biệt theo URL chứ không theo thứ tự gọi: hai lượt tải giờ đi song song nên
        // thứ tự tới nơi không còn cố định.
        global.fetch = jest.fn(async (url) => {
            if (String(url).includes('e_grayscale')) throw new Error('mạng lỗi');
            return {
                ok: true,
                headers: { get: (h) => (h === 'content-type' ? 'image/jpeg' : String(anhGia.length)) },
                arrayBuffer: async () => anhGia,
            };
        });

        const loaded = await imagePipeline.loadImage(CLOUD_URL);

        assert.strictEqual(loaded.ok, true);
        assert.strictEqual(loaded.ocr.enhanced, false, 'lùi về ảnh thường chứ không bỏ luôn OCR');
    });
});

describe('Dây chuyền không tải ảnh cho một kênh đang tắt', () => {
    beforeEach(() => {
        mock.method(repository, 'saveExtraction', async () => null);
        mock.method(repository, 'getExtraKeywords', async () => []);
        mock.method(repository, 'findDuplicates', async () => []);
        mock.method(extractor, 'extractReceipt', async () => ({
            ok: false, code: 'TIMEOUT', error: 'hết giờ', meta: { provider: 'google' },
        }));
    });
    afterEach(() => mock.restoreAll());

    it('OCR đang không dùng được → không xin biến thể ảnh dành cho OCR', async () => {
        mock.method(ocrScanner, 'isOcrAvailable', () => false);
        const spy = mock.method(imagePipeline, 'loadImage', async () => ({
            ok: true,
            vision: { base64: 'ZmFrZQ==', mimeType: 'image/jpeg', sha256: 'sha', bytes: 1000 },
            ocr: null,
            quality: { bytes: 1000, width: 1600, height: 2000, format: 'jpeg', reasons: [] },
        }));

        await receiptService.runPipeline(CLOUD_URL, { profile: 'maintenance' });

        assert.strictEqual(spy.mock.calls[0].arguments[1].withOcrVariant, false);
    });

    it('OCR dùng được → vẫn xin biến thể ảnh cho nó', async () => {
        mock.method(ocrScanner, 'isOcrAvailable', () => true);
        mock.method(ocrScanner, 'scanImage', async () => ({ ok: false, code: 'OCR_DISABLED' }));
        const spy = mock.method(imagePipeline, 'loadImage', async () => ({
            ok: true,
            vision: { base64: 'ZmFrZQ==', mimeType: 'image/jpeg', sha256: 'sha', bytes: 1000 },
            ocr: { buffer: Buffer.from('x'), mimeType: 'image/jpeg', enhanced: true },
            quality: { bytes: 1000, width: 1600, height: 2000, format: 'jpeg', reasons: [] },
        }));

        await receiptService.runPipeline(CLOUD_URL, { profile: 'maintenance' });

        assert.strictEqual(spy.mock.calls[0].arguments[1].withOcrVariant, true);
    });
});
