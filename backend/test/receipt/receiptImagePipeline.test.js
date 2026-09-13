const assert = require('node:assert');

const pipeline = require('../../services/receiptImagePipeline');

const CLOUDINARY = 'https://res.cloudinary.com/demo/image/upload/v1/bills/a.jpg';

describe('receiptImagePipeline — hai biến thể ảnh', () => {
    it('GIỮ NGUYÊN chuỗi biến đổi của biến thể cho model', () => {
        // Đây không phải test hình thức. `image_sha256` — khoá chặn nộp lại đúng một
        // tấm ảnh — được băm trên bytes của chính biến thể này. Đổi chuỗi biến đổi là
        // đổi bytes, là đổi băm: mọi bản ghi đã có sẽ không bao giờ khớp với ảnh đọc
        // sau này nữa, và lớp chống dùng lại hóa đơn hỏng âm thầm, không lỗi nào bật lên.
        assert.strictEqual(pipeline.VISION_TRANSFORM, 'w_1600,c_limit,q_auto:good');
        assert.strictEqual(
            pipeline.visionUrl(CLOUDINARY),
            'https://res.cloudinary.com/demo/image/upload/w_1600,c_limit,q_auto:good/v1/bills/a.jpg',
        );
    });

    it('biến thể cho OCR được xám hoá, tăng tương phản và làm nét', () => {
        // Tesseract chỉ nhìn hình dạng ký tự: màu mực, giấy ngả vàng, bóng đèn đều là
        // nhiễu. Gemini thì ngược lại, cần màu và đường kẻ bảng để biết đâu là cột nào
        // — nên hai bên không thể dùng chung một biến thể.
        const url = pipeline.ocrUrl(CLOUDINARY);

        assert.match(url, /e_grayscale/);
        assert.match(url, /e_contrast:\d+/);
        assert.match(url, /e_sharpen:\d+/);
        // Phải rộng hơn biến thể cho model: chữ hóa đơn nhiệt quá nhỏ ở 1600px.
        assert.match(url, /w_2000,c_limit/);
    });

    it('URL không phải Cloudinary thì giữ nguyên, không đoán mò', () => {
        assert.strictEqual(pipeline.visionUrl('https://x/y.png'), 'https://x/y.png');
        assert.strictEqual(pipeline.ocrUrl('https://x/y.png'), 'https://x/y.png');
        assert.strictEqual(pipeline.hasOcrVariant('https://x/y.png'), false);
        assert.strictEqual(pipeline.hasOcrVariant(CLOUDINARY), true);
    });
});

describe('receiptImagePipeline — đo ảnh từ header', () => {
    const png = (width, height) => {
        const buffer = Buffer.alloc(24);
        buffer.writeUInt32BE(0x89504e47, 0);
        buffer.write('IHDR', 12, 'latin1');
        buffer.writeUInt32BE(width, 16);
        buffer.writeUInt32BE(height, 20);
        return buffer;
    };

    /** JPEG tối thiểu: SOI, một khối APP0 phải đi qua, rồi mới tới SOF0. */
    const jpeg = (width, height) => {
        const app0 = Buffer.alloc(6);
        app0.writeUInt16BE(0xffe0, 0);
        app0.writeUInt16BE(4, 2);       // độ dài khối APP0 (2 byte độ dài + 2 byte rác)

        const sof = Buffer.alloc(11);
        sof.writeUInt16BE(0xffc0, 0);
        sof.writeUInt16BE(9, 2);
        sof.writeUInt8(8, 4);           // độ sâu màu
        sof.writeUInt16BE(height, 5);
        sof.writeUInt16BE(width, 7);

        return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(8)]);
    };

    it('đọc được kích thước PNG', () => {
        assert.deepStrictEqual(pipeline.probeImage(png(1600, 2400)),
            { format: 'png', width: 1600, height: 2400 });
    });

    it('đi qua các khối trung gian của JPEG để tới khối chứa kích thước', () => {
        // JPEG không ghi kích thước ở vị trí cố định. Cộng nhầm độ dài một khối là con
        // trỏ nhảy vào giữa dữ liệu và mọi thứ đọc được sau đó là rác.
        assert.deepStrictEqual(pipeline.probeImage(jpeg(1200, 1800)),
            { format: 'jpeg', width: 1200, height: 1800 });
    });

    it('định dạng lạ hoặc tệp hỏng thì không có ý kiến, KHÔNG chặn', () => {
        // Không đo được không có nghĩa là ảnh xấu. Trả null để lớp chấm chất lượng bỏ
        // qua, thay vì từ chối oan một tấm ảnh chỉ vì định dạng chưa nhận ra.
        assert.strictEqual(pipeline.probeImage(Buffer.from('khong phai anh gi ca')), null);
        assert.strictEqual(pipeline.probeImage(Buffer.alloc(4)), null);
        assert.strictEqual(pipeline.probeImage(null), null);
    });
});

describe('receiptImagePipeline — chấm chất lượng ảnh', () => {
    it('ảnh đủ lớn thì không có ý kiến gì', () => {
        assert.deepStrictEqual(pipeline.assessImage({ bytes: 800_000, width: 1600, height: 2400 }), []);
    });

    it('CHẶN ảnh quá nhỏ vì đó là lỗi người gửi sửa được ngay', () => {
        const reasons = pipeline.assessImage({ bytes: 40_000, width: 300, height: 400 });
        const blocking = reasons.find((r) => r.code === 'IMAGE_TOO_SMALL');

        assert.ok(blocking, 'phải có lý do chặn');
        assert.strictEqual(blocking.severity, 'error');
        // Câu trả cho tài xế phải nói được việc cần làm, không phải một mã lỗi.
        assert.match(blocking.message, /chụp lại/i);
    });

    it('CẢNH BÁO chứ không chặn ảnh độ phân giải thấp', () => {
        // Vẫn đọc được, chỉ là dễ sai số. Chặn ở đây là chặn oan những người có điện
        // thoại kém nhất.
        const reasons = pipeline.assessImage({ bytes: 200_000, width: 700, height: 800 });

        assert.strictEqual(reasons.length, 1);
        assert.strictEqual(reasons[0].code, 'IMAGE_LOW_RESOLUTION');
        assert.strictEqual(reasons[0].severity, 'warning');
    });

    it('cảnh báo tệp quá nhẹ — dấu hiệu ảnh trắng hoặc ảnh lỗi', () => {
        const reasons = pipeline.assessImage({ bytes: 900, width: 1600, height: 2400 });

        assert.strictEqual(reasons[0].code, 'IMAGE_SUSPICIOUSLY_SMALL_FILE');
        assert.strictEqual(reasons[0].severity, 'warning');
    });

    it('không đo được kích thước thì chỉ chấm phần đo được', () => {
        assert.deepStrictEqual(pipeline.assessImage({ bytes: 500_000, width: null, height: null }), []);
    });
});
