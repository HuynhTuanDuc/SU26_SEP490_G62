# ACCOUNTANT MODULE SPECIFICATION V1.0

# 1. PURPOSE

Tài liệu mô tả đầy đủ nghiệp vụ role **Kế toán (Accountant)** trong hệ thống quản lý vận tải.

Tài liệu là nguồn chuẩn để:

* Thiết kế / đối chiếu Database
* Thiết kế / đối chiếu Backend API
* Thiết kế / đối chiếu Web Kế toán (FE)
* Thiết kế Test Case
* Đào tạo người dùng kế toán

Hệ thống đóng vai trò **TMS (Transportation Management System)** — lưu dữ liệu vận hành thô và sinh sổ nhật ký tài chính. Kế toán khai thác dữ liệu, đối soát dòng tiền và **xuất kỳ kế toán sang phần mềm kế toán ngoài (MISA hoặc tương đương)** để xử lý bút toán chính thức.

---

# 2. VAI TRÒ KẾ TOÁN — TỔNG QUAN

Kế toán KHÔNG tham gia vận hành chuyến (không tạo trip, không điều phối, không duyệt phiếu thu vận hành).

Kế toán chịu trách nhiệm:

## Doanh thu
* Theo dõi doanh thu các đơn hoàn thành
* Nhập đơn ngoài hệ thống (đơn đã chạy xong ngoài phần mềm)
* Import Excel đơn ngoài hàng loạt theo template

## Dòng tiền vào
* Ghi nhận khách hàng thanh toán (từng lần, phân bổ FIFO)
* Xác nhận tiền chuyển khoản về tài khoản công ty
* Xác nhận tài xế nộp quỹ (tiền mặt thu hộ)

## Công nợ
* Theo dõi công nợ khách hàng và công nợ tài xế
* Xác nhận / từ chối yêu cầu nộp tiền của tài xế (từ mobile)
* Điều chỉnh công nợ bằng tay khi tài xế không tạo yêu cầu

## Lương thưởng
* Generate và chốt bảng lương tháng (phối hợp Manager)
* Đánh dấu đã chi lương (tự động cấn trừ nợ, chuyển bonus sang đã chi)
* Giải ngân ứng lương (sau khi Manager duyệt)
* Chi thưởng/phúc lợi lẻ ngoài kỳ

## Sổ sách
* Xem nhật ký tài chính (append-only ledger)
* Xuất kỳ kế toán ra CSV để import MISA

---

# 3. MÀN HÌNH WEB KẾ TOÁN

Sidebar gồm các mục (route nội bộ AccountantPage):

| Mục | View | Chức năng chính |
|---|---|---|
| Quản lý doanh thu | RevenueView | Bảng đơn hoàn thành, thống kê, nhập đơn ngoài, import Excel, ghi nhận thanh toán |
| Quản lý công nợ | DebtView | Công nợ khách/tài xế, hàng chờ xác nhận nộp tiền, thu tiền tay |
| Bảng lương | PayrollView (tab payroll) | Generate, xác nhận, đánh dấu đã chi |
| Ứng lương | PayrollView (tab advance) | Giải ngân yêu cầu đã duyệt |
| Thưởng & Phúc lợi | BonusView | Danh sách bonus, chi lẻ ngoài kỳ |
| Báo cáo tổng quan | ReportView | Doanh thu / công nợ / lương theo kỳ |
| Nhật ký tài chính | LedgerView | Sổ ledger, lọc, xuất kỳ kế toán |

Nút hành động trên TopBar (tab Doanh thu): **"Nhập đơn ngoài"** và **"Import Excel"**.

---

# 4. TRANG DOANH THU

## 4.1 Bốn ô thống kê (getFinanceStats)

| Ô | Định nghĩa | Công thức |
|---|---|---|
| Tổng doanh thu | Doanh thu ghi nhận = tổng CƯỚC XE (`actual_price`) của mọi đơn `completed`. KHÔNG phụ thuộc đã thu tiền hay chưa. KHÔNG gồm chi hộ khách | `SUM(actual_price)` |
| Đã thu về | Tiền công ty THỰC NẮM | `Σ GREATEST(collectible − nợ khách còn lại − tiền tài xế đang giữ − phiếu thu chưa xác nhận, 0)` với `collectible = cước + chi hộ khách` |
| Còn phải thu | Tổng tiền chưa về | `Σ (nợ khách còn lại + tiền tài đang giữ + phiếu thu chưa xác nhận)` |
| Đơn chưa thu đủ | Số đơn còn tồn tiền | đếm đơn có tổng tồn > 0 |

