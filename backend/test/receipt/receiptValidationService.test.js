const { mock } = require('../helpers/nodeTestMock');
const assert = require('node:assert');

const repository = require('../../repositories/receiptExtractionRepository');
const imagePipeline = require('../../services/receiptImagePipeline');
const ocrScanner = require('../../services/receiptOcrScanner');
const extractor = require('../../services/receiptVisionExtractor');
const service = require('../../services/receiptValidationService');

/**
 * Ảnh giả đã "tải xong". Dây chuyền thật tải ảnh ở giai đoạn 1 rồi mới gọi model, nên
 * test nào mock model cũng phải mock cả bước tải — nếu không nó đi ra mạng thật với
 * một URL bịa và cả bộ test phụ thuộc vào việc có Internet hay không.
 */
const loadedImage = (overrides = {}) => ({
    ok: true,
    vision: { base64: 'ZmFrZQ==', mimeType: 'image/jpeg', sha256: 'abc', bytes: 120_000 },
    ocr: { buffer: Buffer.from('fake'), mimeType: 'image/jpeg', enhanced: true },
    quality: { bytes: 120_000, width: 1600, height: 2000, format: 'jpeg', reasons: [] },
    ...overrides,
});

/** Hóa đơn bảo dưỡng tối thiểu nhưng tự khớp số học, với tổng cho trước. */
const billWithTotal = (total) => ({
    is_document: true,
    doc_type: 'invoice',
    vendor: { name: 'Garage Thành Công', tax_code: null, address: null, phone: null },
    invoice_no: 'HD-1',
    issued_date: null,
    vehicle_plate: null,
    currency: 'VND',
    line_items: [
        { raw_name: 'Thay nhớt động cơ', quantity: 1, unit: 'lần', unit_price: total, line_total: total, category: 'engine_oil' },
    ],
    subtotal: total,
    discount: 0,
    vat_rate: null,
    vat_amount: null,
    total,
    unreadable_fields: [],
});

const okResult = (total) => ({
    ok: true,
    extraction: billWithTotal(total),
    raw: billWithTotal(total),
    meta: { provider: 'google', model: 'test', prompt_version: 'v1', image_sha256: 'abc', latency_ms: 10 },
});

