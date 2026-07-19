-- ============================================================================
-- SEED DATA — LogisCount TMS (dựng lại toàn bộ dữ liệu mẫu, 07/2026)
-- Chạy SAU "DB script.sql" trên DB trống.
--
-- Tài khoản (mật khẩu):
--   admin@gmail.com   / admin123   — Manager
--   coord@gmail.com   / coord123   — Coordinator
--   acct@gmail.com    / acct123    — Accountant
--   driver1@gmail.com / driver123  — Phạm Văn Tùng  (Xe cắt nóc, 51C-123.45)
--   driver2@gmail.com / driver123  — Hoàng Minh Quân (Xe 3 tấn,  51D-678.90)
--   driver3@gmail.com / driver123  — Đỗ Hữu Phước   (Xe 5m2,    51E-246.80)
--
-- Dữ liệu nghiệp vụ nhất quán (tháng 6 + 7/2026):
--   8 đơn hàng → 9 chuyến (6 hoàn thành, 1 đang chạy, 2 trong pool)
--   Phiếu thu + sổ tài chính + công nợ + KPI khớp số với từng chuyến
-- ============================================================================

-- ─── 1. TÀI KHOẢN & HỒ SƠ ────────────────────────────────────────────────────

INSERT INTO accounts (id, email, password_hash, role_id, is_active) VALUES
    (100000, 'admin@gmail.com',   crypt('admin123',  gen_salt('bf')), (SELECT id FROM roles WHERE name = 'manager'),     TRUE),
    (100001, 'coord@gmail.com',   crypt('coord123',  gen_salt('bf')), (SELECT id FROM roles WHERE name = 'coordinator'), TRUE),
    (100002, 'acct@gmail.com',    crypt('acct123',   gen_salt('bf')), (SELECT id FROM roles WHERE name = 'accountant'),  TRUE),
    (100003, 'driver1@gmail.com', crypt('driver123', gen_salt('bf')), (SELECT id FROM roles WHERE name = 'driver'),      TRUE),
    (100004, 'driver2@gmail.com', crypt('driver123', gen_salt('bf')), (SELECT id FROM roles WHERE name = 'driver'),      TRUE),
    (100005, 'driver3@gmail.com', crypt('driver123', gen_salt('bf')), (SELECT id FROM roles WHERE name = 'driver'),      TRUE);

INSERT INTO profiles (id, full_name, phone, role_id, dob, gender, national_id, address, city, country, emergency_contact_name, emergency_contact_phone, notes) VALUES
    (100000, 'Nguyễn Quang Minh', '0901000001', (SELECT id FROM roles WHERE name = 'manager'),     '1985-04-12', 'male',   '079185000111', '12 Nguyễn Huệ, Quận 1',        'Hồ Chí Minh', 'VN', 'Nguyễn Thị Hoa',  '0908000001', 'Giám đốc điều hành'),
    (100001, 'Trần Thu Hà',       '0901000002', (SELECT id FROM roles WHERE name = 'coordinator'), '1992-09-21', 'female', '079192000222', '88 Lê Lợi, Quận 3',            'Hồ Chí Minh', 'VN', 'Trần Văn Phúc',   '0908000002', 'Điều phối viên'),
    (100002, 'Lê Minh Ngọc',      '0901000003', (SELECT id FROM roles WHERE name = 'accountant'),  '1991-03-14', 'female', '079191000333', '25 Võ Thị Sáu, Quận 3',        'Hồ Chí Minh', 'VN', 'Lê Minh Châu',    '0908000003', 'Kế toán tổng hợp'),
    (100003, 'Phạm Văn Tùng',     '0901000004', (SELECT id FROM roles WHERE name = 'driver'),      '1993-07-08', 'male',   '079193000444', '101 Trần Hưng Đạo, Thủ Đức',   'Hồ Chí Minh', 'VN', 'Phạm Thị Lan',    '0908000004', 'Tài xế xe cắt nóc'),
    (100004, 'Hoàng Minh Quân',   '0901000005', (SELECT id FROM roles WHERE name = 'driver'),      '1990-11-02', 'male',   '079190000555', '55 Hùng Vương, Quận 5',        'Hồ Chí Minh', 'VN', 'Hoàng Thị Hạnh',  '0908000005', 'Tài xế xe 3 tấn'),
    (100005, 'Đỗ Hữu Phước',      '0901000006', (SELECT id FROM roles WHERE name = 'driver'),      '1996-01-18', 'male',   '079196000666', '7 Nguyễn Văn Cừ, Quận 5',      'Hồ Chí Minh', 'VN', 'Đỗ Quốc Minh',    '0908000006', 'Tài xế xe 5m2');

-- ─── 2. NHÓM XE & XE (theo chính sách lương 04/2026) ─────────────────────────

INSERT INTO vehicle_groups (id, name, description, max_load_weight_kg, price_per_km) VALUES
    (100000, 'Xe cắt nóc',     'Xe tải nhẹ cắt nóc, chở hàng cồng kềnh nội thành', 2000,  10000),
    (100001, 'Xe 3 tấn (4m3)', 'Xe tải 3 tấn thùng 4m3',                           3000,  15000),
    (100002, 'Xe 5m2',         'Xe tải thùng dài 5m2',                             7000,  20000),
    (100003, 'Xe 7m4',         'Xe tải thùng dài 7m4, tuyến liên tỉnh',            10000, 30000);

