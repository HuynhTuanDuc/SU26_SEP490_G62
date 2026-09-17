const assert = require('node:assert');

const scanner = require('../../services/receiptOcrScanner');
const taxonomy = require('../../services/receiptTaxonomy');

describe('receiptOcrScanner — đọc số tiền từ text thô', () => {
    it('nhận mọi cách viết số tiền hay gặp trên hóa đơn Việt Nam', () => {
        const { strict } = scanner.parseMoneyTokens(
            'Cong tien hang 1.320.000 | VAT 132,000 | Tong cong 1 452 000 | Tam ung 500000',
        );

        assert.ok(strict.has(1_320_000), 'dấu chấm ngăn nghìn');
        assert.ok(strict.has(132_000), 'dấu phẩy ngăn nghìn');
        assert.ok(strict.has(1_452_000), 'khoảng trắng ngăn nghìn');
        assert.ok(strict.has(500_000), 'viết liền');
    });

    it('KHÔNG để hai cột tiền cạnh nhau dính thành một số', () => {
        // Lỗi thật, phát hiện khi chạy Tesseract trên ảnh hóa đơn: coi khoảng trắng là
        // dấu ngăn nghìn thì dòng bảng dưới đây bị nuốt thành MỘT số 1450000450000, và
        // hai con số 450.000 in rành rành trên giấy biến mất khỏi tập đối chiếu — sinh
        // ra cảnh báo "không tìm thấy thành tiền" trên một hóa đơn hoàn toàn đúng.
        const { strict } = scanner.parseMoneyTokens('Nhot Castrol GTX  1  450.000  450.000');

        assert.ok(strict.has(450_000), 'con số in trên giấy phải nằm trong tập đối chiếu');
    });

    it('vẫn đọc được số ngăn bằng khoảng trắng khi OCR làm mất dấu chấm', () => {
        const { strict } = scanner.parseMoneyTokens('TONG CONG 1 320 000');

        assert.ok(strict.has(1_320_000));
    });

    it('BỎ QUA số dưới 1.000 viết liền', () => {
        // "2" ở cột số lượng, "10" ở cột thuế suất không phải số tiền. Nạp chúng vào
        // tập đối chiếu chỉ tạo ra trùng khớp giả — mà trùng khớp giả nguy hiểm hơn
        // không khớp: nó xác nhận nhầm một con số model bịa ra là "có thật trên giấy".
        const { strict } = scanner.parseMoneyTokens('So luong 2 Thue suat 10 Thanh tien 450000');

        assert.ok(!strict.has(2));
        assert.ok(!strict.has(10));
        assert.ok(strict.has(450_000));
    });

    it('tách bạch số đọc y nguyên với số đọc được sau khi sửa ký tự nhầm', () => {
        // Tesseract nhầm O/0, S/5, B/8 rất thường xuyên. Sửa thì cứu được nhiều lần đọc
        // đúng, nhưng phải để RIÊNG: khớp sau khi sửa chỉ là "nhiều khả năng", không
        // được coi ngang bằng chứng cứ đọc y nguyên.
        const { strict, repaired } = scanner.parseMoneyTokens('Tong cong 1.32O.OOO');

        assert.ok(!strict.has(1_320_000), 'chưa sửa thì không được coi là đọc thấy');
        assert.ok(repaired.has(1_320_000), 'sửa xong thì nhận ra');
    });

    it('trả về ba mức kết luận khác nhau cho một con số', () => {
        const tokens = scanner.parseMoneyTokens('Tong cong 1.320.000 - Da tra 5OO.OOO');

        assert.strictEqual(scanner.amountAppearsIn(tokens, 1_320_000), 'yes');
        assert.strictEqual(scanner.amountAppearsIn(tokens, 500_000), 'likely');
        assert.strictEqual(scanner.amountAppearsIn(tokens, 9_999_000), 'no');
        assert.strictEqual(scanner.amountAppearsIn(tokens, null), 'unknown');
    });

    it('chỉ sửa ký tự trong cụm gần như toàn số, không đụng vào chữ', () => {
        // Đổi bừa mọi chữ O thành 0 trong cả trang thì "Lọc gió" thành "L0c gi0" và từ
        // điển hết khớp — mất luôn đường phân loại chạy trên text thô.
        const { strict, repaired } = scanner.parseMoneyTokens('Loc gio dong co 85.000');

        assert.ok(strict.has(85_000));
        assert.strictEqual(repaired.size, 0);
    });
});

