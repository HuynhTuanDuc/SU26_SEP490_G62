-- =============================================================================
-- SEED DATA — SEP490 Logistics System
-- Chạy tự động SAU "DB script.sql" khi khởi động Docker
-- Bao gồm: dữ liệu cơ bản + data test đầy đủ cho driver module
-- =============================================================================

-- =============================================================================
-- SECTION 1: ROLES
-- =============================================================================
INSERT INTO roles (name) VALUES
    ('manager'), ('coordinator'), ('accountant'), ('driver')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- SECTION 2: ACCOUNTS
-- =============================================================================
INSERT INTO accounts (email, password_hash, role_id, is_active) VALUES
    ('admin@example.com',       crypt('admin123',  gen_salt('bf')), (SELECT id FROM roles WHERE name = 'manager'),     TRUE),
    ('ntck005@gmail.com',       crypt('coord123',  gen_salt('bf')), (SELECT id FROM roles WHERE name = 'coordinator'), TRUE),
    ('accountant@example.com',  crypt('acct123',   gen_salt('bf')), (SELECT id FROM roles WHERE name = 'accountant'),  TRUE),
    ('driver1@example.com',     crypt('driver123', gen_salt('bf')), (SELECT id FROM roles WHERE name = 'driver'),      TRUE),
    ('driver2@example.com',     crypt('driver123', gen_salt('bf')), (SELECT id FROM roles WHERE name = 'driver'),      TRUE),
    ('driver3@example.com',     crypt('driver123', gen_salt('bf')), (SELECT id FROM roles WHERE name = 'driver'),      TRUE),
    ('driver4@example.com',     crypt('driver123', gen_salt('bf')), (SELECT id FROM roles WHERE name = 'driver'),      TRUE)
ON CONFLICT (email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        role_id       = EXCLUDED.role_id,
        is_active     = EXCLUDED.is_active;

-- =============================================================================
-- SECTION 3: PROFILES
-- =============================================================================
WITH account_data AS (
    SELECT id, email FROM accounts
    WHERE email IN (
        'admin@example.com', 'ntck005@gmail.com', 'accountant@example.com',
        'driver1@example.com', 'driver2@example.com', 'driver3@example.com', 'driver4@example.com'
    )
)
INSERT INTO profiles (id, full_name, phone, role_id, dob, gender, national_id, tax_code, address, city, country, emergency_contact_name, emergency_contact_phone, notes)
VALUES
    ((SELECT id FROM account_data WHERE email = 'admin@example.com'),       'Manager',            '0901234560', (SELECT id FROM roles WHERE name = 'manager'),     DATE '1988-05-12', 'male',   '079188001111', '0101234567', '12 Nguyen Hue, District 1',        'Ho Chi Minh', 'VN', 'Tran Thi Huong', '0908888001', 'Tai khoan quan ly he thong'),
    ((SELECT id FROM account_data WHERE email = 'ntck005@gmail.com'),       'Nguyen Coordinator', '0901234561', (SELECT id FROM roles WHERE name = 'coordinator'), DATE '1992-09-21', 'female', '079192002222', '0300123456', '88 Le Loi, Hai Chau',               'Da Nang',     'VN', 'Nguyen Van Phuc', '0908888002', 'Phu trach dieu phoi mien Trung'),
    ((SELECT id FROM account_data WHERE email = 'accountant@example.com'),  'Tran Accountant',    '0901234562', (SELECT id FROM roles WHERE name = 'accountant'),  DATE '1991-03-14', 'female', '079191003333', '0312233445', '25 Vo Thi Sau, Ninh Kieu',          'Can Tho',     'VN', 'Tran Minh Chau', '0908888003', 'Theo doi doi soat va cong no'),
    ((SELECT id FROM account_data WHERE email = 'driver1@example.com'),     'Le Driver 1',        '0901234563', (SELECT id FROM roles WHERE name = 'driver'),      DATE '1995-07-08', 'male',   '079195004444', '0700112233', '101 Tran Hung Dao, Thu Duc',        'Ho Chi Minh', 'VN', 'Le Thi Lan', '0908888004', 'Tai xe tuyen noi thanh'),
    ((SELECT id FROM account_data WHERE email = 'driver2@example.com'),     'Pham Driver 2',      '0901234564', (SELECT id FROM roles WHERE name = 'driver'),      DATE '1994-11-02', 'male',   '079194005555', '0700223344', '55 Hung Vuong, Thanh Khe',          'Da Nang',     'VN', 'Pham Thi Hanh', '0908888005', 'Tai xe tuyen lien tinh'),
    ((SELECT id FROM account_data WHERE email = 'driver3@example.com'),     'Do Driver 3',        '0901234565', (SELECT id FROM roles WHERE name = 'driver'),      DATE '1997-01-18', 'other',  '079197006666', '0700334455', '7 Nguyen Van Cu, Ninh Kieu',        'Can Tho',     'VN', 'Do Quoc Minh', '0908888006', 'Tai xe hang trung'),
    ((SELECT id FROM account_data WHERE email = 'driver4@example.com'),     'Vo Driver 4',        '0901234566', (SELECT id FROM roles WHERE name = 'driver'),      DATE '1990-12-27', 'male',   '079190007777', '0700445566', '240 Le Duan, Hai Chau',             'Da Nang',     'VN', 'Vo Thi Mai', '0908888007', 'Tai xe xe tai nhe')
ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        role_id = EXCLUDED.role_id,
        dob = EXCLUDED.dob,
        gender = EXCLUDED.gender,
        national_id = EXCLUDED.national_id,
        tax_code = EXCLUDED.tax_code,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        country = EXCLUDED.country,
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        notes = EXCLUDED.notes;

-- =============================================================================
-- SECTION 4: DRIVERS
-- =============================================================================
WITH driver_seed AS (
    SELECT * FROM (VALUES
        ('driver1@example.com', 'DL123456', DATE '2027-12-31', DATE '2023-01-01', 15.00::NUMERIC, 'Le Van Duc',    '0908888004'),
        ('driver2@example.com', 'DL223456', DATE '2028-06-30', DATE '2023-07-15', 15.00::NUMERIC, 'Pham Van Khai', '0908888005'),
        ('driver3@example.com', 'DL323456', DATE '2028-11-15', DATE '2024-02-20', 15.00::NUMERIC, 'Do Thi Ngan',   '0908888006'),
        ('driver4@example.com', 'DL423456', DATE '2029-04-10', DATE '2022-09-05', 16.50::NUMERIC, 'Vo Van Binh',   '0908888007')
    ) AS seeded(email, license_number, license_expiry_date, hire_date, revenue_share_percent, ec_name, ec_phone)
)
INSERT INTO drivers (profile_id, license_number, license_expiry_date, hire_date, revenue_share_percent, emergency_contact_name, emergency_contact_phone)
SELECT p.id, ds.license_number, ds.license_expiry_date, ds.hire_date, ds.revenue_share_percent, ds.ec_name, ds.ec_phone
FROM driver_seed ds
JOIN accounts a ON a.email = ds.email
JOIN profiles p ON p.id = a.id
ON CONFLICT (profile_id) DO UPDATE
    SET emergency_contact_name  = EXCLUDED.emergency_contact_name,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone;

-- =============================================================================
-- SECTION 5: CUSTOMERS
-- =============================================================================
INSERT INTO customers (customer_type, full_name, company_name, contact_person, phone, email, address, tax_code, current_debt, notes)
SELECT 'individual', 'Nguyen Hoang Anh', NULL, 'Nguyen Hoang Anh', '0987654321', 'anh@email.com', '123 Nguyen Hue, District 1, HCMC', NULL, 0, 'Khach hang ca nhan, giao hang noi thanh'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '0987654321');

INSERT INTO customers (customer_type, full_name, company_name, contact_person, phone, email, address, tax_code, current_debt, notes)
SELECT 'business', NULL, 'ABC Logistics Co.', 'Ms. Lan Anh', '0987654322', 'contact@abclogistics.vn', '456 Le Loi, District 1, HCMC', '0300456789', 500000, 'Doi tac logistics, thanh toan hang thang'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '0987654322');

INSERT INTO customers (customer_type, full_name, company_name, contact_person, phone, email, address, tax_code, current_debt, notes)
SELECT 'individual', 'Tran Van Binh', NULL, 'Tran Van Binh', '0987654323', 'binh@email.com', '789 Tran Hung Dao, District 5, HCMC', NULL, 0, 'Khach hang ca nhan, thong xuyen van chuyen do noi that'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '0987654323');

INSERT INTO customers (customer_type, full_name, company_name, contact_person, phone, email, address, tax_code, current_debt, notes)
SELECT 'business', NULL, 'XYZ Trading Co.', 'Mr. Hung', '0987654324', 'sales@xyztrading.vn', '321 Nguyen Trai, District 5, HCMC', '0301234567', 1000000, 'Cong ty thuong mai, van chuyen hang hoa xuat nhap khau'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '0987654324');

INSERT INTO customers (customer_type, full_name, company_name, contact_person, phone, email, address, tax_code, current_debt, notes)
SELECT 'business', NULL, 'Sunrise Manufacturing', 'Mr. Tuan Kiet', '0987654325', 'kiet@sunrisemfg.vn', '50 Nguyen Van Linh, District 7, HCMC', '0302345678', 0, 'Nha may san xuat, van chuyen nguyen lieu va san pham'
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '0987654325');

-- =============================================================================
-- SECTION 6: VEHICLE GROUPS
-- =============================================================================
INSERT INTO vehicle_groups (name, max_load_weight_kg, price_per_km)
SELECT 'Small Van (1-2 tấn)', 2000, 10000
WHERE NOT EXISTS (SELECT 1 FROM vehicle_groups WHERE name = 'Small Van (1-2 tấn)');

INSERT INTO vehicle_groups (name, max_load_weight_kg, price_per_km)
SELECT 'Medium Truck (2-5 tấn)', 5000, 15000
WHERE NOT EXISTS (SELECT 1 FROM vehicle_groups WHERE name = 'Medium Truck (2-5 tấn)');

INSERT INTO vehicle_groups (name, max_load_weight_kg, price_per_km)
SELECT 'Large Truck (5-10 tấn)', 10000, 25000
WHERE NOT EXISTS (SELECT 1 FROM vehicle_groups WHERE name = 'Large Truck (5-10 tấn)');

-- =============================================================================
-- SECTION 7: VEHICLES
-- =============================================================================
INSERT INTO vehicles (plate_number, vehicle_group_id, brand, model, load_capacity_kg, manufacture_year, purchase_date, status) VALUES
    ('51-A12345', (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1),          'Toyota',  'Hiace',   2000,  2021, DATE '2021-03-15', 'active'),
    ('51-B67890', (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 1 LIMIT 1), 'Hino',    'FC',      5000,  2020, DATE '2020-08-20', 'active'),
    ('51-C11111', (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 2 LIMIT 1), 'Hyundai', 'HD120S',  10000, 2019, DATE '2019-05-10', 'maintenance'),
    ('51-D22222', (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1),          'Ford',    'Transit', 2000,  2022, DATE '2022-01-08', 'active'),
    ('51-E33333', (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1),          'Kia',     'K200',    1800,  2023, DATE '2023-04-25', 'active'),
    ('51-F44444', (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 1 LIMIT 1), 'Isuzu',   'QKR',     3500,  2021, DATE '2021-11-30', 'active')
ON CONFLICT (plate_number) DO UPDATE
    SET purchase_date = EXCLUDED.purchase_date;

-- =============================================================================
-- SECTION 8: DRIVER ↔ VEHICLE ASSIGNMENT
-- =============================================================================
WITH dvs AS (
    SELECT * FROM (VALUES
        ('driver1@example.com', '51-A12345'),
        ('driver2@example.com', '51-D22222'),
        ('driver3@example.com', '51-B67890'),
        ('driver4@example.com', '51-F44444')
    ) AS t(email, plate_number)
)
UPDATE vehicles v
SET assigned_driver_id = p.id
FROM dvs JOIN accounts a ON a.email = dvs.email JOIN profiles p ON p.id = a.id
WHERE v.plate_number = dvs.plate_number
  AND v.assigned_driver_id IS DISTINCT FROM p.id;

