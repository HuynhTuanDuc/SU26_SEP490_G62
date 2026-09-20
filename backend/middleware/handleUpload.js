/**
 * Bọc middleware tải ảnh (multer + Cloudinary) và DỊCH lỗi của nó ra mã HTTP đúng.
 *
 * Vì sao phải có file này. Bản cũ — chép y hệt ở 8 file route — chỉ có đúng một dòng:
 *
 *     if (err) return res.status(422).json({ error: err.message });
 *
 * tức là MỌI sự cố của tầng tải ảnh đều thành 422 "ảnh không hợp lệ", kèm nguyên văn
 * tiếng Anh của thư viện. Hậu quả đã gặp thật, đúng theo báo cáo "log không có 500 mà
 * app vẫn báo lỗi máy chủ":
 *
 *   • SDK Cloudinary tự cắt kết nối tải ảnh sau 60 giây im lặng (mạng di động yếu làm
 *     luồng gửi đứng lại) và trả về {name:'TimeoutError', http_code:499, message:
 *     'Request Timeout'}. Tài xế thấy "Ảnh hóa đơn không hợp lệ: Request Timeout" rồi
 *     chụp lại — tấm nào cũng hỏng, vì lỗi nằm ở đường truyền chứ không ở tấm ảnh.
 *   • Không có lấy một dòng log. 422 là mã "lỗi người gửi" nên không ai đi tìm, và
 *     trong log máy chủ không có 500, không có stack, không có gì để lần ra.
 *   • Ảnh quá 10MB, sai tên trường, kho ảnh sập — chung một rọ, chung một câu.
 *
 * Nguyên tắc: mã HTTP phải nói đúng AI SỬA ĐƯỢC.
 *   4xx = người gửi sửa được (chụp lại, ảnh nhẹ hơn)
 *   5xx = phía hệ thống hoặc đường truyền, người gửi chỉ cần thử lại
 *
 * App tài xế đã phân nhánh sẵn theo mã này (422 → "chụp ảnh khác"; không mã hoặc ≥500
 * → "chưa nhận được kết quả, tải lại danh sách rồi hãy chụp lại"), nên chỉ cần trả
 * đúng mã là app nói đúng câu, không phải sửa thêm gì bên đó.
 */

const multer = require('multer');
const logger = require('../config/logger');
const { UPLOAD } = require('../constants/uploadConstants');

const MAX_FILE_MB = Math.round(UPLOAD.MAX_FILE_SIZE_BYTES / (1024 * 1024));

// Sự cố ở tầng socket khi máy chủ gọi Cloudinary: request chưa bao giờ tới nơi nên
// không có http_code để đọc, chỉ có mã lỗi hệ thống của Node.
const NETWORK_ERROR_CODES = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
    'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'ERR_STREAM_PREMATURE_CLOSE',
]);

// Câu chốt cho mọi lỗi phía hệ thống. "Ảnh chưa được lưu" là phần quan trọng nhất: nếu
// không nói, tài xế không biết nên chụp lại hay chờ, và thường là ngồi chờ.
const RETRY_LATER = 'Vui lòng thử lại — ảnh chưa được lưu.';

/**
 * @returns {{status: number, message: string, code: string}}
 */
