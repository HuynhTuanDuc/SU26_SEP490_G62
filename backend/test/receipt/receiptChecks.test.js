const assert = require('node:assert');

const checks = require('../../services/receiptChecks');
const taxonomy = require('../../services/receiptTaxonomy');

const keywordIndex = taxonomy.buildKeywordIndex();

/**
 * Hóa đơn garage sạch, mọi phép cộng đều khớp:
 *   450.000 + 170.000 + 150.000 = 770.000 tiền hàng
 *   VAT 10%                     =  77.000
 *   Tổng                        = 847.000
 */
const cleanInvoice = () => ({
    is_document: true,
    doc_type: 'invoice',
    vendor: { name: 'Garage Thành Công', tax_code: '0101234567' },
    invoice_no: 'HD-00123',
    issued_date: '2026-08-20',
    vehicle_plate: '51C-12345',
    currency: 'VND',
    line_items: [
        { raw_name: 'Nhớt Castrol GTX 15W40 4L', quantity: 1, unit: 'chai', unit_price: 450_000, line_total: 450_000, category: 'engine_oil' },
        { raw_name: 'Lọc dầu động cơ', quantity: 2, unit: 'cái', unit_price: 85_000, line_total: 170_000, category: 'filter' },
        { raw_name: 'Tiền công thay dầu', quantity: 1, unit: 'lần', unit_price: 150_000, line_total: 150_000, category: 'labor' },
    ],
    subtotal: 770_000,
    discount: 0,
    vat_rate: 10,
    vat_amount: 77_000,
    total: 847_000,
    unreadable_fields: [],
});

const baseContext = (overrides = {}) => ({
    keywordIndex,
    claimedAmount: 847_000,
    plateNumber: '51C-12345',
    windowStart: '2026-08-19',
    windowEnd: '2026-08-21',
    today: '2026-08-22',
    ...overrides,
});

const codesOf = (result) => result.reasons.map((r) => r.code);

describe('receiptChecks — hóa đơn hợp lệ', () => {
    it('chấp nhận hóa đơn bảo dưỡng khớp mọi phép cộng', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext());

        assert.strictEqual(result.verdict, 'passed');
        assert.deepStrictEqual(result.reasons, []);
        assert.strictEqual(result.receipt_total, 847_000);
        assert.strictEqual(result.groups.on_topic_share, 1);
    });

    it('không đối chiếu số tiền khi tài xế chưa nhập chi phí', () => {
        // Luồng thật: tài xế up ảnh trước, nhập tiền sau. Lúc này chưa có gì để so.
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({ claimedAmount: null }));

        assert.strictEqual(result.verdict, 'passed');
        assert.ok(!codesOf(result).includes('AMOUNT_MISMATCH'));
    });

    it('bỏ qua một khoản lặt vặt không thuộc bảo dưỡng khi nó quá nhỏ', () => {
        // Garage kèm chai nước 10k vào hóa đơn 780k — vẫn là hóa đơn bảo dưỡng.
        const invoice = cleanInvoice();
        invoice.line_items.push({ raw_name: 'Nước suối', quantity: 1, unit: 'chai', unit_price: 10_000, line_total: 10_000, category: 'food' });
        invoice.subtotal = 780_000;
        invoice.vat_amount = 78_000;
        invoice.total = 858_000;

        const result = checks.evaluateReceipt(invoice, baseContext({ claimedAmount: 858_000 }));

        assert.strictEqual(result.verdict, 'passed');
        assert.ok(result.groups.off_topic_share < checks.THRESHOLDS.MAX_OFF_TOPIC_SHARE);
    });
});

describe('receiptChecks — ảnh không phải hóa đơn', () => {
    it('từ chối ảnh không nhận ra chứng từ', () => {
        const result = checks.evaluateReceipt(
            { is_document: false, doc_type: 'other', line_items: [] },
            baseContext(),
        );

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('NOT_A_DOCUMENT'));
    });

    it('từ chối báo giá và nói rõ cần chụp hóa đơn cuối cùng', () => {
        const invoice = { ...cleanInvoice(), doc_type: 'quote' };
        const result = checks.evaluateReceipt(invoice, baseContext());

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('WRONG_DOC_TYPE'));
        assert.match(checks.firstErrorMessage(result.reasons), /BÁO GIÁ/);
    });

    it('từ chối ảnh chụp màn hình chuyển khoản', () => {
        const result = checks.evaluateReceipt(
            { ...cleanInvoice(), doc_type: 'screenshot' },
            baseContext(),
        );

        assert.strictEqual(result.verdict, 'rejected');
        assert.match(checks.firstErrorMessage(result.reasons), /chụp màn hình/);
    });

    it('từ chối khi không đọc được dòng hàng nào', () => {
        // Đây chính là ca mà lớp OCR cũ cho qua: ảnh chỉ có mỗi một con số.
        const result = checks.evaluateReceipt(
            { is_document: true, doc_type: 'receipt', total: 500_000, line_items: [] },
            baseContext({ claimedAmount: 500_000 }),
        );

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('NO_LINE_ITEMS'));
    });

    it('cho hóa đơn viết tay đi tiếp nhưng bắt người duyệt nhìn', () => {
        // Garage nhỏ ở VN viết tay là chuyện thường — chặn cứng là từ chối oan.
        const result = checks.evaluateReceipt(
            { ...cleanInvoice(), doc_type: 'handwritten' },
            baseContext(),
        );

        assert.strictEqual(result.verdict, 'needs_review');
        assert.ok(codesOf(result).includes('HANDWRITTEN_DOCUMENT'));
    });
});

