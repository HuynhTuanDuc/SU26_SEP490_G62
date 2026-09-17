/**
 * Dò trùng hóa đơn — chạy trên Postgres thật.
 *
 * Test này phải chạm DB thật chứ không mock được: giá trị của nó nằm ở phần xử lý NULL
 * trong câu truy vấn. Trong SQL, `NULL = NULL` không phải TRUE mà là NULL, nên một lỗi
 * điều kiện rất dễ dẫn tới hai kết cục trái ngược mà mock không bao giờ lộ ra — hoặc
 * không bắt được gì, hoặc mọi hóa đơn viết tay thiếu số hóa đơn đều khớp lẫn nhau và
 * bị báo trùng oan hàng loạt.
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let repository;

const insert = async (row) => {
    const result = await pool.query(
        `INSERT INTO receipt_extractions
            (entity_type, entity_id, image_url, image_sha256, verdict, vendor_key, invoice_no_key, receipt_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
            row.entityType ?? 'maintenance_record', row.entityId ?? 21,
            row.imageUrl ?? 'https://x/a.jpg', row.imageSha256 ?? null,
            row.verdict ?? 'passed', row.vendorKey ?? null,
            row.invoiceNoKey ?? null, row.receiptTotal ?? null,
        ],
    );
    return result.rows[0].id;
};

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    repository = require('../../repositories/receiptExtractionRepository');
});

afterAll(async () => {
    if (teardown) await teardown();
});

beforeEach(async () => {
    await pool.query('TRUNCATE receipt_extractions RESTART IDENTITY');
});

describe('findDuplicates — nhận dạng theo băm ảnh', () => {
    it('bắt được đúng một tấm ảnh gửi lại lần hai', async () => {
        const id = await insert({ imageSha256: 'hash-aaa', entityId: 21 });

        const rows = await repository.findDuplicates({ imageSha256: 'hash-aaa' });

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(Number(rows[0].id), id);
    });

    it('không khớp khi băm khác nhau', async () => {
        await insert({ imageSha256: 'hash-aaa' });

        const rows = await repository.findDuplicates({ imageSha256: 'hash-bbb' });

        assert.strictEqual(rows.length, 0);
    });

    it('không khớp các dòng có băm NULL khi tra bằng băm NULL', async () => {
        // Nếu điều kiện viết thành `image_sha256 = $1` mà không chặn NULL, Postgres trả
        // NULL (không phải TRUE) nên may mắn vẫn không khớp — nhưng chỉ cần đổi sang
        // `IS NOT DISTINCT FROM` là mọi dòng thiếu băm dính hết vào nhau.
        await insert({ imageSha256: null });
        await insert({ imageSha256: null });

        const rows = await repository.findDuplicates({ imageSha256: null });

        assert.strictEqual(rows.length, 0);
    });
});

describe('findDuplicates — nhận dạng theo nội dung hóa đơn', () => {
    it('bắt được cùng tờ hóa đơn chụp lại từ góc khác (băm khác, khoá giống)', async () => {
        // Đây là ca mà băm ảnh không bắt được và là lý do tồn tại của cặp khoá này.
        const id = await insert({
            imageSha256: 'hash-goc-1', vendorKey: 'tax:0101234567', invoiceNoKey: 'HD00123', entityId: 21,
        });

        const rows = await repository.findDuplicates({
            imageSha256: 'hash-goc-2',
            vendorKey: 'tax:0101234567',
            invoiceNoKey: 'HD00123',
        });

        assert.strictEqual(rows.length, 1);
        assert.strictEqual(Number(rows[0].id), id);
        assert.strictEqual(Number(rows[0].entity_id), 21);
    });

    it('KHÔNG khớp hai hóa đơn cùng bên bán nhưng khác số', async () => {
        // Hai lần thay dầu ở cùng garage là chuyện bình thường.
        await insert({ vendorKey: 'tax:0101234567', invoiceNoKey: 'HD00123' });

        const rows = await repository.findDuplicates({
            vendorKey: 'tax:0101234567', invoiceNoKey: 'HD00999',
        });

        assert.strictEqual(rows.length, 0);
    });

    it('KHÔNG báo trùng khi cả hai hóa đơn đều không ghi số', async () => {
        // Ca nguy hiểm nhất: hóa đơn viết tay ở garage nhỏ thường không có số hóa đơn.
        // Để lọt NULL vào phép so sánh là mọi hóa đơn viết tay của cùng garage đều bị
        // coi là trùng nhau.
        await insert({ vendorKey: 'name:garagea', invoiceNoKey: null });
        await insert({ vendorKey: 'name:garagea', invoiceNoKey: null });

        const rows = await repository.findDuplicates({
            vendorKey: 'name:garagea', invoiceNoKey: null,
        });

        assert.strictEqual(rows.length, 0);
    });

    it('không tra DB khi không có khoá nào dùng được', async () => {
        await insert({ imageSha256: 'hash-aaa', vendorKey: 'name:garagea', invoiceNoKey: 'HD1' });

        const rows = await repository.findDuplicates({});

        assert.strictEqual(rows.length, 0);
    });
});

describe('findDuplicates — loại trừ', () => {
    it('bỏ qua những lần đọc đã bị từ chối', async () => {
        // Hóa đơn bị từ chối thì chưa được dùng vào đâu cả. Chặn lần nộp lại sau khi
        // tài xế chụp lại cho rõ là chặn oan.
        await insert({ imageSha256: 'hash-aaa', verdict: 'rejected' });

        const rows = await repository.findDuplicates({ imageSha256: 'hash-aaa' });

        assert.strictEqual(rows.length, 0);
    });

    it('vẫn bắt các lần đọc cần người xem hoặc lỗi đọc', async () => {
        await insert({ imageSha256: 'hash-aaa', verdict: 'needs_review' });

        const rows = await repository.findDuplicates({ imageSha256: 'hash-aaa' });

        assert.strictEqual(rows.length, 1);
    });

    it('loại trừ được chính dòng đang xét qua excludeId', async () => {
        const id = await insert({ imageSha256: 'hash-aaa' });

        assert.strictEqual((await repository.findDuplicates({ imageSha256: 'hash-aaa', excludeId: id })).length, 0);
        assert.strictEqual((await repository.findDuplicates({ imageSha256: 'hash-aaa', excludeId: null })).length, 1);
    });
});

describe('findDuplicates — phân biệt cùng khoản với khoản khác', () => {
    it('trả đủ thông tin để phân biệt trùng trong cùng khoản với dùng lại cho khoản khác', async () => {
        await insert({ imageSha256: 'hash-aaa', entityType: 'maintenance_record', entityId: 21 });
        await insert({ imageSha256: 'hash-aaa', entityType: 'expense', entityId: 77 });

        const rows = await repository.findDuplicates({ imageSha256: 'hash-aaa' });

        assert.strictEqual(rows.length, 2);
        const checks = require('../../services/receiptChecks');
        const reasons = checks.checkDuplicates(rows, { entityType: 'maintenance_record', entityId: 21 });

        // Có dòng thuộc khoản KHÁC thì đó mới là vấn đề đáng báo, không phải chuyện
        // nộp lại trong cùng một khoản.
        assert.strictEqual(reasons[0].code, 'DUPLICATE_RECEIPT');
        assert.match(reasons[0].message, /khoản chi phí #77/);
    });
});

describe('updateVerdict — hạ phán quyết dòng vừa ghi', () => {
    it('ghi đè checks và verdict, và dòng rejected không còn bị tính là "đã dùng"', async () => {
        const id = await insert({ imageSha256: 'hash-aaa', verdict: 'passed' });

        const updated = await repository.updateVerdict(id, {
            checks: [{ code: 'DUPLICATE_RECEIPT', severity: 'error', message: 'trùng' }],
            verdict: 'rejected',
        });

        assert.strictEqual(updated.verdict, 'rejected');
        const stored = (await pool.query('SELECT checks, verdict FROM receipt_extractions WHERE id = $1', [id])).rows[0];
        assert.strictEqual(stored.checks[0].code, 'DUPLICATE_RECEIPT');
        // Đây là lý do phải hạ xuống rejected: không thì lần nộp bị chặn vẫn chắn đường
        // mọi lần dò trùng sau.
        assert.strictEqual((await repository.findDuplicates({ imageSha256: 'hash-aaa' })).length, 0);
    });

    it('trả null khi không có dòng nào', async () => {
        assert.strictEqual(await repository.updateVerdict(999_999, { checks: [], verdict: 'rejected' }), null);
    });
});

describe('findLatestByImageUrl — đủ dữ liệu để chấm lại đúng như lần đầu', () => {
    it('trả kèm kích thước ảnh và vết dây chuyền', async () => {
        // Thiếu hai thứ này thì bước hoàn tất mất cảnh báo ảnh độ phân giải thấp và chấm lại
        // OCR bằng độ tin cậy cả trang thay vì từng dòng.
        await pool.query(
            `INSERT INTO receipt_extractions
                (entity_type, entity_id, image_url, verdict, raw_extraction, image_width, image_height, pipeline, ocr_text, ocr_confidence)
             VALUES ('maintenance_record', 21, 'https://x/a.jpg', 'passed', '{"is_document": true}'::jsonb, 700, 800,
                     '{"ocr": {"line_confidences": [90, 40]}}'::jsonb, 'Dong 1\nDong 2', 65)`,
        );

        const row = await repository.findLatestByImageUrl('https://x/a.jpg');

        assert.strictEqual(row.image_width, 700);
        assert.strictEqual(row.image_height, 800);
        assert.deepStrictEqual([...row.pipeline.ocr.line_confidences], [90, 40]);
    });
});

describe('Dò trùng song song — trên Postgres thật', () => {
    it('hai lần nộp cùng một hóa đơn cho hai đợt khác nhau: chỉ một được qua', async () => {
        // Khe hở giữa dò và ghi dài bằng thời gian model đọc ảnh. Mock riêng lời gọi model
        // cho chậm như thật; phần dò, ghi, cấp id và hạ phán quyết đều chạy trên DB thật —
        // chính thứ tự id do Postgres cấp là thứ lớp dò lần hai dựa vào.
        const { mock } = require('../helpers/nodeTestMock');
        const imagePipeline = require('../../services/receiptImagePipeline');
        const ocrScanner = require('../../services/receiptOcrScanner');
        const extractor = require('../../services/receiptVisionExtractor');
        const service = require('../../services/receiptValidationService');

        const bill = {
            is_document: true, doc_type: 'invoice', vendor: { name: 'Garage Thành Công', tax_code: '0101234567' },
            invoice_no: 'HD-00123', issued_date: null, vehicle_plate: null, currency: 'VND',
            line_items: [{ raw_name: 'Thay nhớt động cơ', quantity: 1, unit: 'lần', unit_price: 450_000, line_total: 450_000, category: 'engine_oil' }],
            subtotal: 450_000, discount: 0, vat_rate: null, vat_amount: null, total: 450_000, unreadable_fields: [],
        };

        mock.method(imagePipeline, 'loadImage', async (url) => ({
            ok: true,
            // Hai lần chụp khác nhau của cùng tờ giấy: băm KHÁC, khoá nội dung GIỐNG.
            vision: { base64: 'x', mimeType: 'image/jpeg', sha256: `sha-${url}`, bytes: 100_000 },
            ocr: null,
            quality: { width: 1600, height: 2000, bytes: 100_000, reasons: [] },
        }));
        mock.method(ocrScanner, 'scanImage', async () => ({ ok: false, code: 'OCR_DISABLED' }));
        mock.method(extractor, 'extractReceipt', async (url) => ({
            ok: true, extraction: bill, raw: bill, meta: { provider: 'google', model: 't', prompt_version: 'v2', image_sha256: `sha-${url}` },
        }));

        // CỔNG CHẶN trước câu INSERT: cả hai lần nộp phải dò trùng xong rồi mới được ghi —
        // đúng tình huống xảy ra ngoài đời khi model đọc ảnh mất vài giây. Chỉ làm model chậm
        // thì không đủ: kết nối trong pool mở không đều, lần nộp thứ hai hay tới lượt dò SAU
        // khi lần thứ nhất đã ghi, và test đạt kể cả khi tắt hẳn lớp dò lần hai (đã thử đột
        // biến). Sau cổng, hai câu INSERT chạy LẦN LƯỢT trên DB thật: khe mili giây giữa
        // cấp id và ghi xong không phải thứ test này nhắm tới, để nó vào thì test chập chờn.
        const realSave = repository.saveExtraction;
        const waiting = [];
        mock.method(repository, 'saveExtraction', (row) => new Promise((resolve, reject) => {
            waiting.push(() => realSave(row).then(resolve, reject));
            if (waiting.length === 2) {
                waiting[0]();
                setTimeout(waiting[1], 50);
            }
        }));

        try {
            const [a, b] = await Promise.all([
                service.validateReceipt('https://x/xe-1.jpg', { entityType: 'maintenance_record', entityId: 1, allowCache: false }),
                service.validateReceipt('https://x/xe-2.jpg', { entityType: 'maintenance_record', entityId: 2, allowCache: false }),
            ]);

            assert.deepStrictEqual([a.blocked, b.blocked].sort(), [false, true]);
            const stored = (await pool.query('SELECT verdict FROM receipt_extractions ORDER BY id')).rows.map((r) => r.verdict);
            assert.deepStrictEqual([...stored], ['passed', 'rejected'], 'dòng ghi SAU phải là dòng nhường');
        } finally {
            mock.restoreAll();
        }
    });
});