**Đẳng thức kiểm tra:** `Tổng doanh thu + Tổng chi hộ khách = Đã thu về + Còn phải thu` (với mọi đơn completed).

## 4.2 Bảng đơn (getAllOrders)

Mỗi dòng đơn hiển thị:

* `final_price` = **cước + chi hộ khách** (số khách phải trả). Chưa chốt giá → fallback giá ước tính, ghi chú "ước tính". Có chi hộ → dòng phụ "gồm chi hộ Xđ"
* `debt_status`: `paid` (Đã thu đủ) / `partial` (Thu 1 phần) / `unpaid` (Chưa thu) — tính trên tổng khách phải trả
* `driver_debt_remaining`: "TX giữ: Xđ" khi tài xế còn giữ tiền
* Mở rộng dòng → danh sách chuyến: giá từng chuyến (cước + chi hộ), trạng thái nộp tiền tài xế 3 mức: **Đã nộp đủ / Nộp 1 phần (đã nộp X · còn Y) / Chưa nộp**

## 4.3 Modal chi tiết đơn

* Thông tin khách, tài chính (Thực thu khách = cước + chi hộ, có breakdown), số chuyến
* Danh sách chuyến: hành trình, tài xế/xe, chi phí tách loại (chi hộ khách / xăng dầu / chi phí khác công ty chịu)
* **Panel xác nhận chuyển khoản** ngay trong chuyến (khi phiếu thu là bank_transfer chờ xác nhận): xem ảnh bằng chứng, nhập số thực nhận, xác nhận

## 4.4 Modal ghi nhận thanh toán (khách trả tiền)

```text
Kế toán nhập { số tiền, hình thức (tiền mặt / chuyển khoản), ghi chú }
  ↓
Phân bổ ưu tiên: đơn hiện tại trước → phần thừa chảy sang nợ cũ (FIFO cũ nhất trước)
  ↓
INSERT debt_payments (confirmed) từng khoản
  ↓
Ghi sổ: customer_payment (1111 hoặc 1121 / 131) = tổng tiền nhận
```

* Chặn trả vượt tổng nợ còn lại của khách
* Lịch sử thanh toán đơn hiển thị: số tiền · hình thức · ngày giờ · người ghi · trạng thái (Đã xác nhận / Chờ xác nhận / Từ chối) · ghi chú

---

# 5. NHẬP ĐƠN NGOÀI (EXTERNAL ORDER)

Đơn đã chạy xong NGOÀI hệ thống (trước đây quản lý bằng Excel tay), kế toán nhập để đối soát, công nợ và tính lương.

## 5.1 Quy tắc tiền

* `actual_price` (doanh thu, KPI) = **CƯỚC THUẦN** (`cargo_fee`) — pass-through KHÔNG vào doanh thu (BR-027)
* Tổng khách phải trả = cước + chi hộ khách (toll / parking / etc)
* Chi phí công ty chịu: fuel / repair — vào chi phí vận hành, không cộng tiền khách
* Đơn insert với shipment `status = completed`, có `completed_at` đúng ngày chạy

## 5.2 Trạng thái tiền của chuyến (`payment_type` + `driver_payment_state`)

| Ca | payment_type | driver_payment_state | Hệ quả |
|---|---|---|---|
| Khách CK/trả thẳng công ty | bank_transfer | company_received | Không tạo nợ |
| Khách đưa tiền mặt, tài ĐANG giữ | cash | driver_holding | Tạo **Nợ tài xế** = cước + chi hộ (hoặc số ghi đè) |
| Khách đưa tiền mặt, tài ĐÃ nộp về | cash | driver_paid | Tạo Nợ tài xế + debt_payment confirmed ngay (tất toán) |
| Khách chưa trả | client_credit | company_received | Tạo **Nợ khách hàng** = cước + chi hộ |

Ràng buộc: `client_credit` không kết hợp được với trạng thái tài giữ/nộp tiền; "Khách nợ" bắt buộc có SĐT khách.

## 5.3 Ghi sổ khi tạo đơn ngoài (mỗi chuyến)