WITH dvs AS (
    SELECT * FROM (VALUES
        ('driver1@example.com', '51-A12345'),
        ('driver2@example.com', '51-D22222'),
        ('driver3@example.com', '51-B67890'),
        ('driver4@example.com', '51-F44444')
    ) AS t(email, plate_number)
)
UPDATE drivers d
SET vehicle_id = v.id
FROM dvs JOIN accounts a ON a.email = dvs.email JOIN profiles p ON p.id = a.id JOIN vehicles v ON v.plate_number = dvs.plate_number
WHERE d.profile_id = p.id AND d.vehicle_id IS DISTINCT FROM v.id;

-- =============================================================================
-- SECTION 9: PARTNERS
-- =============================================================================
INSERT INTO partners (company_name, short_name, contact_person, phone, email, address, tax_code, business_registration_number, payment_term_days, bank_name, bank_account_number, bank_account_name, notes)
SELECT 'Tech Express Logistics', 'Tech Express', 'Mr. Tuan', '0912345678', 'tuan@techexpress.vn', '100 Pasteur, HCMC', '0314567890', '0314567890-001', 30, 'Vietcombank', '0011008899001', 'TECH EXPRESS LOGISTICS', 'Doi tac giao nhan cong nghe'
WHERE NOT EXISTS (SELECT 1 FROM partners WHERE company_name = 'Tech Express Logistics');
UPDATE partners
SET short_name = 'Tech Express',
    contact_person = 'Mr. Tuan',
    phone = '0912345678',
    email = 'tuan@techexpress.vn',
    address = '100 Pasteur, HCMC',
    tax_code = '0314567890',
    business_registration_number = '0314567890-001',
    payment_term_days = 30,
    bank_name = 'Vietcombank',
    bank_account_number = '0011008899001',
    bank_account_name = 'TECH EXPRESS LOGISTICS',
    notes = 'Doi tac giao nhan cong nghe'
WHERE company_name = 'Tech Express Logistics';

INSERT INTO partners (company_name, short_name, contact_person, phone, email, address, tax_code, business_registration_number, payment_term_days, bank_name, bank_account_number, bank_account_name, notes)
SELECT 'Green Delivery Co.', 'Green Delivery', 'Ms. Hoa', '0912345679', 'hoa@greendelivery.vn', '200 Nguyen Trai, HCMC', '0314567891', '0314567891-002', 15, 'ACB', '220055667788', 'GREEN DELIVERY CO.', 'Doi tac giao hang thuong xuyen'
WHERE NOT EXISTS (SELECT 1 FROM partners WHERE company_name = 'Green Delivery Co.');
UPDATE partners
SET short_name = 'Green Delivery',
    contact_person = 'Ms. Hoa',
    phone = '0912345679',
    email = 'hoa@greendelivery.vn',
    address = '200 Nguyen Trai, HCMC',
    tax_code = '0314567891',
    business_registration_number = '0314567891-002',
    payment_term_days = 15,
    bank_name = 'ACB',
    bank_account_number = '220055667788',
    bank_account_name = 'GREEN DELIVERY CO.',
    notes = 'Doi tac giao hang thuong xuyen'
WHERE company_name = 'Green Delivery Co.';

INSERT INTO partners (company_name, short_name, contact_person, phone, email, address, tax_code, business_registration_number, payment_term_days, bank_name, bank_account_number, bank_account_name, notes)
SELECT 'FastFreight Vietnam', 'FastFreight', 'Mr. Long', '0912345680', 'long@fastfreight.vn', '300 Landmark 81, HCMC', '0314567892', '0314567892-003', 45, 'BIDV', '991122334455', 'FASTFREIGHT VIETNAM', 'Doi tac van tai duong dai'
WHERE NOT EXISTS (SELECT 1 FROM partners WHERE company_name = 'FastFreight Vietnam');
UPDATE partners
SET short_name = 'FastFreight',
    contact_person = 'Mr. Long',
    phone = '0912345680',
    email = 'long@fastfreight.vn',
    address = '300 Landmark 81, HCMC',
    tax_code = '0314567892',
    business_registration_number = '0314567892-003',
    payment_term_days = 45,
    bank_name = 'BIDV',
    bank_account_number = '991122334455',
    bank_account_name = 'FASTFREIGHT VIETNAM',
    notes = 'Doi tac van tai duong dai'
WHERE company_name = 'FastFreight Vietnam';

-- =============================================================================
-- SECTION 10: BASE ORDERS (open + completed)
-- vehicle_group_id lưu trên orders, KHÔNG phải order_shipments
-- =============================================================================

-- Order 1: available trong trip pool
INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price,
                    payment_type, vehicle_group_id, derived_status, notes)
SELECT c.id, p.id, 'Electronics Package', 50.0, 500000, 'cash',
       (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1), 'open', 'Fragile - Handle with care'
FROM customers c
JOIN profiles p ON p.role_id = (SELECT id FROM roles WHERE name = 'coordinator')
WHERE c.phone = '0987654321'
  AND NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Electronics Package')
LIMIT 1;

-- Order 2: đã hoàn thành — driver history
INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price,
                    payment_type, vehicle_group_id, derived_status, notes)
SELECT c.id, p.id, 'Furniture Set', 200.0, 1500000, 'bank_transfer',
       (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1), 'completed', 'Large furniture item'
FROM customers c
JOIN profiles p ON p.role_id = (SELECT id FROM roles WHERE name = 'coordinator')
WHERE c.phone = '0987654322'
  AND NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Furniture Set')
LIMIT 1;

-- =============================================================================
-- SECTION 11: BASE SHIPMENTS + TRIP STOPS
-- =============================================================================

-- Shipment 1: available
INSERT INTO order_shipments (order_id, shipment_index, cargo_weight_kg, estimated_price, status)
SELECT o.id, 1, o.cargo_weight_kg, o.total_estimated_price, 'available'
FROM orders o
WHERE o.cargo_name = 'Electronics Package'
  AND NOT EXISTS (SELECT 1 FROM order_shipments os WHERE os.order_id = o.id AND os.shipment_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone)
SELECT os.id, 1, 'pickup', '123 Nguyen Hue, HCMC', 'Nguyen Hoang Anh', '0987654321'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Electronics Package' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address)
SELECT os.id, 2, 'delivery', '456 Le Loi, HCMC'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Electronics Package' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 2);

-- Shipment 2: completed — driver1
INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, cargo_weight_kg, estimated_price,
                              status, claimed_at, completed_at)
SELECT o.id, 1, drv.id, o.cargo_weight_kg, o.total_estimated_price, 'completed',
       NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'
FROM orders o
JOIN accounts a ON a.email = 'driver1@example.com'
JOIN profiles drv ON drv.id = a.id
WHERE o.cargo_name = 'Furniture Set'
  AND NOT EXISTS (SELECT 1 FROM order_shipments os WHERE os.order_id = o.id AND os.shipment_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
SELECT os.id, 1, 'pickup', '789 Tran Hung Dao, HCMC', 'Tran Van Binh', '0987654323', NOW() - INTERVAL '2 days'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Furniture Set' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, completed_at)
SELECT os.id, 2, 'delivery', '321 Nguyen Trai, HCMC', NOW() - INTERVAL '1 day'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Furniture Set' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 2);

-- =============================================================================
-- SECTION 12: SHIPMENT ASSIGNMENTS
-- =============================================================================
INSERT INTO shipment_assignments (shipment_id, driver_id, vehicle_id, assignment_type, assigned_at)
SELECT os.id, p.id, v.id, 'coordinator_assign', NOW()
FROM order_shipments os
JOIN profiles p ON p.role_id = (SELECT id FROM roles WHERE name = 'driver')
JOIN accounts a ON a.id = p.id AND a.email = 'driver1@example.com'
JOIN vehicles v ON v.plate_number = '51-A12345'
WHERE os.status = 'available'
  AND NOT EXISTS (SELECT 1 FROM shipment_assignments sa WHERE sa.shipment_id = os.id)
LIMIT 1;

-- =============================================================================
-- SECTION 13: BONUS RULES
-- =============================================================================

INSERT INTO bonus_rules (vehicle_group_id, title, bonus_type, reward_amount, conditions_json)
SELECT (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1),
       'Thưởng vượt KPI — Small Van', 'kpi', 2000000, '{"min_revenue": 50000000}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM bonus_rules
    WHERE bonus_type = 'kpi' AND vehicle_group_id = (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1));

INSERT INTO bonus_rules (vehicle_group_id, title, bonus_type, reward_amount, conditions_json)
SELECT (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 1 LIMIT 1),
       'Thưởng vượt KPI — Medium Truck', 'kpi', 2000000, '{"min_revenue": 65000000}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM bonus_rules
    WHERE bonus_type = 'kpi' AND vehicle_group_id = (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 1 LIMIT 1));

INSERT INTO bonus_rules (vehicle_group_id, title, bonus_type, reward_amount, conditions_json)
SELECT (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 2 LIMIT 1),
       'Thưởng vượt KPI — Large Truck', 'kpi', 2000000, '{"min_revenue": 70000000}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM bonus_rules
    WHERE bonus_type = 'kpi' AND vehicle_group_id = (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 2 LIMIT 1));

INSERT INTO bonus_rules (vehicle_group_id, title, bonus_type, reward_amount, conditions_json)
SELECT (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1),
       'Lái xe xuất sắc nhất tháng — Small Van', 'top_revenue', 1000000, '{"rank": 1}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM bonus_rules
    WHERE bonus_type = 'top_revenue' AND vehicle_group_id = (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1));

INSERT INTO bonus_rules (vehicle_group_id, title, bonus_type, reward_amount, conditions_json)
SELECT (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 1 LIMIT 1),
       'Lái xe xuất sắc nhất tháng — Medium Truck', 'top_revenue', 1000000, '{"rank": 1}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM bonus_rules
    WHERE bonus_type = 'top_revenue' AND vehicle_group_id = (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 1 LIMIT 1));

INSERT INTO bonus_rules (vehicle_group_id, title, bonus_type, reward_amount, conditions_json)
SELECT (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 2 LIMIT 1),
       'Lái xe xuất sắc nhất tháng — Large Truck', 'top_revenue', 1000000, '{"rank": 1}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM bonus_rules
    WHERE bonus_type = 'top_revenue' AND vehicle_group_id = (SELECT id FROM vehicle_groups ORDER BY id ASC OFFSET 2 LIMIT 1));

-- =============================================================================
-- SECTION 14: KPI RECORDS (base)
-- =============================================================================
INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue)
SELECT p.id, (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1), 5, 2026, 12, 15000000
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver1@example.com'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 15: MAINTENANCE
-- =============================================================================
INSERT INTO maintenance_records (vehicle_id, maintenance_type, description, cost,
                                  maintenance_date, performed_by, status, started_at, created_at, updated_at)
SELECT v.id, 'scheduled', 'Oil change, filter replacement', 500000, '2026-05-15',
       p.id, 'open', NOW() - INTERVAL '24 days', NOW() - INTERVAL '24 days', NOW() - INTERVAL '24 days'
FROM vehicles v
JOIN accounts a ON a.email = 'driver3@example.com'
JOIN profiles p ON p.id = a.id
WHERE v.plate_number = '51-C11111'
  AND NOT EXISTS (SELECT 1 FROM maintenance_records mr WHERE mr.vehicle_id = v.id AND mr.maintenance_date = '2026-05-15');

INSERT INTO vehicle_status_history (vehicle_id, action_type, from_status, to_status, note, created_at)
SELECT v.id, 'send_to_maintenance', 'active', 'maintenance', 'Seeded maintenance workflow', NOW() - INTERVAL '24 days'
FROM vehicles v
WHERE v.plate_number = '51-C11111'
  AND NOT EXISTS (SELECT 1 FROM vehicle_status_history vsh WHERE vsh.vehicle_id = v.id AND vsh.action_type = 'send_to_maintenance');

-- =============================================================================
-- SECTION 16: RECEIPT REQUESTS (phiếu thu pending — coordinator xử lý)
-- =============================================================================
DO $$
DECLARE
    v_coordinator_id   INT;
    v_driver_id        INT;
    v_customer_id      INT;
    v_vehicle_id       INT;
    v_vehicle_group_id INT;
    v_order_id         INT;
    v_shipment_id      INT;
