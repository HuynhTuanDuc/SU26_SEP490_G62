const assert = require('node:assert');

const crossCheck = require('../../services/receiptCrossCheck');
const taxonomy = require('../../services/receiptTaxonomy');

const keywordIndex = taxonomy.buildKeywordIndex();

/** Hóa đơn bảo dưỡng hai dòng, tự khớp số học. */
const bill = (overrides = {}) => ({
    is_document: true,
    doc_type: 'invoice',
    vendor: { name: 'Garage Thành Công', tax_code: null, address: null, phone: null },
    invoice_no: 'HD-1',
    issued_date: '2026-09-01',
    vehicle_plate: null,
    currency: 'VND',
    line_items: [
        { raw_name: 'Nhớt Castrol', quantity: 1, unit: 'lít', unit_price: 450_000, line_total: 450_000, category: 'engine_oil' },
        { raw_name: 'Lọc dầu', quantity: 2, unit: 'cái', unit_price: 85_000, line_total: 170_000, category: 'filter' },
    ],
    subtotal: 620_000,
    discount: 0,
    vat_rate: null,
    vat_amount: null,
    total: 620_000,
    unreadable_fields: [],
    ...overrides,
});

/** Bản quét OCR khớp với hóa đơn ở trên. */
const goodScan = (text, confidence = 85) => ({
    ok: true,
    confidence,
    text,
    lines: text.split('\n').map((line) => ({ text: line, confidence })),
    engine: 'tesseract.js/vie+eng',
    latency_ms: 4_000,
});

const MATCHING_TEXT = [
    'GARAGE THANH CONG',
    'HOA DON BAN HANG so HD-1',
    'Nhot Castrol      1     450.000     450.000',
    'Loc dau           2      85.000     170.000',
    'Cong tien hang                      620.000',
    'TONG CONG                           620.000',
].join('\n');

describe('receiptCrossCheck — khi kênh OCR không dùng được', () => {
    it('KHÔNG kết luận gì cả, chỉ trừ một khoản nhỏ cho việc thiếu nhân chứng', () => {
        // Đây là điểm quan trọng nhất về tương thích ngược: bật OCR lên không được
        // biến toàn bộ hóa đơn đang chạy tốt thành "cần người xem". Trừ điểm cho việc
        // không có kênh đối chiếu phải đủ nhỏ để tự nó KHÔNG vượt ngưỡng cần duyệt tay.
        const result = crossCheck.corroborate(bill(), { ok: false, code: 'OCR_DISABLED' }, { keywordIndex });

        assert.strictEqual(result.trusted, false);
        assert.deepStrictEqual(result.reasons, []);
        assert.ok(result.confidence > crossCheck.CONFIDENCE.REVIEW,
            `độ tin cậy ${result.confidence} phải còn trên ngưỡng cần người xem`);
    });

    it('coi bản quét mờ là không có ý kiến chứ không phải bằng chứng ngược', () => {
        // Dưới ngưỡng tin cậy, Tesseract đang đoán chứ không đọc. Kết luận "không tìm
        // thấy con số" rút ra từ một bản quét như vậy sẽ tạo cảnh báo sai hàng loạt,
        // và người duyệt sẽ học cách bỏ qua mọi cảnh báo.
        const result = crossCheck.corroborate(bill(), goodScan(MATCHING_TEXT, 30), { keywordIndex });

        assert.strictEqual(result.trusted, false);
        assert.deepStrictEqual(result.reasons, []);
    });

    it('coi bản quét trống là không dùng được', () => {
        assert.strictEqual(crossCheck.isOcrTrustworthy(goodScan('abc', 90), { strict: new Set(), repaired: new Set() }), false);
    });
});

