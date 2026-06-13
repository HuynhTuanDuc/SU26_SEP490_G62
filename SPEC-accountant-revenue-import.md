# SPEC: Accountant - Quản lý thu / Import Excel Doanh thu

> **Context:** Chức năng Accountant quản lý thu - import từ file Excel doanh thu hàng tháng.
> Mỗi lần import = 1 order (file Excel), mỗi dòng Excel = 1 shipment.
> Đã xác nhận nghiệp vụ với doanh nghiệp.

---

## TÓM TẮT TRẠNG THÁI

| Module | Trạng thái |
|--------|-----------|
| **Luồng nhập tay** | ✅ Hoàn thành (đang chạy) |
| **Luồng import Excel** | 🟡 Tạm dừng |
| **Thu tiền / Phiếu thu** | ❌ Chưa làm |
| **Công nợ / Đối soát** | ❌ Chưa làm |
| **Báo cáo doanh thu** | ❌ Chưa làm |

---

## 1. Mô tả nghiệp vụ

### 1.1 Nguồn dữ liệu
- File Excel: `Doanh thu 2026.xlsx` - Sheet `T52026`
- Mỗi lần import tương ứng với **1 Order** (1 file = 1 đợt nhập)
- Mỗi dòng trong Excel = **1 Shipment** (1 chuyến xe)

### 1.2 Cấu trúc file Excel (header row)

| Cột Excel | Bắt buộc | Mô tả |
|-----------|-----------|--------|
| `Ngày, tháng, năm` | ✅ | Ngày chạy chuyến (format: DD/MM/YYYY) |
| `BKS` | ✅ | Biển kiểm soát xe (ví dụ: `29E-080.32`) |
| `Lái xe` | ❌ (null OK) | Tên tài xế |
| `Khách hàng` | ❌ (null OK) | Tên khách hàng |
| `Hành trình` | ✅ | Tuyến đường: `"A - B"` hoặc `"A - B - C - D"` (nhiều điểm) |
| `Cước xe` | ✅ | Giá cước vận chuyển (VNĐ) |
| `Vé` | ❌ (null OK) | Phí phụ thu (vé vào cổng, bến bãi...) |
| `Doanh thu` | ✅ | Bằng `Cước xe` (xác nhận) |
| `KH đã thanh toán` | ❌ (skip) | Chưa xử lý, mặc định chưa thu |
| `Lái xe thu/chi` | ❌ (skip) | Chưa xử lý, liên quan lương tài xế |
| `Đổ dầu` | ❌ (skip) | Chi phí, nhập tay sau |
| `Ứng lương` | ❌ (skip) | Công nợ lương, nhập tay sau |
| `Ghi chú` | ❌ (skip) | Nhập tay sau |
| `Chấm công` | ❌ (skip) | Bỏ qua |
| `Quãng đường` | ❌ (skip) | Bỏ qua, chờ bàn thêm |

### 1.3 Xử lý cột "Hành trình"

**Quy tắc:** Nếu có từ 1 điểm trở lên, tách như sau:
- Điểm 1..N-1: `pickup` (lấy hàng)
- Điểm cuối (thằng cuối cùng): `delivery` (giao hàng)

**Ví dụ:**
- `"A - B"` → pickup: `A`, delivery: `B`
- `"Hateco - Hào Nam - Tôn Thất Tùng"` → pickup: `Hateco`, pickup: `Hào Nam`, delivery: `Tôn Thất Tùng`

**Quy ước tách chuỗi:**
- Tách bằng ký tự `" - "` (dấu gạch ngắn có khoảng trắng 2 đầu)
- Trim từng phần, loại bỏ khoảng trắng thừa
- Nếu sau tách chỉ có 1 phần: cả 2 địa chỉ đều = phần đó (log cảnh báo)

---

## 2. CODE ĐÃ TRIỂN KHAI ✅

### 2.1 Backend Repository (`accountantOrderRepository.js`)
- `parseRouteToStops()` — tách chuỗi hành trình `"A - B - C"` → N stops
- `parseDate()` — xử lý date từ Excel (ISO string, serial number, Date object)
- `parseMoney()` — parse số tiền, loại bỏ `đ`, dấu phẩy, khoảng trắng
- `findVehicleByPlate()` — match BKS → vehicle_id
- `findDriverByName()` — match tên tài xế → driver_id (ưu tiên driver đang gán xe đó)
- `findCustomerByName()` — match tên khách hàng → customer_id
- `bulkImportRevenueOrders()` — tạo **1 Order** + **N Shipments** + **trip_stops** + **pass_through_costs** trong 1 transaction

### 2.2 Backend Controller + Service
- `POST /accountant/revenue/parse` — parse file, trả preview
- `POST /accountant/revenue/import` — import đầy đủ