INSERT INTO vehicles (id, plate_number, vehicle_group_id, brand, model, load_capacity_kg, manufacture_year, purchase_date, assigned_driver_id, status) VALUES
    (100000, '51C-123.45', 100000, 'Suzuki',  'Carry Pro',  1900,  2022, DATE '2022-06-10', 100003, 'active'),
    (100001, '51D-678.90', 100001, 'Isuzu',   'QKR 230',    3000,  2021, DATE '2021-09-15', 100004, 'active'),
    (100002, '51E-246.80', 100002, 'Hino',    'XZU 342L',   6800,  2023, DATE '2023-02-20', 100005, 'active'),
    (100003, '51F-135.79', 100003, 'Hyundai', 'Mighty EX8', 9500,  2022, DATE '2022-11-05', NULL,   'active');

INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, license_expiry_date, hire_date, revenue_share_percent, emergency_contact_name, emergency_contact_phone) VALUES
    (100003, 100000, 100000, 'DL-0123456', DATE '2028-12-31', DATE '2023-03-01', 15.00, 'Phạm Thị Lan',   '0908000004'),
    (100004, 100001, 100001, 'DL-0234567', DATE '2029-06-30', DATE '2024-05-15', 15.00, 'Hoàng Thị Hạnh', '0908000005'),
    (100005, 100002, 100002, 'DL-0345678', DATE '2029-11-15', DATE '2025-11-01', 15.00, 'Đỗ Quốc Minh',   '0908000006');

-- ─── 3. QUY TẮC THƯỞNG (đúng chính sách: KPI 2tr theo ngưỡng nhóm xe, top 1tr) ─

INSERT INTO bonus_rules (vehicle_group_id, title, bonus_type, reward_amount, conditions_json) VALUES
    (100000, 'Thưởng vượt KPI — Xe cắt nóc',                'kpi',         2000000, '{"min_revenue": 50000000}'::jsonb),
    (100001, 'Thưởng vượt KPI — Xe 3 tấn (4m3)',            'kpi',         2000000, '{"min_revenue": 65000000}'::jsonb),
    (100002, 'Thưởng vượt KPI — Xe 5m2',                    'kpi',         2000000, '{"min_revenue": 70000000}'::jsonb),
    (100003, 'Thưởng vượt KPI — Xe 7m4',                    'kpi',         2000000, '{"min_revenue": 100000000}'::jsonb),
    (100000, 'Lái xe xuất sắc nhất tháng — Xe cắt nóc',     'top_revenue', 1000000, '{"rank": 1}'::jsonb),
    (100001, 'Lái xe xuất sắc nhất tháng — Xe 3 tấn (4m3)', 'top_revenue', 1000000, '{"rank": 1}'::jsonb),
    (100002, 'Lái xe xuất sắc nhất tháng — Xe 5m2',         'top_revenue', 1000000, '{"rank": 1}'::jsonb);

-- ─── 4. KHÁCH HÀNG & ĐỐI TÁC ─────────────────────────────────────────────────

INSERT INTO customers (id, customer_type, full_name, company_name, contact_person, phone, email, address, tax_code, notes) VALUES
    (100000, 'individual', 'Nguyễn Hoàng An', NULL,                              'Nguyễn Hoàng An', '0987000001', 'hoangan@gmail.com',        '123 Nguyễn Huệ, Quận 1, TP.HCM',    NULL,         'Khách cá nhân, giao nội thành, trả tiền mặt'),
    (100001, 'business',   NULL, 'Công ty TNHH Thực phẩm Sài Gòn',              'Ms. Lan',         '0987000002', 'lan@saigonfoods.vn',       '456 Lê Lợi, Quận 1, TP.HCM',        '0312345678', 'Hàng thực phẩm khô, thanh toán chuyển khoản'),
    (100002, 'business',   NULL, 'Công ty CP Nội thất Mộc Việt',                'Mr. Hùng',        '0987000003', 'hung@mocviet.vn',          '321 Nguyễn Trãi, Quận 5, TP.HCM',   '0309876543', 'Nội thất cồng kềnh, công nợ 30 ngày'),
    (100003, 'individual', 'Trần Thị Bích', NULL,                               'Trần Thị Bích',   '0987000004', 'bichtran@gmail.com',       '789 Trần Hưng Đạo, Quận 5, TP.HCM', NULL,         'Khách cá nhân, chuyển nhà trọn gói');

INSERT INTO partners (id, company_name, short_name, contact_person, phone, email, address, tax_code, business_registration_number, payment_term_days, bank_name, bank_account_number, bank_account_name, notes) VALUES
    (100000, 'Công ty TNHH Vận tải Tân Cảng', 'Tân Cảng Express', 'Mr. Tuấn', '0912000001', 'tuan@tancang.vn',    '100 Pasteur, Quận 1, TP.HCM',       '0314000001', '0314000001-001', 30, 'Vietcombank', '0011008899001', 'CTY TNHH VAN TAI TAN CANG', 'Đối tác thuê xe khi quá tải'),
    (100001, 'Công ty CP Giao nhận Miền Nam', 'Southern Logistics', 'Ms. Hoa', '0912000002', 'hoa@southernlog.vn', '200 Nguyễn Văn Linh, Quận 7, TP.HCM','0314000002', '0314000002-002', 15, 'ACB',         '220055667788',  'CTY CP GIAO NHAN MIEN NAM', 'Đối tác giao nhận liên tỉnh');

-- ─── 5. THÔNG TIN CÔNG TY ────────────────────────────────────────────────────

UPDATE company_info SET
    company_name        = 'Công ty TNHH Vận tải LogisCount',
    hotline             = '1900 1234',
    bank_name           = 'Vietcombank',
    bank_account_number = '0011002233445',
    bank_account_name   = 'CONG TY TNHH VAN TAI LOGISCOUNT',
    updated_by          = 100000
WHERE id = 1;

