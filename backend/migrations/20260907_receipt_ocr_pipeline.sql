-- =====================================================================
-- 20260907_receipt_ocr_pipeline
-- Lưu vết của dây chuyền đọc hóa đơn nhiều giai đoạn.
--
-- Trước thay đổi này, mỗi lần đọc hóa đơn chỉ để lại đúng một thứ: JSON model trả về.
-- Khi tài xế khiếu nại "máy đọc sai số tiền" thì không có gì để đối chiếu ngoài chính
-- lời khai của model — hỏi lại nó cũng chỉ nhận được cùng một câu trả lời.
--
-- Dây chuyền mới bổ sung một kênh đọc thứ hai (Tesseract) chạy song song, và bốn cột
-- dưới đây là vết của nó:
--
--   * ocr_text / ocr_confidence / ocr_engine — nguyên văn text quét được. Đây là bằng
--     chứng ĐỘC LẬP với model, đọc được bằng mắt, không cần gọi lại API nào để dựng
--     lại. Nó cũng là thứ cho phép chấm lại luật cũ trên dữ liệu cũ mà không phải quét
--     lại ảnh (quét lại tốn ~10 giây CPU mỗi tấm).
--
--   * confidence — điểm tin cậy 0..1 do lớp đối chiếu chéo chấm. Tách thành cột riêng
--     thay vì chôn trong JSONB vì đây là thứ cần LỌC và cần XẾP HẠNG: "cho tôi xem
--     những hóa đơn máy đọc không chắc" là truy vấn chính của người duyệt, và cũng là
--     con số dùng để đo tính năng có tốt lên qua từng phiên bản prompt hay không.
--
--   * image_width / image_height — kích thước ảnh thật. Đủ để trả lời câu hỏi vận hành
--     "có phải hóa đơn đọc sai đều rơi vào ảnh dưới X pixel không", tức là để chỉnh
--     ngưỡng chặn ảnh mờ bằng số liệu chứ không bằng cảm tính.
--
--   * pipeline — tóm tắt từng giai đoạn đã làm gì và trừ điểm ở đâu. JSONB vì hình
--     dạng của nó còn đổi theo từng lần cải tiến dây chuyền; những gì cần truy vấn ổn
--     định thì đã được kéo ra thành cột riêng ở trên.
--
-- An toàn với dữ liệu cũ: chỉ THÊM cột nullable. Dòng đã có giữ nguyên NULL và mọi
-- truy vấn hiện tại không đụng tới cột mới. Bản ghi cũ không có confidence sẽ hiển thị
-- là "chưa chấm" thay vì bị coi là điểm 0 — code đọc cột này phân biệt hai trạng thái
-- đó, xem receiptValidationService.getReceiptReview.
-- =====================================================================

BEGIN;

ALTER TABLE receipt_extractions
    ADD COLUMN IF NOT EXISTS ocr_text       TEXT,
    ADD COLUMN IF NOT EXISTS ocr_confidence NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS ocr_engine     TEXT,
    ADD COLUMN IF NOT EXISTS confidence     NUMERIC(4,3),
    ADD COLUMN IF NOT EXISTS image_width    INT,
    ADD COLUMN IF NOT EXISTS image_height   INT,
    ADD COLUMN IF NOT EXISTS pipeline       JSONB;

COMMENT ON COLUMN receipt_extractions.ocr_text IS
    'Nguyên văn text Tesseract quét được từ ảnh. Bằng chứng độc lập với model: model có thể bịa ra một con số hợp lý, OCR thì chỉ báo cáo hình dạng ký tự có thật trên ảnh.';
COMMENT ON COLUMN receipt_extractions.ocr_confidence IS
    'Độ tin cậy trung bình cả trang do Tesseract tự chấm (0-100). Dưới ~55 thì mọi kết luận rút ra từ text đều không dùng được.';
COMMENT ON COLUMN receipt_extractions.confidence IS
    'Điểm tin cậy 0..1 của lần đọc, chấm bằng cách trừ điểm khi hai kênh đọc lệch nhau (services/receiptCrossCheck.js). NULL = bản ghi có trước khi có lớp đối chiếu chéo.';
COMMENT ON COLUMN receipt_extractions.pipeline IS
    'Tóm tắt từng giai đoạn: chất lượng ảnh, kết quả OCR, phiên bản prompt, các khoản trừ điểm. Dùng để giải thích một phán quyết sau nhiều tuần và để đo hiệu quả từng lớp.';

-- Chỉ đánh index phần đã có điểm: bản ghi cũ (confidence NULL) không bao giờ là kết
-- quả của truy vấn "hóa đơn máy đọc không chắc", đưa vào index chỉ tổ phình.
CREATE INDEX IF NOT EXISTS idx_receipt_extractions_confidence
    ON receipt_extractions (confidence, created_at DESC)
    WHERE confidence IS NOT NULL;

INSERT INTO schema_migrations (filename)
VALUES ('20260907_receipt_ocr_pipeline.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