describe('receiptOcrScanner — dấu hiệu loại chứng từ', () => {
    it('bắt được cụm BÁO GIÁ kể cả khi OCR làm rơi dấu', () => {
        // Tesseract đọc tiếng Việt có dấu sai liên tục ("BÁO GIÁ" ra "BAO GlA"), nhưng
        // phần chữ cái không dấu thì gần như luôn đúng — nên dò trên text đã bỏ dấu.
        assert.strictEqual(scanner.detectDocSignals('PHIEU BAO GIA SUA CHUA').quote, 'bao gia');
        assert.strictEqual(scanner.detectDocSignals('BÁO GIÁ dịch vụ').quote, 'bao gia');
        assert.strictEqual(scanner.detectDocSignals('DỰ TOÁN sửa chữa').quote, 'du toan');
    });

    it('không nhận nhầm hóa đơn thường là báo giá', () => {
        const signals = scanner.detectDocSignals('HOA DON GIA TRI GIA TANG - Thue suat 10%');

        assert.strictEqual(signals.quote, null);
        assert.strictEqual(signals.invoice, 'hoa don');
        assert.ok(signals.vat);
    });
});

describe('receiptOcrScanner — biển số đọc từ text', () => {
    it('nhận biển số ở các cách viết khác nhau, chuẩn hoá về một dạng', () => {
        assert.deepStrictEqual(scanner.findPlates('Xe 29C-12345 vao xuong'), ['29C12345']);
        assert.deepStrictEqual(scanner.findPlates('BKS: 51D 123.45'), ['51D12345']);
    });

    it('không bịa ra biển số từ dãy số thường', () => {
        assert.deepStrictEqual(scanner.findPlates('Ma so thue 0101234567'), []);
    });
});

describe('receiptOcrScanner — từ điển chạy trên text thô', () => {
    const index = taxonomy.buildKeywordIndex();

    it('nhận ra hạng mục từ chính dòng OCR, không cần model đọc ra tên hàng', () => {
        // Đây là đường phân loại thứ ba, và là đường DUY NHẤT thấy được một dòng hàng
        // mà model bỏ sót hoàn toàn: hai đường kia chỉ soi được những dòng model đã
        // liệt kê, còn chữ thì vẫn nằm trong text thô.
        const hits = scanner.dictionaryHits([
            { text: 'Thay nhot dong co Castrol', confidence: 88 },
            { text: 'Xang A95 500.000', confidence: 85 },
        ], index);

        assert.strictEqual(hits.length, 2);
        assert.strictEqual(hits[0].group, 'maintenance');
        assert.strictEqual(hits[1].category, 'fuel');
        assert.strictEqual(hits[1].group, 'excluded');
    });

    it('bỏ qua dòng không khớp từ khoá nào', () => {
        assert.deepStrictEqual(scanner.dictionaryHits([{ text: 'Dia chi: 12 Tran Phu', confidence: 90 }], index), []);
    });
});

describe('receiptOcrScanner — tắt được và hỏng an toàn', () => {
    const original = process.env.RECEIPT_OCR_ENABLED;
    afterEach(() => { process.env.RECEIPT_OCR_ENABLED = original ?? ''; });

    it('tắt bằng env thì trả về không có ý kiến, KHÔNG ném lỗi', () => {
        // OCR là lớp tốn CPU nhất của cả dây chuyền. Phải tắt được ở môi trường chạy
        // sát hạn mức mà không mất tính năng — hệ thống chỉ lùi về một kênh đọc.
        process.env.RECEIPT_OCR_ENABLED = 'false';

        assert.strictEqual(scanner.isOcrEnabled(), false);
    });

    it('không có ảnh thì báo lại chứ không cố quét', async () => {
        const result = await scanner.scanImage(null);

        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.code, 'OCR_NO_IMAGE');
    });
});

