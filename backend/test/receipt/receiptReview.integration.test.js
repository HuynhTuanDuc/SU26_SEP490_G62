/**
 * Màn hình duyệt hóa đơn của quản lý — chạy trên Postgres thật.
 *
 * Trọng tâm là hai thứ mock không kiểm được:
 *   * vòng phản hồi: người duyệt sửa một phân loại sai thì từ điển lớn lên, và bản ghi
 *     CŨ cũng được hưởng phân loại mới (vì dòng hàng được dựng lại từ raw_extraction
 *     mỗi lần đọc, không lưu sẵn dạng đã phân loại)
 *   * SQL ghi/đọc thật của phần duyệt
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let service;
let repository;
let reviewerId;

const RAW = {
    is_document: true,
    doc_type: 'invoice',
    vendor: { name: 'Garage Thành Công', tax_code: '0101234567' },
    invoice_no: 'HD-00123',
    issued_date: '2026-08-20',
    vehicle_plate: '51C-12345',
    line_items: [
        { raw_name: 'Nhớt Castrol GTX 4L', quantity: 1, unit_price: 450_000, line_total: 450_000, category: 'engine_oil' },
        { raw_name: 'Bộ ZX-9981 chuyên dụng', quantity: 1, unit_price: 300_000, line_total: 300_000, category: null },
    ],
    subtotal: 750_000, discount: 0, vat_rate: null, vat_amount: null, total: 750_000,
    unreadable_fields: [],
};

const insertExtraction = async (overrides = {}) => {
    const result = await pool.query(
        `INSERT INTO receipt_extractions
            (entity_type, entity_id, image_url, image_sha256, provider, model, prompt_version,
             raw_extraction, checks, verdict, claimed_amount, receipt_total, latency_ms,
             vendor_key, invoice_no_key)
         VALUES ('maintenance_record', $1, $2, $3, 'google', 'gemini-flash-latest', 'v1',
                 $4::jsonb, $5::jsonb, $6, 750000, 750000, 900, 'tax:0101234567', 'HD00123')
         RETURNING id`,
        [
            overrides.entityId ?? 21,
            overrides.imageUrl ?? 'https://x/bill.jpg',
            overrides.imageSha256 ?? 'hash-1',
            JSON.stringify(overrides.raw ?? RAW),
            JSON.stringify(overrides.checks ?? [
                { code: 'UNCLASSIFIED_ITEMS', severity: 'warning', message: 'Chưa phân loại được 1 dòng' },
            ]),
            overrides.verdict ?? 'needs_review',
        ],
    );
    return result.rows[0].id;
};

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    service = require('../../services/receiptValidationService');
    repository = require('../../repositories/receiptExtractionRepository');
    const profile = await pool.query('SELECT id FROM profiles ORDER BY id LIMIT 1');
    reviewerId = profile.rows[0].id;
});

afterAll(async () => {
    if (teardown) await teardown();
});

beforeEach(async () => {
    await pool.query('TRUNCATE receipt_extractions RESTART IDENTITY');
    await pool.query('TRUNCATE maintenance_item_keywords RESTART IDENTITY');
    service.invalidateTaxonomyCache();
});

describe('getReceiptReview — dữ liệu cho người duyệt', () => {
    it('dựng lại dòng hàng đã phân loại từ bản đọc gốc', async () => {
        await insertExtraction();

        const review = await service.getReceiptReview('maintenance_record', 21, 'maintenance');

        assert.strictEqual(review.receipts.length, 1);
        const receipt = review.receipts[0];
        assert.strictEqual(receipt.items.length, 2);
        assert.strictEqual(receipt.items[0].category, 'engine_oil');
        assert.strictEqual(receipt.items[0].on_topic, true);
        // Dòng lạ chưa ai dạy → chưa phân loại được, đúng thứ cần người duyệt xác nhận.
        assert.strictEqual(receipt.items[1].category, null);
        assert.strictEqual(receipt.items[1].on_topic, null);
    });

    it('tách lỗi và cảnh báo để giao diện tô màu khác nhau', async () => {
        await insertExtraction({
            verdict: 'rejected',
            checks: [
                { code: 'AMOUNT_MISMATCH', severity: 'error', message: 'lệch tiền' },
                { code: 'PLATE_MISMATCH', severity: 'warning', message: 'lệch biển số' },
            ],
        });

        const receipt = (await service.getReceiptReview('maintenance_record', 21)).receipts[0];

        assert.strictEqual(receipt.errors.length, 1);
        assert.strictEqual(receipt.warnings.length, 1);
        assert.strictEqual(receipt.errors[0].code, 'AMOUNT_MISMATCH');
    });

    it('kèm thông tin nhận dạng hóa đơn và ai đã đọc nó', async () => {
        await insertExtraction();

        const receipt = (await service.getReceiptReview('maintenance_record', 21)).receipts[0];

        assert.strictEqual(receipt.invoice_no, 'HD-00123');
        assert.strictEqual(receipt.vehicle_plate, '51C-12345');
        assert.strictEqual(receipt.vendor.tax_code, '0101234567');
        assert.strictEqual(receipt.read_by.model, 'gemini-flash-latest');
        assert.strictEqual(receipt.read_by.prompt_version, 'v1');
    });

    it('tổng kết số hóa đơn cần xem để giao diện biết có bật cảnh báo không', async () => {
        await insertExtraction({ imageSha256: 'h1', verdict: 'needs_review' });
        await insertExtraction({ imageSha256: 'h2', imageUrl: 'https://x/b.jpg', verdict: 'passed', checks: [] });

        const review = await service.getReceiptReview('maintenance_record', 21);

        // low_confidence = 0: hai dòng chèn tay không có cột confidence (giống bản ghi có từ
        // trước khi có lớp đối chiếu chéo), và NULL phải được hiểu là "chưa chấm" chứ không
        // phải "đọc không chắc".
        assert.deepStrictEqual({ ...review.summary }, {
            total: 2, needs_review: 1, rejected: 0, unreviewed: 2, low_confidence: 0,
            supporting: 0, unread: 0, rejected_uploads: 0,
        });
    });

    it('trả rỗng gọn gàng khi khoản chưa có hóa đơn nào được đọc', async () => {
        const review = await service.getReceiptReview('maintenance_record', 999);

        assert.deepStrictEqual([...review.receipts], []);
        assert.deepStrictEqual({ ...review.summary }, {
            total: 0, needs_review: 0, rejected: 0, unreviewed: 0, low_confidence: 0,
            supporting: 0, unread: 0, rejected_uploads: 0,
        },
            'nhánh rỗng phải cùng hình dạng với nhánh có dữ liệu');
    });
});

describe('submitReceiptReview — ghi nhận phán quyết người duyệt', () => {
    it('lưu lại hành động, ghi chú và người duyệt', async () => {
        const id = await insertExtraction();

        await service.submitReceiptReview(id, reviewerId, {
            action: 'override_accept',
            note: 'Bộ ZX-9981 là bộ lọc gió đời mới, hợp lệ',
        });

        const receipt = (await service.getReceiptReview('maintenance_record', 21)).receipts[0];
        assert.strictEqual(receipt.review.action, 'override_accept');
        assert.match(receipt.review.note, /lọc gió đời mới/);
        assert.ok(receipt.review.at);
    });

    it('từ chối hành động không hợp lệ', async () => {
        const id = await insertExtraction();

        await assert.rejects(
            () => service.submitReceiptReview(id, reviewerId, { action: 'xoa_luon' }),
            (err) => err.statusCode === 400,
        );
    });

    it('báo 404 khi bản ghi không tồn tại', async () => {
        await assert.rejects(
            () => service.submitReceiptReview(999_999, reviewerId, { action: 'agree' }),
            (err) => err.statusCode === 404,
        );
    });
});

describe('Vòng phản hồi — từ điển học được từ lần duyệt tay', () => {
    it('phân loại mới áp NGƯỢC LẠI cho bản ghi cũ', async () => {
        // Đây là lý do dòng hàng được dựng lại từ raw_extraction mỗi lần đọc thay vì
        // lưu sẵn dạng đã phân loại: lưu sẵn thì bản ghi cũ đóng băng ở mức hiểu biết
        // của ngày hôm đó, và từ điển lớn lên chẳng giúp gì cho chúng.
        const id = await insertExtraction();

        const before = (await service.getReceiptReview('maintenance_record', 21)).receipts[0];
        assert.strictEqual(before.items[1].category, null);

        await service.submitReceiptReview(id, reviewerId, {
            action: 'override_accept',
            note: 'ZX-9981 là bộ lọc gió',
            learnKeywords: [{ keyword: 'ZX-9981', category: 'filter', item_group: 'maintenance' }],
        });

        const after = (await service.getReceiptReview('maintenance_record', 21)).receipts[0];
        assert.strictEqual(after.items[1].category, 'filter');
        assert.strictEqual(after.items[1].on_topic, true);
        assert.strictEqual(after.items[1].matched_by, 'dictionary');
    });

    it('chuẩn hoá từ khoá học được để lần sau khớp bất kể dấu và hoa thường', async () => {
        const id = await insertExtraction();

        await service.submitReceiptReview(id, reviewerId, {
            action: 'override_accept',
            learnKeywords: [{ keyword: 'Lọc Gió Đời Mới', category: 'filter', item_group: 'maintenance' }],
        });

        const rows = await repository.getExtraKeywords();
        assert.strictEqual(rows[0].keyword, 'loc gio doi moi');
        assert.strictEqual(rows[0].category, 'filter');
    });

    it('bỏ qua từ khoá có hạng mục không hợp lệ thay vì làm hỏng cả lần duyệt', async () => {
        const id = await insertExtraction();

        await service.submitReceiptReview(id, reviewerId, {
            action: 'agree',
            learnKeywords: [
                { keyword: 'hợp lệ', category: 'filter', item_group: 'maintenance' },
                { keyword: 'bịa', category: 'khong_ton_tai', item_group: 'maintenance' },
                { keyword: 'thiếu nhóm', category: 'filter', item_group: 'linh_tinh' },
            ],
        });

        const rows = await repository.getExtraKeywords();
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].keyword, 'hop le');
    });

    it('lần sửa mới nhất thắng khi cùng một từ khoá được dạy lại', async () => {
        const id = await insertExtraction();

        await service.submitReceiptReview(id, reviewerId, {
            action: 'agree',
            learnKeywords: [{ keyword: 'ZX-9981', category: 'filter', item_group: 'maintenance' }],
        });
        await service.submitReceiptReview(id, reviewerId, {
            action: 'override_reject',
            learnKeywords: [{ keyword: 'ZX-9981', category: 'food', item_group: 'excluded' }],
        });

        const rows = await repository.getExtraKeywords();
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].category, 'food');
        assert.strictEqual(rows[0].item_group, 'excluded');
    });

    it('từ điển học được làm đổi cả phán quyết chủ đề', async () => {
        // Dạy cho máy biết "ZX-9981" thật ra là xăng → hóa đơn hết là hóa đơn bảo dưỡng
        // ở phần lớn giá trị? Ở đây 300k/750k = 40% > ngưỡng 20% nên phải bị từ chối.
        const id = await insertExtraction();
        await service.submitReceiptReview(id, reviewerId, {
            action: 'override_reject',
            learnKeywords: [{ keyword: 'ZX-9981', category: 'fuel', item_group: 'excluded' }],
        });

        const receipt = (await service.getReceiptReview('maintenance_record', 21)).receipts[0];
        assert.strictEqual(receipt.items[1].on_topic, false);
        assert.ok(receipt.groups.off_topic_share > 0.2);
    });
});

describe('Tách bạch việc dạy từ điển với việc kết luận về hóa đơn', () => {
    it('dạy từ điển mà KHÔNG đóng dấu phán quyết nào lên hóa đơn', async () => {
        // Gộp hai việc thì mỗi lần sửa một chữ là hệ thống ghi "đã chấp nhận hóa đơn",
        // làm hỏng đúng cột dùng để đo độ chính xác của máy.
        const id = await insertExtraction();

        await service.submitReceiptReview(id, reviewerId, {
            learnKeywords: [{ keyword: 'ZX-9981', category: 'filter', item_group: 'maintenance' }],
        });

        const receipt = (await service.getReceiptReview('maintenance_record', 21)).receipts[0];
        assert.strictEqual(receipt.review, null);            // chưa ai kết luận gì
        assert.strictEqual(receipt.items[1].category, 'filter'); // nhưng từ điển đã học
    });

    it('vẫn ghi phán quyết bình thường khi có hành động kèm theo', async () => {
        const id = await insertExtraction();

        await service.submitReceiptReview(id, reviewerId, {
            action: 'agree',
            learnKeywords: [{ keyword: 'ZX-9981', category: 'filter', item_group: 'maintenance' }],
        });

        const receipt = (await service.getReceiptReview('maintenance_record', 21)).receipts[0];
        assert.strictEqual(receipt.review.action, 'agree');
        assert.strictEqual(receipt.items[1].category, 'filter');
    });

    it('từ chối lời gọi rỗng — không hành động, không từ khoá', async () => {
        const id = await insertExtraction();

        await assert.rejects(
            () => service.submitReceiptReview(id, reviewerId, {}),
            (err) => err.statusCode === 400,
        );
    });
});