describe('receiptChecks — hạng mục có thuộc bảo dưỡng không', () => {
    it('từ chối hóa đơn xăng và chỉ đúng loại chi phí phải khai', () => {
        const invoice = {
            ...cleanInvoice(),
            line_items: [
                { raw_name: 'Xăng A95', quantity: 40, unit: 'lít', unit_price: 23_000, line_total: 920_000, category: 'fuel' },
            ],
            subtotal: 920_000, vat_rate: 10, vat_amount: 92_000, total: 1_012_000,
        };

        const result = checks.evaluateReceipt(invoice, baseContext({ claimedAmount: 1_012_000 }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('OFF_TOPIC_INVOICE'));
        assert.match(checks.firstErrorMessage(result.reasons), /Nhiên liệu/);
    });

    it('từ chối khi phần lớn tiền là ăn uống dù có kèm dòng bảo dưỡng', () => {
        const invoice = {
            ...cleanInvoice(),
            line_items: [
                { raw_name: 'Nhớt Castrol', quantity: 1, unit: 'chai', unit_price: 200_000, line_total: 200_000, category: 'engine_oil' },
                { raw_name: 'Cà phê', quantity: 10, unit: 'ly', unit_price: 100_000, line_total: 1_000_000, category: 'food' },
            ],
            subtotal: 1_200_000, vat_rate: 0, vat_amount: 0, total: 1_200_000,
        };

        const result = checks.evaluateReceipt(invoice, baseContext({ claimedAmount: 1_200_000 }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('OFF_TOPIC_INVOICE'));
    });

    it('đưa dòng chưa phân loại được lên cho người duyệt thay vì tự từ chối', () => {
        const invoice = {
            ...cleanInvoice(),
            line_items: [
                { raw_name: 'Nhớt Castrol', quantity: 1, unit: 'chai', unit_price: 200_000, line_total: 200_000, category: 'engine_oil' },
                { raw_name: 'Bộ ZX-9981 chuyên dụng', quantity: 1, unit: 'bộ', unit_price: 800_000, line_total: 800_000, category: null },
            ],
            subtotal: 1_000_000, vat_rate: 0, vat_amount: 0, total: 1_000_000,
        };

        const result = checks.evaluateReceipt(invoice, baseContext({ claimedAmount: 1_000_000 }));

        assert.strictEqual(result.verdict, 'needs_review');
        assert.ok(codesOf(result).includes('UNCLASSIFIED_ITEMS'));
    });

    it('đánh dấu khi từ điển và AI phân loại chỏi nhau', () => {
        const invoice = cleanInvoice();
        // Từ điển đọc "Xăng A95" là nhiên liệu, model lại khai là vật tư bảo dưỡng.
        invoice.line_items[0] = {
            raw_name: 'Xăng A95', quantity: 1, unit: 'lít', unit_price: 450_000,
            line_total: 450_000, category: 'other_maintenance',
        };

        const result = checks.evaluateReceipt(invoice, baseContext());

        assert.ok(codesOf(result).includes('CATEGORY_CONFLICT'));
        // Từ điển thắng khi tính tiền → dòng này bị tính vào nhóm loại trừ.
        assert.ok(result.groups.off_topic_share > 0);
    });
});

describe('receiptChecks — số học của hóa đơn', () => {
    it('từ chối khi số lượng × đơn giá không ra thành tiền ở nhiều dòng', () => {
        const invoice = cleanInvoice();
        invoice.line_items[0].line_total = 900_000;   // 1 × 450.000 nhưng ghi 900.000
        invoice.line_items[1].line_total = 400_000;   // 2 ×  85.000 nhưng ghi 400.000
        invoice.subtotal = 1_450_000;
        invoice.vat_amount = 145_000;
        invoice.total = 1_595_000;

        const result = checks.evaluateReceipt(invoice, baseContext({ claimedAmount: 1_595_000 }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('LINE_MATH_MISMATCH'));
    });

    it('chỉ cảnh báo khi đúng một dòng lệch mà tổng vẫn khớp', () => {
        // Các thành tiền vẫn cộng đúng ra tổng → nhiều khả năng máy đọc nhầm đơn giá,
        // không phải hóa đơn bị sửa. Chặn cứng ca này là từ chối oan người trung thực.
        const invoice = cleanInvoice();
        invoice.line_items[0].unit_price = 460_000;   // thành tiền vẫn giữ 450.000

        const result = checks.evaluateReceipt(invoice, baseContext());

        assert.strictEqual(result.verdict, 'needs_review');
        assert.ok(codesOf(result).includes('LINE_MATH_MISMATCH_MINOR'));
        assert.ok(!codesOf(result).includes('LINE_MATH_MISMATCH'));
    });

    it('bắt được hóa đơn bị sửa tổng: cộng các dòng không ra tiền hàng', () => {
        // Đây là dấu hiệu tờ hóa đơn bị chỉnh sửa — thứ mà dung sai 15% cũ bỏ lọt hoàn toàn.
        const invoice = cleanInvoice();
        invoice.subtotal = 3_000_000;
        invoice.vat_amount = 300_000;
        invoice.total = 3_300_000;

        const result = checks.evaluateReceipt(invoice, baseContext({ claimedAmount: 3_300_000 }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('SUBTOTAL_MISMATCH'));
    });

    it('bắt được tổng cuối không bằng tiền hàng cộng thuế', () => {
        const invoice = cleanInvoice();
        invoice.total = 1_500_000;    // đúng ra phải là 847.000

        const result = checks.evaluateReceipt(invoice, baseContext({ claimedAmount: 1_500_000 }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('TOTAL_MISMATCH'));
    });

    it('cảnh báo khi thuế VAT không khớp thuế suất', () => {
        const invoice = cleanInvoice();
        invoice.vat_rate = 8;          // 8% của 770.000 = 61.600, không phải 77.000
        invoice.total = 831_600;
        invoice.vat_amount = 61_600;
        invoice.line_items[0].line_total = 450_000;

        // Đặt VAT lệch so với thuế suất nhưng tổng vẫn tự khớp.
        invoice.vat_amount = 77_000;
        invoice.total = 847_000;

        const result = checks.evaluateReceipt(invoice, baseContext());

        assert.ok(codesOf(result).includes('VAT_MISMATCH'));
        assert.strictEqual(result.verdict, 'needs_review');
    });

    it('chấp nhận sai số làm tròn nhỏ trong ngưỡng', () => {
        const invoice = cleanInvoice();
        invoice.total = 847_500;       // lệch 500đ do làm tròn
        invoice.subtotal = 770_500;
        invoice.line_items[2].line_total = 150_500;
        invoice.line_items[2].unit_price = 150_500;

        const result = checks.evaluateReceipt(invoice, baseContext({ claimedAmount: 847_500 }));

        assert.strictEqual(result.verdict, 'passed');
    });

    it('suy ra tổng từ các dòng khi hóa đơn không in dòng tổng', () => {
        const invoice = cleanInvoice();
        invoice.subtotal = null;
        invoice.vat_rate = null;
        invoice.vat_amount = null;
        invoice.total = null;

        const result = checks.evaluateReceipt(invoice, baseContext({ claimedAmount: 770_000 }));

        assert.strictEqual(result.receipt_total, 770_000);
        assert.strictEqual(result.totals.total_source, 'line_sum');
        assert.strictEqual(result.verdict, 'passed');
    });
});

describe('receiptChecks — đối chiếu số tiền khai', () => {
    it('từ chối khai vống và nói rõ lệch bao nhiêu', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({ claimedAmount: 5_000_000 }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('AMOUNT_MISMATCH'));
        assert.match(checks.firstErrorMessage(result.reasons), /847\.000đ/);
        assert.match(checks.firstErrorMessage(result.reasons), /4\.153\.000đ/);
    });

    it('chặn mức lệch mà dung sai 15% cũ vẫn cho qua', () => {
        // 847.000 + 12% = 948.640 — lớp cũ chấp nhận, lớp mới phải chặn.
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({ claimedAmount: 948_640 }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('AMOUNT_MISMATCH'));
    });

    it('chỉ cảnh báo với lệch nhỏ dưới 2% và dưới 50.000đ', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({ claimedAmount: 852_000 }));

        assert.strictEqual(result.verdict, 'needs_review');
        assert.ok(codesOf(result).includes('AMOUNT_MINOR_DIFF'));
    });

    it('coi như khớp khi lệch trong mức làm tròn', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({ claimedAmount: 847_500 }));

        assert.strictEqual(result.verdict, 'passed');
    });
});

