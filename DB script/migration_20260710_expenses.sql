-- Migration 2026-07-10: Expense taxonomy + approval workflow
-- 1. Taxonomy mới (5 loại):
--    Khách chi trả (pass-through): toll (cầu đường), parking (đỗ xe), etc (phí ETC)
--    Công ty chi trả:              fuel (xăng dầu), repair (sửa xe)
-- 2. Luồng duyệt: driver tạo → pending → coordinator approve/reject

BEGIN;

-- ── 1. Chuẩn hóa dữ liệu cũ (nếu có) trước khi siết constraint ────────────────
UPDATE expenses SET expense_type = 'repair' WHERE expense_type = 'minor_repair';
UPDATE expenses SET expense_type = 'other'  WHERE expense_type = 'ferry';

-- ── 2. Constraint expense_type mới (thêm 'etc', giữ giá trị hệ thống cũ) ──────
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_expense_type_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_expense_type_check
    CHECK (expense_type IN (
        'toll', 'parking', 'etc',            -- khách chi trả (pass-through)
        'fuel', 'repair',                     -- công ty chi trả
        'maintenance', 'depreciation', 'other' -- hệ thống / dữ liệu cũ
    ));

-- ── 3. Cột luồng duyệt ────────────────────────────────────────────────────────
-- DEFAULT 'approved' để mọi bản ghi cũ được coi là đã duyệt
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reviewed_by   INT REFERENCES profiles(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reject_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);

COMMIT;
