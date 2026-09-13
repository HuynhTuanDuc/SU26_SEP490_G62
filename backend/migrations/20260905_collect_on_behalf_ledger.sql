-- =====================================================================
-- 20260905_collect_on_behalf_ledger
-- Thêm event_type 'collect_on_behalf_held' — vế THU HỘ của tài khoản 3388.
--
-- VÌ SAO CẦN:
--
-- Tài khoản 3388 được khai từ đầu là "thu hộ/chi hộ", nhưng hệ thống mới chỉ dùng nửa
-- CHI HỘ (công ty ứng tiền hộ khách → Nợ 3388, thu lại → Có 3388). Nửa THU HỘ (COD —
-- tiền hàng công ty thu giúp khách rồi phải trả lại) chưa bao giờ có bút toán nào.
--
-- Hệ quả đo được trên DB thật, chuyến cước 2tr + thu hộ 15tr, tài xế cầm cả 17tr:
--
--     driver_debt_created   Nợ 1388 / Có 131    17.000.000   <-- SAI
--     shipment_revenue      Nợ 131  / Có 511     2.000.000
--     => tài khoản 131 (phải thu khách) = 2tr Nợ − 17tr Có = −15.000.000
--
-- Sổ đang nói khách trả THỪA 15 triệu, đúng bằng số thu hộ, và không có gì tự sửa lại.
-- Nguyên nhân: insertCustomerCashIn dồn mọi phần không phải chi hộ vào Có 131, trong khi
-- tiền thu hộ không phải tiền khách nợ — đó là tiền công ty NỢ LẠI khách.
--
-- VÌ SAO PHẢI LÀ MỘT event_type RIÊNG, không dùng lại 'driver_debt_created':
--
-- getPassThroughOutstanding đếm phần chi hộ đã tất toán bằng cách cộng mọi dòng Có 3388
-- có event_type nằm trong MONEY_IN_EVENTS. Nếu vế thu hộ mang luôn event_type của sự kiện
-- cha (driver_debt_created — có trong danh sách đó), nó sẽ bị đếm nhầm thành "đã thu lại
-- tiền chi hộ", và lần tiền về sau của cùng đơn sẽ tính thiếu phần chi hộ. Tách tên là
-- cách duy nhất giữ cho hai nửa của 3388 không lẫn vào nhau.
--
-- NOT VALID: mọi dòng đang có đều mang event_type thuộc danh sách cũ — vốn là tập con của
-- danh sách mới — nên không dòng nào vi phạm. Bỏ qua bước quét lại bảng cho nhanh; ràng
-- buộc vẫn áp đầy đủ với mọi dòng ghi mới.
-- =====================================================================

BEGIN;

ALTER TABLE financial_transactions
    DROP CONSTRAINT IF EXISTS financial_transactions_event_type_check;

ALTER TABLE financial_transactions
    ADD CONSTRAINT financial_transactions_event_type_check
    CHECK (event_type IN (
        'shipment_revenue',
        'prepaid_received',
        'prepaid_refunded',
        'cash_receipt',
        'bank_receipt',
        'driver_debt_created',
        'driver_debt_paid',
        'customer_debt_created',
        'customer_payment',
        'pass_through_cost',
        'expense_recorded',
        'expense_reimbursed',
        'payroll_paid',
        'bonus_paid',
        'advance_disbursed',
        'advance_recovered',
        'debt_transferred',
        'opening_balance',
        -- Thu hộ (COD): công ty/tài xế đang giữ tiền hàng của khách.
        -- Nợ <nơi tiền đang nằm> | Có 3388 — là khoản PHẢI TRẢ LẠI khách, không phải
        -- doanh thu và không phải tiền khách nợ.
        'collect_on_behalf_held'
    )) NOT VALID;

INSERT INTO schema_migrations (filename)
VALUES ('20260905_collect_on_behalf_ledger.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- Xác thực SAU khi COMMIT, tách khỏi giao dịch thêm ràng buộc.
--
-- Vì sao hai bước: ADD ... NOT VALID chỉ lấy khoá trong chớp mắt nên không chặn ghi;
-- VALIDATE quét bảng nhưng lấy khoá nhẹ (SHARE UPDATE EXCLUSIVE) nên đọc và ghi vẫn chạy
-- bình thường suốt lúc quét. Gộp làm một là giữ khoá nặng trong cả thời gian quét.
--
-- Bước này không thể hỏng: danh sách cũ là tập con của danh sách mới nên mọi dòng đang có
-- đều thoả. Có nó thì DB nâng cấp và DB dựng mới giống nhau đến từng cờ — thiếu nó, hai
-- đường phân kỳ ở chỗ ràng buộc bị đánh dấu "chưa xác thực", và bản pg_dump mang theo dấu
-- đó đi mãi.

ALTER TABLE financial_transactions
    VALIDATE CONSTRAINT financial_transactions_event_type_check;