describe('receiptChecks — đối chiếu ngữ cảnh hệ thống', () => {
    it('CHẶN hóa đơn ghi biển số của xe khác', () => {
        // Người dùng báo: hóa đơn khác biển số vẫn được chấp nhận. Trước đây chỉ cảnh báo.
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({ plateNumber: '51C-99999' }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.match(result.reasons.find((r) => r.code === 'PLATE_MISMATCH').message, /không phải xe đang bảo dưỡng/);
    });

    it('chỉ cảnh báo khi biển số lệch đúng một ký tự — có thể do ảnh mờ', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({ plateNumber: '51C-12346' }));

        assert.strictEqual(result.verdict, 'needs_review');
        assert.strictEqual(result.reasons.find((r) => r.code === 'PLATE_MISMATCH').severity, 'warning');
    });

    it('chỉ cảnh báo khi model đọc lệch biển nhưng văn bản OCR thấy đúng biển của xe', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({
            plateNumber: '51C-99999',
            corroboration: { reasons: [], signals: { plates: ['51C99999'] } },
        }));

        assert.strictEqual(result.reasons.find((r) => r.code === 'PLATE_MISMATCH').severity, 'warning');
    });

    it('hóa đơn không in biển số nào thì không có gì để đối chiếu', () => {
        const result = checks.evaluateReceipt({ ...cleanInvoice(), vehicle_plate: null }, baseContext({ plateNumber: '51C-99999' }));

        assert.ok(!codesOf(result).includes('PLATE_MISMATCH'));
    });

    it('bỏ qua khác biệt định dạng biển số', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({ plateNumber: '51C 123.45' }));

        assert.strictEqual(result.verdict, 'passed');
    });

    it('từ chối hóa đơn đề ngày tương lai', () => {
        const invoice = { ...cleanInvoice(), issued_date: '2026-09-15' };
        const result = checks.evaluateReceipt(invoice, baseContext());

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('FUTURE_DATE'));
    });

    it('cảnh báo hóa đơn cũ nằm ngoài đợt bảo dưỡng này', () => {
        const invoice = { ...cleanInvoice(), issued_date: '2026-05-02' };
        const result = checks.evaluateReceipt(invoice, baseContext());

        assert.strictEqual(result.verdict, 'needs_review');
        assert.ok(codesOf(result).includes('DATE_OUTSIDE_WINDOW'));
    });

    it('chấp nhận hóa đơn lập trước ngày mở phiếu vài ngày', () => {
        // Tài xế hay sửa xe xong mới mở phiếu trên hệ thống.
        const invoice = { ...cleanInvoice(), issued_date: '2026-08-15' };
        const result = checks.evaluateReceipt(invoice, baseContext());

        assert.strictEqual(result.verdict, 'passed');
    });
});

