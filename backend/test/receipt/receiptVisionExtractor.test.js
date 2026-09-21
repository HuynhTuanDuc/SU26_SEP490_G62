const assert = require('node:assert');

const extractor = require('../../services/receiptVisionExtractor');

describe('receiptVisionExtractor — quyết định thử lại', () => {
    // Đo thực tế trên máy chủ Google: 503 "high demand" xảy ra thường xuyên và hỏng
    // ngay dưới 1 giây. Không thử lại thì mỗi đợt quá tải là một loạt hóa đơn rơi vào
    // "cần người xem" và người duyệt thấy tính năng như đang hỏng.
    it('thử lại khi dịch vụ quá tải', () => {
        const r = extractor.classifyError({ message: '[503 Service Unavailable] This model is currently experiencing high demand.' });

        assert.strictEqual(r.code, 'SERVICE_UNAVAILABLE');
        assert.strictEqual(r.retryable, true);
    });

    // ĐỔI Ý so với bản đầu: 429 KHÔNG đáng thử lại.
    //
    // Lùi của ta là 0,7-2,8 giây, còn cửa sổ hạn mức của Google tính theo PHÚT và theo NGÀY.
    // Thử lại trong vài giây không bao giờ kịp hồi — nó chỉ bắn thêm hai lời gọi nữa vào
    // đúng cái hạn mức đang cạn, rồi bắt tài xế chờ thêm chừng ấy giây để nhận cùng một câu
    // trả lời. Nâng cấu hình máy chủ còn làm chuyện này tệ hơn: hóa đơn tới Gemini dày hơn,
    // chạm trần sớm hơn, và mỗi lần chạm lại đẻ thêm lời gọi.
    it('KHÔNG thử lại khi hết hạn mức', () => {
        assert.deepStrictEqual(extractor.classifyError({ status: 429, message: 'Too Many Requests' }),
            { code: 'RATE_LIMIT', retryable: false });
        assert.deepStrictEqual(extractor.classifyError({ message: '[429] Resource has been exhausted (quota)' }),
            { code: 'RATE_LIMIT', retryable: false });
    });

    it('thử lại khi mạng chập chờn', () => {
        assert.strictEqual(extractor.classifyError({ message: 'fetch failed' }).retryable, true);
        assert.strictEqual(extractor.classifyError({ message: 'socket hang up' }).retryable, true);
    });

    it('KHÔNG thử lại khi quá thời gian', () => {
        // Đã chờ hết 30 giây một lần thì lần hai cũng vậy — chỉ tổ bắt tài xế đứng chờ
        // thêm mà cơ hội thành công không tăng.
        assert.deepStrictEqual(extractor.classifyError({ code: 'TIMEOUT', message: 'Quá thời gian đọc hóa đơn' }),
            { code: 'TIMEOUT', retryable: false });
    });

    it('KHÔNG thử lại với lỗi cấu hình', () => {
        // Model không còn tồn tại hoặc khoá sai thì thử lại bao nhiêu lần cũng vậy.
        assert.strictEqual(extractor.classifyError({ message: '[404 Not Found] This model is no longer available to new users.' }).retryable, false);
        assert.strictEqual(extractor.classifyError({ status: 400, message: 'API key not valid' }).retryable, false);
    });
});

describe('receiptVisionExtractor — cấu hình model', () => {
    it('ghim phiên bản model thay vì dùng alias tự đổi', () => {
        // Alias kiểu `-latest` tự trỏ sang model mới khi Google chuyển hướng: hành vi
        // đọc hóa đơn đổi mà không ai deploy gì, và cột prompt_version dùng để so độ
        // chính xác giữa các phiên bản mất ý nghĩa.
        const model = process.env.RECEIPT_VISION_MODEL || 'gemini-3.6-flash';

        assert.ok(!model.includes('-latest'), `Model phải được ghim phiên bản, đang là: ${model}`);
    });
});

describe('receiptVisionExtractor — chuẩn hoá kết quả model', () => {
    it('ép kiểu số và loại bỏ mã hạng mục model bịa ra', () => {
        const n = extractor.normalizeExtraction({
            is_document: true, doc_type: 'invoice',
            line_items: [{ raw_name: 'Nhớt', quantity: '2', unit_price: '85000', line_total: '170000', category: 'khong_ton_tai' }],
            total: '170000',
        });

        assert.strictEqual(n.line_items[0].quantity, 2);
        assert.strictEqual(n.line_items[0].unit_price, 85_000);
        assert.strictEqual(n.line_items[0].category, null);
        assert.strictEqual(n.total, 170_000);
    });

    it('ghi nhận ngày sai định dạng là không đọc được thay vì đoán', () => {
        const n = extractor.normalizeExtraction({
            is_document: true, doc_type: 'invoice', issued_date: '20/08/2026', line_items: [],
        });

        assert.strictEqual(n.issued_date, null);
        assert.ok(n.unreadable_fields.includes('issued_date'));
    });

    it('bỏ dòng hàng không có tên', () => {
        const n = extractor.normalizeExtraction({
            is_document: true, doc_type: 'invoice',
            line_items: [{ raw_name: 'Nhớt', line_total: 1 }, { line_total: 2 }, { raw_name: '   ' }],
        });

        assert.strictEqual(n.line_items.length, 1);
    });

    it('thu nhỏ ảnh Cloudinary để cắt băng thông và token đầu vào', () => {
        const url = extractor.optimizeCloudinaryUrl('https://res.cloudinary.com/x/image/upload/v1/bills/a.jpg');

        assert.match(url, /w_1600,c_limit/);
        // URL không phải Cloudinary thì giữ nguyên, không đoán mò.
        assert.strictEqual(extractor.optimizeCloudinaryUrl('https://x/y.png'), 'https://x/y.png');
    });
});
