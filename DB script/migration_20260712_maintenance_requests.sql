-- Migration 2026-07-12: Driver gửi yêu cầu bảo dưỡng xe
-- Thêm trạng thái 'requested' / 'rejected' vào maintenance_records
-- + cột người yêu cầu, lý do yêu cầu, lý do từ chối.
-- Chạy trong transaction.

BEGIN;

ALTER TABLE maintenance_records
    DROP CONSTRAINT IF EXISTS maintenance_records_status_check;

ALTER TABLE maintenance_records
    ADD CONSTRAINT maintenance_records_status_check
    CHECK (status IN ('requested','open','pending_verification','completed','rejected'));

ALTER TABLE maintenance_records
    ADD COLUMN IF NOT EXISTS requested_by   INT REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS request_reason TEXT,
    ADD COLUMN IF NOT EXISTS reject_reason  TEXT;

CREATE INDEX IF NOT EXISTS idx_maintenance_requested
    ON maintenance_records(status) WHERE status = 'requested';

COMMIT;