-- ─── 6. ĐƠN HÀNG & CHUYẾN ────────────────────────────────────────────────────
-- Tháng 6/2026 — 4 đơn hoàn thành, đã chốt phiếu thu:
--   Đơn 100000 (Saigon Foods, CK)      → chuyến 100000, driver1, 2.500.000
--   Đơn 100001 (Hoàng An, tiền mặt)    → chuyến 100001, driver2, 3.200.000 → nợ tài xế (đã nộp 2tr, còn 1,2tr)
--   Đơn 100002 (Mộc Việt, công nợ)     → chuyến 100002, driver3, 5.500.000 → nợ khách (đã trả 2tr, còn 3,5tr)
--   Đơn 100003 (Bích, tiền mặt)        → chuyến 100003, driver1, 1.800.000 → nợ tài xế đã nộp đủ
-- Tháng 7/2026:
--   Đơn 100004 (Saigon Foods, CK)      → chuyến 100004, driver1, 2.000.000 (hoàn thành)
--   Đơn 100005 (Hoàng An, tiền mặt)    → chuyến 100005, driver3, 4.000.000 (hoàn thành, nợ tài xế chưa nộp)
--   Đơn 100006 (Mộc Việt, CK, mở)      → chuyến 100006 đang chạy (driver2) + chuyến 100007 trong pool
--   Đơn 100007 (Bích, tiền mặt, mở)    → chuyến 100008 trong pool

INSERT INTO orders (id, customer_id, created_by, cargo_name, cargo_weight_kg, payment_type, total_estimated_price, derived_status, notes, created_at, updated_at) VALUES
    (100000, 100001, 100001, 'Thực phẩm khô đóng thùng',    800,  'bank_transfer', 2400000, 'completed', 'Giao kho Quận 7',                      '2026-06-05 06:30:00+07', '2026-06-06 09:00:00+07'),
    (100001, 100000, 100001, 'Đồ gia dụng',                 1500, 'cash',          3000000, 'completed', 'Khách trả tiền mặt cho tài xế',         '2026-06-10 06:00:00+07', '2026-06-10 18:00:00+07'),
    (100002, 100002, 100001, 'Bàn ghế gỗ xuất khẩu',        4500, 'client_credit', 5200000, 'completed', 'Công nợ 30 ngày theo hợp đồng',         '2026-06-18 06:00:00+07', '2026-06-18 17:00:00+07'),
    (100003, 100003, 100001, 'Đồ đạc chuyển nhà',           900,  'cash',          1700000, 'completed', 'Chuyển nhà trọn gói Quận 5 → Thủ Đức',  '2026-06-22 07:00:00+07', '2026-06-22 16:00:00+07'),
    (100004, 100001, 100001, 'Gia vị & nguyên liệu bếp',    700,  'bank_transfer', 1900000, 'completed', 'Giao siêu thị Gò Vấp',                  '2026-07-08 06:30:00+07', '2026-07-09 10:00:00+07'),
    (100005, 100000, 100001, 'Máy móc gia công nhỏ',        3200, 'cash',          3800000, 'completed', 'Hàng nặng, cần xe 5m2',                 '2026-07-12 06:00:00+07', '2026-07-12 17:30:00+07'),
    (100006, 100002, 100001, 'Nội thất văn phòng (2 đợt)',  5000, 'bank_transfer', 5800000, 'open',      'Chia 2 chuyến, đợt 2 chờ tài xế nhận',  '2026-07-16 07:00:00+07', '2026-07-16 09:15:00+07'),
    (100007, 100003, 100001, 'Tủ lạnh + máy giặt',          400,  'cash',          1500000, 'open',      'Chờ tài xế nhận chuyến',                '2026-07-17 08:00:00+07', '2026-07-17 08:00:00+07');

INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_price, estimated_distance_km, actual_distance_km, actual_price, cargo_name, cargo_weight_kg, status, claimed_at, picking_at, transit_at, arrived_at, completed_at, created_at, updated_at) VALUES
    -- Tháng 6 — hoàn thành
    (100000, 100000, 1, 100000, 2400000, 240, 250, 2500000, 'Thực phẩm khô đóng thùng', 800,  'completed', '2026-06-05 07:00:00+07', '2026-06-05 07:40:00+07', '2026-06-05 09:00:00+07', '2026-06-05 15:30:00+07', '2026-06-05 16:30:00+07', '2026-06-05 06:30:00+07', '2026-06-05 16:30:00+07'),
    (100001, 100001, 1, 100001, 3000000, 200, 213, 3200000, 'Đồ gia dụng',              1500, 'completed', '2026-06-10 07:00:00+07', '2026-06-10 07:50:00+07', '2026-06-10 09:30:00+07', '2026-06-10 16:00:00+07', '2026-06-10 17:00:00+07', '2026-06-10 06:00:00+07', '2026-06-10 17:00:00+07'),
    (100002, 100002, 1, 100002, 5200000, 260, 275, 5500000, 'Bàn ghế gỗ xuất khẩu',     4500, 'completed', '2026-06-18 06:30:00+07', '2026-06-18 07:20:00+07', '2026-06-18 08:45:00+07', '2026-06-18 15:00:00+07', '2026-06-18 16:00:00+07', '2026-06-18 06:00:00+07', '2026-06-18 16:00:00+07'),
    (100003, 100003, 1, 100000, 1700000, 170, 180, 1800000, 'Đồ đạc chuyển nhà',        900,  'completed', '2026-06-22 07:30:00+07', '2026-06-22 08:15:00+07', '2026-06-22 09:30:00+07', '2026-06-22 14:30:00+07', '2026-06-22 15:30:00+07', '2026-06-22 07:00:00+07', '2026-06-22 15:30:00+07'),
    -- Tháng 7 — hoàn thành
    (100004, 100004, 1, 100000, 1900000, 190, 200, 2000000, 'Gia vị & nguyên liệu bếp', 700,  'completed', '2026-07-08 07:00:00+07', '2026-07-08 07:45:00+07', '2026-07-08 09:00:00+07', '2026-07-08 14:00:00+07', '2026-07-08 15:00:00+07', '2026-07-08 06:30:00+07', '2026-07-08 15:00:00+07'),
    (100005, 100005, 1, 100002, 3800000, 190, 200, 4000000, 'Máy móc gia công nhỏ',     3200, 'completed', '2026-07-12 07:00:00+07', '2026-07-12 07:50:00+07', '2026-07-12 09:15:00+07', '2026-07-12 15:30:00+07', '2026-07-12 16:30:00+07', '2026-07-12 06:00:00+07', '2026-07-12 16:30:00+07'),
    -- Tháng 7 — đang chạy (driver2 đang chở đợt 1 đơn 100006)
    (100006, 100006, 1, 100001, 3000000, 150, NULL, NULL,   'Nội thất văn phòng đợt 1', 2600, 'transit',   '2026-07-16 08:00:00+07', '2026-07-16 08:30:00+07', '2026-07-16 09:15:00+07', NULL, NULL, '2026-07-16 07:00:00+07', '2026-07-16 09:15:00+07'),
    -- Trip pool
    (100007, 100006, 2, 100001, 2800000, 140, NULL, NULL,   'Nội thất văn phòng đợt 2', 2400, 'available', NULL, NULL, NULL, NULL, NULL, '2026-07-16 07:00:00+07', '2026-07-16 07:00:00+07'),
    (100008, 100007, 1, 100000, 1500000, 150, NULL, NULL,   'Tủ lạnh + máy giặt',       400,  'available', NULL, NULL, NULL, NULL, NULL, '2026-07-17 08:00:00+07', '2026-07-17 08:00:00+07');