### 2.3 Frontend (`OrderFormModal.jsx`)
- Đúng header Excel: `Ngày, tháng, năm`, `BKS`, `Lái xe`, `Hành trình`, `Cước xe`, `Vé`
- Preview table: hiển thị điểm dừng đã parse, cột match xe/tài xế
- Tổng tiền cước + vé ở footer

### 2.4 Test Data
- `Import_Test_Order_T52026.xlsx` — 16 test cases
- `test_seed_import.sql` — seed data test để import vào DB

### 2.5 Luồng nhập tay (`POST /accountant/orders`)
- Đã sửa: dùng `derived_status` thay vì `status`
- Đã sửa: tạo `trip_stops` cho đơn lẻ (pickup + delivery)

---

## 3. NHỮNG THỨ CẦN HOÀN THIỆN SAU

### 3.1 Import Excel (tạm dừng)
- [ ] Hoàn thiện `handleExcelSubmit` — hiện tại đang gửi raw rows, cần confirm flow
- [ ] Xử lý file thực tế: đọc header row → detect columns → parse → preview
- [ ] Backend parse route `"Bình Minh - Bắc Giang x2c"` — tách ra 2 dòng
- [ ] Test với file Excel thực tế

### 3.2 Thu tiền / Phiếu thu
- [ ] Tạo bảng `receipt_vouchers` hay dùng `debt_payments`?
- [ ] Ghi nhận thanh toán: tiền mặt, chuyển khoản
- [ ] In phiếu thu (PDF)

### 3.3 Công nợ
- [ ] Tạo `debts` khi import? Hoặc chỉ tạo khi thu tiền?
- [ ] Lịch sử công nợ theo order

### 3.4 Đối soát quỹ tài xế
- [ ] Xem tài xế đã thu hộ bao nhiêu
- [ ] Tài xế nộp tiền về công ty

### 3.5 Báo cáo doanh thu
- [ ] Tổng hợp theo tháng
- [ ] Chi tiết theo tài xế / xe / khách hàng

---

## 4. BẢNG SO SÁNH: PDF Design Spec vs DB Thực Tế

> ⚠️ **PHÁT HIỆN:** PDF Design Spec (`Report4`) đã **LỖI THỜI** so với DB thực tế. DB đã được thiết kế lại hoàn toàn.

### 4.1 `profiles`
| Field | PDF | DB Thực tế |
|-------|-----|-------------|
| `id` | PK, UUID | PK, INT (auto) |
| `email` | Có trong profiles | ❌ Di chuyển sang bảng `accounts` riêng |
| `is_active` | Có | ❌ Di chuyển sang `accounts` |
| `dob`, `gender`, `city`, `country` | Không có | ✅ Có (DB bổ sung) |

**=> Kết luận:** PDF sai. DB đúng hơn (tách auth khỏi profile, chuẩn hóa).

### 4.2 `orders`
| Field | PDF | DB Thực tế |
|-------|-----|-------------|
| `pickup_address` | Có | ❌ Không có — chuyển sang `trip_stops` |
| `delivery_address` | Có | ❌ Không có — chuyển sang `trip_stops` |
| `estimated_price` | Có | ❌ → chia thành `total_estimated_price`, `total_actual_price` |
| `status` | Có | ❌ → đổi thành `derived_status` |
| `is_confidential` | Có | ✅ Có |
| `import_batch_id` | Không | ✅ Có |

**=> Kết luận:** PDF sai nghiêm trọng. DB chuẩn hóa đúng: địa chỉ nằm ở `trip_stops`, không phải `orders`.

### 4.3 `order_shipments`
| Field | PDF | DB Thực tế |
|-------|-----|-------------|
| `pickup_address`, `delivery_address` | Có | ❌ Không có |
| `actual_delivery_time` | Có | ❌ → tách thành nhiều timestamp: `picking_at`, `transit_at`, `arrived_at`, `completed_at`, `failed_at` |
| `customer_confirmed` | Có | ❌ Không có |
| `vehicle_group_id` | Không | ✅ Có |
| `owner_driver_id` | Không | ✅ Có |
| `trip_code` | Không | ✅ Có |
| `version` | Không | ✅ Có (optimistic locking) |
| `cancel_reason` | Không | ✅ Có |

**=> Kết luận:** PDF mô tả thiếu. DB bổ sung nhiều trường cần thiết.

### 4.4 `drivers`
| Field | PDF | DB Thực tế |
|-------|-----|-------------|
| `base_salary` | Có (trong drivers) | ❌ → di chuyển sang `payrolls` |
| `joined_at` | Có | ❌ → đổi thành `hire_date` |
| `emergency_contact` | 1 trường | ✅ Tách thành `emergency_contact_name`, `emergency_contact_phone` |
| `revenue_share_percent` | Không | ✅ Có |
| `license_number`, `license_expiry_date` | Không | ✅ Có |
| `vehicle_id` | Không | ✅ Có (1-1 relationship) |