describe('receiptCrossCheck — hai kênh khớp nhau', () => {
    it('không có cảnh báo nào và độ tin cậy đạt mức cao', () => {
        const result = crossCheck.corroborate(bill(), goodScan(MATCHING_TEXT), { keywordIndex });

        assert.strictEqual(result.trusted, true);
        assert.deepStrictEqual(result.reasons, []);
        assert.strictEqual(result.confidence, 1);
        assert.strictEqual(result.confidence_label, 'cao');
        assert.strictEqual(crossCheck.shouldRecheck(result), false, 'khớp rồi thì không tốn thêm lượt gọi model');
    });

    it('xác nhận được cả tổng tiền lẫn từng dòng và tên bên bán', () => {
        const { signals } = crossCheck.corroborate(bill(), goodScan(MATCHING_TEXT), { keywordIndex });

        assert.strictEqual(signals.total.status, 'yes');
        assert.strictEqual(signals.line_totals.grounded, 2);
        assert.strictEqual(signals.vendor.status, 'yes');
    });
});

describe('receiptCrossCheck — bắt con số không có trên giấy', () => {
    const text = MATCHING_TEXT.replace('TONG CONG                           620.000', 'TONG CONG');

    it('cảnh báo khi tổng tiền model khai không tìm thấy trong text quét', () => {
        // Đây là thứ một mình model không bao giờ tự tố cáo được: khi ảnh mờ đúng chỗ
        // cột tổng, model vẫn trả về một con số trông hoàn toàn hợp lý và không có gì
        // trong kết quả của nó cho thấy con số đó được suy ra chứ không phải đọc ra.
        const result = crossCheck.corroborate(bill({ total: 999_000 }), goodScan(text), { keywordIndex });
        const found = result.reasons.find((r) => r.code === 'OCR_TOTAL_NOT_GROUNDED');

        assert.ok(found, 'phải cảnh báo');
        assert.strictEqual(found.severity, 'warning', 'bằng chứng OCR quá nhiễu để dùng làm căn cứ TỪ CHỐI');
        assert.ok(result.confidence < crossCheck.CONFIDENCE.HIGH);
        assert.ok(result.suspect_fields.includes('total'));
    });

    it('đề nghị đọc lại có trợ giúp khi biết rõ trường nào đang lệch', () => {
        // Lượt đọc lại tốn thêm một lần gọi model, nên chỉ chạy khi CÓ CHỖ ĐỂ SỬA.
        const result = crossCheck.corroborate(bill({ total: 999_000 }), goodScan(text), { keywordIndex });

        assert.strictEqual(crossCheck.shouldRecheck(result), true);
    });

    it('chỉ trừ tượng trưng khi con số khớp sau khi sửa ký tự nhầm', () => {
        const blurry = MATCHING_TEXT.replace(/620\.000/g, '62O.OOO');
        const result = crossCheck.corroborate(bill(), goodScan(blurry), { keywordIndex });

        assert.deepStrictEqual(result.reasons, [], 'gần như chắc là đúng thì không làm phiền người duyệt');
        assert.ok(result.confidence >= crossCheck.CONFIDENCE.HIGH);
    });

    it('cảnh báo khi phần lớn dòng hàng không tìm thấy được', () => {
        const result = crossCheck.corroborate(
            bill({ line_items: [
                { raw_name: 'Nhớt Castrol', quantity: 1, unit: null, unit_price: 111_000, line_total: 111_000, category: 'engine_oil' },
                { raw_name: 'Lọc dầu', quantity: 1, unit: null, unit_price: 222_000, line_total: 222_000, category: 'filter' },
            ] }),
            goodScan(MATCHING_TEXT),
            { keywordIndex },
        );

        assert.ok(result.reasons.some((r) => r.code === 'OCR_LINE_TOTALS_NOT_GROUNDED'));
    });
});