* `shipment_revenue` 131/511 = cước
* `pass_through_cost` 3388/1111 cho từng chi hộ; `expense_recorded` 642/1111 cho chi phí công ty
* `prepaid_received` 1121/131 nếu có tiền khách ứng trước (cấp đơn)
* `driver_debt_created` 1388/131 khi tài giữ/đã nộp; thêm `driver_debt_paid` 1111/1388 nếu đã nộp
* **KHÔNG** ghi `customer_debt_created` (doanh thu đã ghi qua shipment_revenue — tránh double 511); nợ khách chỉ nằm ở bảng `debts`

## 5.4 Định danh khách hàng

* Khóa nhận diện = **SĐT** (find-or-create theo phone)
* Khách lẻ không SĐT → gom chung 1 hồ sơ "Khách lẻ" (phone rỗng), không theo dõi nợ được

---

# 6. IMPORT EXCEL ĐƠN NGOÀI

Thay thế sổ Excel tay của doanh nghiệp. Template: **Template Import Don Ngoai.xlsx** (tải ngay trong modal).

## 6.1 Template (1 dòng = 1 chuyến hoàn thành, 18 cột)

Bắt buộc: Ngày chạy (dd/mm/yyyy) · Biển số xe · Tên tài xế · Điểm lấy · Điểm giao · Cước xe · **Thanh toán**.

Cột "Thanh toán" nhận đúng 4 giá trị (map vào bảng 5.2):

```text
CK công ty | Tiền mặt - tài đã nộp | Tiền mặt - tài đang giữ | Khách nợ
```

Cột đặc biệt:

* **Số lượt (tăng bo)** = N → hệ thống tách N chuyến, cước chia đều, chi phí + tiền giữ gắn lượt 1. KPI số chuyến tính N
* **Tiền tài đang giữ** — chỉ điền khi khác (cước + chi hộ): khách trả thiếu / tài nộp một phần → ghi đè số nợ tài xế. Không dùng cùng dòng tăng bo
* Phí cầu đường/vé, phí đỗ xe → expense khách chịu; Xăng dầu, Sửa xe → expense công ty chịu

## 6.2 Luồng import

```text
Chọn file → FE parse + validate từng dòng (đọc header theo tên, chấp nhận không dấu)
  ↓
Còn dòng lỗi → liệt kê "Dòng N: lý do", CHẶN import (bắt sửa file)
  ↓
Hợp lệ → preview bảng → Import
  ↓
BE validate lại từng đơn độc lập → đơn lỗi bị bỏ qua kèm lý do, đơn hợp lệ vẫn vào
  ↓
Kết quả: imported_count + errors[] theo số dòng Excel
```

* KHÔNG nhập qua import: chấm công, ngày nghỉ, ứng lương, bảo dưỡng (dùng chức năng riêng)
* `completed_at` = ngày chạy trong file → doanh thu/KPI rơi đúng tháng quá khứ

---

# 7. XÁC NHẬN CHUYỂN KHOẢN (BANK TRANSFER)

Khi driver chọn "Khách chuyển khoản về công ty" trên mobile, phiếu thu ở trạng thái **chờ kế toán xác nhận tiền về**.

```text
Danh sách phiếu thu bank_transfer chưa xác nhận (kèm ảnh bằng chứng driver chụp)
  ↓
Kế toán nhập SỐ TIỀN THỰC NHẬN + ghi chú → Xác nhận
  ↓
Ghi sổ bank_receipt 1121/131 = số thực nhận (marker chống xác nhận trùng — lần 2 trả 409)
  ↓
  ├─ Thiếu  → tạo Nợ khách hàng phần thiếu
  ├─ Thừa  → phân bổ tự động vào nợ cũ của khách (FIFO), debt_payments confirmed
  └─ Đủ    → xong
  ↓
Driver nhận notification kết quả
```

---

# 8. CÔNG NỢ

## 8.1 Nguyên tắc

Trạng thái nợ **tính động** — không lưu cột status:

```text
remaining = debts.total_amount − SUM(debt_payments.amount WHERE status = 'confirmed')
paid / partial / unpaid / overdue (quá hạn khi remaining > 0 và due_date < hôm nay)
```

Cho phép trả nhiều lần; mỗi lần 1 dòng `debt_payments`.

## 8.2 Trang công nợ

* Thống kê: Tổng nợ phải thu / Khách hàng nợ / Tài xế đang giữ tiền
* 2 tab: theo Khách hàng / theo Tài xế; lọc trạng thái; xổ dòng xem từng khoản nợ
* Nút thu tiền theo người → phân bổ FIFO các khoản nợ của người đó

## 8.3 Hàng chờ "Báo nộp tiền chờ xác nhận"

