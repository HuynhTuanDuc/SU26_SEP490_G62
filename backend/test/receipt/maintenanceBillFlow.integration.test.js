/**
 * Luồng hóa đơn bảo dưỡng từ đầu tới cuối — chạy trên Postgres thật.
 *
 * Mock chỉ ba thứ đi ra ngoài: tải ảnh, Gemini, Tesseract. Mọi thứ còn lại là code thật:
 * driverService (tải ảnh, hoàn tất), vehicleManagementService (trả về làm lại, huỷ), SQL
 * dò trùng, SQL ghi bill_pics.
 *
 * Những lỗi ở đây nằm ở THỨ TỰ giữa các thao tác của nhiều người (tài xế tải ảnh trong
 * lúc bấm hoàn tất, quản lý trả về rồi tài xế nộp lại) — mock từng lời gọi repository
 * không tái hiện được.
 */
const assert = require('node:assert');
const { mock } = require('../helpers/nodeTestMock');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let driverService;
let vehicleManagementService;
let vehicleManagementController;
let receiptService;
let imagePipeline;
let extractor;
let ocrScanner;

const MANAGER = 1;
const DRIVER = 4;

/** Hóa đơn bảo dưỡng tự khớp số học. `invoiceNo` là khoá nhận dạng tờ giấy. */
const bill = (total, { invoiceNo = 'HD-1', docType = 'invoice' } = {}) => ({
    is_document: true,
    doc_type: docType,
    vendor: { name: 'Garage Thành Công', tax_code: '0101234567', address: null, phone: null },
    invoice_no: invoiceNo,
    issued_date: null,
    vehicle_plate: null,
    currency: 'VND',
    line_items: [
        { raw_name: 'Thay nhớt động cơ', quantity: 1, unit: 'lần', unit_price: total, line_total: total, category: 'engine_oil' },
    ],
    subtotal: total, discount: 0, vat_rate: null, vat_amount: null, total,
    unreadable_fields: [],
});

// Nội dung từng URL ảnh: tờ hóa đơn nào, và băm của tệp.
let images;
// Chặn lượt đọc của một URL cho tới khi test mở ra — để dựng đúng thứ tự tranh chấp.
let gates;

const gate = (url) => {
    let open;
    let reached;
    const opened = new Promise((resolve) => { open = resolve; });
    const arrived = new Promise((resolve) => { reached = resolve; });
    gates[url] = { opened, reached };
    return { open, arrived };
};

const catchErr = async (promise) => {
    try { await promise; return null; } catch (err) { return err; }
};

let seq = 0;
const newRecord = async ({ status = 'open', cost = 450_000, billPics = [] } = {}) => {
    seq += 1;
    const vehicleId = 500 + seq;
    await pool.query(
        `INSERT INTO vehicles (id, plate_number, vehicle_group_id, status) VALUES ($1, $2, 1, 'maintenance')`,
        [vehicleId, `51C-${String(10000 + seq)}`],
    );
    const { rows: [row] } = await pool.query(
        `INSERT INTO maintenance_records
            (vehicle_id, maintenance_type, description, cost, maintenance_date, performed_by,
             status, bill_pics, created_by, started_at)
         VALUES ($1, 'scheduled', 'Thay nhớt', $2, CURRENT_DATE, $3, $4, $5::jsonb, $6, NOW() - INTERVAL '1 day')
         RETURNING id`,
        [vehicleId, cost, DRIVER, status, JSON.stringify(billPics), MANAGER],
    );
    return { vehicleId, recordId: row.id };
};