BEGIN
    SELECT p.id INTO v_coordinator_id
    FROM profiles p JOIN accounts a ON a.id = p.id
    WHERE a.email = 'ntck005@gmail.com';

    SELECT p.id INTO v_driver_id
    FROM profiles p JOIN accounts a ON a.id = p.id
    WHERE a.email = 'driver1@example.com';

    SELECT v.id, v.vehicle_group_id INTO v_vehicle_id, v_vehicle_group_id
    FROM vehicles v
    WHERE v.plate_number = '51-A12345';

    SELECT c.id INTO v_customer_id
    FROM customers c
    WHERE c.phone = '0987654322';

    IF NOT EXISTS (
        SELECT 1 FROM orders WHERE cargo_name = 'Receipt Pending Demo: Showroom Cabinets'
    ) THEN
        INSERT INTO orders (
            customer_id, created_by, cargo_name, cargo_weight_kg,
            total_estimated_price, payment_type, vehicle_group_id,
            derived_status, notes
        )
        VALUES (
            v_customer_id, v_coordinator_id, 'Receipt Pending Demo: Showroom Cabinets', 180.0,
            220000, 'cash', v_vehicle_group_id,
            'completed', 'Completed shipment waiting for coordinator receipt publishing'
        )
        RETURNING id INTO v_order_id;
    ELSE
        SELECT id INTO v_order_id
        FROM orders
        WHERE cargo_name = 'Receipt Pending Demo: Showroom Cabinets'
        LIMIT 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM order_shipments WHERE order_id = v_order_id AND shipment_index = 1
    ) THEN
        INSERT INTO order_shipments (
            order_id, shipment_index, owner_driver_id, vehicle_id,
            cargo_name, cargo_weight_kg, estimated_price, estimated_distance_km,
            status, claimed_at, picking_at, transit_at, arrived_at, completed_at, notes
        )
        VALUES (
            v_order_id, 1, v_driver_id, v_vehicle_id,
            'Showroom Cabinets', 180.0, 220000, 22.0,
            'completed',
            NOW() - INTERVAL '30 hours',
            NOW() - INTERVAL '29 hours',
            NOW() - INTERVAL '27 hours',
            NOW() - INTERVAL '25 hours',
            NOW() - INTERVAL '24 hours',
            'Driver completed shipment and submitted actual km for receipt request'
        )
        RETURNING id INTO v_shipment_id;
    ELSE
        SELECT id INTO v_shipment_id
        FROM order_shipments
        WHERE order_id = v_order_id AND shipment_index = 1
        LIMIT 1;

        UPDATE order_shipments
        SET owner_driver_id = v_driver_id,
            vehicle_id = v_vehicle_id,
            cargo_name = 'Showroom Cabinets',
            cargo_weight_kg = 180.0,
            estimated_price = 220000,
            estimated_distance_km = 22.0,
            status = 'completed',
            notes = 'Driver completed shipment and submitted actual km for receipt request'
        WHERE id = v_shipment_id;
    END IF;

    INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
    SELECT v_shipment_id, 1, 'pickup', '12 Nguyen Van Linh, District 7', 'Warehouse Team', '0901010101', NOW() - INTERVAL '26 hours'
    WHERE NOT EXISTS (
        SELECT 1 FROM trip_stops WHERE shipment_id = v_shipment_id AND stop_index = 1
    );

    INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, arrived_at, completed_at)
    SELECT v_shipment_id, 2, 'delivery', '88 Le Thanh Ton, District 1', 'Showroom Admin', '0902020202',
           NOW() - INTERVAL '25 hours', NOW() - INTERVAL '24 hours'
    WHERE NOT EXISTS (
        SELECT 1 FROM trip_stops WHERE shipment_id = v_shipment_id AND stop_index = 2
    );

    INSERT INTO shipment_assignments (shipment_id, driver_id, vehicle_id, assignment_type, assigned_by, assigned_at, accepted_at, completed_at)
    SELECT v_shipment_id, v_driver_id, v_vehicle_id, 'coordinator_assign', v_coordinator_id,
           NOW() - INTERVAL '30 hours', NOW() - INTERVAL '30 hours', NOW() - INTERVAL '24 hours'
    WHERE NOT EXISTS (
        SELECT 1 FROM shipment_assignments WHERE shipment_id = v_shipment_id AND driver_id = v_driver_id
    );

    INSERT INTO delivery_proofs (shipment_id, captured_by, file_url, is_realtime, captured_at)
    SELECT v_shipment_id, v_driver_id, 'https://res.cloudinary.com/demo/image/upload/receipt-pending-proof.jpg', TRUE, NOW() - INTERVAL '24 hours'
    WHERE NOT EXISTS (
        SELECT 1 FROM delivery_proofs WHERE shipment_id = v_shipment_id
    );

    UPDATE order_shipments
    SET actual_distance_km = 23.7,
        updated_at = NOW()
    WHERE id = v_shipment_id;

    INSERT INTO order_receipt_requests (requesting_shipment_id, order_id, driver_id, status, requested_at)
    SELECT v_shipment_id, v_order_id, v_driver_id, 'pending', NOW() - INTERVAL '90 minutes'
    WHERE NOT EXISTS (
        SELECT 1 FROM order_receipt_requests WHERE order_id = v_order_id
    );

    INSERT INTO expenses (shipment_id, vehicle_id, created_by, updated_by, expense_type, amount, description, expense_date)
    SELECT v_shipment_id, v_vehicle_id, v_coordinator_id, v_coordinator_id, 'toll', 45000,
           'Seeded toll cost for pending receipt review', CURRENT_DATE - 1
    WHERE NOT EXISTS (
        SELECT 1 FROM expenses
        WHERE shipment_id = v_shipment_id AND description = 'Seeded toll cost for pending receipt review'
    );

    INSERT INTO expenses (shipment_id, vehicle_id, created_by, updated_by, expense_type, amount, description, expense_date)
    SELECT v_shipment_id, v_vehicle_id, v_coordinator_id, v_coordinator_id, 'parking', 20000,
           'Seeded parking cost for pending receipt review', CURRENT_DATE - 1
    WHERE NOT EXISTS (
        SELECT 1 FROM expenses
        WHERE shipment_id = v_shipment_id AND description = 'Seeded parking cost for pending receipt review'
    );
END $$;

-- =============================================================================
-- SECTION 16B: RECEIPT REQUEST APPROVED DEMO (coordinator da publish)
-- =============================================================================
DO $$
DECLARE
    v_coordinator_id    INT;
    v_driver_id         INT;
    v_customer_id       INT;
    v_vehicle_id        INT;
    v_vehicle_group_id  INT;
    v_price_per_km      NUMERIC(12,2);
    v_estimated_km      NUMERIC(10,2) := 52.0;
    v_actual_km         NUMERIC(10,2) := 54.2;
    v_actual_income     NUMERIC(12,2);
    v_order_id          INT;
    v_shipment_id       INT;
    v_request_id        INT;
    v_receipt_id        INT;
BEGIN
    SELECT p.id INTO v_coordinator_id
    FROM profiles p JOIN accounts a ON a.id = p.id
    WHERE a.email = 'ntck005@gmail.com';

    SELECT p.id INTO v_driver_id
    FROM profiles p JOIN accounts a ON a.id = p.id
    WHERE a.email = 'driver4@example.com';

    SELECT v.id, v.vehicle_group_id, vg.price_per_km
    INTO v_vehicle_id, v_vehicle_group_id, v_price_per_km
    FROM vehicles v
    JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
    WHERE v.plate_number = '51-F44444';

    SELECT c.id INTO v_customer_id
    FROM customers c
    WHERE c.phone = '0987654324';

    v_actual_income := v_actual_km * v_price_per_km;

    IF NOT EXISTS (
        SELECT 1 FROM orders WHERE cargo_name = 'Receipt Approved Demo: Construction AC Units'
    ) THEN
        INSERT INTO orders (
            customer_id, created_by, cargo_name, cargo_weight_kg,
            total_estimated_price, total_actual_price, payment_type, vehicle_group_id,
            derived_status, notes
        )
        VALUES (
            v_customer_id, v_coordinator_id, 'Receipt Approved Demo: Construction AC Units', 320.0,
            v_estimated_km * v_price_per_km, v_actual_income, 'bank_transfer', v_vehicle_group_id,
            'completed', 'Coordinator already published receipt based on driver actual km'
        )
        RETURNING id INTO v_order_id;
    ELSE
        SELECT id INTO v_order_id
        FROM orders
        WHERE cargo_name = 'Receipt Approved Demo: Construction AC Units'
        LIMIT 1;

        UPDATE orders
        SET total_estimated_price = v_estimated_km * v_price_per_km,
            total_actual_price = v_actual_income,
            vehicle_group_id = v_vehicle_group_id,
            payment_type = 'bank_transfer',
            derived_status = 'completed',
            notes = 'Coordinator already published receipt based on driver actual km'
        WHERE id = v_order_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM order_shipments WHERE order_id = v_order_id AND shipment_index = 1
    ) THEN
        INSERT INTO order_shipments (
            order_id, shipment_index, owner_driver_id, vehicle_id,
            cargo_name, cargo_weight_kg, estimated_price, estimated_distance_km,
            actual_distance_km, actual_price, status,
            claimed_at, picking_at, transit_at, arrived_at, completed_at, notes
        )
        VALUES (
            v_order_id, 1, v_driver_id, v_vehicle_id,
            'Construction AC Units', 320.0, v_estimated_km * v_price_per_km, v_estimated_km,
            v_actual_km, v_actual_income, 'completed',
            NOW() - INTERVAL '18 hours',
            NOW() - INTERVAL '17 hours',
            NOW() - INTERVAL '15 hours',
            NOW() - INTERVAL '13 hours',
            NOW() - INTERVAL '12 hours',
            'Approved receipt demo with actual distance and saved actual income'
        )
        RETURNING id INTO v_shipment_id;
    ELSE
        SELECT id INTO v_shipment_id
        FROM order_shipments
        WHERE order_id = v_order_id AND shipment_index = 1
        LIMIT 1;

        UPDATE order_shipments
        SET owner_driver_id = v_driver_id,
            vehicle_id = v_vehicle_id,
            cargo_name = 'Construction AC Units',
            cargo_weight_kg = 320.0,
            estimated_price = v_estimated_km * v_price_per_km,
            estimated_distance_km = v_estimated_km,
            actual_distance_km = v_actual_km,
            actual_price = v_actual_income,
            status = 'completed',
            notes = 'Approved receipt demo with actual distance and saved actual income'
        WHERE id = v_shipment_id;
    END IF;

    INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
    SELECT v_shipment_id, 1, 'pickup', '05 Quang Trung, Go Vap', 'Site Warehouse', '0903030303', NOW() - INTERVAL '14 hours'
    WHERE NOT EXISTS (
        SELECT 1 FROM trip_stops WHERE shipment_id = v_shipment_id AND stop_index = 1
    );

    INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, arrived_at, completed_at)
    SELECT v_shipment_id, 2, 'delivery', '250 Dien Bien Phu, Binh Thanh', 'Project Supervisor', '0904040404',
           NOW() - INTERVAL '13 hours', NOW() - INTERVAL '12 hours'
    WHERE NOT EXISTS (
        SELECT 1 FROM trip_stops WHERE shipment_id = v_shipment_id AND stop_index = 2
    );

    INSERT INTO shipment_assignments (shipment_id, driver_id, vehicle_id, assignment_type, assigned_by, assigned_at, accepted_at, completed_at)
    SELECT v_shipment_id, v_driver_id, v_vehicle_id, 'coordinator_assign', v_coordinator_id,
           NOW() - INTERVAL '18 hours', NOW() - INTERVAL '18 hours', NOW() - INTERVAL '12 hours'
    WHERE NOT EXISTS (
        SELECT 1 FROM shipment_assignments WHERE shipment_id = v_shipment_id AND driver_id = v_driver_id
    );

    INSERT INTO delivery_proofs (shipment_id, captured_by, file_url, is_realtime, captured_at)
    SELECT v_shipment_id, v_driver_id, 'https://res.cloudinary.com/demo/image/upload/receipt-approved-proof.jpg', TRUE, NOW() - INTERVAL '12 hours'
    WHERE NOT EXISTS (
        SELECT 1 FROM delivery_proofs WHERE shipment_id = v_shipment_id
    );

    SELECT id INTO v_request_id
    FROM order_receipt_requests
    WHERE order_id = v_order_id
    LIMIT 1;

    IF v_request_id IS NULL THEN
        INSERT INTO order_receipt_requests (
            requesting_shipment_id, order_id, driver_id, status, requested_at,
            processed_by, processed_at, coordinator_notes
        )
        VALUES (
            v_shipment_id, v_order_id, v_driver_id, 'approved', NOW() - INTERVAL '11 hours',
            v_coordinator_id, NOW() - INTERVAL '10 hours',
            'Published by coordinator after checking actual km against vehicle group pricing'
        )
        RETURNING id INTO v_request_id;
    ELSE
        UPDATE order_receipt_requests
        SET driver_id = v_driver_id,
            status = 'approved',
            processed_by = v_coordinator_id,
            processed_at = NOW() - INTERVAL '10 hours',
            coordinator_notes = 'Published by coordinator after checking actual km against vehicle group pricing'
        WHERE id = v_request_id;
    END IF;

    SELECT id INTO v_receipt_id
    FROM shipment_receipts
    WHERE order_receipt_request_id = v_request_id
    LIMIT 1;

    IF v_receipt_id IS NULL THEN
        INSERT INTO shipment_receipts (
            shipment_id, payment_type, amount, collected_by, collected_at,
            notes, order_receipt_request_id, created_at, created_by
        )
        VALUES (
            v_shipment_id, 'bank_transfer', v_actual_income, NULL, NOW() - INTERVAL '10 hours',
            'Seeded approved receipt using actual km from driver request', v_request_id, NOW() - INTERVAL '10 hours', v_coordinator_id
        )
        RETURNING id INTO v_receipt_id;
    ELSE
        UPDATE shipment_receipts
        SET shipment_id = v_shipment_id,
            payment_type = 'bank_transfer',
            amount = v_actual_income,
            collected_by = NULL,
            collected_at = NOW() - INTERVAL '10 hours',
            notes = 'Seeded approved receipt using actual km from driver request',
            created_by = v_coordinator_id
        WHERE id = v_receipt_id;
    END IF;

    INSERT INTO expenses (shipment_id, vehicle_id, created_by, updated_by, expense_type, amount, description, expense_date)
    SELECT v_shipment_id, v_vehicle_id, v_coordinator_id, v_coordinator_id, 'fuel', 180000,
           'Seeded fuel expense for approved receipt demo', CURRENT_DATE
    WHERE NOT EXISTS (
        SELECT 1 FROM expenses
        WHERE shipment_id = v_shipment_id AND description = 'Seeded fuel expense for approved receipt demo'
    );

    INSERT INTO expenses (shipment_id, vehicle_id, created_by, updated_by, expense_type, amount, description, expense_date)
    SELECT v_shipment_id, v_vehicle_id, v_coordinator_id, v_coordinator_id, 'toll', 65000,
           'Seeded toll expense for approved receipt demo', CURRENT_DATE
    WHERE NOT EXISTS (
        SELECT 1 FROM expenses
        WHERE shipment_id = v_shipment_id AND description = 'Seeded toll expense for approved receipt demo'
    );

    UPDATE orders
    SET total_actual_price = (
            SELECT COALESCE(SUM(COALESCE(os.actual_price, 0)), 0)
            FROM order_shipments os
            WHERE os.order_id = v_order_id
        ),
        updated_at = NOW()
    WHERE id = v_order_id;