describe('receiptChecks — trường đọc không rõ', () => {
    it('đưa lên người duyệt khi model tự khai có trường không đọc được', () => {
        const invoice = { ...cleanInvoice(), unreadable_fields: ['invoice_no'] };
        const result = checks.evaluateReceipt(invoice, baseContext());

        assert.strictEqual(result.verdict, 'needs_review');
        assert.ok(codesOf(result).includes('PARTIAL_READ'));
    });
});

describe('receiptChecks — hồ sơ theo loại chi phí', () => {
    const fuelInvoice = () => ({
        is_document: true,
        doc_type: 'receipt',
        vendor: { name: 'Petrolimex CH 12' },
        invoice_no: 'PE-8891',
        issued_date: '2026-08-20',
        vehicle_plate: null,
        line_items: [
            { raw_name: 'Xăng RON 95-III', quantity: 40, unit: 'lít', unit_price: 23_000, line_total: 920_000, category: 'fuel' },
        ],
        subtotal: 920_000, discount: 0, vat_rate: 10, vat_amount: 92_000, total: 1_012_000,
        unreadable_fields: [],
    });

    it('chấp nhận hóa đơn xăng khi khai vào loại Nhiên liệu', () => {
        // Chính hóa đơn này bị từ chối ở hồ sơ bảo dưỡng — cùng bộ khung, khác chủ đề.
        const result = checks.evaluateReceipt(fuelInvoice(), baseContext({
            profile: 'fuel', claimedAmount: 1_012_000, plateNumber: null, windowStart: null,
        }));

        assert.strictEqual(result.verdict, 'passed');
    });

    it('vẫn từ chối chính hóa đơn xăng đó khi khai vào loại Bảo dưỡng', () => {
        const result = checks.evaluateReceipt(fuelInvoice(), baseContext({
            profile: 'maintenance', claimedAmount: 1_012_000, plateNumber: null, windowStart: null,
        }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('OFF_TOPIC_INVOICE'));
    });

    it('từ chối hóa đơn bảo dưỡng khi khai nhầm vào loại Nhiên liệu', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({ profile: 'fuel' }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('OFF_TOPIC_INVOICE'));
    });

    it('bỏ qua kiểm tra hạng mục với loại chi phí không có danh mục đặc trưng', () => {
        // 'other' không ràng buộc hạng mục, nhưng các lớp còn lại vẫn chạy đủ:
        // đúng loại chứng từ, số học tự khớp, khớp số khai.
        const result = checks.evaluateReceipt(fuelInvoice(), baseContext({
            profile: 'other', claimedAmount: 1_012_000, plateNumber: null, windowStart: null,
        }));

        assert.strictEqual(result.verdict, 'passed');
    });

    it('vẫn bắt sai số học kể cả khi không kiểm tra hạng mục', () => {
        const invoice = fuelInvoice();
        invoice.total = 5_000_000;

        const result = checks.evaluateReceipt(invoice, baseContext({
            profile: 'other', claimedAmount: 5_000_000, plateNumber: null, windowStart: null,
        }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('TOTAL_MISMATCH'));
    });
});

describe('receiptChecks — số khai là TRẦN (lúc upload từng ảnh)', () => {
    it('không đòi hóa đơn lẻ phải bằng đúng số khai', () => {
        // Đợt bảo dưỡng 800k gồm hai hóa đơn 300k + 500k. Lúc up tấm 300k, đòi bằng
        // 800k là từ chối oan ngay tấm đầu tiên.
        const invoice = cleanInvoice();
        const result = checks.evaluateReceipt(invoice, baseContext({
            claimedAmount: 2_000_000,
            claimedAmountMode: 'ceiling',
        }));

        assert.strictEqual(result.verdict, 'passed');
    });

    it('vẫn chặn khi một hóa đơn lẻ lớn hơn tổng chi phí đã khai', () => {
        // Một hóa đơn không thể lớn hơn tổng của cả đợt — chiều này kiểm được ngay.
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({
            claimedAmount: 200_000,
            claimedAmountMode: 'ceiling',
        }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('AMOUNT_BELOW_RECEIPT'));
    });

    it('bỏ qua chênh lệch làm tròn ở chế độ trần', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({
            claimedAmount: 846_500,
            claimedAmountMode: 'ceiling',
        }));

        assert.strictEqual(result.verdict, 'passed');
    });
});