-- Điểm dừng (lấy + giao cho từng chuyến)
INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, arrived_at, completed_at) VALUES
    (100000, 1, 'pickup',   'Kho Saigon Foods, 456 Lê Lợi, Quận 1, TP.HCM',        'Ms. Lan',         '0987000002', '2026-06-05 07:30:00+07', '2026-06-05 08:50:00+07'),
    (100000, 2, 'delivery', 'Kho lạnh Quận 7, 15 Nguyễn Thị Thập, TP.HCM',          'Anh Bảo (thủ kho)','0912345001', '2026-06-05 15:30:00+07', '2026-06-05 16:25:00+07'),
    (100001, 1, 'pickup',   '123 Nguyễn Huệ, Quận 1, TP.HCM',                      'Nguyễn Hoàng An', '0987000001', '2026-06-10 07:40:00+07', '2026-06-10 09:20:00+07'),
    (100001, 2, 'delivery', '45 Quốc lộ 51, Long Thành, Đồng Nai',                 'Chị Thu',         '0912345002', '2026-06-10 16:00:00+07', '2026-06-10 16:55:00+07'),
    (100002, 1, 'pickup',   'Xưởng Mộc Việt, 321 Nguyễn Trãi, Quận 5, TP.HCM',     'Mr. Hùng',        '0987000003', '2026-06-18 07:10:00+07', '2026-06-18 08:40:00+07'),
    (100002, 2, 'delivery', 'Cảng Cát Lái, Thủ Đức, TP.HCM',                        'Kho xuất CL-3',   '0912345003', '2026-06-18 15:00:00+07', '2026-06-18 15:55:00+07'),
    (100003, 1, 'pickup',   '789 Trần Hưng Đạo, Quận 5, TP.HCM',                   'Trần Thị Bích',   '0987000004', '2026-06-22 08:00:00+07', '2026-06-22 09:25:00+07'),
    (100003, 2, 'delivery', 'Chung cư Vinhomes Grand Park, Thủ Đức, TP.HCM',        'Trần Thị Bích',   '0987000004', '2026-06-22 14:30:00+07', '2026-06-22 15:25:00+07'),
    (100004, 1, 'pickup',   'Kho Saigon Foods, 456 Lê Lợi, Quận 1, TP.HCM',        'Ms. Lan',         '0987000002', '2026-07-08 07:30:00+07', '2026-07-08 08:55:00+07'),
    (100004, 2, 'delivery', 'Siêu thị BigC Gò Vấp, TP.HCM',                         'Anh Nam (nhận hàng)','0912345004', '2026-07-08 14:00:00+07', '2026-07-08 14:55:00+07'),
    (100005, 1, 'pickup',   '123 Nguyễn Huệ, Quận 1, TP.HCM',                      'Nguyễn Hoàng An', '0987000001', '2026-07-12 07:40:00+07', '2026-07-12 09:10:00+07'),
    (100005, 2, 'delivery', 'KCN Sóng Thần, Dĩ An, Bình Dương',                     'Anh Đạt',         '0912345005', '2026-07-12 15:30:00+07', '2026-07-12 16:25:00+07'),
    (100006, 1, 'pickup',   'Xưởng Mộc Việt, 321 Nguyễn Trãi, Quận 5, TP.HCM',     'Mr. Hùng',        '0987000003', '2026-07-16 08:20:00+07', '2026-07-16 09:10:00+07'),
    (100006, 2, 'delivery', 'Tòa nhà Bitexco, 2 Hải Triều, Quận 1, TP.HCM',         'Lễ tân tầng 12',  '0912345006', NULL, NULL),
    (100007, 1, 'pickup',   'Xưởng Mộc Việt, 321 Nguyễn Trãi, Quận 5, TP.HCM',     'Mr. Hùng',        '0987000003', NULL, NULL),
    (100007, 2, 'delivery', 'Tòa nhà Bitexco, 2 Hải Triều, Quận 1, TP.HCM',         'Lễ tân tầng 12',  '0912345006', NULL, NULL),
    (100008, 1, 'pickup',   'Điện máy Chợ Lớn, 190 Hồng Bàng, Quận 5, TP.HCM',     'Quầy giao nhận',  '0912345007', NULL, NULL),
    (100008, 2, 'delivery', '789 Trần Hưng Đạo, Quận 5, TP.HCM',                   'Trần Thị Bích',   '0987000004', NULL, NULL);

