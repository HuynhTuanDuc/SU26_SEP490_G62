-- Migration 2026-07-12: Danh mục ngày lễ hưởng 200% lương (Điều V.1 chính sách lương 01/04/2026)
-- Driver có chuyến hoàn thành trong ngày lễ → cộng thêm 100% lương ngày vào holiday_bonus
-- (100% còn lại đã nằm trong lương cứng vì ngày lễ không bị trừ công).

BEGIN;

CREATE TABLE IF NOT EXISTS company_holidays (
    holiday_date DATE PRIMARY KEY,
    name         TEXT NOT NULL
);

INSERT INTO company_holidays (holiday_date, name) VALUES
    ('2026-01-01', 'Tết Dương lịch'),
    ('2026-02-17', 'Tết Âm lịch (mùng 1)'),
    ('2026-02-18', 'Tết Âm lịch (mùng 2)'),
    ('2026-02-19', 'Tết Âm lịch (mùng 3)'),
    ('2026-04-26', 'Giỗ Tổ Hùng Vương (10/03 ÂL)'),
    ('2026-04-30', 'Ngày Giải phóng miền Nam'),
    ('2026-05-01', 'Ngày Quốc tế lao động'),
    ('2026-09-02', 'Ngày Quốc khánh')
ON CONFLICT (holiday_date) DO NOTHING;

COMMIT;
