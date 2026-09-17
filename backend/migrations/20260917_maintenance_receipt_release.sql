-- =====================================================================
-- 20260917_maintenance_receipt_release
-- Hai cột cho luồng hóa đơn bảo dưỡng.
--
-- 1. receipt_extractions.released_at — lần đọc hóa đơn này đã được THẢ RA, không còn
--    tính là "đã dùng" khi dò trùng.
--
--    Lớp dò trùng coi mọi lần đọc chưa bị từ chối là hóa đơn đã dùng. Nhưng có những
--    lần đọc mà tờ hóa đơn chưa hề được dùng vào đâu:
--      * quản lý TRẢ VỀ LÀM LẠI — bill_pics bị xoá sạch, app bảo tài xế "chụp lại hoá
--        đơn và nhập lại chi phí". Đã tái hiện: tài xế nộp lại đúng tờ hóa đơn thật (cùng
--        tệp, hay chụp lại cùng tờ) bị CHẶN "ảnh đã tải lên cho chính khoản này rồi" — và
--        không bao giờ nộp được nữa, vì tờ hóa đơn thật chỉ có một.
--      * quản lý HUỶ đợt — đợt không bao giờ thành khoản chi. Gửi yêu cầu mới rồi nộp
--        cùng hóa đơn thì bị chặn "đã được dùng cho đợt #X".
--      * ảnh đã quét xong nhưng không vào được đợt (đợt vừa gửi duyệt trong lúc quét).
--    Dòng đã thả ra vẫn giữ nguyên để làm vết; dò trùng chỉ còn CẢNH BÁO cho người duyệt.
--
-- 2. maintenance_records.receipt_check — kết quả đối chiếu CẢ ĐỢT lúc tài xế bấm hoàn
--    tất (tổng các hóa đơn so với số khai, ảnh chứng từ bị gạt khỏi tổng...). Trước đây
--    kết quả này chỉ sống trong request: thông báo gửi quản lý nói "Có N điểm cần kiểm
--    tra trên hóa đơn" mà màn duyệt không chỉ ra được các điểm ở mức cả đợt.
--
-- An toàn với dữ liệu cũ: chỉ THÊM cột nullable. Phần bù dữ liệu chỉ thả ra những lần
-- đọc chắc chắn không còn thuộc đợt nào: đợt đã huỷ, hoặc ảnh không còn trong bill_pics
-- và đã cũ hơn 10 phút — một lần tải ảnh đang dở (đã ghi vết, chưa kịp thêm vào
-- bill_pics) không bao giờ kéo dài tới mức đó, nên không thả nhầm lần tải đang chạy.
-- =====================================================================

BEGIN;

ALTER TABLE receipt_extractions
    ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

ALTER TABLE maintenance_records
    ADD COLUMN IF NOT EXISTS receipt_check JSONB;

COMMENT ON COLUMN receipt_extractions.released_at IS
    'Thời điểm lần đọc này được thả ra: đợt bảo dưỡng bị trả về làm lại/huỷ, hoặc ảnh không vào được đợt. Dò trùng không coi dòng đã thả ra là hóa đơn đã dùng, chỉ cảnh báo.';
COMMENT ON COLUMN maintenance_records.receipt_check IS
    'Kết quả đối chiếu cả đợt lúc tài xế hoàn tất (verdict, reasons, tổng hóa đơn). NULL khi chưa hoàn tất hoặc đã bị trả về làm lại.';

UPDATE receipt_extractions re
   SET released_at = mr.updated_at
  FROM maintenance_records mr
 WHERE re.entity_type = 'maintenance_record'
   AND mr.id = re.entity_id
   AND re.released_at IS NULL
   AND (
        mr.status = 'rejected'
        OR (NOT (mr.bill_pics ? re.image_url) AND re.created_at < NOW() - INTERVAL '10 minutes')
   );

INSERT INTO schema_migrations (filename)
VALUES ('20260917_maintenance_receipt_release.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