describe('receiptChecks — nhận dạng và chống dùng lại hóa đơn', () => {
    it('ưu tiên mã số thuế làm khoá bên bán vì nó đọc ổn định hơn tên', () => {
        const withTax = checks.invoiceIdentity({ vendor: { tax_code: '01-0123456-7', name: 'Garage A' }, invoice_no: 'HD/00123' });
        assert.deepStrictEqual(withTax, { vendorKey: 'tax:0101234567', invoiceNoKey: 'HD00123' });
    });

    it('rơi về tên đã chuẩn hoá khi hóa đơn không ghi mã số thuế', () => {
        const byName = checks.invoiceIdentity({ vendor: { name: 'Garage Thành Công' }, invoice_no: 'hd 00123' });
        assert.deepStrictEqual(byName, { vendorKey: 'name:garagethanhcong', invoiceNoKey: 'HD00123' });
    });

    it('trả số hóa đơn null khi hóa đơn không ghi số', () => {
        // Quan trọng: nơi gọi phải bỏ qua cặp khoá này, nếu không mọi hóa đơn viết tay
        // thiếu số sẽ khớp lẫn nhau và báo trùng oan hàng loạt.
        assert.strictEqual(checks.invoiceIdentity({ vendor: { name: 'Garage A' } }).invoiceNoKey, null);
    });

    it('từ chối khi hóa đơn đã dùng cho một đợt bảo dưỡng khác', () => {
        const matches = [{ id: 5, entity_type: 'maintenance_record', entity_id: 99, created_at: '2026-08-01' }];
        const reasons = checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21 });

        assert.strictEqual(reasons.length, 1);
        assert.strictEqual(reasons[0].code, 'DUPLICATE_RECEIPT');
        assert.strictEqual(reasons[0].severity, 'error');
        assert.match(reasons[0].message, /đợt bảo dưỡng #99/);
    });

    it('từ chối khi hóa đơn đã dùng cho một khoản chi phí khác', () => {
        const matches = [{ id: 5, entity_type: 'expense', entity_id: 77, created_at: '2026-08-01' }];
        const reasons = checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21 });

        assert.match(reasons[0].message, /khoản chi phí #77/);
    });

    it('phân biệt nộp trùng trong CÙNG một khoản với dùng lại cho khoản khác', () => {
        const matches = [{ id: 5, entity_type: 'maintenance_record', entity_id: 21, image_url: 'a.jpg' }];
        const reasons = checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21 });

        assert.strictEqual(reasons[0].code, 'DUPLICATE_IMAGE_SAME_RECORD');
        assert.match(reasons[0].message, /đã được tải lên cho chính khoản này/);
    });

    it('không báo gì khi không có bản đọc nào trùng', () => {
        assert.deepStrictEqual(checks.checkDuplicates([], { entityType: 'maintenance_record', entityId: 21 }), []);
        assert.deepStrictEqual(checks.checkDuplicates(undefined, { entityType: 'maintenance_record', entityId: 21 }), []);
    });

    it('KHÔNG coi việc đọc lại chính lần tải lên đó là nộp trùng', () => {
        // Lỗi thật, đã tái hiện: Gemini lỗi lúc tải ảnh → vết không có bản đọc → bước hoàn
        // tất phải đọc lại từ đầu → dò trùng khớp đúng dòng vết của CHÍNH lần tải đó → tài
        // xế bị chặn "ảnh đã tải lên cho chính khoản này, vui lòng chọn ảnh khác", trong khi
        // không làm gì sai và không có ảnh nào khác để chọn.
        const matches = [{ id: 5, entity_type: 'maintenance_record', entity_id: 21, image_url: 'a.jpg', verdict: 'error' }];
        const reasons = checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21, imageUrl: 'a.jpg' });

        assert.deepStrictEqual(reasons, []);
    });

    it('vẫn bắt nộp lại cùng ảnh thành tệp MỚI cho chính khoản đó', () => {
        // Mỗi lần tải lên là một tệp mới trên Cloudinary, tức URL mới — nên nộp lại thật
        // sự không bao giờ trùng URL, và vẫn bị bắt qua băm ảnh.
        const matches = [{ id: 5, entity_type: 'maintenance_record', entity_id: 21, image_url: 'a.jpg' }];
        const reasons = checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21, imageUrl: 'b.jpg' });

        assert.strictEqual(reasons[0].code, 'DUPLICATE_IMAGE_SAME_RECORD');
    });

    it('cùng URL nhưng ở khoản KHÁC vẫn là dùng lại hóa đơn', () => {
        const matches = [{ id: 5, entity_type: 'maintenance_record', entity_id: 99, image_url: 'a.jpg' }];
        const reasons = checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21, imageUrl: 'a.jpg' });

        assert.strictEqual(reasons[0].code, 'DUPLICATE_RECEIPT');
    });

    it('lần nộp đã bị TRẢ VỀ LÀM LẠI không chặn nộp lại cho chính khoản đó, chỉ cảnh báo', () => {
        // Đã tái hiện: trả về làm lại xoá bill_pics, app bảo "chụp lại hoá đơn", và tờ hóa
        // đơn thật bị chặn "ảnh đã tải lên cho chính khoản này rồi" mãi mãi.
        const matches = [{ id: 5, entity_type: 'maintenance_record', entity_id: 21, image_url: 'a.jpg', released_at: '2026-09-01' }];
        const reasons = checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21, imageUrl: 'b.jpg' });

        assert.deepStrictEqual(reasons.map((r) => [r.code, r.severity]), [['RECEIPT_PREVIOUSLY_RETURNED', 'warning']]);
    });

    it('hóa đơn của đợt đã bị HUỶ chỉ cảnh báo khi dùng cho đợt khác, và nói rõ đợt nào', () => {
        const matches = [{ id: 5, entity_type: 'maintenance_record', entity_id: 99, image_url: 'a.jpg', released_at: '2026-09-01' }];
        const reasons = checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21, imageUrl: 'b.jpg' });

        assert.strictEqual(reasons[0].severity, 'warning');
        assert.match(reasons[0].message, /đợt bảo dưỡng #99/);
    });

    it('tài xế tự XOÁ ảnh rồi tải lại cùng hóa đơn cho chính đợt đó: không chặn, không cảnh báo', () => {
        const matches = [{ id: 5, entity_type: 'maintenance_record', entity_id: 21, image_url: 'a.jpg', released_at: '2026-09-01', release_reason: 'removed' }];
        assert.deepStrictEqual(checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21, imageUrl: 'b.jpg' }), []);
    });

    it('hóa đơn tài xế đã xoá khỏi đợt KHÁC vẫn được nhắc cho người duyệt, đúng lý do', () => {
        const matches = [{ id: 5, entity_type: 'maintenance_record', entity_id: 99, image_url: 'a.jpg', released_at: '2026-09-01', release_reason: 'removed' }];
        const reasons = checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21, imageUrl: 'b.jpg' });

        assert.strictEqual(reasons[0].severity, 'warning');
        assert.match(reasons[0].message, /#99 \(tài xế đã xoá khỏi đợt đó\)/);
    });

    it('một lần dùng THẬT vẫn chặn dù cùng hóa đơn đó có lần nộp khác đã bị trả về', () => {
        const matches = [
            { id: 5, entity_type: 'maintenance_record', entity_id: 99, image_url: 'a.jpg', released_at: '2026-09-01' },
            { id: 6, entity_type: 'maintenance_record', entity_id: 42, image_url: 'c.jpg', released_at: null },
        ];
        const reasons = checks.checkDuplicates(matches, { entityType: 'maintenance_record', entityId: 21, imageUrl: 'b.jpg' });

        assert.deepStrictEqual(reasons.map((r) => [r.code, r.severity]), [['DUPLICATE_RECEIPT', 'error']]);
        assert.match(reasons[0].message, /#42/);
        assert.doesNotMatch(reasons[0].message, /#99/);
    });

    it('chặn hóa đơn hợp lệ về mọi mặt khác nếu nó đã được dùng ở nơi khác', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), baseContext({
            entityType: 'maintenance_record',
            entityId: 21,
            duplicateMatches: [{ id: 5, entity_type: 'maintenance_record', entity_id: 99 }],
        }));

        assert.strictEqual(result.verdict, 'rejected');
        assert.ok(codesOf(result).includes('DUPLICATE_RECEIPT'));
    });
});