const classifyUploadError = (err) => {
    // Lỗi do chính multer sinh ra: kích thước, số lượng, tên trường.
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return {
                status: 413,
                code: 'FILE_TOO_LARGE',
                message: `Ảnh vượt quá ${MAX_FILE_MB}MB. Vui lòng chụp lại ở độ phân giải nhỏ hơn.`,
            };
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_PART_COUNT') {
            return { status: 400, code: err.code, message: 'Gửi quá nhiều ảnh trong một lần.' };
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return {
                status: 400,
                code: err.code,
                message: `Ứng dụng gửi sai tên trường ảnh (${err.field}). Vui lòng cập nhật ứng dụng lên bản mới nhất.`,
            };
        }
        return { status: 400, code: err.code, message: 'Không đọc được ảnh gửi lên. Vui lòng thử lại.' };
    }

    // Ảnh bị fileFilter chặn (không phải tệp ảnh). Đây là lỗi của người gửi thật, và
    // câu thông báo đã là tiếng Việt sẵn — chuyển nguyên văn.
    if (err?.uploadRejected) {
        return { status: 422, code: 'NOT_AN_IMAGE', message: err.message };
    }

    const httpCode = Number(err?.http_code) || null;

    // Hết thời gian chờ khi đẩy ảnh sang Cloudinary. ĐÂY là ca hay gặp nhất ngoài thực
    // địa và cũng là ca bị gán nhầm thành "ảnh không hợp lệ" trước đây.
    if (err?.name === 'TimeoutError' || httpCode === 499 || err?.code === 'ETIMEDOUT') {
        return {
            status: 504,
            code: 'UPLOAD_TIMEOUT',
            message: `Tải ảnh lên quá lâu nên đã dừng giữa chừng, thường là do sóng yếu. ${RETRY_LATER}`,
        };
    }

    if (httpCode === 401 || httpCode === 403) {
        return {
            status: 500,
            code: 'STORAGE_AUTH',
            message: 'Máy chủ chưa cấu hình đúng kho ảnh. Vui lòng báo quản trị viên.',
        };
    }
    if (httpCode === 420 || httpCode === 429) {
        return {
            status: 503,
            code: 'STORAGE_RATE_LIMIT',
            message: `Kho ảnh đang quá tải. ${RETRY_LATER}`,
        };
    }
    if (httpCode && httpCode >= 500) {
        return { status: 502, code: 'STORAGE_ERROR', message: `Kho ảnh đang gặp sự cố. ${RETRY_LATER}` };
    }
    // Cloudinary từ chối chính tấm ảnh (tệp hỏng, định dạng không nhận). Lỗi của tấm
    // ảnh → tài xế chụp lại được, nhưng câu gốc là tiếng Anh nên không đưa thẳng ra.
    if (httpCode && httpCode >= 400) {
        return { status: 422, code: 'STORAGE_REJECTED', message: 'Kho ảnh không nhận tấm ảnh này. Vui lòng chụp lại.' };
    }

    if (NETWORK_ERROR_CODES.has(err?.code)) {
        return {
            status: 502,
            code: 'STORAGE_UNREACHABLE',
            message: `Không gửi được ảnh lên kho ảnh (mất kết nối giữa chừng). ${RETRY_LATER}`,
        };
    }

    // Không nhận ra: mặc định là lỗi PHÍA HỆ THỐNG, không phải lỗi tấm ảnh. Đoán sai
    // theo hướng này thì tài xế thử lại; đoán sai theo hướng cũ (422) thì tài xế chụp
    // lại mười tấm ảnh đều hỏng mà không ai biết vì sao.
    return { status: 502, code: 'UPLOAD_FAILED', message: `Không tải được ảnh lên. ${RETRY_LATER}` };
};

/** Gom mọi thứ nhận dạng được về lỗi gốc vào một dòng log duy nhất. */
const describeError = (err) => [
    err?.name && err.name !== 'Error' ? err.name : null,
    err?.code ? `code=${err.code}` : null,
    err?.http_code ? `http_code=${err.http_code}` : null,
    err?.message || null,
].filter(Boolean).join(' | ') || 'không rõ nguyên nhân';

const handleUpload = (middleware) => (req, res, next) => {
    middleware(req, res, (err) => {
        if (!err) return next();

        const { status, code, message } = classifyUploadError(err);
        // LUÔN ghi log, kể cả khi trả 4xx. Sự cố tải ảnh trước đây biến mất hoàn toàn
        // khỏi log vì nó được trả về dưới dạng 422; người trực không có cách nào biết
        // kho ảnh đang chậm cho tới khi tài xế gọi điện.
        const line = `[upload] ${req.method} ${req.originalUrl} → ${status} (${code}): ${describeError(err)}`;
        if (status >= 500) logger.error(line); else logger.warn(line);

        return res.status(status).json({ error: message, code });
    });
};

module.exports = { handleUpload, classifyUploadError };
