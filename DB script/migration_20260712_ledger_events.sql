-- Migration 2026-07-12: Bổ sung loại sự kiện nhật ký tài chính
--   bonus_paid       : chi thưởng lẻ ngoài kỳ lương (tiền mặt)
--   advance_recovered: hoàn ứng lương khi chi lương (tất toán TK 141)
--   prepaid_refunded : hoàn tiền khách ứng trước khi hủy đơn

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
        'payroll_paid',
        'bonus_paid',
        'advance_disbursed',
        'advance_recovered'
    ));

COMMIT;
