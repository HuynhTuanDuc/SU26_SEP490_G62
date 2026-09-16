-- =====================================================================
-- 20260914_driver_termination_settlement
-- Quyết toán khi tài xế chấm dứt hợp đồng.
--
-- Tiền ứng lương vẫn trừ vào lương kỳ đó như thường lệ, công nợ vẫn trừ theo trần % như
-- thường lệ. Chỉ khác ở kỳ lương CUỐI (nghỉ giữa tháng, lương theo công thấp): tiền đã ứng
-- có thể lớn hơn số lương làm ra. Trước đây phiếu lương khi đó ra số âm, bút toán chi lương
-- âm bị bỏ qua (CHECK amount > 0) còn bút toán hoàn ứng vẫn ghi đủ → TK 334 treo số dư Nợ,
-- phần tài xế còn nợ lại công ty không nằm ở đâu để thu.
--
-- Nay phần ứng vượt lương được chuyển thành công nợ tài xế lúc chi lương, để kế toán thu
-- như mọi khoản nợ tài xế khác (phiếu thu → driver_debt_paid):
--     advance_to_debt   Nợ 1388 | Có 141
--
-- 1) debts.source thêm 'payroll' — khoản nợ sinh từ bảng lương. Tách khỏi 'manual' vì nợ
--    khai tay được sửa/xoá tự do, còn khoản này đã có bút toán đi kèm.
-- 2) financial_transactions.event_type thêm 'advance_to_debt'.
-- =====================================================================

BEGIN;

ALTER TABLE debts DROP CONSTRAINT IF EXISTS debts_source_check;
ALTER TABLE debts ADD CONSTRAINT debts_source_check
    CHECK (source IN ('shipment', 'manual', 'payroll')) NOT VALID;

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
        'collect_on_behalf_returned',
        -- Tiền ứng lương chưa trừ hết vào lương kỳ đó → công nợ tài xế: Nợ 1388 | Có 141.
        'advance_to_debt'
    )) NOT VALID;

INSERT INTO schema_migrations (filename)
VALUES ('20260914_driver_termination_settlement.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

-- Xác thực sau COMMIT (cùng lý do với 20260906): danh sách cũ là tập con của danh sách mới
-- nên không thể hỏng, và DB nâng cấp giống DB dựng mới đến từng cờ.
ALTER TABLE debts VALIDATE CONSTRAINT debts_source_check;
ALTER TABLE financial_transactions VALIDATE CONSTRAINT financial_transactions_event_type_check;