END $$;

-- =============================================================================
-- SECTION 17: TEST SCENARIO — Multi-Trip Order (3 chuyến cùng đơn)
-- Driver tự claim từng chuyến riêng lẻ
-- =============================================================================

INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg,
                    total_estimated_price, payment_type, vehicle_group_id, derived_status, notes)
SELECT c.id, p.id, 'Multi-Trip: Hàng điện tử 3 chuyến', 150.0, 2100000, 'bank_transfer',
       (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1), 'open', '3 chuyến giao cho 3 điểm khác nhau'
FROM customers c, profiles p
JOIN accounts a ON a.id = p.id
WHERE c.phone = '0987654322'
  AND a.email = 'ntck005@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Multi-Trip: Hàng điện tử 3 chuyến')
LIMIT 1;

-- Trip 1 / 3
INSERT INTO order_shipments (order_id, shipment_index, cargo_name, cargo_weight_kg, estimated_price, status)
SELECT o.id, 1, 'Laptop Dell', 50.0, 700000, 'available'
FROM orders o WHERE o.cargo_name = 'Multi-Trip: Hàng điện tử 3 chuyến'
  AND NOT EXISTS (SELECT 1 FROM order_shipments os WHERE os.order_id = o.id AND os.shipment_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone)
SELECT os.id, 1, 'pickup', 'Kho FPT - KCN Tân Thuận, Q.7', 'Ms. Lan', '0903333333'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Multi-Trip: Hàng điện tử 3 chuyến' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone)
SELECT os.id, 2, 'delivery', '100 Nguyễn Thị Minh Khai, Q.1', 'Mr. Bình', '0904444444'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Multi-Trip: Hàng điện tử 3 chuyến' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 2);

-- Trip 2 / 3
INSERT INTO order_shipments (order_id, shipment_index, cargo_name, cargo_weight_kg, estimated_price, status)
SELECT o.id, 2, 'Màn hình Samsung', 60.0, 700000, 'available'
FROM orders o WHERE o.cargo_name = 'Multi-Trip: Hàng điện tử 3 chuyến'
  AND NOT EXISTS (SELECT 1 FROM order_shipments os WHERE os.order_id = o.id AND os.shipment_index = 2);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone)
SELECT os.id, 1, 'pickup', 'Kho FPT - KCN Tân Thuận, Q.7', 'Ms. Lan', '0903333333'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Multi-Trip: Hàng điện tử 3 chuyến' AND os.shipment_index = 2
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone)
SELECT os.id, 2, 'delivery', '200 Lý Tự Trọng, Q.1', 'Ms. Hương', '0905555555'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Multi-Trip: Hàng điện tử 3 chuyến' AND os.shipment_index = 2
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 2);

-- Trip 3 / 3
INSERT INTO order_shipments (order_id, shipment_index, cargo_name, cargo_weight_kg, estimated_price, status)
SELECT o.id, 3, 'Server rack', 40.0, 700000, 'available'
FROM orders o WHERE o.cargo_name = 'Multi-Trip: Hàng điện tử 3 chuyến'
  AND NOT EXISTS (SELECT 1 FROM order_shipments os WHERE os.order_id = o.id AND os.shipment_index = 3);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone)
SELECT os.id, 1, 'pickup', 'Kho FPT - KCN Tân Thuận, Q.7', 'Ms. Lan', '0903333333'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Multi-Trip: Hàng điện tử 3 chuyến' AND os.shipment_index = 3
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone)
SELECT os.id, 2, 'delivery', '300 Đinh Tiên Hoàng, Bình Thạnh', 'Mr. Sơn', '0906666666'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Multi-Trip: Hàng điện tử 3 chuyến' AND os.shipment_index = 3
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 2);

-- =============================================================================
-- SECTION 18: TEST SCENARIO — Shipment ARRIVED (chờ driver upload proof)
-- =============================================================================

INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg,
                    total_estimated_price, payment_type, vehicle_group_id, derived_status, notes)
SELECT c.id, p.id, 'Arrived Test: Giao ngay hôm nay', 80.0, 650000, 'cash',
       (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1), 'open', 'Driver đã đến điểm giao, chờ xác nhận'
FROM customers c, profiles p
JOIN accounts a ON a.id = p.id
WHERE c.phone = '0987654321'
  AND a.email = 'ntck005@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Arrived Test: Giao ngay hôm nay')
LIMIT 1;

INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id,
                              cargo_name, cargo_weight_kg, estimated_price,
                              status, claimed_at, picking_at, transit_at, arrived_at)
SELECT o.id, 1, drv.id, v.id,
       'Đồ gia dụng', 80.0, 650000,
       'arrived',
       NOW() - INTERVAL '4 hours',
       NOW() - INTERVAL '3 hours',
       NOW() - INTERVAL '2 hours',
       NOW() - INTERVAL '10 minutes'
FROM orders o
JOIN accounts a ON a.email = 'driver1@example.com'
JOIN profiles drv ON drv.id = a.id
JOIN vehicles v ON v.plate_number = '51-A12345'
WHERE o.cargo_name = 'Arrived Test: Giao ngay hôm nay'
  AND NOT EXISTS (SELECT 1 FROM order_shipments os WHERE os.order_id = o.id AND os.shipment_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, arrived_at, completed_at)
SELECT os.id, 1, 'pickup', '789 Cách Mạng Tháng 8, Q.3', 'Chị Mai', '0907777777',
       NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Arrived Test: Giao ngay hôm nay' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, arrived_at)
SELECT os.id, 2, 'delivery', '50 Hoàng Diệu, Q.4', 'Anh Khoa', '0908888888',
       NOW() - INTERVAL '10 minutes'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Arrived Test: Giao ngay hôm nay' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 2);

INSERT INTO shipment_assignments (shipment_id, driver_id, vehicle_id, assignment_type, assigned_at, accepted_at)
SELECT os.id, drv.id, v.id, 'self_claim', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours'
FROM order_shipments os
JOIN orders o ON o.id = os.order_id
JOIN accounts a ON a.email = 'driver1@example.com'
JOIN profiles drv ON drv.id = a.id
JOIN vehicles v ON v.plate_number = '51-A12345'
WHERE o.cargo_name = 'Arrived Test: Giao ngay hôm nay' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM shipment_assignments sa WHERE sa.shipment_id = os.id AND sa.driver_id = drv.id);

-- =============================================================================
-- SECTION 19: TEST SCENARIO — Shipment FAILED (driver2, test hoàn hàng)
-- =============================================================================

INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg,
                    total_estimated_price, payment_type, vehicle_group_id, derived_status, notes)
SELECT c.id, p.id, 'Failed Test: Khách từ chối nhận', 120.0, 500000, 'cash',
       (SELECT id FROM vehicle_groups ORDER BY id ASC LIMIT 1), 'open', 'Khách báo bận, không ra nhận hàng'
FROM customers c, profiles p
JOIN accounts a ON a.id = p.id
WHERE c.phone = '0987654324'
  AND a.email = 'ntck005@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Failed Test: Khách từ chối nhận')
LIMIT 1;

INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id,
                              cargo_name, cargo_weight_kg, estimated_price,
                              status, cancel_reason,
                              claimed_at, picking_at, transit_at, arrived_at, failed_at)
SELECT o.id, 1, drv2.id, v2.id,
       'Thực phẩm đông lạnh', 120.0, 500000,
       'failed', 'Khách từ chối nhận hàng, không liên lạc được',
       NOW() - INTERVAL '6 hours',
       NOW() - INTERVAL '5 hours',
       NOW() - INTERVAL '4 hours',
       NOW() - INTERVAL '1 hour',
       NOW() - INTERVAL '30 minutes'
FROM orders o
JOIN accounts a ON a.email = 'driver2@example.com'
JOIN profiles drv2 ON drv2.id = a.id
JOIN vehicles v2 ON v2.plate_number = '51-D22222'
WHERE o.cargo_name = 'Failed Test: Khách từ chối nhận'
  AND NOT EXISTS (SELECT 1 FROM order_shipments os WHERE os.order_id = o.id AND os.shipment_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, arrived_at, completed_at)
SELECT os.id, 1, 'pickup', 'Kho lạnh - 88 Bến Vân Đồn, Q.4',
       NOW() - INTERVAL '5 hours', NOW() - INTERVAL '4 hours'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Failed Test: Khách từ chối nhận' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 1);

INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, arrived_at)
SELECT os.id, 2, 'delivery', '22 Nguyễn Văn Cừ, Q.5', NOW() - INTERVAL '1 hour'
FROM order_shipments os JOIN orders o ON o.id = os.order_id
WHERE o.cargo_name = 'Failed Test: Khách từ chối nhận' AND os.shipment_index = 1
  AND NOT EXISTS (SELECT 1 FROM trip_stops ts WHERE ts.shipment_id = os.id AND ts.stop_index = 2);

-- =============================================================================
-- SECTION 20: TEST SCENARIO — Driver Debt (driver1 đã thu tiền mặt)
-- Test: GET /api/debts/me, POST /api/debts/:id/remit
-- =============================================================================
DO $$
DECLARE
    v_shipment_id INT;
    v_driver_id   INT;
    v_order_id    INT;
    v_payment_id  INT;
    v_vehicle_id  INT;
    v_group_id    INT;
    v_customer_id INT;
    v_coord_id    INT;
BEGIN
    SELECT p.id INTO v_driver_id
    FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver1@example.com';

    SELECT p.id INTO v_coord_id
    FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'ntck005@gmail.com';

    SELECT id, vehicle_group_id INTO v_vehicle_id, v_group_id
    FROM vehicles
    WHERE plate_number = '51-A12345';

    SELECT id INTO v_customer_id
    FROM customers
    WHERE phone = '0987654321';

    IF NOT EXISTS (
        SELECT 1 FROM orders WHERE cargo_name = 'Driver Debt Demo: Cash Collected Office Supplies'
    ) THEN
        INSERT INTO orders (
            customer_id, created_by, cargo_name, cargo_weight_kg,
            total_estimated_price, total_actual_price, payment_type,
            vehicle_group_id, derived_status, notes
        )
        VALUES (
            v_customer_id, v_coord_id, 'Driver Debt Demo: Cash Collected Office Supplies', 95.0,
            1500000, 1500000, 'cash', v_group_id, 'completed',
            'Dedicated cash-collected demo for driver debt and remittance flow'
        )
        RETURNING id INTO v_order_id;
    ELSE
        SELECT id INTO v_order_id
        FROM orders
        WHERE cargo_name = 'Driver Debt Demo: Cash Collected Office Supplies'
        LIMIT 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM order_shipments WHERE order_id = v_order_id AND shipment_index = 1
    ) THEN
        INSERT INTO order_shipments (
            order_id, shipment_index, owner_driver_id, vehicle_id,
            cargo_name, cargo_weight_kg, estimated_price, estimated_distance_km,
            actual_distance_km, actual_price, status,
            claimed_at, picking_at, transit_at, arrived_at, completed_at, notes
        )
        VALUES (
            v_order_id, 1, v_driver_id, v_vehicle_id,
            'Office Supplies', 95.0, 1500000, 150.0,
            150.0, 1500000, 'completed',
            NOW() - INTERVAL '3 days',
            NOW() - INTERVAL '3 days' + INTERVAL '1 hour',
            NOW() - INTERVAL '3 days' + INTERVAL '3 hours',
            NOW() - INTERVAL '3 days' + INTERVAL '5 hours',
            NOW() - INTERVAL '2 days',
            'Dedicated shipment for cash collected and driver debt settlement testing'
        )
        RETURNING id INTO v_shipment_id;
    ELSE
        SELECT id INTO v_shipment_id
        FROM order_shipments
        WHERE order_id = v_order_id AND shipment_index = 1
        LIMIT 1;
    END IF;

    IF v_shipment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM shipment_receipts WHERE shipment_id = v_shipment_id
    ) THEN
        INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by, notes, collected_at)
        VALUES (v_shipment_id, 'cash_collected', 1500000, v_driver_id,
                'Khách thanh toán tiền mặt khi nhận hàng', NOW() - INTERVAL '1 day')
        RETURNING id INTO v_payment_id;

        INSERT INTO payment_receipts (payment_id, file_url, uploaded_at)
        VALUES (v_payment_id, 'https://res.cloudinary.com/demo/image/upload/sample.jpg', NOW() - INTERVAL '1 day');

        INSERT INTO debts (debt_type, driver_id, shipment_id, order_id, total_amount, paid_amount, status, notes)
        VALUES ('driver', v_driver_id, v_shipment_id, v_order_id, 1500000, 500000, 'partial',
                'Khách thanh toán tiền mặt — driver đang cầm tiền');

        -- Lần nộp 1: đã được kế toán xác nhận
        INSERT INTO debt_payments (debt_id, amount, payment_method, status, receipt_url,
                                   confirmed_at, created_by, notes, paid_at)
        SELECT d.id, 500000, 'cash', 'confirmed',
               'https://res.cloudinary.com/demo/image/upload/sample.jpg',
               NOW() - INTERVAL '10 hours', v_driver_id, 'Nộp tiền mặt tại văn phòng', NOW() - INTERVAL '12 hours'
        FROM debts d WHERE d.driver_id = v_driver_id AND d.total_amount = 1500000;

        -- Lần nộp 2: đang chờ kế toán xác nhận
        INSERT INTO debt_payments (debt_id, amount, payment_method, status, receipt_url,
                                   created_by, notes, paid_at)
        SELECT d.id, 700000, 'bank_transfer', 'pending',
               'https://res.cloudinary.com/demo/image/upload/sample2.jpg',
               v_driver_id, 'Chuyển khoản 700k còn lại', NOW() - INTERVAL '1 hour'
        FROM debts d WHERE d.driver_id = v_driver_id AND d.total_amount = 1500000;

        -- Công nợ thứ 2 (chưa nộp)
        INSERT INTO debts (debt_type, driver_id, order_id, total_amount, paid_amount, status, notes)
        VALUES ('driver', v_driver_id, v_order_id, 800000, 0, 'unpaid',
                'Thu hộ chuyến thứ 2, chưa nộp về công ty');
    END IF;
END $$;

-- =============================================================================
-- SECTION 21: TEST SCENARIO — Payroll tháng 5/2026 đã duyệt
-- Test: GET /api/payroll/me
-- =============================================================================
INSERT INTO payrolls (
    driver_id, payroll_month, payroll_year,
    base_salary, months_of_service,
    total_revenue, revenue_share_pct, revenue_bonus,
    kpi_bonus, top_driver_bonus, other_bonus,
    insurance_employee, driver_debt_deduction, advance_deduction, other_deduction,
    status
)
SELECT p.id, 5, 2026,
       9000000, 40,
       15000000, 15.00, 2250000,
       500000, 0, 200000,
       900000, 500000, 0, 0,
       'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver1@example.com'
  AND NOT EXISTS (
      SELECT 1 FROM payrolls pw WHERE pw.driver_id = p.id AND pw.payroll_month = 5 AND pw.payroll_year = 2026
  );

-- =============================================================================
-- SECTION 22: TEST SCENARIO — Salary Advance pending
-- Test: GET /api/payroll/advance
-- =============================================================================
INSERT INTO salary_advances (driver_id, amount, reason, request_month, request_year, status)
SELECT p.id, 2000000, 'Cần tiền đóng học phí cho con', 6, 2026, 'pending'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver1@example.com'
  AND NOT EXISTS (
      SELECT 1 FROM salary_advances sa
      WHERE sa.driver_id = p.id AND sa.request_month = 6 AND sa.request_year = 2026
        AND sa.status IN ('pending', 'approved')
  );

-- =============================================================================
-- SECTION 23: TEST SCENARIO — KPI tháng 4-6/2026
-- Test: GET /api/kpi/me, GET /api/kpi/leaderboard
-- =============================================================================
DO $$
DECLARE
    v_driver1_id   INT;
    v_driver2_id   INT;
    v_group_small  INT;
BEGIN
    SELECT p.id INTO v_driver1_id FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver1@example.com';
    SELECT p.id INTO v_driver2_id FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver2@example.com';
    SELECT id  INTO v_group_small  FROM vehicle_groups ORDER BY id ASC LIMIT 1;

    -- Driver 1 — tháng 6/2026 (tháng hiện tại)
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year,
                              completed_shipments, total_revenue, incident_count)
    VALUES (v_driver1_id, v_group_small, 6, 2026, 18, 12600000, 1)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments,
        total_revenue       = EXCLUDED.total_revenue,
        incident_count      = EXCLUDED.incident_count;

    -- Driver 1 — tháng 5/2026
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year,
                              completed_shipments, total_revenue, incident_count)
    VALUES (v_driver1_id, v_group_small, 5, 2026, 22, 15400000, 0)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments,
        total_revenue       = EXCLUDED.total_revenue,
        incident_count      = EXCLUDED.incident_count;

    -- Driver 1 — tháng 4/2026
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year,
                              completed_shipments, total_revenue, incident_count)
    VALUES (v_driver1_id, v_group_small, 4, 2026, 19, 13300000, 0)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments,
        total_revenue       = EXCLUDED.total_revenue,
        incident_count      = EXCLUDED.incident_count;

    -- Driver 2 — tháng 6/2026 (leaderboard)
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year,
                              completed_shipments, total_revenue, incident_count)
    VALUES (v_driver2_id, v_group_small, 6, 2026, 25, 17500000, 0)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments,
        total_revenue       = EXCLUDED.total_revenue,
        incident_count      = EXCLUDED.incident_count;

    -- Driver 2 — tháng 5/2026
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year,
                              completed_shipments, total_revenue, incident_count)
    VALUES (v_driver2_id, v_group_small, 5, 2026, 20, 14000000, 1)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments,
        total_revenue       = EXCLUDED.total_revenue,
        incident_count      = EXCLUDED.incident_count;
END $$;

-- =============================================================================
-- SECTION 24: TEST SCENARIO — Incident mở (driver2, từ chối nhận hàng)
-- Test: GET /api/incidents/my
-- =============================================================================
DO $$
DECLARE
    v_shipment_id INT;
    v_driver2_id  INT;
BEGIN
    SELECT p.id INTO v_driver2_id
    FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver2@example.com';

    SELECT os.id INTO v_shipment_id
    FROM order_shipments os JOIN orders o ON o.id = os.order_id
    WHERE o.cargo_name = 'Failed Test: Khách từ chối nhận' AND os.shipment_index = 1 LIMIT 1;

    IF v_shipment_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM incidents WHERE shipment_id = v_shipment_id
    ) THEN
        INSERT INTO incidents (shipment_id, reported_by, incident_type, severity_level,
                               description, location, status, occurred_at)
        VALUES (v_shipment_id, v_driver2_id, 'customer_refusal', 'low',
                'Khách hàng không ra nhận hàng sau nhiều lần gọi điện. Đã chờ 30 phút tại điểm giao.',
                '22 Nguyễn Văn Cừ, Q.5, TP.HCM', 'open', NOW() - INTERVAL '30 minutes');
    END IF;
END $$;

-- =============================================================================
-- SECTION 25: TEST SCENARIO — Leave Requests tháng 4-6/2026
-- Test: GET /api/leave/me, GET /api/leave/summary
-- =============================================================================
DO $$
DECLARE
    v_driver_id INT;
BEGIN
    SELECT p.id INTO v_driver_id
    FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver1@example.com';

    IF v_driver_id IS NOT NULL THEN
        INSERT INTO leave_requests (driver_id, leave_date, leave_type, reason, status)
        VALUES (v_driver_id, '2026-06-10', 'unpaid', 'Việc gia đình', 'approved')
        ON CONFLICT (driver_id, leave_date) DO NOTHING;

        INSERT INTO leave_requests (driver_id, leave_date, leave_type, reason, status)
        VALUES (v_driver_id, '2026-04-18', 'paid', 'Giỗ Tổ Hùng Vương', 'approved')
        ON CONFLICT (driver_id, leave_date) DO NOTHING;
    END IF;
END $$;

-- =============================================================================
-- SECTION 26: COMPANY INFO
-- =============================================================================
UPDATE company_info
SET company_name        = 'SEP490 Van Tai Logistics',
    hotline             = '1900 1234',
    bank_name           = 'Vietcombank',
    bank_account_number = '0011004433001',
    bank_account_name   = 'CONG TY TNHH SEP490 VAN TAI LOGISTICS',
    bank_qr_url         = 'https://res.cloudinary.com/demo/image/upload/qr-placeholder.png',
    updated_at          = NOW()
WHERE id = 1;

