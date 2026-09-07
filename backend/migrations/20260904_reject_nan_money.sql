-- =====================================================================
-- 20260904_reject_nan_money
-- Chặn giá trị NaN / vô cực trên các cột tiền mà người dùng nhập trực tiếp.
--
-- VÌ SAO CẦN, dù mã nguồn đã kiểm:
--
-- Postgres coi chuỗi 'NaN' là một giá trị NUMERIC HỢP LỆ, và ba tính chất sau biến nó
-- thành một lỗ hỏng dữ liệu âm thầm:
--
--     SELECT 'NaN'::numeric > 0;                        -- true  (!)
--     SELECT SUM(x) FROM (VALUES (100),( 'NaN')) t(x);  -- NaN   (lây ra cả cột)
--     SELECT ... WHERE amount > 0                       -- KHÔNG lọc được NaN ra
--
-- Nghĩa là ràng buộc CHECK (amount > 0) đang có KHÔNG chặn được NaN, và một dòng NaN
-- lọt vào sẽ làm mọi SUM() chạm tới nó trả về NaN: tổng hoàn ứng của tài xế, tổng chi
-- phí của đơn, dòng "chi phí vận hành" trên báo cáo kinh doanh. Không có lỗi nào báo
-- ra — chỉ tới lúc ai đó mở báo cáo và thấy chữ NaN.
--
-- Đường vào thực tế: tài xế dán chuỗi "1.500.000đ" từ tin nhắn vào ô số tiền.
-- Number("1.500.000đ") ra NaN, lọt qua phép kiểm cũ (NaN <= 0 là false), xuống DB.
--
-- Mã nguồn nay đã chặn ở utils/money.js. Chốt này là lớp thứ hai: dữ liệu tiền hỏng
-- không sửa lại được bằng cách nào rẻ, nên chặn hai lớp là xứng đáng.
--
-- CÁCH CHẶN: `x < 'Infinity'` là FALSE với NaN (Postgres xếp NaN lớn hơn mọi số, kể cả
-- vô cực) nên vế này loại đúng cả NaN lẫn +Infinity, trong khi mọi số thật đều lọt.
--
-- An toàn với dữ liệu cũ: dùng NOT VALID nên KHÔNG quét lại bảng lúc thêm — chỉ áp cho
-- dòng ghi mới. Nếu DB đang có dòng NaN sẵn thì migration vẫn chạy được; xử lý dòng cũ
-- là việc riêng, xem truy vấn rà soát ở cuối file.
-- =====================================================================

BEGIN;

ALTER TABLE expenses            DROP CONSTRAINT IF EXISTS expenses_amount_finite;
ALTER TABLE expenses            ADD  CONSTRAINT expenses_amount_finite
    CHECK (amount < 'Infinity'::numeric) NOT VALID;

ALTER TABLE debt_payments       DROP CONSTRAINT IF EXISTS debt_payments_amount_finite;
ALTER TABLE debt_payments       ADD  CONSTRAINT debt_payments_amount_finite
    CHECK (amount < 'Infinity'::numeric) NOT VALID;

ALTER TABLE salary_advances     DROP CONSTRAINT IF EXISTS salary_advances_amount_finite;
ALTER TABLE salary_advances     ADD  CONSTRAINT salary_advances_amount_finite
    CHECK (amount < 'Infinity'::numeric) NOT VALID;

ALTER TABLE driver_bonuses      DROP CONSTRAINT IF EXISTS driver_bonuses_amount_finite;
ALTER TABLE driver_bonuses      ADD  CONSTRAINT driver_bonuses_amount_finite
    CHECK (amount < 'Infinity'::numeric) NOT VALID;

ALTER TABLE payment_vouchers    DROP CONSTRAINT IF EXISTS payment_vouchers_amount_finite;
ALTER TABLE payment_vouchers    ADD  CONSTRAINT payment_vouchers_amount_finite
    CHECK (amount < 'Infinity'::numeric) NOT VALID;

ALTER TABLE debts               DROP CONSTRAINT IF EXISTS debts_total_amount_finite;
ALTER TABLE debts               ADD  CONSTRAINT debts_total_amount_finite
    CHECK (total_amount < 'Infinity'::numeric) NOT VALID;

ALTER TABLE maintenance_records DROP CONSTRAINT IF EXISTS maintenance_records_cost_finite;
ALTER TABLE maintenance_records ADD  CONSTRAINT maintenance_records_cost_finite
    CHECK (cost IS NULL OR cost < 'Infinity'::numeric) NOT VALID;

ALTER TABLE financial_transactions DROP CONSTRAINT IF EXISTS financial_transactions_amount_finite;
ALTER TABLE financial_transactions ADD  CONSTRAINT financial_transactions_amount_finite
    CHECK (amount < 'Infinity'::numeric) NOT VALID;

INSERT INTO schema_migrations (filename)
VALUES ('20260904_reject_nan_money.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- Rà soát dòng NaN đã lọt vào từ trước (chạy tay khi cần — KHÔNG nằm trong migration
-- vì sửa một khoản tiền sai là quyết định nghiệp vụ, không phải việc của máy):
--
--   SELECT 'expenses' AS bang, id, amount FROM expenses            WHERE amount = 'NaN'::numeric
--   UNION ALL SELECT 'debt_payments', id, amount FROM debt_payments WHERE amount = 'NaN'::numeric
--   UNION ALL SELECT 'salary_advances', id, amount FROM salary_advances WHERE amount = 'NaN'::numeric;