describe('receiptCrossCheck — bắt chứng từ sai loại', () => {
    it('cảnh báo khi trên giấy có chữ BÁO GIÁ mà model xếp là hóa đơn', () => {
        const text = MATCHING_TEXT.replace('HOA DON BAN HANG so HD-1', 'PHIEU BAO GIA so BG-1');
        const result = crossCheck.corroborate(bill(), goodScan(text), { keywordIndex });
        const found = result.reasons.find((r) => r.code === 'OCR_QUOTE_SIGNAL');

        assert.ok(found);
        // CỐ Ý chỉ cảnh báo dù model tự đọc ra 'quote' thì bị từ chối thẳng: hóa đơn
        // sửa xe thật rất hay có dòng "theo báo giá số ... ngày ...", nên bắt được cụm
        // này trong text KHÔNG đủ để kết luận cả tờ giấy là báo giá.
        assert.strictEqual(found.severity, 'warning');
    });

    it('im lặng khi chính model đã nhận ra đó là báo giá', () => {
        // Model đã tự nhận ra thì tầng luật (receiptChecks) từ chối rồi — cảnh báo thêm
        // ở đây chỉ làm loãng danh sách việc của người duyệt.
        const text = MATCHING_TEXT.replace('HOA DON BAN HANG so HD-1', 'PHIEU BAO GIA so BG-1');
        const result = crossCheck.corroborate(bill({ doc_type: 'quote' }), goodScan(text), { keywordIndex });

        assert.ok(!result.reasons.some((r) => r.code === 'OCR_QUOTE_SIGNAL'));
    });
});

describe('receiptCrossCheck — bắt dòng hàng model bỏ sót', () => {
    it('cảnh báo khi text có hạng mục ngoài phạm vi mà bảng kê không có', () => {
        // Cả model lẫn từ điển chạy trên line_items đều mù với một dòng bị bỏ sót hoàn
        // toàn — chỉ text thô còn giữ được chữ đó.
        const text = `${MATCHING_TEXT}\nXang A95                          500.000`;
        const result = crossCheck.corroborate(bill(), goodScan(text), { keywordIndex, profile: 'maintenance' });
        const found = result.reasons.find((r) => r.code === 'OCR_OFF_TOPIC_TEXT');

        assert.ok(found, 'phải nhận ra dòng xăng nằm ngoài phạm vi bảo dưỡng');
        assert.ok(result.suspect_fields.includes('line_items'));
    });

    it('KHÔNG cảnh báo khi hạng mục đó vốn đúng chủ đề của loại chi phí', () => {
        // Cùng một dòng "Xăng A95" là hợp lệ khi khai vào loại chi phí nhiên liệu.
        const text = `${MATCHING_TEXT}\nXang A95                          500.000`;
        const result = crossCheck.corroborate(bill(), goodScan(text), { keywordIndex, profile: 'fuel' });

        assert.ok(!result.reasons.some((r) => r.code === 'OCR_OFF_TOPIC_TEXT'));
    });

    it('bỏ qua bằng chứng từ những dòng bản thân nó đọc không rõ', () => {
        const text = `${MATCHING_TEXT}\nXang A95                          500.000`;
        const scan = goodScan(text);
        scan.lines[scan.lines.length - 1].confidence = 20;

        const result = crossCheck.corroborate(bill(), scan, { keywordIndex, profile: 'maintenance' });

        assert.ok(!result.reasons.some((r) => r.code === 'OCR_OFF_TOPIC_TEXT'));
    });
});

describe('receiptCrossCheck — chọn giữa hai lượt đọc', () => {
    const read = (confidence) => ({ result: { ok: true }, corroboration: { confidence } });

    it('lấy lượt đọc lại khi nó tốt hơn hoặc ngang bằng', () => {
        // Hòa thì lấy lượt sau: nó nhìn được mọi thứ lượt trước nhìn được, cộng thêm
        // text OCR.
        assert.strictEqual(crossCheck.pickBetterRead(read(0.6), read(0.9)).corroboration.confidence, 0.9);
        assert.strictEqual(crossCheck.pickBetterRead(read(0.7), read(0.7)).corroboration.confidence, 0.7);
    });

    it('giữ lượt đầu khi lượt đọc lại tệ hơn', () => {
        // Trường hợp model bị text OCR sai dẫn đi lạc.
        assert.strictEqual(crossCheck.pickBetterRead(read(0.9), read(0.4)).corroboration.confidence, 0.9);
    });

    it('không đọc lại khi kênh OCR không đáng tin', () => {
        assert.strictEqual(crossCheck.shouldRecheck({ trusted: false, confidence: 0.2, suspect_fields: ['total'] }), false);
    });
});