describe('receiptChecks — chi phí bất thường so với lịch sử xe', () => {
    // Xe này bảo dưỡng đều tay: 1,2 – 1,5 triệu, trung vị 1,35 triệu.
    const history = [1_200_000, 1_350_000, 1_500_000, 1_250_000, 1_400_000];

    it('im lặng khi chi phí nằm trong khoảng quen thuộc', () => {
        assert.deepStrictEqual(checks.checkCostOutlier(1_400_000, history), []);
    });

    it('im lặng với mức nhỉnh hơn nhưng chưa đáng gọi người vào xem', () => {
        // Cao hơn mọi lần trước về mặt thống kê, nhưng chưa tới 1,5 lần mức thường lệ.
        // Không có sàn này thì xe nào chi tiêu đều sẽ bị cảnh báo gần như mọi đợt.
        assert.deepStrictEqual(checks.checkCostOutlier(1_900_000, history), []);
    });

    it('cảnh báo khi chi phí cao gấp nhiều lần mức thường lệ', () => {
        const reasons = checks.checkCostOutlier(4_800_000, history);

        assert.strictEqual(reasons.length, 1);
        assert.strictEqual(reasons[0].code, 'COST_OUTLIER');
        // Luôn là cảnh báo: sửa xe tốn tiền là chuyện có thật, không phải căn cứ từ chối.
        assert.strictEqual(reasons[0].severity, 'warning');
        assert.match(reasons[0].message, /4\.800\.000đ/);
        assert.match(reasons[0].message, /1\.350\.000đ/);
    });

    it('không cảnh báo chiều ngược lại — rẻ bất thường không phải dấu hiệu gian lận', () => {
        assert.deepStrictEqual(checks.checkCostOutlier(200_000, history), []);
    });

    it('im lặng khi chưa đủ mốc để biết thế nào là bình thường', () => {
        assert.deepStrictEqual(checks.checkCostOutlier(9_000_000, [1_000_000, 1_100_000]), []);
        assert.deepStrictEqual(checks.checkCostOutlier(9_000_000, []), []);
    });

    it('một hóa đơn khống trong quá khứ KHÔNG che được hóa đơn khống tiếp theo', () => {
        // Đây là lý do dùng trung vị và MAD thay vì trung bình và độ lệch chuẩn: trung
        // bình bị outlier kéo lên, nên một lần khai khống lọt lưới sẽ nâng ngưỡng và
        // hợp thức hoá lần sau.
        const poisoned = [1_200_000, 1_350_000, 1_500_000, 9_000_000, 1_400_000];

        assert.strictEqual(checks.checkCostOutlier(4_800_000, poisoned).length, 1);
    });

    it('xử lý được lịch sử phẳng tuyệt đối mà không chia cho 0', () => {
        const flat = [1_000_000, 1_000_000, 1_000_000];

        assert.strictEqual(checks.checkCostOutlier(3_000_000, flat).length, 1);
        assert.deepStrictEqual(checks.checkCostOutlier(1_500_000, flat), []);
    });
});

