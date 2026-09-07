-- =====================================================================
-- 20260906_collect_on_behalf_return
-- Bước TẤT TOÁN của thu hộ: trả tiền lại cho người bán.
--
-- Migration trước (20260905) mới ghi được vế PHÁT SINH nghĩa vụ:
--     collect_on_behalf_held   Nợ 1388 | Có 3388
-- tức "công ty/tài xế đang giữ tiền hàng của khách". Nhưng không có đường nào đóng khoản
-- đó lại, nên 3388 chỉ có thể phình mãi: sổ biết công ty đang nợ ai bao nhiêu, mà không
-- ghi lại được lúc đã trả.
--
-- Migration này thêm nốt vế kia:
--     collect_on_behalf_returned   Nợ 3388 | Có 1111/1121
--
-- Đi qua PHIẾU CHI chứ không ghi thẳng vào sổ — cùng đường với mọi đồng tiền ra khỏi quỹ,
-- nên vẫn có người chi, có chứng từ đính kèm, có dấu vết ai bấm lúc nào. Loại phiếu
-- 'collect_on_behalf_return' không nằm trong danh sách kế toán tự chọn khi lập phiếu tay
-- (giống prepaid_refund và driver_reimbursement): nó bắt buộc gắn với một đơn hàng cụ thể,
-- chọn tay là sinh phiếu mồ côi không trừ được vào khoản 3388 nào.
-- =====================================================================

BEGIN;

-- ─── 1. Bút toán trả tiền thu hộ ─────────────────────────────────────
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
        'collect_on_behalf_held',
        -- Đã trả tiền thu hộ lại cho người bán: Nợ 3388 | Có 1111/1121.
        'collect_on_behalf_returned'
    )) NOT VALID;

-- ─── 2. Loại phiếu chi tương ứng ─────────────────────────────────────
ALTER TABLE payment_vouchers
    DROP CONSTRAINT IF EXISTS payment_vouchers_voucher_type_check;

ALTER TABLE payment_vouchers
    ADD CONSTRAINT payment_vouchers_voucher_type_check
    CHECK (voucher_type IN (
        'office','rent','utilities','equipment','entertainment','compensation',
        'prepaid_refund','driver_reimbursement',
        -- Trả lại tiền thu hộ (COD) cho người bán. Luôn gắn order_id.
        'collect_on_behalf_return',
        'other'
    )) NOT VALID;

INSERT INTO schema_migrations (filename)
VALUES ('20260906_collect_on_behalf_return.sql')
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

ALTER TABLE payment_vouchers
    VALIDATE CONSTRAINT payment_vouchers_voucher_type_check;