describe('receiptValidationService', () => {
    beforeEach(() => {
        service.invalidateTaxonomyCache();
        mock.method(repository, 'getExtraKeywords', async () => []);
        mock.method(repository, 'saveExtraction', async () => ({ id: 1 }));
        mock.method(repository, 'findLatestByImageUrl', async () => null);
        mock.method(imagePipeline, 'loadImage', async () => loadedImage());
        // Mặc định coi như không có kênh OCR: các test ở file này kiểm tra luật nghiệp
        // vụ (khớp số tiền, dò trùng, ngưỡng chi phí), không kiểm tra lớp đối chiếu
        // chéo — lớp đó có bộ test riêng ở receiptCrossCheck.test.js.
        mock.method(ocrScanner, 'scanImage', async () => ({ ok: false, code: 'OCR_DISABLED', latency_ms: 0 }));
    });

    afterEach(() => {
        mock.restoreAll();
        service.invalidateTaxonomyCache();
    });

    it('chấp nhận khi số khai khớp TỔNG của nhiều hóa đơn rời', async () => {
        const totals = { 'a.jpg': 300_000, 'b.jpg': 500_000 };
        mock.method(extractor, 'extractReceipt', async (url) => okResult(totals[url]));

        const result = await service.validateMaintenanceBills(['a.jpg', 'b.jpg'], { claimedAmount: 800_000 });

        assert.strictEqual(result.verdict, 'passed');
        assert.strictEqual(result.blocked, false);
    });

    it('chấp nhận khi số khai khớp hóa đơn LỚN NHẤT — tài xế chụp trùng nhiều góc', async () => {
        // Chỉ so tổng thì ca này bị từ chối oan: cùng một hóa đơn 500k chụp hai lần
        // sẽ cộng thành 1 triệu.
        mock.method(extractor, 'extractReceipt', async () => okResult(500_000));

        const result = await service.validateMaintenanceBills(['a.jpg', 'b.jpg'], { claimedAmount: 500_000 });

        assert.strictEqual(result.verdict, 'passed');
    });

    it('từ chối khi số khai không khớp cả tổng lẫn hóa đơn lớn nhất', async () => {
        mock.method(extractor, 'extractReceipt', async () => okResult(200_000));

        const result = await service.validateMaintenanceBills(['a.jpg'], { claimedAmount: 5_000_000 });

        assert.strictEqual(result.verdict, 'rejected');
        assert.strictEqual(result.blocked, true);
        assert.match(result.reject_reason, /5\.000\.000đ/);
    });

    it('sự cố phía hệ thống thành needs_review chứ không phải passed', async () => {
        // Đây là chỗ hỏng cốt lõi của lớp cũ: OCR timeout thì trả valid = true, tức là
        // không còn ai nhìn lại khoản đó nữa.
        mock.method(extractor, 'extractReceipt', async () => ({
            ok: false, code: 'TIMEOUT', error: 'Quá thời gian đọc hóa đơn',
            meta: { provider: 'google', model: 'test', prompt_version: 'v1', image_sha256: null, latency_ms: 30_000 },
        }));

        const result = await service.validateMaintenanceBills(['a.jpg'], { claimedAmount: 5_000_000 });

        assert.strictEqual(result.verdict, 'needs_review');
        assert.strictEqual(result.blocked, false);
        assert.ok(result.reasons.some((r) => r.code === 'EXTRACTION_TIMEOUT'));
    });

    it('chặn khi lỗi là do người gửi và sửa được ngay bằng cách chụp lại', async () => {
        mock.method(extractor, 'extractReceipt', async () => ({
            ok: false, code: 'NOT_AN_IMAGE', error: 'Tệp tải về không phải ảnh',
            meta: { provider: 'google', model: 'test', prompt_version: 'v1', image_sha256: null, latency_ms: 5 },
        }));

        const result = await service.validateMaintenanceBills(['a.pdf'], { claimedAmount: 100_000 });

        assert.strictEqual(result.verdict, 'rejected');
        assert.strictEqual(result.blocked, true);
    });

    it('dùng lại bản đọc đã lưu thay vì gọi model lần hai', async () => {
        // Tài xế up ảnh (đọc lần 1) rồi mới nhập tiền và bấm hoàn tất. Cùng tấm ảnh thì
        // kết quả đọc không đổi — gọi lại model chỉ tốn tiền và thời gian.
        mock.method(repository, 'findLatestByImageUrl', async () => ({
            id: 9, image_url: 'a.jpg', image_sha256: 'abc',
            raw_extraction: billWithTotal(450_000),
            verdict: 'passed', receipt_total: 450_000,
            provider: 'google', model: 'test', prompt_version: 'v1',
        }));
        const spy = mock.method(extractor, 'extractReceipt', async () => okResult(450_000));

        const result = await service.validateMaintenanceBills(['a.jpg'], { claimedAmount: 450_000 });

        assert.strictEqual(result.verdict, 'passed');
        assert.strictEqual(spy.mock.calls.length, 0);
        // Đọc lại từ cache thì không được ghi thêm một dòng lưu vết trùng lặp.
        assert.strictEqual(repository.saveExtraction.mock.calls.length, 0);
    });

    it('không làm hỏng luồng chính khi không ghi được vết', async () => {
        mock.method(repository, 'saveExtraction', async () => { throw new Error('DB down'); });
        mock.method(extractor, 'extractReceipt', async () => okResult(450_000));

        const result = await service.validateMaintenanceBills(['a.jpg'], { claimedAmount: 450_000 });

        assert.strictEqual(result.verdict, 'passed');
    });

    it('vẫn chạy được bằng từ điển gốc khi không nạp được phần mở rộng', async () => {
        mock.method(repository, 'getExtraKeywords', async () => { throw new Error('DB down'); });
        mock.method(extractor, 'extractReceipt', async () => okResult(450_000));

        const result = await service.validateMaintenanceBills(['a.jpg'], { claimedAmount: 450_000 });

        assert.strictEqual(result.verdict, 'passed');
    });
});

