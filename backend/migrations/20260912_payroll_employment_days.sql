-- =====================================================================
-- 20260912_payroll_employment_days
-- Lưu SỐ NGÀY của kỳ vào phiếu lương:
--   employed_days — số ngày thuộc thời gian làm việc trong tháng (từ ngày vào làm tới
--                   cuối tháng; đủ tháng thì bằng số ngày lịch)
--   working_days  — số công tính lương = employed_days − nghỉ không lương/vắng/nửa công
--
-- VÌ SAO CẦN: lương cứng, phụ cấp điện thoại và BHXH nay tính theo ngày vào làm (trước
-- đây tài vào làm ngày 25 vẫn nhận đủ lương cả tháng). Phiếu lương chỉ lưu con số
-- absence_penalty thì màn hình không phân biệt được "nghỉ không lương" với "vào làm giữa
-- tháng" — phiếu gửi tài xế mới vào sẽ ghi nhầm là họ bị trừ vì nghỉ không lương.
--
-- An toàn với dữ liệu cũ: hai cột nullable, không DEFAULT. Phiếu tạo trước migration để
-- NULL và giao diện hiểu là đủ tháng — đúng với cách tính lúc phiếu đó được tạo. Tính lại
-- bảng lương (chỉ phiếu 'pending') sẽ tự điền.
-- =====================================================================
BEGIN;

ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS employed_days SMALLINT;
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS working_days  NUMERIC(4,1);

INSERT INTO schema_migrations (filename)
VALUES ('20260912_payroll_employment_days.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