describe('receiptChecks — chọn tập chi phí để so sánh', () => {
    const rows = [
        { cost: 1_000_000, maintenance_type: 'scheduled' },
        { cost: 1_100_000, maintenance_type: 'scheduled' },
        { cost: 1_200_000, maintenance_type: 'scheduled' },
        { cost: 8_000_000, maintenance_type: 'emergency' },
    ];

    it('ưu tiên lịch sử CÙNG LOẠI bảo dưỡng khi đủ mẫu', () => {
        // So một đợt thay dầu định kỳ với một lần đại tu khẩn cấp là so hai thứ khác loại.
        const picked = checks.pickComparableCosts(rows, 'scheduled');

        assert.deepStrictEqual(picked.costs, [1_000_000, 1_100_000, 1_200_000]);
        assert.match(picked.scopeLabel, /định kỳ/);
    });

    it('gộp tất cả khi cùng loại chưa đủ mẫu, và nói rõ đang so với cái gì', () => {
        const picked = checks.pickComparableCosts(rows, 'emergency');

        assert.strictEqual(picked.costs.length, 4);
        assert.strictEqual(picked.scopeLabel, 'đợt bảo dưỡng trước');
    });

    it('loại bỏ chi phí rỗng hoặc không hợp lệ', () => {
        const messy = [{ cost: null }, { cost: 0 }, { cost: 'abc' }, { cost: 500_000 }];

        assert.deepStrictEqual(checks.pickComparableCosts(messy, null).costs, [500_000]);
    });

    it('lịch sử khẩn cấp không kéo ngưỡng của đợt định kỳ lên', () => {
        // Nếu gộp cả 8 triệu khẩn cấp vào, trung vị vọt lên và 3 triệu cho một đợt định
        // kỳ sẽ lọt lưới.
        const { costs, scopeLabel } = checks.pickComparableCosts(rows, 'scheduled');
        const reasons = checks.checkCostOutlier(3_000_000, costs, { scopeLabel });

        assert.strictEqual(reasons.length, 1);
    });
});