-- Lịch sử nhận chuyến (driver tự claim từ pool)
INSERT INTO shipment_assignment_history (shipment_id, from_driver_id, from_vehicle_id, to_driver_id, to_vehicle_id, changed_by, change_reason, changed_at) VALUES
    (100000, NULL, NULL, 100003, 100000, 100003, 'self_claim', '2026-06-05 07:00:00+07'),
    (100001, NULL, NULL, 100004, 100001, 100004, 'self_claim', '2026-06-10 07:00:00+07'),
    (100002, NULL, NULL, 100005, 100002, 100005, 'self_claim', '2026-06-18 06:30:00+07'),
    (100003, NULL, NULL, 100003, 100000, 100003, 'self_claim', '2026-06-22 07:30:00+07'),
    (100004, NULL, NULL, 100003, 100000, 100003, 'self_claim', '2026-07-08 07:00:00+07'),
    (100005, NULL, NULL, 100005, 100002, 100005, 'self_claim', '2026-07-12 07:00:00+07'),
    (100006, NULL, NULL, 100004, 100001, 100004, 'self_claim', '2026-07-16 08:00:00+07');

-- Chia doanh thu mặc định (100% chủ chuyến) cho các chuyến hoàn thành
INSERT INTO shipment_revenue_allocations (shipment_id, driver_id, share_percent, allocation_reason, created_by) VALUES
    (100000, 100003, 100, 'default_owner', 100001),
    (100001, 100004, 100, 'default_owner', 100001),
    (100002, 100005, 100, 'default_owner', 100001),
    (100003, 100003, 100, 'default_owner', 100001),
    (100004, 100003, 100, 'default_owner', 100001),
    (100005, 100005, 100, 'default_owner', 100001);

-- Ảnh bằng chứng giao hàng (chuyến hoàn thành)
INSERT INTO delivery_proofs (shipment_id, captured_by, file_url, is_realtime, captured_at) VALUES
    (100000, 100003, 'https://res.cloudinary.com/demo/image/upload/sample.jpg', TRUE, '2026-06-05 16:25:00+07'),
    (100001, 100004, 'https://res.cloudinary.com/demo/image/upload/sample.jpg', TRUE, '2026-06-10 16:55:00+07'),
    (100002, 100005, 'https://res.cloudinary.com/demo/image/upload/sample.jpg', TRUE, '2026-06-18 15:55:00+07'),
    (100003, 100003, 'https://res.cloudinary.com/demo/image/upload/sample.jpg', TRUE, '2026-06-22 15:25:00+07'),
    (100004, 100003, 'https://res.cloudinary.com/demo/image/upload/sample.jpg', TRUE, '2026-07-08 14:55:00+07'),
    (100005, 100005, 'https://res.cloudinary.com/demo/image/upload/sample.jpg', TRUE, '2026-07-12 16:25:00+07');

-- ─── 7. YÊU CẦU PHIẾU THU & PHIẾU THU ────────────────────────────────────────

INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, driver_notes, status, requested_at, processed_by, processed_at, coordinator_notes) VALUES
    (100000, 100000, 100000, 100003, 'Km thực tế 250', 'approved', '2026-06-05 16:35:00+07', 100001, '2026-06-05 17:00:00+07', 'Chốt 2.500.000đ theo km thực tế'),
    (100001, 100001, 100001, 100004, 'Km thực tế 213', 'approved', '2026-06-10 17:05:00+07', 100001, '2026-06-10 17:30:00+07', 'Chốt 3.200.000đ'),
    (100002, 100002, 100002, 100005, 'Km thực tế 275', 'approved', '2026-06-18 16:05:00+07', 100001, '2026-06-18 16:30:00+07', 'Chốt 5.500.000đ, khách nợ theo hợp đồng'),
    (100003, 100003, 100003, 100003, 'Km thực tế 180', 'approved', '2026-06-22 15:35:00+07', 100001, '2026-06-22 16:00:00+07', 'Chốt 1.800.000đ'),
    (100004, 100004, 100004, 100003, 'Km thực tế 200', 'approved', '2026-07-08 15:05:00+07', 100001, '2026-07-08 15:30:00+07', 'Chốt 2.000.000đ'),
    (100005, 100005, 100005, 100005, 'Km thực tế 200', 'approved', '2026-07-12 16:35:00+07', 100001, '2026-07-12 17:00:00+07', 'Chốt 4.000.000đ');

INSERT INTO shipment_receipts (id, shipment_id, payment_type, amount, collected_by, collected_at, notes, order_receipt_request_id, created_by) VALUES
    (100000, 100000, 'bank_transfer',  2500000, NULL,   '2026-06-06 09:00:00+07', 'Khách CK về công ty, kế toán đã xác nhận', 100000, 100001),
    (100001, 100001, 'cash_collected', 3200000, 100004, '2026-06-10 17:00:00+07', 'Tài xế thu tiền mặt của khách',            100001, 100001),
    (100002, 100002, 'client_credit',  5500000, NULL,   '2026-06-18 16:30:00+07', 'Khách nợ, hạn thanh toán 18/07',           100002, 100001),
    (100003, 100003, 'cash_collected', 1800000, 100003, '2026-06-22 15:30:00+07', 'Tài xế thu tiền mặt của khách',            100003, 100001),
    (100004, 100004, 'bank_transfer',  2000000, NULL,   '2026-07-09 10:00:00+07', 'Khách CK về công ty, kế toán đã xác nhận', 100004, 100001),
    (100005, 100005, 'cash_collected', 4000000, 100005, '2026-07-12 17:00:00+07', 'Tài xế thu tiền mặt của khách',            100005, 100001);