describe('receiptValidationService — chống dùng lại hóa đơn', () => {
    beforeEach(() => {
        service.invalidateTaxonomyCache();
        mock.method(repository, 'getExtraKeywords', async () => []);
        mock.method(repository, 'saveExtraction', async () => ({ id: 1 }));
        mock.method(repository, 'findLatestByImageUrl', async () => null);
        mock.method(imagePipeline, 'loadImage', async () => loadedImage());
        // Mặc định coi như không có kênh OCR: các test ở file này kiểm tra luật nghiệp
        // vụ (khớp số tiền, dò trùng, ngưỡng chi phí), không kiểm tra lớp đối chiếu
        // chéo — lớp đó có bộ test riêng ở receiptCrossCheck.test.js.
        mock.method(ocrScanner, 'scanImage', async () => ({ ok: false, code: 'OCR_DISABLED', latency_ms: 0 }));
    });

    afterEach(() => {
        mock.restoreAll();
        service.invalidateTaxonomyCache();
    });

    it('chặn ảnh mới khi hóa đơn đó đã dùng cho đợt khác', () => {
        mock.method(extractor, 'extractReceipt', async () => okResult(450_000));
        mock.method(repository, 'findDuplicates', async () => ([
            { id: 5, entity_type: 'maintenance_record', entity_id: 99, created_at: '2026-08-01' },
        ]));

        return service.validateReceipt('a.jpg', {
            claimedAmount: 450_000, entityType: 'maintenance_record', entityId: 21, allowCache: false,
        }).then((result) => {
            assert.strictEqual(result.verdict, 'rejected');
            assert.match(result.reject_reason, /đợt bảo dưỡng #99/);
        });
    });

    it('KHÔNG dò trùng khi đọc lại từ vết đã ghi', async () => {
        // Cạm bẫy: ở bước hoàn tất, bản đọc lấy từ vết ghi lúc upload. Dò trùng lúc đó
        // sẽ khớp đúng dòng của chính nó và chặn mọi đợt bảo dưỡng hợp lệ.
        mock.method(repository, 'findLatestByImageUrl', async () => ({
            id: 9, image_url: 'a.jpg', image_sha256: 'abc',
            raw_extraction: billWithTotal(450_000),
            verdict: 'passed', receipt_total: 450_000,
            provider: 'google', model: 'test', prompt_version: 'v1',
        }));
        const dupSpy = mock.method(repository, 'findDuplicates', async () => ([
            { id: 9, entity_type: 'maintenance_record', entity_id: 21 },
        ]));

        const result = await service.validateMaintenanceBills(['a.jpg'], {
            claimedAmount: 450_000, entityType: 'maintenance_record', entityId: 21,
        });

        assert.strictEqual(result.verdict, 'passed');
        assert.strictEqual(dupSpy.mock.calls.length, 0);
    });

    it('không chặn tài xế khi việc dò trùng lỗi', async () => {
        mock.method(extractor, 'extractReceipt', async () => okResult(450_000));
        mock.method(repository, 'findDuplicates', async () => { throw new Error('DB down'); });

        const result = await service.validateReceipt('a.jpg', {
            claimedAmount: 450_000, entityType: 'maintenance_record', entityId: 21, allowCache: false,
        });

        assert.strictEqual(result.verdict, 'passed');
    });

    it('lưu khoá nhận dạng cùng bản đọc để lần sau dò được', async () => {
        mock.method(extractor, 'extractReceipt', async () => okResult(450_000));
        mock.method(repository, 'findDuplicates', async () => []);

        await service.validateReceipt('a.jpg', {
            claimedAmount: 450_000, entityType: 'maintenance_record', entityId: 21, allowCache: false,
        });

        const saved = repository.saveExtraction.mock.calls[0].arguments[0];
        assert.strictEqual(saved.vendorKey, 'name:garagethanhcong');
        assert.strictEqual(saved.invoiceNoKey, 'HD1');
    });
});

describe('receiptValidationService — dây chuyền nhiều giai đoạn', () => {
    const vnd = (value) => value.toLocaleString('en-US').replace(/,/g, '.');

    /**
     * Bản quét OCR khớp với hóa đơn do billWithTotal dựng ra.
     *
     * Có mã số thuế và số tạm ứng là cố ý, không phải cho giống thật: lớp đối chiếu
     * chéo chỉ coi một bản quét là dùng được khi nó đọc ra được ít nhất hai con số —
     * một bản quét chỉ ra đúng một con số thì không có gì để đối chiếu.
     */
    const scanFor = (total) => {
        const text = [
            'GARAGE THANH CONG',
            'MST 0101234567',
            'HOA DON BAN HANG so HD-1',
            `Thay nhot dong co   1   ${vnd(total)}   ${vnd(total)}`,
            `TONG CONG    ${vnd(total)}`,
            'Da tam ung 100.000',
        ].join('\n');
        return {
            ok: true, text, confidence: 85, engine: 'tesseract.js/vie+eng', latency_ms: 3_000,
            lines: text.split('\n').map((line) => ({ text: line, confidence: 85 })),
        };
    };

    beforeEach(() => {
        service.invalidateTaxonomyCache();
        mock.method(repository, 'getExtraKeywords', async () => []);
        mock.method(repository, 'saveExtraction', async () => ({ id: 1 }));
        mock.method(repository, 'findLatestByImageUrl', async () => null);
        mock.method(repository, 'findDuplicates', async () => []);
        mock.method(imagePipeline, 'loadImage', async () => loadedImage());
    });

    afterEach(() => {
        mock.restoreAll();
        service.invalidateTaxonomyCache();
    });

    it('KHÔNG gọi model khi ảnh đã bị loại vì quá nhỏ', async () => {
        // Tốn một lượt gọi model và cả chục giây OCR để rồi vẫn trả về đúng câu
        // "chụp lại đi" là lãng phí thuần tuý.
        mock.method(imagePipeline, 'loadImage', async () => loadedImage({
            quality: {
                bytes: 20_000, width: 300, height: 400, format: 'jpeg',
                reasons: [{ code: 'IMAGE_TOO_SMALL', severity: 'error', message: 'Ảnh quá nhỏ, vui lòng chụp lại' }],
            },
        }));
        const vision = mock.method(extractor, 'extractReceipt', async () => okResult(450_000));
        const ocr = mock.method(ocrScanner, 'scanImage', async () => scanFor(450_000));

        const result = await service.validateReceipt('a.jpg', { entityId: 1 });

        assert.strictEqual(result.blocked, true);
        assert.strictEqual(vision.mock.callCount(), 0, 'không được gọi model');
        assert.strictEqual(ocr.mock.callCount(), 0, 'không được quét OCR');
    });

    it('lượt đọc ĐẦU không được nhìn thấy text OCR', async () => {
        // Hai kênh phải độc lập, nếu không thì việc chúng khớp nhau chẳng chứng minh
        // được gì ngoài việc model biết chép lại.
        const vision = mock.method(extractor, 'extractReceipt', async () => okResult(450_000));
        mock.method(ocrScanner, 'scanImage', async () => scanFor(450_000));

        await service.validateReceipt('a.jpg', { entityId: 1 });

        assert.strictEqual(vision.mock.callCount(), 1);
        assert.strictEqual(vision.mock.calls[0].arguments[1]?.ocrText, undefined);
    });

    it('hai kênh khớp nhau thì cho qua với độ tin cậy cao nhất', async () => {
        mock.method(extractor, 'extractReceipt', async () => okResult(450_000));
        mock.method(ocrScanner, 'scanImage', async () => scanFor(450_000));

        const result = await service.validateReceipt('a.jpg', { entityId: 1 });

        assert.strictEqual(result.verdict, 'passed');
        assert.strictEqual(result.confidence, 1);
    });

    it('đọc LẠI có trợ giúp OCR khi tổng tiền không có trên giấy, rồi lấy bản tốt hơn', async () => {
        // Đây là toàn bộ giá trị của dây chuyền hai kênh: lượt đầu cho một con số
        // không có trên ảnh, kênh OCR phát hiện ra, lượt hai được chỉ đích danh trường
        // cần soi lại và đọc đúng.
        const vision = mock.method(extractor, 'extractReceipt', async (url, options) => (
            options?.ocrText ? okResult(450_000) : okResult(999_000)
        ));
        mock.method(ocrScanner, 'scanImage', async () => scanFor(450_000));

        const result = await service.validateReceipt('a.jpg', { entityId: 1 });

        assert.strictEqual(vision.mock.callCount(), 2, 'phải có lượt đọc lại');
        assert.ok(vision.mock.calls[1].arguments[1].ocrText, 'lượt hai mới được xem text OCR');
        assert.ok(vision.mock.calls[1].arguments[1].suspectFields.includes('total'),
            'phải chỉ đích danh trường đang lệch');
        assert.strictEqual(result.receipt_total, 450_000, 'lấy bản đọc khớp với giấy');
    });

    it('KHÔNG đọc lại khi kênh OCR không dùng được', async () => {
        // Không có nhân chứng thì đọc lại bao nhiêu lần cũng không có gì để đối chiếu,
        // chỉ tốn thêm tiền gọi API.
        const vision = mock.method(extractor, 'extractReceipt', async () => okResult(450_000));
        mock.method(ocrScanner, 'scanImage', async () => ({ ok: false, code: 'OCR_TIMEOUT' }));

        await service.validateReceipt('a.jpg', { entityId: 1 });

        assert.strictEqual(vision.mock.callCount(), 1);
    });

    it('lưu nguyên văn text OCR làm bằng chứng độc lập', async () => {
        // Khi tài xế khiếu nại "máy đọc sai", đây là thứ duy nhất đối chiếu được mà
        // không phải hỏi lại chính model đã đọc sai.
        mock.method(extractor, 'extractReceipt', async () => okResult(450_000));
        mock.method(ocrScanner, 'scanImage', async () => scanFor(450_000));

        await service.validateReceipt('a.jpg', { entityId: 7 });
        const saved = repository.saveExtraction.mock.calls[0].arguments[0];

        assert.match(saved.ocrText, /TONG CONG/);
        assert.strictEqual(saved.ocrConfidence, 85);
        assert.strictEqual(saved.confidence, 1);
        assert.strictEqual(saved.imageWidth, 1600);
        assert.strictEqual(saved.pipeline.ocr.ok, true);
        assert.strictEqual(saved.pipeline.corroboration.trusted, true);
    });

    it('dựng lại kênh OCR từ vết đã lưu thay vì quét lại ảnh', async () => {
        // Bước hoàn tất chấm lại cùng tấm ảnh với số tiền khai. Quét lại tốn khoảng
        // 10 giây CPU mà kết quả không thể khác đi — ảnh vẫn thế.
        mock.method(repository, 'findLatestByImageUrl', async () => ({
            raw_extraction: okResult(450_000).raw,
            provider: 'google', model: 'test', prompt_version: 'v2', image_sha256: 'abc',
            ocr_text: scanFor(450_000).text, ocr_confidence: '85', ocr_engine: 'tesseract.js/vie+eng',
        }));
        const ocr = mock.method(ocrScanner, 'scanImage', async () => scanFor(450_000));
        const vision = mock.method(extractor, 'extractReceipt', async () => okResult(450_000));

        const result = await service.validateReceipt('a.jpg', { entityId: 1, claimedAmount: 450_000 });

        assert.strictEqual(ocr.mock.callCount(), 0, 'không quét lại');
        assert.strictEqual(vision.mock.callCount(), 0, 'không gọi lại model');
        assert.strictEqual(result.verdict, 'passed');
        assert.strictEqual(result.confidence, 1, 'vẫn chấm được độ tin cậy từ text đã lưu');
    });

    it('lấy độ tin cậy của ảnh THẤP NHẤT cho cả đợt bảo dưỡng', async () => {
        // Một hóa đơn đọc chắc chắn không bù được cho một hóa đơn đọc mù mờ — người
        // duyệt vẫn phải mở đúng cái mù mờ đó ra xem.
        const totals = { 'a.jpg': 300_000, 'b.jpg': 500_000 };
        mock.method(extractor, 'extractReceipt', async (url) => okResult(totals[url]));
        mock.method(ocrScanner, 'scanImage', async (buffer) => (
            buffer ? { ok: false, code: 'OCR_DISABLED' } : { ok: false, code: 'OCR_DISABLED' }
        ));

        const result = await service.validateMaintenanceBills(['a.jpg', 'b.jpg'], { claimedAmount: 800_000 });

        assert.ok(result.confidence < 1, 'thiếu kênh đối chiếu thì không thể đạt mức tuyệt đối');
        assert.strictEqual(result.confidence_label, 'cao');
    });
});