describe('receiptOcrScanner — dựng lại dòng từ kết quả Tesseract', () => {
    it('ưu tiên dòng có sẵn kèm độ tin cậy riêng', () => {
        // Độ tin cậy THEO DÒNG quan trọng hơn trung bình cả trang: tờ hóa đơn có tiêu
        // đề nét và bảng bị loá sáng vẫn cho trung bình "khá ổn" trong khi đúng phần
        // con số cần đọc lại là phần không đọc nổi.
        const lines = scanner.extractLines({
            lines: [{ text: 'Tong cong 1.320.000', confidence: 91 }, { text: '  ', confidence: 10 }],
        });

        assert.deepStrictEqual(lines, [{ text: 'Tong cong 1.320.000', confidence: 91 }]);
    });

    it('lần theo cấu trúc lồng của phiên bản mới khi không có mảng dòng phẳng', () => {
        const lines = scanner.extractLines({
            blocks: [{ paragraphs: [{ lines: [{ text: 'Loc dau 85.000', confidence: 80 }] }] }],
        });

        assert.deepStrictEqual(lines, [{ text: 'Loc dau 85.000', confidence: 80 }]);
    });

    it('rơi về cắt chuỗi thô khi không có cấu trúc nào', () => {
        // Nhánh này cũng chính là nhánh dùng khi dựng lại kênh OCR từ text đã lưu trong
        // DB: bản ghi chỉ giữ text và độ tin cậy cả trang, không giữ từng dòng.
        const lines = scanner.extractLines({ text: 'Dong 1\nDong 2\n\n', confidence: 75 });

        assert.deepStrictEqual(lines, [
            { text: 'Dong 1', confidence: 75 },
            { text: 'Dong 2', confidence: 75 },
        ]);
    });
});

describe('receiptOcrScanner — không nhận nhầm do bỏ dấu và dính giữa từ', () => {
    it('"đủ toàn bộ" KHÔNG phải "dự toán"', () => {
        // Lỗi thật, đã tái hiện: bỏ dấu biến "đủ toàn bộ" thành "du toan bo", chứa "du
        // toan". Hóa đơn thật ghi "khách đã thanh toán đủ toàn bộ" bị gắn OCR_QUOTE_SIGNAL,
        // trừ 0,25 điểm, đẩy sang cần người xem và tốn thêm một lượt gọi model.
        assert.strictEqual(scanner.detectDocSignals('HÓA ĐƠN BÁN HÀNG. Khách đã thanh toán đủ toàn bộ').quote, null);
        // Cùng câu đó khi OCR làm rơi hết dấu.
        assert.strictEqual(scanner.detectDocSignals('HOA DON BAN HANG. Khach da thanh toan du toan bo').quote, null);
        assert.strictEqual(scanner.detectDocSignals('Đã nhận dù toàn phần hàng').quote, null);
    });

    it('vẫn nhận ra dự toán thật', () => {
        assert.strictEqual(scanner.detectDocSignals('BẢNG DỰ TOÁN CHI PHÍ SỬA CHỮA').quote, 'du toan');
        assert.strictEqual(scanner.detectDocSignals('BANG DU TOAN SUA CHUA').quote, 'du toan');
    });

    it('dò theo biên từ: "vật tư" không phải VAT', () => {
        assert.strictEqual(scanner.detectDocSignals('Vật tư phụ tùng thay thế').vat, null);
        assert.strictEqual(scanner.detectDocSignals('Thuế GTGT 10%').vat, 'thue gtgt');
        assert.strictEqual(scanner.detectDocSignals('Cong: 450.000 VAT 10%').vat, 'vat');
    });
});

describe('receiptOcrScanner — đối chiếu số tiền có phần lẻ', () => {
    it('làm tròn trước khi so, vì VNĐ không có phần lẻ', () => {
        // Model có thể trả 1826000.4 sau khi tự ép kiểu. So thẳng với tập số nguyên thì
        // không bao giờ khớp và sinh cảnh báo "không tìm thấy tổng tiền" oan.
        const tokens = scanner.parseMoneyTokens('TONG CONG 1.826.000');

        assert.strictEqual(scanner.amountAppearsIn(tokens, 1826000.4), 'yes');
        assert.strictEqual(scanner.amountAppearsIn(tokens, 1825999.6), 'yes');
    });
});