-- =============================================================================
-- SECTION 27: HISTORICAL COMPLETED ORDERS (Jan–Jun 2026) for 6-month report
-- ~20 orders with actual_price, receipts, and various payment types
-- =============================================================================
DO $$
DECLARE
    v_coord_id  INT;
    v_cust1     INT;  -- Nguyen Hoang Anh (individual)
    v_cust2     INT;  -- ABC Logistics Co.
    v_cust3     INT;  -- Tran Van Binh (individual)
    v_cust4     INT;  -- XYZ Trading
    v_cust5     INT;  -- Sunrise Manufacturing
    v_drv1      INT;
    v_drv2      INT;
    v_drv3      INT;
    v_drv4      INT;
    v_veh1      INT;
    v_veh2      INT;
    v_veh3      INT;
    v_veh4      INT;
    v_vg_small  INT;
    v_vg_medium INT;
    v_oid       INT;
    v_sid       INT;
    v_rid       INT;
BEGIN
    SELECT p.id INTO v_coord_id FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'ntck005@gmail.com';
    SELECT p.id INTO v_drv1     FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver1@example.com';
    SELECT p.id INTO v_drv2     FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver2@example.com';
    SELECT p.id INTO v_drv3     FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver3@example.com';
    SELECT p.id INTO v_drv4     FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver4@example.com';
    SELECT id INTO v_veh1 FROM vehicles WHERE plate_number = '51-A12345';
    SELECT id INTO v_veh2 FROM vehicles WHERE plate_number = '51-D22222';
    SELECT id INTO v_veh3 FROM vehicles WHERE plate_number = '51-B67890';
    SELECT id INTO v_veh4 FROM vehicles WHERE plate_number = '51-F44444';
    SELECT id INTO v_cust1 FROM customers WHERE phone = '0987654321';
    SELECT id INTO v_cust2 FROM customers WHERE phone = '0987654322';
    SELECT id INTO v_cust3 FROM customers WHERE phone = '0987654323';
    SELECT id INTO v_cust4 FROM customers WHERE phone = '0987654324';
    SELECT id INTO v_cust5 FROM customers WHERE phone = '0987654325';
    SELECT id INTO v_vg_small  FROM vehicle_groups ORDER BY id ASC LIMIT 1;
    SELECT id INTO v_vg_medium FROM vehicle_groups ORDER BY id ASC OFFSET 1 LIMIT 1;

    -- -------------------------------------------------------
    -- JAN 2026 — Order H1: bank_transfer, driver1
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-Jan-01: Thiet bi van phong') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust2, v_coord_id, 'Hist-Jan-01: Thiet bi van phong', 80.0, 1200000, 1200000,
                'bank_transfer', v_vg_small, 'completed', 'Historical order Jan 2026',
                TIMESTAMPTZ '2026-01-08 08:00:00+07', TIMESTAMPTZ '2026-01-08 17:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at, notes)
        VALUES (v_oid, 1, v_drv1, v_veh1, 'Thiet bi van phong', 80.0, 1200000, 1200000, 40.0, 41.2, 'completed',
                '2026-01-08 08:30:00+07', '2026-01-08 09:00:00+07', '2026-01-08 10:00:00+07',
                '2026-01-08 12:00:00+07', '2026-01-08 13:00:00+07', 'Completed Jan 2026')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '456 Le Loi, District 1, HCMC', 'Ms. Lan Anh', '0987654322', '2026-01-08 09:30:00+07'),
               (v_sid, 2, 'delivery', '200 Nguyen Thi Minh Khai, District 3, HCMC', 'Mr. Toan', '0911100001', '2026-01-08 13:00:00+07');

        INSERT INTO order_receipt_requests (requesting_shipment_id, order_id, driver_id, status, requested_at, processed_by, processed_at)
        VALUES (v_sid, v_oid, v_drv1, 'approved', '2026-01-08 13:05:00+07', v_coord_id, '2026-01-08 14:00:00+07');

        SELECT id INTO v_rid FROM order_receipt_requests WHERE order_id = v_oid LIMIT 1;
        INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by, notes, collected_at, order_receipt_request_id, created_at, created_by)
        VALUES (v_sid, 'bank_transfer', 1200000, NULL, 'Chuyển khoản tháng 1', '2026-01-08 14:00:00+07', v_rid, '2026-01-08 14:00:00+07', v_coord_id);
    END IF;

    -- -------------------------------------------------------
    -- JAN 2026 — Order H2: cash, driver2
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-Jan-02: Do noi that') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust3, v_coord_id, 'Hist-Jan-02: Do noi that', 180.0, 2200000, 2200000,
                'cash', v_vg_small, 'completed', 'Historical order Jan 2026',
                TIMESTAMPTZ '2026-01-15 08:00:00+07', TIMESTAMPTZ '2026-01-15 18:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv2, v_veh2, 'Do noi that', 180.0, 2200000, 2200000, 55.0, 56.5, 'completed',
                '2026-01-15 08:30:00+07', '2026-01-15 09:00:00+07', '2026-01-15 11:00:00+07',
                '2026-01-15 14:00:00+07', '2026-01-15 15:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '789 Tran Hung Dao, District 5, HCMC', 'Tran Van Binh', '0987654323', '2026-01-15 10:00:00+07'),
               (v_sid, 2, 'delivery', '55 Nguyen Van Cu, District 5, HCMC', 'Tran Thi Hoa', '0911100002', '2026-01-15 15:00:00+07');

        INSERT INTO order_receipt_requests (requesting_shipment_id, order_id, driver_id, status, requested_at, processed_by, processed_at)
        VALUES (v_sid, v_oid, v_drv2, 'approved', '2026-01-15 15:10:00+07', v_coord_id, '2026-01-15 16:00:00+07');

        SELECT id INTO v_rid FROM order_receipt_requests WHERE order_id = v_oid LIMIT 1;
        INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by, notes, collected_at, order_receipt_request_id, created_at, created_by)
        VALUES (v_sid, 'cash_collected', 2200000, v_drv2, 'Thu tien mat tu khach', '2026-01-15 15:00:00+07', v_rid, '2026-01-15 16:00:00+07', v_coord_id);

        INSERT INTO debts (debt_type, driver_id, shipment_id, order_id, total_amount, paid_amount, status, notes, created_at)
        VALUES ('driver', v_drv2, v_sid, v_oid, 2200000, 2200000, 'paid', 'Da nop toan bo ve cong ty', '2026-01-15 16:00:00+07');
    END IF;

    -- -------------------------------------------------------
    -- FEB 2026 — Order H3: bank_transfer, driver3 (medium truck)
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-Feb-01: Hang xay dung') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust5, v_coord_id, 'Hist-Feb-01: Hang xay dung', 2500.0, 3500000, 3500000,
                'bank_transfer', v_vg_medium, 'completed', 'Historical order Feb 2026',
                TIMESTAMPTZ '2026-02-05 08:00:00+07', TIMESTAMPTZ '2026-02-05 18:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv3, v_veh3, 'Hang xay dung', 2500.0, 3500000, 3500000, 70.0, 72.0, 'completed',
                '2026-02-05 08:30:00+07', '2026-02-05 09:30:00+07', '2026-02-05 11:30:00+07',
                '2026-02-05 15:00:00+07', '2026-02-05 16:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '50 Nguyen Van Linh, District 7, HCMC', 'Mr. Tuan Kiet', '0987654325', '2026-02-05 10:30:00+07'),
               (v_sid, 2, 'delivery', '100 Ly Thuong Kiet, District 10, HCMC', 'Mr. Quang', '0911100003', '2026-02-05 16:00:00+07');

        INSERT INTO order_receipt_requests (requesting_shipment_id, order_id, driver_id, status, requested_at, processed_by, processed_at)
        VALUES (v_sid, v_oid, v_drv3, 'approved', '2026-02-05 16:10:00+07', v_coord_id, '2026-02-05 17:00:00+07');

        SELECT id INTO v_rid FROM order_receipt_requests WHERE order_id = v_oid LIMIT 1;
        INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by, notes, collected_at, order_receipt_request_id, created_at, created_by)
        VALUES (v_sid, 'bank_transfer', 3500000, NULL, 'Chuyen khoan thang 2', '2026-02-05 17:00:00+07', v_rid, '2026-02-05 17:00:00+07', v_coord_id);
    END IF;

    -- -------------------------------------------------------
    -- FEB 2026 — Order H4: bank_transfer (receipt via QR), driver1
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-Feb-02: Linh kien dien tu') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust2, v_coord_id, 'Hist-Feb-02: Linh kien dien tu', 45.0, 900000, 900000,
                'bank_transfer', v_vg_small, 'completed', 'Historical order Feb 2026',
                TIMESTAMPTZ '2026-02-20 08:00:00+07', TIMESTAMPTZ '2026-02-20 14:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv1, v_veh1, 'Linh kien dien tu', 45.0, 900000, 900000, 30.0, 31.5, 'completed',
                '2026-02-20 08:30:00+07', '2026-02-20 09:00:00+07', '2026-02-20 10:00:00+07',
                '2026-02-20 12:00:00+07', '2026-02-20 13:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '456 Le Loi, District 1, HCMC', 'Ms. Lan Anh', '0987654322', '2026-02-20 09:30:00+07'),
               (v_sid, 2, 'delivery', '77 Hai Ba Trung, District 1, HCMC', 'Mr. Tai', '0911100004', '2026-02-20 13:00:00+07');

        INSERT INTO order_receipt_requests (requesting_shipment_id, order_id, driver_id, status, requested_at, processed_by, processed_at)
        VALUES (v_sid, v_oid, v_drv1, 'approved', '2026-02-20 13:05:00+07', v_coord_id, '2026-02-20 14:00:00+07');

        SELECT id INTO v_rid FROM order_receipt_requests WHERE order_id = v_oid LIMIT 1;
        INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by, notes, collected_at, order_receipt_request_id, created_at, created_by)
        VALUES (v_sid, 'qr_transfer', 900000, NULL, 'Thanh toan QR thang 2', '2026-02-20 14:00:00+07', v_rid, '2026-02-20 14:00:00+07', v_coord_id);
    END IF;

    -- -------------------------------------------------------
    -- MAR 2026 — Order H5: cash, driver4 (medium truck)
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-Mar-01: May moc cong nghiep') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust4, v_coord_id, 'Hist-Mar-01: May moc cong nghiep', 1800.0, 4500000, 4500000,
                'cash', v_vg_medium, 'completed', 'Historical order Mar 2026',
                TIMESTAMPTZ '2026-03-10 07:00:00+07', TIMESTAMPTZ '2026-03-10 18:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv4, v_veh4, 'May moc cong nghiep', 1800.0, 4500000, 4500000, 90.0, 92.5, 'completed',
                '2026-03-10 07:30:00+07', '2026-03-10 08:30:00+07', '2026-03-10 11:00:00+07',
                '2026-03-10 15:00:00+07', '2026-03-10 16:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '321 Nguyen Trai, District 5, HCMC', 'Mr. Hung', '0987654324', '2026-03-10 09:00:00+07'),
               (v_sid, 2, 'delivery', '88 Dien Bien Phu, Binh Thanh, HCMC', 'Mr. Minh', '0911100005', '2026-03-10 16:00:00+07');

        INSERT INTO order_receipt_requests (requesting_shipment_id, order_id, driver_id, status, requested_at, processed_by, processed_at)
        VALUES (v_sid, v_oid, v_drv4, 'approved', '2026-03-10 16:10:00+07', v_coord_id, '2026-03-10 17:00:00+07');

        SELECT id INTO v_rid FROM order_receipt_requests WHERE order_id = v_oid LIMIT 1;
        INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by, notes, collected_at, order_receipt_request_id, created_at, created_by)
        VALUES (v_sid, 'cash_collected', 4500000, v_drv4, 'Thu tien mat may moc', '2026-03-10 16:00:00+07', v_rid, '2026-03-10 17:00:00+07', v_coord_id);

        INSERT INTO debts (debt_type, driver_id, shipment_id, order_id, total_amount, paid_amount, status, notes, created_at)
        VALUES ('driver', v_drv4, v_sid, v_oid, 4500000, 4500000, 'paid', 'Da nop toan bo ve cong ty', '2026-03-11 09:00:00+07');
    END IF;

    -- -------------------------------------------------------
    -- MAR 2026 — Order H6: client_credit (ghi no), driver1 → CUSTOMER DEBT
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-Mar-02: Hang tiet kiem') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust2, v_coord_id, 'Hist-Mar-02: Hang tiet kiem', 60.0, 750000, 750000,
                'client_credit', v_vg_small, 'completed', 'Ghi no khach hang thang 3',
                TIMESTAMPTZ '2026-03-22 08:00:00+07', TIMESTAMPTZ '2026-03-22 16:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv1, v_veh1, 'Hang tiet kiem', 60.0, 750000, 750000, 25.0, 25.5, 'completed',
                '2026-03-22 08:30:00+07', '2026-03-22 09:00:00+07', '2026-03-22 10:00:00+07',
                '2026-03-22 12:00:00+07', '2026-03-22 13:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '456 Le Loi, District 1, HCMC', 'Ms. Lan Anh', '0987654322', '2026-03-22 09:30:00+07'),
               (v_sid, 2, 'delivery', '150 Nam Ky Khoi Nghia, District 3, HCMC', 'Ms. Hoa', '0911100006', '2026-03-22 13:00:00+07');

        INSERT INTO debts (debt_type, customer_id, shipment_id, order_id, total_amount, paid_amount, status, due_date, notes, created_at)
        VALUES ('customer', v_cust2, v_sid, v_oid, 750000, 0, 'unpaid', DATE '2026-04-22', 'Ghi no ABC Logistics thang 3', '2026-03-22 16:00:00+07');
    END IF;

    -- -------------------------------------------------------
    -- APR 2026 — Order H7: bank_transfer, driver2
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-Apr-01: Thuc pham dong lanh') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust1, v_coord_id, 'Hist-Apr-01: Thuc pham dong lanh', 120.0, 1800000, 1800000,
                'bank_transfer', v_vg_small, 'completed', 'Historical order Apr 2026',
                TIMESTAMPTZ '2026-04-03 07:00:00+07', TIMESTAMPTZ '2026-04-03 16:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv2, v_veh2, 'Thuc pham dong lanh', 120.0, 1800000, 1800000, 45.0, 46.0, 'completed',
                '2026-04-03 07:30:00+07', '2026-04-03 08:00:00+07', '2026-04-03 10:00:00+07',
                '2026-04-03 13:00:00+07', '2026-04-03 14:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '123 Nguyen Hue, District 1, HCMC', 'Nguyen Hoang Anh', '0987654321', '2026-04-03 08:30:00+07'),
               (v_sid, 2, 'delivery', '250 Hoang Dieu, District 4, HCMC', 'Mr. Kien', '0911100007', '2026-04-03 14:00:00+07');

        INSERT INTO order_receipt_requests (requesting_shipment_id, order_id, driver_id, status, requested_at, processed_by, processed_at)
        VALUES (v_sid, v_oid, v_drv2, 'approved', '2026-04-03 14:05:00+07', v_coord_id, '2026-04-03 15:00:00+07');

        SELECT id INTO v_rid FROM order_receipt_requests WHERE order_id = v_oid LIMIT 1;
        INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by, notes, collected_at, order_receipt_request_id, created_at, created_by)
        VALUES (v_sid, 'bank_transfer', 1800000, NULL, 'Chuyen khoan thang 4', '2026-04-03 15:00:00+07', v_rid, '2026-04-03 15:00:00+07', v_coord_id);
    END IF;

    -- -------------------------------------------------------
    -- APR 2026 — Order H8: client_credit → CUSTOMER DEBT (XYZ Trading)
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-Apr-02: Hang hoa xuat khau') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust4, v_coord_id, 'Hist-Apr-02: Hang hoa xuat khau', 500.0, 5500000, 5500000,
                'client_credit', v_vg_medium, 'completed', 'Ghi no khach hang thang 4',
                TIMESTAMPTZ '2026-04-18 07:00:00+07', TIMESTAMPTZ '2026-04-18 18:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv3, v_veh3, 'Hang hoa xuat khau', 500.0, 5500000, 5500000, 110.0, 112.0, 'completed',
                '2026-04-18 07:30:00+07', '2026-04-18 08:30:00+07', '2026-04-18 11:00:00+07',
                '2026-04-18 16:00:00+07', '2026-04-18 17:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '321 Nguyen Trai, District 5, HCMC', 'Mr. Hung', '0987654324', '2026-04-18 09:30:00+07'),
               (v_sid, 2, 'delivery', 'Cang Cat Lai, District 2, HCMC', 'Mr. Phong', '0911100008', '2026-04-18 17:00:00+07');

        INSERT INTO debts (debt_type, customer_id, shipment_id, order_id, total_amount, paid_amount, status, due_date, notes, created_at)
        VALUES ('customer', v_cust4, v_sid, v_oid, 5500000, 2000000, 'partial', DATE '2026-05-18', 'Ghi no XYZ Trading thang 4 - da tra 1 phan', '2026-04-18 18:00:00+07');
    END IF;

    -- -------------------------------------------------------
    -- MAY 2026 — Order H9: bank_transfer, driver1
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-May-01: Phu tung o to') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust5, v_coord_id, 'Hist-May-01: Phu tung o to', 300.0, 3200000, 3200000,
                'bank_transfer', v_vg_medium, 'completed', 'Historical order May 2026',
                TIMESTAMPTZ '2026-05-06 07:00:00+07', TIMESTAMPTZ '2026-05-06 17:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv1, v_veh1, 'Phu tung o to', 300.0, 3200000, 3200000, 64.0, 65.0, 'completed',
                '2026-05-06 07:30:00+07', '2026-05-06 08:30:00+07', '2026-05-06 10:30:00+07',
                '2026-05-06 14:00:00+07', '2026-05-06 15:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '50 Nguyen Van Linh, District 7, HCMC', 'Mr. Tuan Kiet', '0987654325', '2026-05-06 09:30:00+07'),
               (v_sid, 2, 'delivery', '120 Cong Hoa, Tan Binh, HCMC', 'Ms. Thu', '0911100009', '2026-05-06 15:00:00+07');

        INSERT INTO order_receipt_requests (requesting_shipment_id, order_id, driver_id, status, requested_at, processed_by, processed_at)
        VALUES (v_sid, v_oid, v_drv1, 'approved', '2026-05-06 15:05:00+07', v_coord_id, '2026-05-06 16:00:00+07');

        SELECT id INTO v_rid FROM order_receipt_requests WHERE order_id = v_oid LIMIT 1;
        INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by, notes, collected_at, order_receipt_request_id, created_at, created_by)
        VALUES (v_sid, 'bank_transfer', 3200000, NULL, 'Chuyen khoan thang 5', '2026-05-06 16:00:00+07', v_rid, '2026-05-06 16:00:00+07', v_coord_id);
    END IF;

    -- -------------------------------------------------------
    -- MAY 2026 — Order H10: cash, driver4
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-May-02: San pham nhua') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust3, v_coord_id, 'Hist-May-02: San pham nhua', 90.0, 1100000, 1100000,
                'cash', v_vg_small, 'completed', 'Historical order May 2026',
                TIMESTAMPTZ '2026-05-20 08:00:00+07', TIMESTAMPTZ '2026-05-20 16:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv4, v_veh4, 'San pham nhua', 90.0, 1100000, 1100000, 36.0, 37.0, 'completed',
                '2026-05-20 08:30:00+07', '2026-05-20 09:00:00+07', '2026-05-20 10:30:00+07',
                '2026-05-20 13:00:00+07', '2026-05-20 14:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '789 Tran Hung Dao, District 5, HCMC', 'Tran Van Binh', '0987654323', '2026-05-20 09:30:00+07'),
               (v_sid, 2, 'delivery', '300 Ly Thai To, District 10, HCMC', 'Mr. Lam', '0911100010', '2026-05-20 14:00:00+07');

        INSERT INTO order_receipt_requests (requesting_shipment_id, order_id, driver_id, status, requested_at, processed_by, processed_at)
        VALUES (v_sid, v_oid, v_drv4, 'approved', '2026-05-20 14:05:00+07', v_coord_id, '2026-05-20 15:00:00+07');

        SELECT id INTO v_rid FROM order_receipt_requests WHERE order_id = v_oid LIMIT 1;
        INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by, notes, collected_at, order_receipt_request_id, created_at, created_by)
        VALUES (v_sid, 'cash_collected', 1100000, v_drv4, 'Thu tien mat san pham nhua', '2026-05-20 14:00:00+07', v_rid, '2026-05-20 15:00:00+07', v_coord_id);

        INSERT INTO debts (debt_type, driver_id, shipment_id, order_id, total_amount, paid_amount, status, notes, created_at)
        VALUES ('driver', v_drv4, v_sid, v_oid, 1100000, 1100000, 'paid', 'Da nop ve cong ty', '2026-05-21 09:00:00+07');
    END IF;

    -- -------------------------------------------------------
    -- JUN 2026 — Order H11: bank_transfer, driver2
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-Jun-01: Thiet bi y te') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust2, v_coord_id, 'Hist-Jun-01: Thiet bi y te', 55.0, 1050000, 1050000,
                'bank_transfer', v_vg_small, 'completed', 'Historical order Jun 2026',
                TIMESTAMPTZ '2026-06-03 08:00:00+07', TIMESTAMPTZ '2026-06-03 16:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv2, v_veh2, 'Thiet bi y te', 55.0, 1050000, 1050000, 35.0, 35.5, 'completed',
                '2026-06-03 08:30:00+07', '2026-06-03 09:00:00+07', '2026-06-03 10:30:00+07',
                '2026-06-03 13:00:00+07', '2026-06-03 14:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '456 Le Loi, District 1, HCMC', 'Ms. Lan Anh', '0987654322', '2026-06-03 09:30:00+07'),
               (v_sid, 2, 'delivery', '88 Nguyen Thi Minh Khai, District 1, HCMC', 'Dr. Nam', '0911100011', '2026-06-03 14:00:00+07');

        INSERT INTO order_receipt_requests (requesting_shipment_id, order_id, driver_id, status, requested_at, processed_by, processed_at)
        VALUES (v_sid, v_oid, v_drv2, 'approved', '2026-06-03 14:05:00+07', v_coord_id, '2026-06-03 15:00:00+07');

        SELECT id INTO v_rid FROM order_receipt_requests WHERE order_id = v_oid LIMIT 1;
        INSERT INTO shipment_receipts (shipment_id, payment_type, amount, collected_by, notes, collected_at, order_receipt_request_id, created_at, created_by)
        VALUES (v_sid, 'bank_transfer', 1050000, NULL, 'Chuyen khoan thang 6', '2026-06-03 15:00:00+07', v_rid, '2026-06-03 15:00:00+07', v_coord_id);
    END IF;

    -- -------------------------------------------------------
    -- JUN 2026 — Order H12: client_credit → CUSTOMER DEBT (Sunrise Manufacturing)
    -- -------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM orders WHERE cargo_name = 'Hist-Jun-02: Nguyen lieu san xuat') THEN
        INSERT INTO orders (customer_id, created_by, cargo_name, cargo_weight_kg, total_estimated_price, total_actual_price,
                            payment_type, vehicle_group_id, derived_status, notes, created_at, updated_at)
        VALUES (v_cust5, v_coord_id, 'Hist-Jun-02: Nguyen lieu san xuat', 3000.0, 6000000, 6000000,
                'client_credit', v_vg_medium, 'completed', 'Ghi no Sunrise Manufacturing thang 6',
                TIMESTAMPTZ '2026-06-15 07:00:00+07', TIMESTAMPTZ '2026-06-15 19:00:00+07')
        RETURNING id INTO v_oid;

        INSERT INTO order_shipments (order_id, shipment_index, owner_driver_id, vehicle_id, cargo_name, cargo_weight_kg,
                                     estimated_price, actual_price, estimated_distance_km, actual_distance_km, status,
                                     claimed_at, picking_at, transit_at, arrived_at, completed_at)
        VALUES (v_oid, 1, v_drv3, v_veh3, 'Nguyen lieu san xuat', 3000.0, 6000000, 6000000, 120.0, 122.5, 'completed',
                '2026-06-15 07:30:00+07', '2026-06-15 08:30:00+07', '2026-06-15 11:00:00+07',
                '2026-06-15 16:00:00+07', '2026-06-15 17:00:00+07')
        RETURNING id INTO v_sid;

        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address, contact_name, contact_phone, completed_at)
        VALUES (v_sid, 1, 'pickup', '50 Nguyen Van Linh, District 7, HCMC', 'Mr. Tuan Kiet', '0987654325', '2026-06-15 09:30:00+07'),
               (v_sid, 2, 'delivery', 'KCN Binh Duong, Thu Dau Mot, Binh Duong', 'Mr. Duc', '0911100012', '2026-06-15 17:00:00+07');

        INSERT INTO debts (debt_type, customer_id, shipment_id, order_id, total_amount, paid_amount, status, due_date, notes, created_at)
        VALUES ('customer', v_cust5, v_sid, v_oid, 6000000, 0, 'unpaid', DATE '2026-07-15', 'Ghi no Sunrise Manufacturing thang 6 - chua thanh toan', '2026-06-15 19:00:00+07');
    END IF;