const readRecord = async (recordId) => (await pool.query(
    'SELECT status, bill_pics, cost FROM maintenance_records WHERE id = $1', [recordId],
)).rows[0];

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    driverService = require('../../services/driverService');
    vehicleManagementService = require('../../services/vehicleManagementService');
    vehicleManagementController = require('../../controllers/vehicleManagementController');
    receiptService = require('../../services/receiptValidationService');
    imagePipeline = require('../../services/receiptImagePipeline');
    extractor = require('../../services/receiptVisionExtractor');
    ocrScanner = require('../../services/receiptOcrScanner');

    await pool.query(`
        TRUNCATE receipt_extractions, notifications, vehicle_status_history, maintenance_records,
                 vehicles, vehicle_groups, drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1,'m@t.com','h',1),(4,'d@t.com','h',4)`);
    await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1,'Quản lý Bình',1),(4,'Tài xế Hùng',4)`);
    await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1,'Xe 5m2',15000)`);
    await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date) VALUES (4,NULL,1,'DL-1',CURRENT_DATE)`);
});

afterAll(async () => { if (teardown) await teardown(); });

beforeEach(() => {
    images = {};
    gates = {};
    receiptService.invalidateTaxonomyCache();

    mock.method(imagePipeline, 'loadImage', async (url) => ({
        ok: true,
        vision: { base64: 'ZmFrZQ==', mimeType: 'image/jpeg', sha256: images[url]?.sha ?? `sha-${url}`, bytes: 120_000 },
        ocr: { buffer: Buffer.from('fake'), mimeType: 'image/jpeg', enhanced: true },
        quality: { bytes: 120_000, width: 1600, height: 2000, format: 'jpeg', reasons: [] },
    }));
    mock.method(ocrScanner, 'scanImage', async () => ({ ok: false, code: 'OCR_DISABLED' }));
    mock.method(extractor, 'extractReceipt', async (url, { image }) => {
        const held = gates[url];
        if (held) {
            held.reached();
            await held.opened;
        }
        const extraction = images[url]?.bill;
        return {
            ok: true, extraction, raw: extraction,
            meta: { provider: 'google', model: 'test', prompt_version: 'v2', image_sha256: image.sha256, latency_ms: 5 },
        };
    });
});

afterEach(() => mock.restoreAll());

describe('Quản lý trả về làm lại / huỷ — tài xế phải nộp lại được hóa đơn thật', () => {
    it('trả về làm lại vì sai số tiền → nộp lại ĐÚNG tệp ảnh cũ không bị chặn', async () => {
        const { vehicleId, recordId } = await newRecord();
        images['https://cdn/lan-1.jpg'] = { sha: 'sha-hd1', bill: bill(450_000) };
        images['https://cdn/lan-2.jpg'] = { sha: 'sha-hd1', bill: bill(450_000) };

        await driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/lan-1.jpg');
        await driverService.completeMaintenance(DRIVER, vehicleId, { cost: 450_000 });
        // Trả về làm lại xoá sạch bill_pics và cost — tờ hóa đơn thật vẫn là tờ đó.
        await vehicleManagementService.rejectMaintenance(vehicleId, MANAGER, { mode: 'redo', reason: 'Số tiền không khớp hóa đơn' });

        // App bảo tài xế: "Hãy chụp lại hoá đơn và nhập lại chi phí".
        await driverService.updateMaintenanceCost(DRIVER, vehicleId, 450_000);
        const err = await catchErr(driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/lan-2.jpg'));

        assert.strictEqual(err, null, `bị chặn oan: ${err?.message}`);
        assert.deepStrictEqual((await readRecord(recordId)).bill_pics, ['https://cdn/lan-2.jpg']);
        await driverService.completeMaintenance(DRIVER, vehicleId, { cost: 450_000 });
        assert.strictEqual((await readRecord(recordId)).status, 'pending_verification');
    });

    it('trả về làm lại vì ảnh mờ → CHỤP LẠI cùng tờ hóa đơn (băm khác, cùng số HĐ) không bị chặn', async () => {
        const { vehicleId, recordId } = await newRecord();
        images['https://cdn/mo.jpg'] = { sha: 'sha-mo', bill: bill(450_000, { invoiceNo: 'HD-77' }) };
        images['https://cdn/ro.jpg'] = { sha: 'sha-ro', bill: bill(450_000, { invoiceNo: 'HD-77' }) };

        await driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/mo.jpg');
        await driverService.completeMaintenance(DRIVER, vehicleId, { cost: 450_000 });
        await vehicleManagementService.rejectMaintenance(vehicleId, MANAGER, { mode: 'redo', reason: 'Ảnh mờ / không đọc được' });

        await driverService.updateMaintenanceCost(DRIVER, vehicleId, 450_000);
        const err = await catchErr(driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/ro.jpg'));

        assert.strictEqual(err, null, `bị chặn oan: ${err?.message}`);
        assert.deepStrictEqual((await readRecord(recordId)).bill_pics, ['https://cdn/ro.jpg']);
    });

    it('nộp lại sau khi bị trả về vẫn để lại dấu cho người duyệt thấy', async () => {
        const { vehicleId, recordId } = await newRecord();
        images['https://cdn/a.jpg'] = { sha: 'sha-a', bill: bill(450_000, { invoiceNo: 'HD-88' }) };
        images['https://cdn/b.jpg'] = { sha: 'sha-a', bill: bill(450_000, { invoiceNo: 'HD-88' }) };

        await driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/a.jpg');
        await driverService.completeMaintenance(DRIVER, vehicleId, { cost: 450_000 });
        await vehicleManagementService.rejectMaintenance(vehicleId, MANAGER, { mode: 'redo', reason: 'Hóa đơn khống' });
        await driverService.updateMaintenanceCost(DRIVER, vehicleId, 450_000);
        await driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/b.jpg');

        const { rows: [row] } = await pool.query(
            `SELECT verdict, checks FROM receipt_extractions WHERE entity_id = $1 AND image_url = 'https://cdn/b.jpg'`, [recordId],
        );
        assert.strictEqual(row.verdict, 'needs_review');
        assert.ok(row.checks.some((r) => r.code === 'RECEIPT_PREVIOUSLY_RETURNED' && r.severity === 'warning'));
    });

    it('đợt cũ bị HUỶ → dùng cùng hóa đơn cho đợt mới chỉ cảnh báo, không chặn', async () => {
        const first = await newRecord();
        images['https://cdn/huy-1.jpg'] = { sha: 'sha-huy', bill: bill(450_000, { invoiceNo: 'HD-90' }) };
        images['https://cdn/huy-2.jpg'] = { sha: 'sha-huy', bill: bill(450_000, { invoiceNo: 'HD-90' }) };
        await driverService.uploadMaintenanceBill(DRIVER, first.vehicleId, 'https://cdn/huy-1.jpg');
        await vehicleManagementService.rejectMaintenance(first.vehicleId, MANAGER, { mode: 'cancel', reason: 'Đưa nhầm xe vào bảo dưỡng' });

        const second = await newRecord();
        const err = await catchErr(driverService.uploadMaintenanceBill(DRIVER, second.vehicleId, 'https://cdn/huy-2.jpg'));

        assert.strictEqual(err, null, `bị chặn oan: ${err?.message}`);
        const { rows: [row] } = await pool.query(
            `SELECT verdict, checks FROM receipt_extractions WHERE entity_id = $1`, [second.recordId],
        );
        assert.ok(row.checks.some((r) => r.code === 'RECEIPT_PREVIOUSLY_RETURNED'));
    });

    it('hóa đơn của đợt KHÔNG bị trả về vẫn bị chặn khi dùng cho đợt khác', async () => {
        const first = await newRecord();
        images['https://cdn/dung-1.jpg'] = { sha: 'sha-dung', bill: bill(450_000, { invoiceNo: 'HD-91' }) };
        images['https://cdn/dung-2.jpg'] = { sha: 'sha-dung', bill: bill(450_000, { invoiceNo: 'HD-91' }) };
        await driverService.uploadMaintenanceBill(DRIVER, first.vehicleId, 'https://cdn/dung-1.jpg');
        await driverService.completeMaintenance(DRIVER, first.vehicleId, { cost: 450_000 });

        const second = await newRecord();
        const err = await catchErr(driverService.uploadMaintenanceBill(DRIVER, second.vehicleId, 'https://cdn/dung-2.jpg'));

        assert.strictEqual(err?.statusCode, 422);
        assert.match(err.message, /đã được dùng cho đợt bảo dưỡng/);
    });
});

describe('Tải ảnh và hoàn tất chồng lên nhau', () => {
    it('ảnh tải xong SAU khi đợt đã gửi duyệt không được lẻn vào bill_pics', async () => {
        const { vehicleId, recordId } = await newRecord();
        images['https://cdn/dau.jpg'] = { sha: 'sha-dau', bill: bill(450_000, { invoiceNo: 'HD-10' }) };
        images['https://cdn/muon.jpg'] = { sha: 'sha-muon', bill: bill(300_000, { invoiceNo: 'HD-11' }) };
        await driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/dau.jpg');

        // App không khoá nút "Hoàn thành" trong lúc ảnh đang "Đang kiểm tra...".
        const held = gate('https://cdn/muon.jpg');
        const upload = catchErr(driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/muon.jpg'));
        await held.arrived;
        await driverService.completeMaintenance(DRIVER, vehicleId, { cost: 450_000 });
        held.open();
        const err = await upload;

        const after = await readRecord(recordId);
        assert.strictEqual(after.status, 'pending_verification');
        assert.deepStrictEqual(after.bill_pics, ['https://cdn/dau.jpg'], 'hóa đơn chưa qua đối chiếu số tiền đã lẻn vào đợt đã gửi duyệt');
        assert.strictEqual(err?.statusCode, 409);

        // Ảnh không vào được đợt thì dòng vết của nó phải được thả ra — nếu không, chính lần
        // tải hụt này sẽ chặn tài xế nộp lại tờ hóa đơn đó sau khi đợt bị trả về làm lại.
        const { rows: [row] } = await pool.query(
            `SELECT released_at FROM receipt_extractions WHERE image_url = 'https://cdn/muon.jpg'`,
        );
        assert.ok(row.released_at);
    });

    it('hoàn tất KHÔNG được xoá mất ảnh vừa tải xong trong lúc nó đang kiểm tra', async () => {
        // Ảnh gửi kèm yêu cầu chưa từng được quét → hoàn tất chạy đủ dây chuyền, mất cả
        // chục giây. Tài xế tải thêm một ảnh trong khoảng đó.
        const { vehicleId, recordId } = await newRecord({ billPics: ['https://cdn/yeu-cau.jpg'] });
        images['https://cdn/yeu-cau.jpg'] = { sha: 'sha-yc', bill: bill(450_000, { invoiceNo: 'HD-20' }) };
        images['https://cdn/them.jpg'] = { sha: 'sha-them', bill: bill(450_000, { invoiceNo: 'HD-21' }) };

        const held = gate('https://cdn/yeu-cau.jpg');
        const completing = catchErr(driverService.completeMaintenance(DRIVER, vehicleId, { cost: 450_000 }));
        await held.arrived;
        await driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/them.jpg');
        held.open();
        const err = await completing;

        const after = await readRecord(recordId);
        assert.deepStrictEqual(after.bill_pics, ['https://cdn/yeu-cau.jpg', 'https://cdn/them.jpg'], 'ảnh tài xế đã được báo tải thành công bị mất');
        assert.strictEqual(after.status, 'open', 'đợt gửi duyệt với một ảnh chưa qua đối chiếu số tiền');
        assert.strictEqual(err?.statusCode, 409);
    });

    it('bấm hoàn tất hai lần: một lần thành công, lần kia nhận 409 chứ không phải 500', async () => {
        const { vehicleId } = await newRecord();
        images['https://cdn/hai-lan.jpg'] = { sha: 'sha-2l', bill: bill(450_000, { invoiceNo: 'HD-30' }) };
        await driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/hai-lan.jpg');

        const results = await Promise.all([
            catchErr(driverService.completeMaintenance(DRIVER, vehicleId, { cost: 450_000 })),
            catchErr(driverService.completeMaintenance(DRIVER, vehicleId, { cost: 450_000 })),
        ]);

        assert.strictEqual(results.filter((e) => e === null).length, 1);
        assert.strictEqual(results.find(Boolean).statusCode, 409);
    });
});

describe('Màn duyệt của quản lý', () => {
    const callReceipts = async (recordId) => {
        let body;
        let status = 200;
        const res = {
            status(code) { status = code; return this; },
            json(payload) { body = payload; return this; },
        };
        await vehicleManagementController.getMaintenanceReceipts({ params: { recordId: String(recordId) } }, res);
        assert.strictEqual(status, 200, JSON.stringify(body));
        return body;
    };

    it('chỉ hiện hóa đơn đang thuộc đợt, không hiện ảnh bị chặn lúc tải (ảnh đó đã bị xoá khỏi Cloudinary)', async () => {
        const { vehicleId, recordId } = await newRecord();
        images['https://cdn/bao-gia-tai.jpg'] = { sha: 'sha-bg', bill: bill(450_000, { invoiceNo: 'BG-1', docType: 'quote' }) };
        images['https://cdn/that.jpg'] = { sha: 'sha-that', bill: bill(450_000, { invoiceNo: 'HD-40' }) };

        const blocked = await catchErr(driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/bao-gia-tai.jpg'));
        assert.strictEqual(blocked?.statusCode, 422);
        await driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/that.jpg');
        await driverService.completeMaintenance(DRIVER, vehicleId, { cost: 450_000 });

        const review = await callReceipts(recordId);

        assert.deepStrictEqual(review.receipts.map((r) => r.image_url), ['https://cdn/that.jpg']);
        assert.strictEqual(review.summary.rejected, 0, '"1 hóa đơn không đạt" cho một ảnh không hề thuộc đợt');
        assert.strictEqual(review.summary.rejected_uploads, 1);
    });

    it('hiện đúng những điểm bước hoàn tất đã nêu, kể cả điểm ở mức cả đợt', async () => {
        // Báo giá gửi kèm yêu cầu: bước hoàn tất gạt ra khỏi tổng và gắn cảnh báo. Thông báo
        // gửi quản lý nói "Có N điểm cần kiểm tra" — màn duyệt phải chỉ ra được điểm đó.
        const { vehicleId, recordId } = await newRecord({ billPics: ['https://cdn/bao-gia-yc.jpg'] });
        images['https://cdn/bao-gia-yc.jpg'] = { sha: 'sha-bgyc', bill: bill(480_000, { invoiceNo: 'BG-2', docType: 'quote' }) };
        images['https://cdn/hd-cuoi.jpg'] = { sha: 'sha-hdc', bill: bill(450_000, { invoiceNo: 'HD-41' }) };
        await driverService.uploadMaintenanceBill(DRIVER, vehicleId, 'https://cdn/hd-cuoi.jpg');
        await driverService.completeMaintenance(DRIVER, vehicleId, { cost: 450_000 });

        const review = await callReceipts(recordId);

        assert.ok(review.record_checks.some((r) => r.code === 'SUPPORTING_DOCUMENT'), JSON.stringify(review.record_checks));
        const quote = review.receipts.find((r) => r.image_url === 'https://cdn/bao-gia-yc.jpg');
        assert.strictEqual(quote.supporting, true);
        assert.strictEqual(review.summary.rejected, 0, 'báo giá gửi kèm không phải "hóa đơn không đạt"');
    });
});
