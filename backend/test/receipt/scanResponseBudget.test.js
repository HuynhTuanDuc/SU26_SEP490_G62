/**
 * Hạn TRẢ LỜI của một request có quét hóa đơn.
 *
 * Trần 55 giây của lượt quét trước đây bắt đầu đếm từ lúc BẮT ĐẦU QUÉT, tức là sau khi
 * ảnh đã đi hết mạng di động và đã được đẩy xong lên Cloudinary. Tổng thời gian tài xế
 * thật sự phải chờ là (tải ảnh) + 55 giây — hai đoạn cộng lại vượt hạn chờ của app, và
 * app báo "hết thời gian chờ" trong khi máy chủ vẫn trả lời bình thường vài giây sau
 * (nên trong log máy chủ không có lỗi nào cả).
 *
 * Giờ hạn đếm từ lúc request TỚI máy chủ, và lượt quét chỉ được dùng phần CÒN LẠI.
 */
const assert = require('node:assert');
const { mock } = require('../helpers/nodeTestMock');

const receiptService = require('../../services/receiptValidationService');
const imagePipeline = require('../../services/receiptImagePipeline');
const ocrScanner = require('../../services/receiptOcrScanner');
const extractor = require('../../services/receiptVisionExtractor');
const repository = require('../../repositories/receiptExtractionRepository');

const { RESPONSE_BUDGET_MS, MIN_SCAN_BUDGET_MS } = receiptService;

// Trần riêng của một lượt quét (RECEIPT_SCAN_BUDGET_MS). Lấy qua đúng con đường mà mã
// thật dùng, để test không trôi khi trần đổi.
const SCAN_BUDGET_MS = Number(process.env.RECEIPT_SCAN_BUDGET_MS || 55_000);

let seenDeadline;
let seenOcrDeadline;

beforeEach(() => {
    seenDeadline = null;
    seenOcrDeadline = null;

    // Không đụng tới DB: test này chỉ đo hạn chót được truyền đi.
    mock.method(repository, 'saveExtraction', async () => null);
    mock.method(repository, 'getExtraKeywords', async () => []);
    mock.method(repository, 'findDuplicates', async () => []);
    mock.method(imagePipeline, 'loadImage', async () => ({
        ok: true,
        vision: { base64: 'ZmFrZQ==', mimeType: 'image/jpeg', sha256: 'sha-1', bytes: 120_000 },
        ocr: { buffer: Buffer.from('fake'), mimeType: 'image/jpeg', enhanced: true },
        quality: { bytes: 120_000, width: 1600, height: 2000, format: 'jpeg', reasons: [] },
    }));
    mock.method(ocrScanner, 'scanImage', async (_buffer, opts = {}) => {
        seenOcrDeadline = opts.deadlineAt ?? null;
        return { ok: false, code: 'OCR_DISABLED' };
    });
    // Dừng ngay sau lượt đọc đầu: phần cần đo là hạn chót được truyền vào, không phải
    // kết quả đọc.
    mock.method(extractor, 'extractReceipt', async (_url, { deadlineAt }) => {
        seenDeadline = deadlineAt;
        return { ok: false, code: 'TIMEOUT', error: 'hết giờ', meta: { provider: 'google' } };
    });
});

afterEach(() => mock.restoreAll());

/** Sai số cho thời gian chạy thật giữa lúc test lấy mốc và lúc runPipeline lấy mốc. */
const nearly = (actual, expected, label) => assert.ok(
    Math.abs(actual - expected) < 1_000,
    `${label}: chờ ~${expected}, nhận ${actual} (lệch ${actual - expected}ms)`,
);

describe('Trần thời gian quét bám theo hạn trả lời của cả request', () => {
    it('tải ảnh mất gần hết hạn → lượt quét chỉ còn phần dư, không phải trọn 55 giây', async () => {
        const now = Date.now();
        // Request tới 45 giây trước: 40 giây đã tiêu vào việc đẩy ảnh lên Cloudinary.
        await receiptService.runPipeline('x.jpg', { profile: 'maintenance', deadlineAt: now + 15_000 });

        nearly(seenDeadline, now + 20_000, 'hạn của lượt quét');
        // 20 giây chứ không phải 15: dưới sàn thì hóa đơn gửi từ nơi sóng yếu không
        // được đọc lần nào, tức là tính năng tự đọc tắt đúng lúc cần nhất.
        nearly(seenDeadline, Date.now() + MIN_SCAN_BUDGET_MS, 'sàn tối thiểu');
    });

    it('tải ảnh nhanh → lượt quét vẫn bị chặn ở trần riêng của nó', async () => {
        const now = Date.now();
        await receiptService.runPipeline('x.jpg', { profile: 'maintenance', deadlineAt: now + 600_000 });

        nearly(seenDeadline, now + SCAN_BUDGET_MS, 'trần của lượt quét');
    });

    it('hạn còn lại nằm giữa sàn và trần thì lấy đúng phần còn lại', async () => {
        const now = Date.now();
        await receiptService.runPipeline('x.jpg', { profile: 'maintenance', deadlineAt: now + 30_000 });

        nearly(seenDeadline, now + 30_000, 'hạn còn lại');
    });

    it('OCR chịu chung hạn chót — nơi gọi chờ nó bằng Promise.all', async () => {
        const now = Date.now();
        await receiptService.runPipeline('x.jpg', { profile: 'maintenance', deadlineAt: now + 25_000 });

        nearly(seenOcrDeadline, now + 25_000, 'hạn của OCR');
    });

    it('không truyền hạn nào (luồng cũ, màn duyệt) thì giữ nguyên trần cũ', async () => {
        const now = Date.now();
        await receiptService.runPipeline('x.jpg', { profile: 'maintenance' });

        nearly(seenDeadline, now + SCAN_BUDGET_MS, 'trần mặc định');
    });

    it('hạn trả lời đi xuyên validateReceipt tới tận lượt đọc', async () => {
        const now = Date.now();
        await receiptService.validateReceipt('x.jpg', {
            profile: 'maintenance',
            allowCache: false,
            checkDuplicates: false,
            entityId: null,
            deadlineAt: now + 30_000,
        });

        nearly(seenDeadline, now + 30_000, 'hạn đi qua validateReceipt');
    });
});

describe('Hạn trả lời được tính từ lúc request TỚI máy chủ', () => {
    it('RESPONSE_BUDGET_MS thấp hơn hạn chờ của app tài xế', () => {
        // App cắt request tải hóa đơn ở 120 giây (TIMEOUT_SCAN_UPLOAD_MS). Khoảng chênh
        // là phần dành cho việc đẩy ảnh qua mạng di động. Hai con số này bò sát nhau là
        // quay lại đúng lỗi cũ.
        assert.ok(RESPONSE_BUDGET_MS <= 60_000, `RESPONSE_BUDGET_MS = ${RESPONSE_BUDGET_MS}`);
        assert.ok(MIN_SCAN_BUDGET_MS < RESPONSE_BUDGET_MS);
    });
});