-- ─── 8. CÔNG NỢ & THANH TOÁN NỢ ──────────────────────────────────────────────
-- Nợ tài xế = tiền mặt thu hộ chưa nộp. Nợ khách = đơn client_credit.

INSERT INTO debts (id, debt_type, customer_id, driver_id, order_id, shipment_id, total_amount, due_date, notes, created_at, updated_at) VALUES
    (100000, 'driver',   NULL,   100004, 100001, 100001, 3200000, DATE '2026-06-25', 'Thu hộ tiền mặt chuyến #100001 — đã nộp 2.000.000, còn 1.200.000', '2026-06-10 17:00:00+07', '2026-06-20 10:00:00+07'),
    (100001, 'customer', 100002, NULL,   100002, 100002, 5500000, DATE '2026-07-18', 'Công nợ đơn nội thất — đã trả 2.000.000, còn 3.500.000',           '2026-06-18 16:30:00+07', '2026-07-05 11:00:00+07'),
    (100002, 'driver',   NULL,   100003, 100003, 100003, 1800000, DATE '2026-07-05', 'Thu hộ tiền mặt chuyến #100003 — đã nộp đủ',                       '2026-06-22 15:30:00+07', '2026-06-28 09:00:00+07'),
    (100003, 'driver',   NULL,   100005, 100005, 100005, 4000000, DATE '2026-07-25', 'Thu hộ tiền mặt chuyến #100005 — chưa nộp',                        '2026-07-12 17:00:00+07', '2026-07-12 17:00:00+07');

INSERT INTO debt_payments (debt_id, amount, payment_method, status, paid_at, confirmed_at, confirmed_by, created_by, notes) VALUES
    (100000, 2000000, 'cash',          'confirmed', '2026-06-20 09:30:00+07', '2026-06-20 10:00:00+07', 100002, 100004, 'Tài xế nộp tiền mặt đợt 1'),
    (100002, 1800000, 'cash',          'confirmed', '2026-06-28 08:30:00+07', '2026-06-28 09:00:00+07', 100002, 100003, 'Tài xế nộp đủ tiền thu hộ'),
    (100001, 2000000, 'bank_transfer', 'confirmed', '2026-07-05 10:30:00+07', '2026-07-05 11:00:00+07', 100002, 100002, 'Mộc Việt chuyển khoản trả nợ đợt 1');

-- ─── 9. CHI PHÍ TÀI XẾ ───────────────────────────────────────────────────────

-- reimbursement_status = 'settled': các khoản này đã tất toán theo sổ (bút toán chi đã ghi ở mục 15)
INSERT INTO expenses (id, shipment_id, vehicle_id, created_by, expense_type, amount, description, expense_date, status, reviewed_by, reviewed_at, reimbursement_status, reimbursed_at, created_at, updated_at) VALUES
    (100000, 100000, 100000, 100003, 'toll',   120000, 'Phí cầu đường cao tốc Long Thành',      DATE '2026-06-05', 'approved', 100001, '2026-06-05 17:00:00+07', 'settled', '2026-06-05 17:00:00+07', '2026-06-05 16:00:00+07', '2026-06-05 17:00:00+07'),
    (100001, 100003, 100000, 100003, 'fuel',   500000, 'Đổ dầu chuyến chuyển nhà',              DATE '2026-06-22', 'approved', 100001, '2026-06-22 16:00:00+07', 'settled', '2026-06-22 16:00:00+07', '2026-06-22 15:00:00+07', '2026-06-22 16:00:00+07'),
    (100002, 100005, 100002, 100005, 'fuel',   450000, 'Đổ dầu chuyến Bình Dương',              DATE '2026-07-12', 'approved', 100001, '2026-07-12 17:00:00+07', 'settled', '2026-07-12 17:00:00+07', '2026-07-12 16:00:00+07', '2026-07-12 17:00:00+07'),
    (100003, NULL,   100001, 100004, 'repair', 800000, 'Thay má phanh trước — chờ duyệt',       DATE '2026-07-15', 'pending',  NULL,   NULL,                     NULL,      NULL,                     '2026-07-15 09:00:00+07', '2026-07-15 09:00:00+07');

-- ─── 10. PHIẾU CHI ───────────────────────────────────────────────────────────

INSERT INTO payment_vouchers (id, voucher_type, amount, payee, reason, payment_method, status, created_by, approved_by, paid_by, approved_at, paid_at, created_at, updated_at) VALUES
    (100000, 'office',    1200000, 'Nhà sách Phương Nam',  'Mua giấy in, văn phòng phẩm quý 2',        'cash',          'paid',    100002, 100000, 100002, '2026-06-15 09:00:00+07', '2026-06-15 14:00:00+07', '2026-06-14 15:00:00+07', '2026-06-15 14:00:00+07'),
    (100001, 'utilities', 2500000, 'Điện lực TP.HCM',      'Tiền điện văn phòng + kho tháng 6/2026',   'bank_transfer', 'pending', 100002, NULL,   NULL,   NULL,                     NULL,                     '2026-07-15 10:00:00+07', '2026-07-15 10:00:00+07');

-- ─── 11. KPI (khớp đúng chuyến hoàn thành từng tháng) ────────────────────────
-- T6: driver1 = 2 chuyến 4.300.000 | driver2 = 1 chuyến 3.200.000 (1 sự cố) | driver3 = 1 chuyến 5.500.000
-- T7: driver1 = 1 chuyến 2.000.000 | driver3 = 1 chuyến 4.000.000 (1 sự cố)

INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue, incident_count, major_incident_count, critical_incident_count) VALUES
    (100003, 100000, 6, 2026, 2, 4300000, 0, 0, 0),
    (100004, 100001, 6, 2026, 1, 3200000, 1, 0, 0),
    (100005, 100002, 6, 2026, 1, 5500000, 0, 0, 0),
    (100003, 100000, 7, 2026, 1, 2000000, 0, 0, 0),
    (100005, 100002, 7, 2026, 1, 4000000, 1, 0, 0);

-- ─── 12. SỰ CỐ ───────────────────────────────────────────────────────────────

INSERT INTO incidents (shipment_id, vehicle_id, reported_by, incident_type, severity_level, description, location, status, resolved_by, resolution_note, occurred_at, resolved_at) VALUES
    (100001, 100001, 100004, 'traffic_jam',  'low',    'Kẹt xe kéo dài trên cao tốc Long Thành — Dầu Giây, dự kiến trễ 1 tiếng', 'Cao tốc Long Thành, Km 15', 'resolved', 100001, 'Đã báo khách, giao trễ trong biên độ cho phép', '2026-06-10 10:00:00+07', '2026-06-10 11:00:00+07'),
    (100005, 100002, 100005, 'cargo_damage', 'medium', 'Một kiện máy bị trầy xước vỏ ngoài khi hạ hàng, khách yêu cầu ghi nhận', 'KCN Sóng Thần, Bình Dương', 'open',     NULL,   NULL,                                            '2026-07-12 16:00:00+07', NULL);

-- ─── 13. NGHỈ PHÉP & ỨNG LƯƠNG ───────────────────────────────────────────────

INSERT INTO leave_requests (driver_id, leave_date, leave_type, reason, status) VALUES
    (100005, DATE '2026-06-15', 'unpaid', 'Việc gia đình',        'approved'),
    (100005, DATE '2026-06-16', 'unpaid', 'Việc gia đình',        'approved'),
    (100003, DATE '2026-07-06', 'paid',   'Nghỉ phép định kỳ',    'approved');

INSERT INTO salary_advances (id, driver_id, amount, reason, request_month, request_year, status, approved_by, approved_at, paid_by, paid_at, reject_reason, created_at, updated_at) VALUES
    (100000, 100004, 3000000, 'Ứng lương lo việc gia đình', 6, 2026, 'paid',     100000, '2026-06-25 09:00:00+07', 100002, '2026-06-25 14:00:00+07', NULL,                                  '2026-06-25 08:00:00+07', '2026-06-25 14:00:00+07'),
    (100001, 100005, 5000000, 'Ứng lương sửa nhà',          6, 2026, 'rejected', 100000, '2026-06-25 10:00:00+07', NULL,   NULL,                     'Mới vào làm, chưa đủ điều kiện ứng',  '2026-06-25 08:30:00+07', '2026-06-25 10:00:00+07');

-- ─── 14. THƯỞNG & PHÚC LỢI ───────────────────────────────────────────────────

INSERT INTO driver_bonuses (driver_id, type, year, amount, notes, beneficiary_name, beneficiary_relation, status, requested_by, approved_by, paid_by, requested_at, approved_at, paid_at) VALUES
    (100004, 'welfare_birthday', 2026, 200000, 'Sinh nhật tháng 6',                    NULL, NULL, 'paid',    100002, 100000, 100002, '2026-06-28 09:00:00+07', '2026-06-29 09:00:00+07', '2026-06-30 09:00:00+07'),
    (100003, 'special',          2026, 500000, 'Thưởng hỗ trợ giao hàng gấp cho khách VIP', NULL, NULL, 'pending', 100002, NULL,   NULL,   '2026-07-10 09:00:00+07', NULL, NULL);

-- ─── 15. SỔ NHẬT KÝ TÀI CHÍNH (khớp từng nghiệp vụ ở trên, theo thứ tự thời gian) ─
-- Quy ước TK: 1111 tiền mặt | 1121 tiền gửi NH | 131 phải thu KH | 1388 phải thu tài xế
--             141 tạm ứng | 511 doanh thu | 642 chi phí QLDN | 3388 thu hộ/chi hộ