Nguồn: (a) tài xế gửi yêu cầu nộp quỹ từ mobile (kèm ảnh chứng từ), (b) khoản phân bổ tiền thừa khách trả qua tài xế (method `offset`, chờ duyệt).

```text
Panel vàng trên đầu trang công nợ (tự ẩn khi trống)
  ↓
Mỗi dòng: ảnh chứng từ (phóng to) · người nộp · loại · mã nợ · hình thức · thời gian · số tiền
  ↓
  ├─ Xác nhận → debt_payments confirmed + ghi sổ + WebSocket báo driver (nợ giảm ngay trên app)
  └─ Từ chối (bắt buộc lý do) → driver nhận thông báo kèm lý do
```

Ghi sổ khi xác nhận:

* Nợ tài xế: `driver_debt_paid` (1111 hoặc 1121)/1388
* Nợ khách: `customer_payment` (1111 hoặc 1121)/131
* Method `offset` (cấn trừ nội bộ): **KHÔNG ghi sổ tiền mặt** — tiền chỉ về khi tài xế nộp quỹ

## 8.4 Điều chỉnh bằng tay

Tài xế đưa tiền trực tiếp không tạo yêu cầu → kế toán dùng nút thu tiền theo người (8.2) hoặc theo đơn (4.4). Mọi khoản đều vào `debt_payments` + ghi sổ, không sửa số dư trực tiếp.

---

# 9. BẢNG LƯƠNG

## 9.1 Công thức (chính sách 01/04/2026)

```text
LƯƠNG THỰC NHẬN =
  (Lương cứng / 28) × ngày công thực tế        [8tr <12 tháng; 9tr ≥12 tháng]
  + 15% doanh thu (cước thuần các chuyến hoàn thành trong tháng)
  + Thưởng vượt KPI (2tr khi vượt ngưỡng doanh thu theo nhóm xe — bonus_rules)
  + Thưởng lái xe xuất sắc (1tr — top 1 doanh thu nhóm xe)
  + Đi làm ngày lễ 200% (tự cộng 100% lương ngày cho mỗi ngày lễ có chuyến hoàn thành — company_holidays)
  + Thưởng & phúc lợi approved trong kỳ (Tết, hiếu hỉ, sinh nhật, đặc biệt)
  + Phụ cấp điện thoại 200.000đ
  − BHXH người lao động 557.550đ (10,5% × 5.310.000; công ty đóng 1.141.650đ không trừ)
  − Ứng lương đã giải ngân trong tháng
  − Công nợ tài xế còn tồn (cap theo lương khả dụng, phần dư chuyển tháng sau)
  − Phạt nghỉ không lương
```

Cột DB: `overtime_bonus` = snapshot thưởng phúc lợi; `holiday_bonus` = 200% lễ; `other_bonus` = phụ cấp điện thoại.

## 9.2 Luồng trạng thái

```text
pending (kế toán generate / hệ thống tính)
  ↓ Manager duyệt
reviewed
  ↓ Kế toán xác nhận
approved
  ↓ Kế toán đánh dấu ĐÃ CHI (markPayrollPaid)
paid
```

## 9.3 markPayrollPaid — 1 transaction

```text
1. payrolls → paid
2. driver_bonuses approved-trong-kỳ → paid (chi qua lương; cảnh báo nếu lệch snapshot)
3. Cấn trừ nợ tài xế đã khấu trừ: INSERT debt_payments (method='offset', confirmed) FIFO nợ cũ nhất
4. Ghi sổ: driver_debt_paid 334/1388 (cấn trừ) + advance_recovered 334/141 (hoàn ứng) + payroll_paid 334/1111 (net)
```

## 9.4 Ứng lương

* Driver chỉ được ứng **ngày 25**, tối đa **5.000.000đ/tháng** (backend chặn cứng)
* Flow: Driver request → Manager approve → **Kế toán disburse** → ghi sổ `advance_disbursed` 141/1111
* Trừ ngay vào lương THÁNG ứng

## 9.5 Thưởng & phúc lợi

* Mức tự điền: kết hôn 1tr · tang (bản thân 1tr / thân nhân 500k) · sinh nhật 200k · Tết theo công thức thâm niên + chuyên cần
* Mặc định **chi qua lương** (approved → tự thành paid khi chi lương)
* Nút "Chi trả" trên BonusView = chi LẺ ngoài kỳ (có cảnh báo) → ghi sổ `bonus_paid` 642/1111

---