END $$;

-- =============================================================================
-- SECTION 28: PAYROLLS — All 4 drivers, multiple months
-- =============================================================================

-- Driver 1 — April 2026
INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service,
    total_revenue, revenue_share_pct, revenue_bonus, kpi_bonus, top_driver_bonus, other_bonus,
    insurance_employee, driver_debt_deduction, advance_deduction, other_deduction, status)
SELECT p.id, 4, 2026, 9000000, 39,
    13300000, 15.00, 1995000, 300000, 0, 0,
    900000, 0, 0, 0, 'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver1@example.com'
  AND NOT EXISTS (SELECT 1 FROM payrolls pw WHERE pw.driver_id = p.id AND pw.payroll_month = 4 AND pw.payroll_year = 2026);

-- Driver 1 — May 2026 (already exists from section 21, update to ensure correct values)
UPDATE payrolls SET
    total_revenue = 15000000, revenue_share_pct = 15.00, revenue_bonus = 2250000,
    kpi_bonus = 500000, top_driver_bonus = 0, other_bonus = 200000,
    insurance_employee = 900000, driver_debt_deduction = 500000, advance_deduction = 0, other_deduction = 0,
    status = 'approved'
WHERE driver_id = (SELECT p.id FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver1@example.com')
  AND payroll_month = 5 AND payroll_year = 2026;

-- Driver 2 — April 2026
INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service,
    total_revenue, revenue_share_pct, revenue_bonus, kpi_bonus, top_driver_bonus, other_bonus,
    insurance_employee, driver_debt_deduction, advance_deduction, other_deduction, status)