INSERT INTO financial_transactions (event_type, debit_account, credit_account, amount, description, ref_type, ref_id, actor_id, occurred_at) VALUES
    -- 05-06/06: chuyến 100000 (Saigon Foods, CK)
    ('shipment_revenue',    '131',  '511',  2500000, 'Doanh thu chuyến #100000 — đơn #100000',                          'shipment', 100000, 100001, '2026-06-05 17:00:00+07'),
    ('pass_through_cost',   '3388', '1111', 120000,  'Chi hộ khách (toll) — chuyến #100000, duyệt chi phí tài xế khai', 'expense',  100000, 100001, '2026-06-05 17:00:00+07'),
    ('bank_receipt',        '1121', '131',  2500000, 'Khách CK về công ty — phiếu thu #100000, đơn #100000',            'shipment', 100000, 100002, '2026-06-06 09:00:00+07'),
    -- 10/06: chuyến 100001 (tiền mặt → nợ tài xế driver2)
    ('shipment_revenue',    '131',  '511',  3200000, 'Doanh thu chuyến #100001 — đơn #100001',                          'shipment', 100001, 100001, '2026-06-10 17:30:00+07'),
    ('driver_debt_created', '1388', '131',  3200000, 'Tài xế thu tiền mặt từ khách — phiếu thu #100001, đơn #100001',   'debt',     100000, 100004, '2026-06-10 17:30:00+07'),
    -- 15/06: phiếu chi văn phòng phẩm
    ('expense_recorded',    '642',  '1111', 1200000, 'Chi office — phiếu chi #100000, chi cho: Nhà sách Phương Nam',    'voucher',  100000, 100002, '2026-06-15 14:00:00+07'),
    -- 18/06: chuyến 100002 (công nợ khách Mộc Việt)
    ('shipment_revenue',    '131',  '511',  5500000, 'Doanh thu chuyến #100002 — đơn #100002',                          'shipment', 100002, 100001, '2026-06-18 16:30:00+07'),
    -- 20/06: driver2 nộp 2tr tiền thu hộ
    ('driver_debt_paid',    '1111', '1388', 2000000, 'Tài xế nộp tiền thu hộ đợt 1 — công nợ #100000',                  'debt',     100000, 100002, '2026-06-20 10:00:00+07'),
    -- 22/06: chuyến 100003 (tiền mặt → nợ tài xế driver1) + chi phí dầu
    ('shipment_revenue',    '131',  '511',  1800000, 'Doanh thu chuyến #100003 — đơn #100003',                          'shipment', 100003, 100001, '2026-06-22 16:00:00+07'),
    ('driver_debt_created', '1388', '131',  1800000, 'Tài xế thu tiền mặt từ khách — phiếu thu #100003, đơn #100003',   'debt',     100002, 100003, '2026-06-22 16:00:00+07'),
    ('expense_recorded',    '642',  '1111', 500000,  'Chi phí vận hành (fuel) — chuyến #100003, duyệt chi phí tài xế khai', 'expense', 100001, 100001, '2026-06-22 16:00:00+07'),
    -- 25/06: giải ngân ứng lương driver2
    ('advance_disbursed',   '141',  '1111', 3000000, 'Giải ngân ứng lương tháng 6/2026 — tài xế Hoàng Minh Quân',       'advance',  100000, 100002, '2026-06-25 14:00:00+07'),
    -- 28/06: driver1 nộp đủ tiền thu hộ
    ('driver_debt_paid',    '1111', '1388', 1800000, 'Tài xế nộp đủ tiền thu hộ — công nợ #100002',                     'debt',     100002, 100002, '2026-06-28 09:00:00+07'),
    -- 30/06: chi thưởng sinh nhật driver2
    ('bonus_paid',          '642',  '1111', 200000,  'Chi thưởng/phúc lợi ngoài kỳ lương (welfare_birthday) — tài xế Hoàng Minh Quân', NULL, NULL, 100002, '2026-06-30 09:00:00+07'),
    -- 05/07: Mộc Việt trả nợ đợt 1
    ('customer_payment',    '1121', '131',  2000000, 'Khách hàng thanh toán — công nợ #100001',                         'debt',     100001, 100002, '2026-07-05 11:00:00+07'),
    -- 08-09/07: chuyến 100004 (Saigon Foods, CK)
    ('shipment_revenue',    '131',  '511',  2000000, 'Doanh thu chuyến #100004 — đơn #100004',                          'shipment', 100004, 100001, '2026-07-08 15:30:00+07'),
    ('bank_receipt',        '1121', '131',  2000000, 'Khách CK về công ty — phiếu thu #100004, đơn #100004',            'shipment', 100004, 100002, '2026-07-09 10:00:00+07'),
    -- 12/07: chuyến 100005 (tiền mặt → nợ tài xế driver3) + chi phí dầu
    ('shipment_revenue',    '131',  '511',  4000000, 'Doanh thu chuyến #100005 — đơn #100005',                          'shipment', 100005, 100001, '2026-07-12 17:00:00+07'),
    ('driver_debt_created', '1388', '131',  4000000, 'Tài xế thu tiền mặt từ khách — phiếu thu #100005, đơn #100005',   'debt',     100003, 100005, '2026-07-12 17:00:00+07'),
    ('expense_recorded',    '642',  '1111', 450000,  'Chi phí vận hành (fuel) — chuyến #100005, duyệt chi phí tài xế khai', 'expense', 100002, 100001, '2026-07-12 17:00:00+07');

-- ─── 16. ĐỒNG BỘ SEQUENCE (bắt buộc sau khi insert ID tường minh) ────────────

SELECT setval(pg_get_serial_sequence('accounts','id'),               (SELECT MAX(id) FROM accounts));
SELECT setval(pg_get_serial_sequence('vehicle_groups','id'),         (SELECT MAX(id) FROM vehicle_groups));
SELECT setval(pg_get_serial_sequence('vehicles','id'),               (SELECT MAX(id) FROM vehicles));
SELECT setval(pg_get_serial_sequence('customers','id'),              (SELECT MAX(id) FROM customers));
SELECT setval(pg_get_serial_sequence('partners','id'),               (SELECT MAX(id) FROM partners));
SELECT setval(pg_get_serial_sequence('orders','id'),                 (SELECT MAX(id) FROM orders));
SELECT setval(pg_get_serial_sequence('order_shipments','id'),        (SELECT MAX(id) FROM order_shipments));
SELECT setval(pg_get_serial_sequence('order_receipt_requests','id'), (SELECT MAX(id) FROM order_receipt_requests));
SELECT setval(pg_get_serial_sequence('shipment_receipts','id'),      (SELECT MAX(id) FROM shipment_receipts));
SELECT setval(pg_get_serial_sequence('debts','id'),                  (SELECT MAX(id) FROM debts));
SELECT setval(pg_get_serial_sequence('expenses','id'),               (SELECT MAX(id) FROM expenses));
SELECT setval(pg_get_serial_sequence('payment_vouchers','id'),       (SELECT MAX(id) FROM payment_vouchers));
SELECT setval(pg_get_serial_sequence('salary_advances','id'),        (SELECT MAX(id) FROM salary_advances));