# 10. NHẬT KÝ TÀI CHÍNH & XUẤT MISA

## 10.1 Nguyên tắc

* Bảng `financial_transactions` **append-only**: chỉ INSERT, không UPDATE/DELETE
* Mỗi sự kiện tiền tệ = 1 dòng: event_type, TK nợ/có, số tiền (>0), diễn giải, tham chiếu, người thao tác
* **Doanh thu ghi đúng 1 lần** qua `shipment_revenue`; nợ phát sinh không ghi lại 131/511
* Cấn trừ nội bộ (`offset`) không ghi dòng tiền mặt

## 10.2 Bảng sự kiện (15 event)

| event_type | TK nợ/có | Khi nào |
|---|---|---|
| shipment_revenue | 131/511 | Chốt phiếu thu / tạo đơn ngoài (chỉ cước) |
| prepaid_received | 1121/131 | Khách ứng trước khi tạo đơn |
| prepaid_refunded | 131/1121 | Hủy đơn có tiền ứng |
| cash_receipt | 1111/131 | Thu tiền mặt trực tiếp |
| bank_receipt | 1121/131 | Kế toán xác nhận CK về (số thực nhận) |
| driver_debt_created | 1388/131 | Tài xế cầm tiền khách |
| driver_debt_paid | 1111·1121·334 / 1388 | Tài xế nộp quỹ / cấn trừ lương |
| customer_debt_created | 131/511 | CHỈ khi doanh thu chưa ghi qua shipment_revenue |
| customer_payment | 1111·1121/131 | Khách thanh toán nợ |
| pass_through_cost | 3388/1111 | Chi hộ khách được duyệt |
| expense_recorded | 642/1111 | Chi phí vận hành được duyệt |
| payroll_paid | 334/1111 | Chi lương (net) |
| bonus_paid | 642/1111 | Chi thưởng lẻ ngoài kỳ |
| advance_disbursed | 141/1111 | Giải ngân ứng lương |
| advance_recovered | 334/141 | Hoàn ứng khi chi lương |

## 10.3 Quy ước mapping MISA (dữ liệu thô → bút toán chính thức)

Hệ thống là TMS gửi **dữ liệu thô**: cột TK nợ/có trong file chỉ là GỢI Ý mapping — kế toán MISA là người hạch toán chuẩn.

* **TK 3388 (chi hộ khách)**: TMS chỉ ghi vế PHÁT SINH chi hộ (`pass_through_cost` — Nợ 3388/Có 1111). Vế THU HỒI khi khách trả không tách riêng trong sự kiện tiền về — kế toán MISA tự hạch toán tất toán 3388 dựa vào 2 cột tách kèm theo.
* File export có 2 cột **`tien_cuoc` / `tien_chi_ho`** trên các sự kiện tiền về (bank_receipt, driver_debt_created/paid, customer_payment, cash_receipt): MISA hạch toán Có 131 phần cước, Có 3388 phần chi hộ. Quy ước tách: **chi hộ được thu trước** (chi hộ = MIN(tổng chi hộ đơn, số tiền sự kiện)); đơn thanh toán nhiều lần thì đối chiếu theo `ref_id`.
* Cột **`but_toan_dao`**: khác rỗng = dòng điều chỉnh cho bút toán (id ghi trong cột) đã xuất ở kỳ trước — MISA hạch toán như bút toán điều chỉnh kỳ sau.

## 10.4 Bút toán đảo (reversal entry)

Sổ append-only — sai KHÔNG sửa/xóa, ghi dòng NGƯỢC CHIỀU (đổi TK nợ↔có, cùng số tiền) gắn `reversal_of_id` + lý do:

```text
TH1 — gốc CHƯA xuất MISA: đảo xong, khi xuất kỳ cả CẶP gốc+đảo được đánh dấu
      batch "VOID-..." và LOẠI khỏi file → MISA nhận file sạch, vết sai vẫn đủ trong TMS.
TH2 — gốc ĐÃ xuất: dòng đảo nằm trong file KỲ SAU như bút toán điều chỉnh (cột but_toan_dao).
```

* Đảo từ màn Nhật ký (nút "Đảo", bắt buộc lý do); dòng đã là bút toán đảo hoặc đã bị đảo thì không đảo tiếp.
* **Hủy xác nhận khoản nộp tiền** (lịch sử thanh toán → "Hủy"): `debt_payments` → `voided` (số dư nợ tự hồi phục) + hệ thống TỰ tìm và đảo dòng sổ tương ứng; khoản `offset` không có dòng tiền mặt nên chỉ void. Driver nhận cập nhật nợ realtime.

