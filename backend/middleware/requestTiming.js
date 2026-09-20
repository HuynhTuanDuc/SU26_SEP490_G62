/**
 * Đánh dấu mốc request tới, và GỌI TÊN trường hợp client bỏ cuộc giữa chừng.
 *
 * Vì sao cần: khi app bỏ cuộc trước lúc máy chủ trả lời, dòng log duy nhất còn lại là
 * dòng của morgan, và nó trông như thế này:
 *
 *   "POST /api/drivers/maintenance/100000/complete HTTP/1.1" - -
 *
 * Hai dấu gạch ngang đó là :status và :res[content-length] — morgan để trống vì máy chủ
 * chưa gửi đi byte nào. Người đọc log thấy một dòng không có mã lỗi, không có 500, và kết
 * luận "máy chủ không có lỗi gì" — trong khi thực tế tài xế đang nhìn thấy một câu báo lỗi
 * trên điện thoại. Đó đúng là khoảng mù đã làm lỗi này khó lần ra.
 *
 * Dòng log ở đây nói thẳng: client đã đóng kết nối, sau bao nhiêu giây, ở đường nào. Từ
 * con số giây đó suy ra ngay thủ phạm là hạn chờ nào (30 giây = hạn mặc định của app đời
 * cũ, 60 giây = hạn của iOS, 120 giây = hạn của app hiện tại).
 */

const logger = require('../config/logger');

const trackRequestTiming = (req, res, next) => {
    // Mốc để mọi hạn chót bên trong đếm từ đây — xem RESPONSE_BUDGET_MS. Phải là lúc
    // request TỚI, vì đoạn đẩy ảnh lên Cloudinary nằm trước controller và chính nó là
    // đoạn co giãn nhất khi tài xế đứng chỗ sóng yếu.
    req.receivedAt = Date.now();

    // 'close' bắn cho MỌI response (cả khi trả lời xong bình thường), nên phải hỏi thêm
    // hai điều: đã gửi header chưa, và đã ghi xong chưa. Cả hai đều 'chưa' nghĩa là kết
    // nối đứt trong lúc handler còn đang chạy.
    res.on('close', () => {
        if (res.headersSent || res.writableEnded) return;
        const giay = ((Date.now() - req.receivedAt) / 1000).toFixed(1);
        logger.warn(
            `[bỏ dở] ${req.method} ${req.originalUrl} — client đóng kết nối sau ${giay}s, `
            + 'máy chủ chưa kịp trả lời (việc đang làm vẫn chạy tiếp tới khi xong)',
        );
    });

    next();
};

module.exports = { trackRequestTiming };
