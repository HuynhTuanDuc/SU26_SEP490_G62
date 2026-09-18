-- =====================================================================
-- 20260918_maintenance_request_pics
-- Tách ảnh chụp lúc GỬI YÊU CẦU bảo dưỡng ra khỏi ảnh HÓA ĐƠN, và ghi lý do một lần
-- đọc hóa đơn được thả ra.
--
-- 1. maintenance_records.request_pics
--    Lúc gửi yêu cầu, app mời chụp "chứng từ / báo giá" — và trước đây những ảnh đó đi
--    thẳng vào bill_pics, lẫn với hóa đơn thanh toán. Bước hoàn tất vì thế phải NỚI lỏng:
--    ảnh không phải hóa đơn chỉ bị gạt khỏi tổng thay vì chặn, nếu không tài xế có hóa
--    đơn thật cũng bị kẹt. Hệ quả người dùng đã báo: nộp nhiều ảnh, chỉ cần MỘT ảnh đúng
--    là các ảnh sai vẫn lọt tới bàn duyệt. Tách riêng thì bill_pics chỉ còn hóa đơn, và
--    bước hoàn tất chặn được mọi ảnh sai.
--
-- 2. receipt_extractions.release_reason
--    Tài xế giờ xoá được ảnh đã tải. Một hóa đơn tài xế tự xoá rồi tải lại (vì chụp nhầm
--    góc) không đáng một cảnh báo; một hóa đơn quản lý đã TRẢ VỀ mà tài xế nộp lại thì
--    đáng. Cùng là "đã thả ra" nhưng người duyệt cần biết vì sao.
--      returned     — quản lý yêu cầu làm lại chứng từ
--      cancelled    — quản lý huỷ đợt bảo dưỡng
--      removed      — tài xế tự xoá ảnh khỏi đợt
--      not_attached — ảnh quét xong nhưng không vào được đợt (đợt vừa đổi trạng thái)
--
-- An toàn với dữ liệu cũ:
--   * Chỉ chuyển ảnh ở đợt CHƯA gửi duyệt (requested/open/rejected) và chỉ những ảnh
--     chưa từng được quét cho đợt đó — ảnh tải ở bước bảo dưỡng luôn được quét ngay lúc
--     tải, nên ảnh không có dòng vết nào chính là ảnh chụp lúc yêu cầu. Đợt đã gửi duyệt
--     hoặc đã hoàn tất giữ nguyên: đã được chấm và đã sinh chứng từ chi phí theo bill_pics.
--   * Chạy lại nhiều lần không đổi gì thêm: lần hai không còn ảnh nào để chuyển.
-- =====================================================================

BEGIN;

ALTER TABLE maintenance_records
    ADD COLUMN IF NOT EXISTS request_pics JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN maintenance_records.request_pics IS
    'Ảnh chứng từ/báo giá tài xế chụp lúc GỬI YÊU CẦU bảo dưỡng. Không bao giờ được chấm như hóa đơn; bill_pics chỉ chứa hóa đơn thanh toán tải ở bước bảo dưỡng.';

ALTER TABLE receipt_extractions
    ADD COLUMN IF NOT EXISTS release_reason TEXT;

ALTER TABLE receipt_extractions
    DROP CONSTRAINT IF EXISTS receipt_extractions_release_reason_check;
ALTER TABLE receipt_extractions
    ADD CONSTRAINT receipt_extractions_release_reason_check
    CHECK (release_reason IS NULL OR release_reason IN ('returned', 'cancelled', 'removed', 'not_attached'));

COMMENT ON COLUMN receipt_extractions.release_reason IS
    'Vì sao lần đọc được thả ra: returned (quản lý trả về làm lại), cancelled (quản lý huỷ đợt), removed (tài xế tự xoá ảnh), not_attached (ảnh không vào được đợt).';

-- Lý do cho những dòng đã thả ra bởi 20260917: đợt bị huỷ, còn lại là trả về làm lại.
UPDATE receipt_extractions re
   SET release_reason = CASE WHEN mr.status = 'rejected' THEN 'cancelled' ELSE 'returned' END
  FROM maintenance_records mr
 WHERE re.entity_type = 'maintenance_record'
   AND mr.id = re.entity_id
   AND re.released_at IS NOT NULL
   AND re.release_reason IS NULL;

UPDATE receipt_extractions
   SET release_reason = 'returned'
 WHERE released_at IS NOT NULL
   AND release_reason IS NULL;

-- Chuyển ảnh chụp lúc yêu cầu sang request_pics, giữ nguyên thứ tự.
WITH split AS (
    SELECT mr.id,
           COALESCE(jsonb_agg(p.value ORDER BY p.ord) FILTER (WHERE NOT p.scanned), '[]'::jsonb) AS request_part,
           COALESCE(jsonb_agg(p.value ORDER BY p.ord) FILTER (WHERE p.scanned), '[]'::jsonb)     AS bill_part
      FROM maintenance_records mr
      CROSS JOIN LATERAL (
            SELECT e.value, e.ord,
                   EXISTS (
                       SELECT 1 FROM receipt_extractions re
                        WHERE re.entity_type = 'maintenance_record'
                          AND re.entity_id = mr.id
                          AND re.image_url = e.value #>> '{}'
                   ) AS scanned
              FROM jsonb_array_elements(mr.bill_pics) WITH ORDINALITY AS e(value, ord)
      ) p
     WHERE mr.status IN ('requested', 'open', 'rejected')
     GROUP BY mr.id
)
UPDATE maintenance_records mr
   SET request_pics = mr.request_pics || split.request_part,
       bill_pics    = split.bill_part,
       updated_at   = NOW()
  FROM split
 WHERE mr.id = split.id
   AND jsonb_array_length(split.request_part) > 0;

INSERT INTO schema_migrations (filename)
VALUES ('20260918_maintenance_request_pics.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