## 10.5 Màn nhật ký + xuất kỳ

* Lọc theo loại sự kiện / khoảng ngày / đã-chưa xuất; phân trang
* **Xuất kỳ kế toán**: chọn từ ngày–đến ngày → lấy các dòng `exported_at IS NULL` trong kỳ → xuất CSV (BOM UTF-8, cột: id, ngày, loại, diễn giải, TK nợ, TK có, số tiền, tham chiếu) → đánh dấu `exported_at` + `export_batch_id` (EXP-YYYYMMDD-xxx) trong transaction
* Dòng đã xuất không xuất lại; file dùng import vào MISA

---

# 11. LUỒNG PHỐI HỢP VỚI CÁC ROLE KHÁC

```text
Driver (mobile)                Coordinator (web)                 Kế toán (web)
─────────────────              ──────────────────                ─────────────────
COMPLETED + nhập km  ────────► duyệt phiếu thu
                               (chốt actual_price,
                                duyệt expenses)     ────────────► đơn xuất hiện trang Doanh thu
chọn 1/3 nút thanh toán:
├ CK công ty (ảnh)   ─────────────────────────────────────────► xác nhận tiền về (bank_receipt)
├ Tiền mặt tài giữ   → Nợ TX ─────────────────────────────────► theo dõi "TX giữ", chờ nộp quỹ
└ Khách nợ           → Nợ KH ─────────────────────────────────► ghi nhận khách thanh toán dần
gửi yêu cầu nộp quỹ (ảnh) ────────────────────────────────────► xác nhận / từ chối (panel công nợ)
yêu cầu ứng lương    ────────► Manager duyệt      ─────────────► giải ngân ngày 25
                               Manager duyệt lương ────────────► xác nhận + đánh dấu đã chi
```

---

# 12. PERMISSION (trích cho Accountant)

| Chức năng | Accountant |
|---|---|
| Xem trang Doanh thu / Báo cáo / Nhật ký | YES |
| Nhập đơn ngoài + Import Excel đơn ngoài | YES (chỉ Accountant) |
| Ghi nhận khách thanh toán / quản lý nợ khách | YES (chỉ Accountant) |
| Xác nhận CK về công ty | YES |
| Xác nhận / từ chối tài xế nộp quỹ | YES (cùng Manager) |
| Generate / xác nhận / đánh dấu chi lương | YES |
| Giải ngân ứng lương | YES (chỉ Accountant) |
| Chi thưởng lẻ | YES |
| Xuất kỳ kế toán (MISA) | YES (chỉ Accountant) |
| Tạo/duyệt phiếu thu vận hành, điều phối trip, quản lý xe/user | NO |

---

# 13. BUSINESS RULES TÓM TẮT

* **AC-01** Doanh thu = cước thuần, ghi 1 lần duy nhất (`shipment_revenue`); chi hộ khách không phải doanh thu.
* **AC-02** Khách phải trả = cước + chi hộ khách; mọi phép tính đã thu/còn nợ dùng số này.
* **AC-03** Trạng thái nợ tính động từ `debt_payments` confirmed; không sửa số dư trực tiếp.
* **AC-04** Mỗi chuyển động tiền = 1 dòng ledger append-only; `offset` không ghi tiền mặt.
* **AC-05** Phiếu thu bank_transfer chỉ được tính "đã thu" sau khi kế toán xác nhận (`bank_receipt`); xác nhận idempotent.
* **AC-06** Thanh toán phân bổ FIFO nợ cũ nhất trước; chặn trả vượt tổng nợ.
* **AC-07** Chi lương tự động: bonus approved → paid, nợ đã khấu trừ → offset confirmed, hoàn ứng tất toán TK 141.
* **AC-08** Ứng lương: chỉ ngày 25, max 5tr/tháng, trừ ngay tháng ứng.
* **AC-09** Import Excel: dòng lỗi bị từ chối kèm lý do theo số dòng; không ghi dữ liệu nửa vời cho dòng lỗi.
* **AC-10** Đơn ngoài `completed_at` = ngày chạy thực tế → doanh thu/KPI rơi đúng tháng.
* **AC-11** Khách định danh bằng SĐT; "Khách nợ" bắt buộc có SĐT.
* **AC-12** Dòng ledger đã export không được export lại; export đánh batch id trong transaction.