**=> Kết luận:** PDF thiếu nhiều trường. DB chuẩn hóa tốt hơn.

### 4.5 `payrolls`
| Field | PDF | DB Thực tế |
|-------|-----|-------------|
| `base_salary`, `revenue_bonus`, `deduction`, `total_salary` | Có (sơ lược) | ✅ Có, chi tiết hơn nhiều |
| `absence_penalty` | Không | ✅ Có |
| `insurance_employee`, `insurance_company` | Không | ✅ Có |
| `driver_debt_deduction`, `advance_deduction` | Không | ✅ Có |
| `gross_salary` (computed) | Không | ✅ Có |
| `net_salary` (computed) | Không | ✅ Có |
| Workflow: reviewed/approved/paid | Không | ✅ Có |

**=> Kết luận:** DB vượt trội so với PDF.

### 4.6 Các bảng KHÁC

| Bảng | PDF vs DB |
|-------|-----------|
| `roles` | ✅ Giống nhau |
| `notifications` | Có khác: PDF `content`, DB `body` + `type` + `entity_type` + `entity_id` |
| `activity_logs` | ❌ Khác hoàn toàn: PDF `title`, `metadata`; DB `action`, `old_data`, `new_data`, `ip_address` |
| `vehicle_groups` | Gần giống: PDF `fixed_price_per_km`, DB `price_per_km` |
| `vehicles` | Gần giống: thêm `brand`, `model`, `manufacture_year` |
| `maintenance_records` | Gần giống |
| `customers` | ✅ Giống nhau |
| `partners` | ✅ Giống nhau |
| `shipment_assignments` | DB thêm `assignment_type`, `assigned_by` |
| `expenses` | ✅ Giống nhau |
| `expense_attachments` | ✅ Giống nhau |
| `debts` | DB thêm `total_amount`, `updated_by` |
| `kpi_records` | DB thêm `vehicle_group_id`, `incident_count`, `on_time_rate` (computed) |
| `bonus_rules` | DB thêm `bonus_type`, `is_active`, `conditions_json` |
| `bonus_records` | DB thêm `kpi_record_id`, `awarded_month`, `awarded_year` |
| `incidents` | DB mở rộng nhiều: `replacement_vehicle_id`, `replacement_driver_id`, `resolved_by` |

### 4.7 Bảng MỚI trong DB (không có trong PDF)

| Bảng | Mô tả |
|------|-------|
| `accounts` | Tách từ profiles — email, password_hash, is_active, last_login |
| `pass_through_costs` | Chi phí đi qua (bot, phà, vé...) |
| `shipment_payments` | Tiền thu hộ của tài xế |
| `payment_receipts` | Ảnh biên nhận thanh toán |
| `delivery_proofs` | Ảnh chứng minh giao hàng |
| `trip_runs` | Lượt chạy (X2C = 2 lượt) |
| `shipment_assignment_history` | Lịch sử thay đổi driver/xe |
| `shipment_vehicle_upgrades` | Nâng cấp xe lên |
| `salary_advances` | Ứng lương tài xế |
| `invoice_shipments` | Liên kết hóa đơn với shipments |
| `incident_evidences` | Bằng chứng sự cố |
| `v_leaderboard` | View xếp hạng tài xế |
| `v_trip_pool` | View pool shipment khả dụng |
| `v_driver_debt_summary` | View tổng hợp công nợ tài xế |
| `v_customer_debt_summary` | View tổng hợp công nợ khách hàng |

---

## 5. KHUYẾN NGHỊ

1. **PDF Design Spec cần cập nhật.** Nhiều bảng đã khác biệt đáng kể. Nếu cần nộp báo cáo, cần sync lại.

2. **Ưu tiên tiếp theo:** Xác định luồng "Thu tiền / Phiếu thu" trước khi quay lại Excel. Hiện tại `PaymentModal` đang dùng `debt_payments` nhưng chưa rõ UX cho việc ghi nhận thu tiền.

3. **Quyết định về `debts`:** Khi import Excel, có 2 hướng:
   - A) Tạo `debts` ngay với `total_amount = cước xe`, `paid_amount = 0`
   - B) Chỉ tạo `debts` khi bấm "Ghi nhận thanh toán"

4. **BKS → vehicle mapping:** Cần thống nhất format BKS. File Excel có `29E-080.32` (dấu chấm), DB có `51-A12345` (dấu gạch). Cân nhắc chuẩn hóa.