describe('evaluateReceipt — chất lượng ảnh và độ tin cậy', () => {
    it('CHẶN ngay khi ảnh không đủ để đọc, không xét tới nội dung', () => {
        // Ảnh không đọc nổi thì mọi kết luận rút ra từ nó đều vô nghĩa, và lý do trả
        // cho tài xế phải là "chụp lại đi" chứ không phải một lỗi nội dung khó hiểu do
        // đọc nhầm trên ảnh mờ.
        const result = checks.evaluateReceipt(cleanInvoice(), {
            keywordIndex,
            imageQuality: {
                width: 300,
                height: 400,
                reasons: [{ code: 'IMAGE_TOO_SMALL', severity: 'error', message: 'Ảnh quá nhỏ' }],
            },
        });

        assert.strictEqual(result.verdict, 'rejected');
        assert.strictEqual(result.reasons[0].code, 'IMAGE_TOO_SMALL');
        assert.strictEqual(result.confidence, 0);
    });

    it('cảnh báo ảnh mờ vẫn cho đi tiếp và vẫn chấm nội dung', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), {
            keywordIndex,
            imageQuality: {
                reasons: [{ code: 'IMAGE_LOW_RESOLUTION', severity: 'warning', message: 'Ảnh phân giải thấp' }],
            },
        });

        assert.strictEqual(result.verdict, 'needs_review');
        assert.strictEqual(result.receipt_total, 847_000, 'vẫn phải đọc ra được tổng tiền');
    });

    it('gộp cảnh báo của lớp đối chiếu chéo vào cùng danh sách lý do', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), {
            keywordIndex,
            corroboration: {
                confidence: 0.7,
                confidence_label: 'trung bình',
                penalties: [{ code: 'TOTAL_NOT_GROUNDED', weight: 0.3 }],
                reasons: [{ code: 'OCR_TOTAL_NOT_GROUNDED', severity: 'warning', message: 'Không tìm thấy tổng tiền' }],
            },
        });

        assert.strictEqual(result.verdict, 'needs_review');
        assert.ok(result.reasons.some((r) => r.code === 'OCR_TOTAL_NOT_GROUNDED'));
        assert.strictEqual(result.confidence, 0.7);
    });

    it('độ tin cậy thấp TỰ NÓ là lý do cần người xem', () => {
        // Lớp chốt: kể cả khi không lý do cụ thể nào bật lên, một hóa đơn mà mọi phép
        // kiểm đều "không đủ dữ liệu để kết luận" không được lặng lẽ `passed` — đó
        // đúng là cái bẫy fail-open mà cả thiết kế này sinh ra để tránh.
        const result = checks.evaluateReceipt(cleanInvoice(), {
            keywordIndex,
            corroboration: { confidence: 0.4, confidence_label: 'thấp', penalties: [], reasons: [] },
        });

        assert.strictEqual(result.verdict, 'needs_review');
        assert.ok(result.reasons.some((r) => r.code === 'LOW_CONFIDENCE'));
    });

    it('độ tin cậy cao thì không thêm lý do nào', () => {
        const result = checks.evaluateReceipt(cleanInvoice(), {
            keywordIndex,
            corroboration: { confidence: 1, confidence_label: 'cao', penalties: [], reasons: [] },
        });

        assert.strictEqual(result.verdict, 'passed');
        assert.strictEqual(result.confidence, 1);
    });

    it('thiếu cả hai lớp mới thì chấm y như trước, không đổi phán quyết', () => {
        // Tương thích ngược: mọi nơi gọi cũ không truyền imageQuality/corroboration.
        const result = checks.evaluateReceipt(cleanInvoice(), { keywordIndex });

        assert.strictEqual(result.verdict, 'passed');
        assert.strictEqual(result.confidence, null);
    });
});