SELECT p.id, 4, 2026, 9000000, 33,
    14000000, 15.00, 2100000, 300000, 0, 0,
    900000, 0, 0, 0, 'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver2@example.com'
  AND NOT EXISTS (SELECT 1 FROM payrolls pw WHERE pw.driver_id = p.id AND pw.payroll_month = 4 AND pw.payroll_year = 2026);

-- Driver 2 — May 2026
INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service,
    total_revenue, revenue_share_pct, revenue_bonus, kpi_bonus, top_driver_bonus, other_bonus,
    insurance_employee, driver_debt_deduction, advance_deduction, other_deduction, status)
SELECT p.id, 5, 2026, 9000000, 34,
    14000000, 15.00, 2100000, 300000, 1000000, 0,
    900000, 0, 0, 0, 'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver2@example.com'
  AND NOT EXISTS (SELECT 1 FROM payrolls pw WHERE pw.driver_id = p.id AND pw.payroll_month = 5 AND pw.payroll_year = 2026);

-- Driver 3 — April 2026
INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service,
    total_revenue, revenue_share_pct, revenue_bonus, kpi_bonus, top_driver_bonus, other_bonus,
    insurance_employee, driver_debt_deduction, advance_deduction, other_deduction, status)
SELECT p.id, 4, 2026, 9000000, 26,
    11500000, 15.00, 1725000, 0, 0, 0,
    900000, 0, 0, 0, 'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver3@example.com'
  AND NOT EXISTS (SELECT 1 FROM payrolls pw WHERE pw.driver_id = p.id AND pw.payroll_month = 4 AND pw.payroll_year = 2026);

-- Driver 3 — May 2026
INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service,
    total_revenue, revenue_share_pct, revenue_bonus, kpi_bonus, top_driver_bonus, other_bonus,
    insurance_employee, driver_debt_deduction, advance_deduction, other_deduction, status)
SELECT p.id, 5, 2026, 9000000, 27,
    13000000, 15.00, 1950000, 0, 0, 0,
    900000, 0, 0, 0, 'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver3@example.com'
  AND NOT EXISTS (SELECT 1 FROM payrolls pw WHERE pw.driver_id = p.id AND pw.payroll_month = 5 AND pw.payroll_year = 2026);

-- Driver 4 — April 2026
INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service,
    total_revenue, revenue_share_pct, revenue_bonus, kpi_bonus, top_driver_bonus, other_bonus,
    insurance_employee, driver_debt_deduction, advance_deduction, other_deduction, status)
SELECT p.id, 4, 2026, 9500000, 44,
    12000000, 16.50, 1980000, 0, 0, 300000,
    950000, 0, 0, 0, 'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver4@example.com'
  AND NOT EXISTS (SELECT 1 FROM payrolls pw WHERE pw.driver_id = p.id AND pw.payroll_month = 4 AND pw.payroll_year = 2026);

-- Driver 4 — May 2026
INSERT INTO payrolls (driver_id, payroll_month, payroll_year, base_salary, months_of_service,
    total_revenue, revenue_share_pct, revenue_bonus, kpi_bonus, top_driver_bonus, other_bonus,
    insurance_employee, driver_debt_deduction, advance_deduction, other_deduction, status)
SELECT p.id, 5, 2026, 9500000, 45,
    15500000, 16.50, 2557500, 500000, 0, 0,
    950000, 0, 0, 0, 'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver4@example.com'
  AND NOT EXISTS (SELECT 1 FROM payrolls pw WHERE pw.driver_id = p.id AND pw.payroll_month = 5 AND pw.payroll_year = 2026);

-- =============================================================================
-- SECTION 29: SALARY ADVANCES — approved (accountant can disburse)
-- =============================================================================

-- Driver 2 — approved advance, tháng 6/2026
INSERT INTO salary_advances (driver_id, amount, reason, request_month, request_year, status)
SELECT p.id, 3000000, 'Sua nha sau mua bao', 6, 2026, 'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver2@example.com'
  AND NOT EXISTS (
      SELECT 1 FROM salary_advances sa
      WHERE sa.driver_id = p.id AND sa.request_month = 6 AND sa.request_year = 2026
        AND sa.status IN ('pending', 'approved')
  );

-- Driver 3 — approved advance, tháng 6/2026
INSERT INTO salary_advances (driver_id, amount, reason, request_month, request_year, status)
SELECT p.id, 2500000, 'Mua thiet bi y te gia dinh', 6, 2026, 'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver3@example.com'
  AND NOT EXISTS (
      SELECT 1 FROM salary_advances sa
      WHERE sa.driver_id = p.id AND sa.request_month = 6 AND sa.request_year = 2026
        AND sa.status IN ('pending', 'approved')
  );

-- Driver 4 — approved advance, tháng 5/2026
INSERT INTO salary_advances (driver_id, amount, reason, request_month, request_year, status)
SELECT p.id, 4000000, 'Dong hoc phi cho con vao dai hoc', 5, 2026, 'approved'
FROM profiles p JOIN accounts a ON a.id = p.id
WHERE a.email = 'driver4@example.com'
  AND NOT EXISTS (
      SELECT 1 FROM salary_advances sa
      WHERE sa.driver_id = p.id AND sa.request_month = 5 AND sa.request_year = 2026
        AND sa.status IN ('pending', 'approved')
  );

-- =============================================================================
-- SECTION 30: ADDITIONAL KPI — Drivers 3 & 4 (prior months)
-- =============================================================================
DO $$
DECLARE
    v_drv3      INT;
    v_drv4      INT;
    v_vg_medium INT;
BEGIN
    SELECT p.id INTO v_drv3 FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver3@example.com';
    SELECT p.id INTO v_drv4 FROM profiles p JOIN accounts a ON a.id = p.id WHERE a.email = 'driver4@example.com';
    SELECT id INTO v_vg_medium FROM vehicle_groups ORDER BY id ASC OFFSET 1 LIMIT 1;

    -- Driver 3 — Apr 2026
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue, incident_count)
    VALUES (v_drv3, v_vg_medium, 4, 2026, 14, 11500000, 0)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments, total_revenue = EXCLUDED.total_revenue;

    -- Driver 3 — May 2026
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue, incident_count)
    VALUES (v_drv3, v_vg_medium, 5, 2026, 16, 13000000, 0)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments, total_revenue = EXCLUDED.total_revenue;

    -- Driver 3 — Jun 2026
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue, incident_count)
    VALUES (v_drv3, v_vg_medium, 6, 2026, 10, 9500000, 0)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments, total_revenue = EXCLUDED.total_revenue;

    -- Driver 4 — Apr 2026
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue, incident_count)
    VALUES (v_drv4, v_vg_medium, 4, 2026, 12, 12000000, 1)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments, total_revenue = EXCLUDED.total_revenue;

    -- Driver 4 — May 2026
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue, incident_count)
    VALUES (v_drv4, v_vg_medium, 5, 2026, 18, 15500000, 0)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments, total_revenue = EXCLUDED.total_revenue;

    -- Driver 4 — Jun 2026
    INSERT INTO kpi_records (driver_id, vehicle_group_id, month, year, completed_shipments, total_revenue, incident_count)
    VALUES (v_drv4, v_vg_medium, 6, 2026, 13, 12800000, 0)
    ON CONFLICT (driver_id, month, year) DO UPDATE SET
        completed_shipments = EXCLUDED.completed_shipments, total_revenue = EXCLUDED.total_revenue;
END $$;

-- =============================================================================
-- SEED VALIDATION — Đếm số bản ghi sau khi seed
-- =============================================================================
SELECT '✓ Accounts'          AS entity, COUNT(*) AS count FROM accounts
UNION ALL SELECT '✓ Profiles',           COUNT(*) FROM profiles
UNION ALL SELECT '✓ Customers',          COUNT(*) FROM customers
UNION ALL SELECT '✓ Vehicle Groups',     COUNT(*) FROM vehicle_groups
UNION ALL SELECT '✓ Vehicles',           COUNT(*) FROM vehicles
UNION ALL SELECT '✓ Orders',             COUNT(*) FROM orders
UNION ALL SELECT '✓ Shipments',          COUNT(*) FROM order_shipments
UNION ALL SELECT '✓ Trip Stops',         COUNT(*) FROM trip_stops
UNION ALL SELECT '✓ Drivers',            COUNT(*) FROM drivers
UNION ALL SELECT '✓ KPI Records',        COUNT(*) FROM kpi_records
UNION ALL SELECT '✓ Payrolls',           COUNT(*) FROM payrolls
UNION ALL SELECT '✓ Salary Advances',    COUNT(*) FROM salary_advances
UNION ALL SELECT '✓ Debts (driver)',     COUNT(*) FROM debts WHERE debt_type = 'driver'
UNION ALL SELECT '✓ Debts (customer)',   COUNT(*) FROM debts WHERE debt_type = 'customer'
UNION ALL SELECT '✓ Incidents',          COUNT(*) FROM incidents
UNION ALL SELECT '✓ Leave Requests',     COUNT(*) FROM leave_requests
UNION ALL SELECT '✓ Receipt Requests',   COUNT(*) FROM order_receipt_requests
UNION ALL SELECT '✓ Shipment Receipts',  COUNT(*) FROM shipment_receipts
UNION ALL SELECT '✓ Expenses',           COUNT(*) FROM expenses
UNION ALL SELECT '✓ Delivery Proofs',    COUNT(*) FROM delivery_proofs
UNION ALL SELECT '✓ Maintenance',        COUNT(*) FROM maintenance_records;
