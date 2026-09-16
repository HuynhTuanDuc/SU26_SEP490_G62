-- =====================================================================
-- 20260913_driver_termination_date
-- Thêm ngày nghỉ việc cho tài xế: drivers.termination_date = ngày làm việc CUỐI CÙNG
-- (NULL = đang làm).
--
-- VÌ SAO CẦN: hệ thống không có cách nào ghi nhận tài xế nghỉ việc ngoài việc khoá tài
-- khoản, mà bảng lương lại loại hẳn tài khoản đã khoá. Tài nghỉ ngày 20 thường bị khoá
-- trước kỳ tính lương (ngày 10 tháng sau) → mất trắng lương 20 ngày đã làm. Ngược lại, tài
-- chưa bị khoá thì vẫn nhận đủ lương cả tháng và vẫn được xét thưởng Tết dù đã nghỉ.
-- Có ngày nghỉ việc thì bảng lương, chấm công, thưởng Tết đều cắt đúng tại ngày đó.
--
-- An toàn với dữ liệu cũ: cột nullable, mọi dòng cũ là NULL (= đang làm, đúng như cách
-- hệ thống vẫn hiểu). CHECK chỉ ràng buộc khi có giá trị nên dòng cũ đều hợp lệ.
-- =====================================================================
BEGIN;

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS termination_date DATE;

ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_termination_after_hire;
ALTER TABLE drivers ADD CONSTRAINT drivers_termination_after_hire
    CHECK (termination_date IS NULL OR termination_date >= hire_date);

INSERT INTO schema_migrations (filename)
VALUES ('20260913_driver_termination_date.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
