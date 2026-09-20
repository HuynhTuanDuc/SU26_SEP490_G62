/**
 * Sự cố của TẦNG TẢI ẢNH phải nói đúng ai sửa được.
 *
 * Bản cũ — chép y hệt ở 8 file route — trả mọi lỗi của multer/Cloudinary thành
 * `422 { error: err.message }`. Hai hậu quả đã gặp ngoài thực địa:
 *
 *   • SDK Cloudinary tự cắt kết nối sau 60 giây im lặng và trả về
 *     {name:'TimeoutError', http_code:499, message:'Request Timeout'}. Tài xế thấy
 *     "Ảnh hóa đơn không hợp lệ: Request Timeout" nên chụp lại — tấm nào cũng hỏng,
 *     vì lỗi ở đường truyền chứ không ở tấm ảnh.
 *   • 422 là mã lỗi của NGƯỜI GỬI nên không ai đi tìm trong log máy chủ, và cũng
 *     không có dòng log nào được ghi. Đúng cảnh "app báo lỗi mà log sạch bóng 500".
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';

const assert = require('node:assert');
const express = require('express');
const multer = require('multer');
const request = require('supertest');

jest.mock('../../config/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const logger = require('../../config/logger');
const { handleUpload, classifyUploadError } = require('../../middleware/handleUpload');

/** App tối giản: một middleware giả đẩy đúng lỗi cần thử vào handleUpload. */
const appThatFailsWith = (err) => {
    const app = express();
    app.post('/upload', handleUpload((_req, _res, next) => next(err)), (_req, res) => res.json({ ok: true }));
    return app;
};

const cloudinaryTimeout = () => ({ message: 'Request Timeout', http_code: 499, name: 'TimeoutError' });

beforeEach(() => {
    logger.warn.mockClear();
    logger.error.mockClear();
});

describe('handleUpload — dịch lỗi tải ảnh ra mã HTTP đúng', () => {
    it('Cloudinary hết thời gian chờ là sự cố ĐƯỜNG TRUYỀN (504), không phải ảnh sai (422)', async () => {
        const res = await request(appThatFailsWith(cloudinaryTimeout())).post('/upload');

        assert.strictEqual(res.status, 504);
        // Câu cho tài xế: nói rõ nguyên nhân và nói rõ ảnh CHƯA được lưu.
        assert.match(res.body.error, /sóng yếu/);
        assert.match(res.body.error, /ảnh chưa được lưu/i);
        // Không bao giờ để nguyên văn tiếng Anh của thư viện lọt ra màn hình tài xế.
        assert.ok(!res.body.error.includes('Request Timeout'), res.body.error);
    });

    it('ghi log mọi sự cố tải ảnh — trước đây 422 làm cả sự cố hạ tầng biến mất khỏi log', async () => {
        await request(appThatFailsWith(cloudinaryTimeout())).post('/upload');

        assert.strictEqual(logger.error.mock.calls.length, 1);
        const line = logger.error.mock.calls[0][0];
        // Dòng log giữ nguyên văn lỗi gốc: đó là thứ người sửa cần, còn tài xế thì không.
        assert.match(line, /Request Timeout/);
        assert.match(line, /UPLOAD_TIMEOUT/);
        assert.match(line, /POST \/upload/);
    });

    it('ảnh quá nặng là 413 kèm đúng mức trần, không lẫn với ảnh sai định dạng', async () => {
        const res = await request(appThatFailsWith(new multer.MulterError('LIMIT_FILE_SIZE', 'bill'))).post('/upload');

        assert.strictEqual(res.status, 413);
        assert.match(res.body.error, /10MB/);
        assert.strictEqual(logger.warn.mock.calls.length, 1);
    });

    it('kho ảnh lỗi 5xx và mất kết nối giữa chừng đều là 502 — tài xế chỉ cần thử lại', async () => {
        const server = await request(appThatFailsWith({ message: 'Server Error', http_code: 500 })).post('/upload');
        const reset = await request(appThatFailsWith(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))).post('/upload');

        assert.strictEqual(server.status, 502);
        assert.strictEqual(reset.status, 502);
        assert.match(reset.body.error, /ảnh chưa được lưu/i);
    });

    it('lỗi KHÔNG nhận ra được đoán về phía hệ thống (502), không đổ cho tấm ảnh', async () => {
        // Đoán sai hướng này: tài xế thử lại. Đoán sai hướng cũ (422): tài xế chụp lại
        // mười tấm đều hỏng mà không ai biết vì sao.
        const res = await request(appThatFailsWith(new Error('chuyện lạ chưa từng gặp'))).post('/upload');

        assert.strictEqual(res.status, 502);
        assert.ok(!res.body.error.includes('chuyện lạ'), res.body.error);
        assert.strictEqual(logger.error.mock.calls.length, 1);
    });

    it('không có lỗi thì đi tiếp bình thường và không ghi log', async () => {
        const app = express();
        app.post('/upload', handleUpload((_req, _res, next) => next()), (_req, res) => res.json({ ok: true }));

        const res = await request(app).post('/upload');

        assert.strictEqual(res.status, 200);
        assert.strictEqual(logger.warn.mock.calls.length + logger.error.mock.calls.length, 0);
    });
});

describe('handleUpload — tệp không phải ảnh vẫn là lỗi của người gửi', () => {
    it('đi hết chuỗi thật (route → multer → fileFilter) và ra 422 kèm câu tiếng Việt', async () => {
        // Không đụng tới Cloudinary: fileFilter chặn TRƯỚC khi có lời gọi nào đi ra ngoài.
        const { uploadMaintenanceBill } = require('../../middleware/uploadMiddleware');
        const app = express();
        app.post('/upload', handleUpload(uploadMaintenanceBill.single('bill')), (_req, res) => res.json({ ok: true }));

        const res = await request(app)
            .post('/upload')
            .attach('bill', Buffer.from('day khong phai anh'), { filename: 'a.txt', contentType: 'text/plain' });

        assert.strictEqual(res.status, 422);
        assert.strictEqual(res.body.error, 'Chỉ chấp nhận file ảnh');
    });

    it('cùng câu đó nhưng KHÔNG có dấu uploadRejected thì không được coi là lỗi ảnh', () => {
        // Cờ uploadRejected là thứ phân biệt "ảnh sai" với "sự cố lạ". Mất cờ mà vẫn ra
        // 422 nghĩa là bất kỳ lỗi lạ nào cũng lại bị đổ cho tấm ảnh như bản cũ.
        assert.strictEqual(classifyUploadError(new Error('Chỉ chấp nhận file ảnh')).status, 502);
        assert.strictEqual(
            classifyUploadError(Object.assign(new Error('Chỉ chấp nhận file ảnh'), { uploadRejected: true })).status,
            422,
        );
    });
});
