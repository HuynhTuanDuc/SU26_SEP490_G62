/**
 * @swagger
 * tags:
 *   name: Accountant
 *   description: Nghiệp vụ kế toán — thống kê tài chính, quản lý đơn hàng, công nợ và bảng lương
 */

/**
 * @swagger
 * /accountant/finance/stats:
 *   get:
 *     tags: [Accountant]
 *     summary: Thống kê tài chính tổng quan (doanh thu, công nợ, chi phí)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tổng quan tài chính theo tháng
 */

/**
 * @swagger
 * /accountant/reports/overview:
 *   get:
 *     tags: [Accountant]
 *     summary: Báo cáo tổng quan (doanh thu, số đơn, số chuyến)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dữ liệu báo cáo
 */

/**
 * @swagger
 * /accountant/orders:
 *   get:
 *     tags: [Accountant]
 *     summary: Danh sách đơn hàng (Accountant)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách đơn hàng phân trang
 *   post:
 *     tags: [Accountant]
 *     summary: Tạo đơn hàng mới (Accountant)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Tạo đơn hàng thành công
 */

/**
 * @swagger
 * /accountant/orders/lookup:
 *   get:
 *     tags: [Accountant]
 *     summary: Tra cứu driver / vehicle cho form tạo đơn
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách driver và xe khả dụng
 */

/**
 * @swagger
 * /accountant/orders/{id}/shipments:
 *   get:
 *     tags: [Accountant]
 *     summary: Danh sách shipments của đơn hàng
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Mảng shipments kèm driver, xe, trạng thái
 */

/**
 * @swagger
 * /accountant/orders/{id}:
 *   put:
 *     tags: [Accountant]
 *     summary: Cập nhật đơn hàng (Accountant)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */

/**
 * @swagger
 * /accountant/orders/{id}/shipments/{shipmentId}/driver-payment:
 *   post:
 *     tags: [Accountant]
 *     summary: Kế toán xác nhận driver đã nộp tiền thu hộ
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: shipmentId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:         { type: number }
 *               payment_method: { type: string, enum: [cash, bank_transfer] }
 *               notes:          { type: string }
 *     responses:
 *       201:
 *         description: Ghi nhận thanh toán thành công
 */

/**
 * @swagger
 * /accountant/orders/{id}/payments:
 *   get:
 *     tags: [Accountant]
 *     summary: Lịch sử thanh toán của đơn hàng
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Mảng payment records
 *   post:
 *     tags: [Accountant]
 *     summary: Ghi nhận thanh toán từ khách hàng
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, payment_method]
 *             properties:
 *               amount:         { type: number }
 *               payment_method: { type: string }
 *               notes:          { type: string }
 *     responses:
 *       201:
 *         description: Ghi nhận thành công
 */

/**
 * @swagger
 * /accountant/debts:
 *   get:
 *     tags: [Accountant]
 *     summary: Danh sách công nợ toàn hệ thống
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách công nợ driver và khách hàng
 */

/**
 * @swagger
 * /accountant/debts/stats:
 *   get:
 *     tags: [Accountant]
 *     summary: Thống kê công nợ tổng quan
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total outstanding, overdue, by type
 */

/**
 * @swagger
 * /accountant/debts/grouped:
 *   get:
 *     tags: [Accountant]
 *     summary: Công nợ nhóm theo đối tượng (driver / customer)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách nhóm công nợ
 */

/**
 * @swagger
 * /accountant/debts/person/{personType}/{personId}:
 *   get:
 *     tags: [Accountant]
 *     summary: Công nợ của một người cụ thể
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: personType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [driver, customer, partner]
 *       - in: path
 *         name: personId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Danh sách công nợ của người đó
 */

/**
 * @swagger
 * /accountant/debts/payment/history/{personType}/{personId}:
 *   get:
 *     tags: [Accountant]
 *     summary: Lịch sử thanh toán công nợ của một người
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: personType
 *         required: true
 *         schema: { type: string, enum: [driver, customer, partner] }
 *       - in: path
 *         name: personId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Lịch sử thanh toán
 */

/**
 * @swagger
 * /accountant/debts/payment/preview:
 *   post:
 *     tags: [Accountant]
 *     summary: Xem trước phân bổ thanh toán (trước khi thực sự ghi nhận)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, personType, personId]
 *             properties:
 *               amount:     { type: number }
 *               personType: { type: string, enum: [driver, customer, partner] }
 *               personId:   { type: integer }
 *     responses:
 *       200:
 *         description: Preview phân bổ trước khi ghi nhận
 */

/**
 * @swagger
 * /accountant/debts/payment/allocate:
 *   post:
 *     tags: [Accountant]
 *     summary: Phân bổ thanh toán theo logic tự động
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Phân bổ thành công
 */

/**
 * @swagger
 * /accountant/debts/payment/by-shipment:
 *   post:
 *     tags: [Accountant]
 *     summary: Ghi nhận thanh toán theo chuyến cụ thể
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Ghi nhận thành công
 */

/**
 * @swagger
 * /accountant/debts/payment/by-debt:
 *   post:
 *     tags: [Accountant]
 *     summary: Ghi nhận thanh toán cho một khoản nợ cụ thể
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Ghi nhận thành công
 */

/**
 * @swagger
 * /accountant/payroll:
 *   get:
 *     tags: [Accountant]
 *     summary: Danh sách bảng lương tháng
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Danh sách payroll records
 */

/**
 * @swagger
 * /accountant/payroll/generate:
 *   post:
 *     tags: [Accountant]
 *     summary: Tạo bảng lương tháng cho tất cả driver
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [month, year]
 *             properties:
 *               month: { type: integer, minimum: 1, maximum: 12 }
 *               year:  { type: integer }
 *     responses:
 *       201:
 *         description: Bảng lương đã được tạo
 */

/**
 * @swagger
 * /accountant/payroll/{id}/confirm:
 *   patch:
 *     tags: [Accountant]
 *     summary: Xác nhận bảng lương (chuyển sang confirmed)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã xác nhận bảng lương
 */

/**
 * @swagger
 * /accountant/payroll/{id}/pay:
 *   patch:
 *     tags: [Accountant]
 *     summary: Đánh dấu đã thanh toán lương (paid)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã ghi nhận thanh toán lương
 */

/**
 * @swagger
 * /accountant/payroll/advances:
 *   get:
 *     tags: [Accountant]
 *     summary: Danh sách ứng lương đang chờ giải ngân (Accountant)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng salary advance records đã được manager duyệt
 */

/**
 * @swagger
 * /accountant/payroll/advances/{id}/disburse:
 *   patch:
 *     tags: [Accountant]
 *     summary: Giải ngân ứng lương — Accountant xác nhận đã chuyển tiền (BR-029)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Đã giải ngân
 *       422:
 *         description: Yêu cầu chưa được manager approve
 */

/**
 * @swagger
 * /accountant/vehicle-groups:
 *   get:
 *     tags: [Accountant]
 *     summary: Danh sách nhóm xe (dùng cho dropdown sửa nhóm KPI cố định của tài xế ở màn Bảng lương)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng vehicle groups
 */

/**
 * @swagger
 * /accountant/orders/export:
 *   get:
 *     tags: [Accountant]
 *     summary: Xuất báo cáo chi tiết từng chuyến khớp bộ lọc màn Quản lý doanh thu
 *     description: Dùng cùng bộ filter với GET /accountant/orders, kèm chi phí + trạng thái thanh toán từng chuyến.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: debt_status
 *         schema: { type: string }
 *       - in: query
 *         name: customer
 *         schema: { type: string }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Mảng rows báo cáo (không phân trang)
 */

/**
 * @swagger
 * /accountant/orders/import:
 *   post:
 *     tags: [Accountant]
 *     summary: Import hàng loạt đơn hàng từ template Excel
 *     description: |
 *       Body: { orders: [payload giống POST /accountant/orders, kèm row_index để báo lỗi theo dòng] }.
 *       Tối đa 1000 dòng/lần. Khách lẻ được phép bỏ trống tên/SĐT (khác luồng tạo tay),
 *       trừ chuyến payment_type = client_credit bắt buộc có SĐT để theo dõi công nợ.
 *       Từng dòng lỗi không chặn các dòng còn lại — trả về danh sách imported + errors.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orders]
 *             properties:
 *               orders:
 *                 type: array
 *                 maxItems: 1000
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Import thành công (có thể kèm một số dòng lỗi)
 *       400:
 *         description: Tất cả các dòng đều lỗi, hoặc payload không hợp lệ
 */

/**
 * @swagger
 * /accountant/orders/{id}/customer-debt:
 *   get:
 *     tags: [Accountant]
 *     summary: Tổng quan công nợ khách hàng của một đơn hàng
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Tổng số tiền, đã thu, còn nợ của đơn hàng (đối tượng customer)
 */

/**
 * @swagger
 * /accountant/debts/{id}/transfer-to-driver:
 *   post:
 *     tags: [Accountant]
 *     summary: Chuyển công nợ khách hàng sang công nợ tài xế
 *     description: |
 *       Tái phân loại khoản phải thu — KHÔNG phải một giao dịch tiền thật (không có tiền mặt/
 *       chuyển khoản nào di chuyển). Chuyển TOÀN BỘ số dư còn lại (remaining) của 1 công nợ
 *       khách hàng (debt_type = customer) sang một công nợ tài xế mới (debt_type = driver):
 *       - Đóng công nợ khách bằng 1 debt_payments (payment_method = 'offset', status = confirmed)
 *       - Mở công nợ tài xế mới cùng số tiền còn lại
 *       - Ghi 1 bút toán financial_transactions duy nhất: Nợ 1388 / Có 131 (event_type = debt_transferred)
 *       Chỉ áp dụng cho debt_type = customer và còn số dư > 0.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: debt_id (công nợ khách hàng cần chuyển)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId]
 *             properties:
 *               driverId:
 *                 type: integer
 *                 description: profile_id của tài xế nhận công nợ mới
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đã chuyển công nợ — trả về closedDebtId, newDebtId, amount
 *       400:
 *         description: Tài xế không tồn tại, hoặc công nợ không phải loại customer
 *       404:
 *         description: Không tìm thấy công nợ
 *       409:
 *         description: Công nợ đã tất toán, không còn số dư để chuyển
 */

/**
 * @swagger
 * /accountant/debts/payment/history:
 *   get:
 *     tags: [Accountant]
 *     summary: Lịch sử thanh toán công nợ toàn cục (mọi khách hàng + tài xế)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: person_type
 *         schema: { type: string, enum: [customer, driver] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, confirmed, rejected, voided] }
 *       - in: query
 *         name: method
 *         schema: { type: string, enum: [cash, bank_transfer, offset] }
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách lịch sử thanh toán công nợ phân trang
 */

/**
 * @swagger
 * /accountant/receipts/bank-transfer:
 *   get:
 *     tags: [Accountant]
 *     summary: Danh sách phiếu thu đang chờ xác nhận chuyển khoản (payment_type = bank_transfer)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách phiếu thu chờ kế toán xác nhận đã nhận tiền chuyển khoản
 */

/**
 * @swagger
 * /accountant/receipts/{receiptId}/confirm-bank-transfer:
 *   post:
 *     tags: [Accountant]
 *     summary: Xác nhận đã nhận tiền chuyển khoản của một phiếu thu (TH1 — mục 15)
 *     description: Kế toán xác nhận tiền đã về tài khoản công ty → ghi financial_transactions (event_type = bank_receipt).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: receiptId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *               actual_amount:
 *                 type: number
 *                 description: Số tiền thực nhận (nếu khác amount trên phiếu thu)
 *     responses:
 *       200:
 *         description: Đã xác nhận nhận tiền chuyển khoản thành công
 *       400:
 *         description: Phiếu thu không hợp lệ hoặc không phải chuyển khoản
 *       404:
 *         description: Không tìm thấy phiếu thu
 *       409:
 *         description: Phiếu thu đã được xác nhận trước đó
 */

/**
 * @swagger
 * /accountant/expenses:
 *   get:
 *     tags: [Accountant]
 *     summary: Danh sách chi phí driver khai báo (đối chiếu kế toán)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: expense_type
 *         schema: { type: string, enum: [toll, parking, etc, fuel, repair] }
 *       - in: query
 *         name: reimbursement_status
 *         schema: { type: string }
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách chi phí phân trang kèm thống kê tổng hợp (stats)
 */

/**
 * @swagger
 * /accountant/vouchers:
 *   get:
 *     tags: [Accountant]
 *     summary: Danh sách phiếu chi thủ công (Accountant tạo → Manager duyệt → Accountant xác nhận chi)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected, paid] }
 *       - in: query
 *         name: voucher_type
 *         schema: { type: string, enum: [office, rent, utilities, equipment, entertainment, other] }
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: sort
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách phiếu chi phân trang kèm thống kê tổng hợp (stats)
 *   post:
 *     tags: [Accountant]
 *     summary: Tạo phiếu chi thủ công — chờ Manager duyệt
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [voucher_type, amount, payee, reason]
 *             properties:
 *               voucher_type:
 *                 type: string
 *                 enum: [office, rent, utilities, equipment, entertainment, other]
 *               amount:
 *                 type: number
 *               payee:
 *                 type: string
 *                 description: Người/đơn vị nhận chi
 *               reason:
 *                 type: string
 *                 description: Lý do chi
 *               payment_method:
 *                 type: string
 *                 enum: [cash, bank_transfer]
 *                 default: cash
 *               proof:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh chứng từ (tuỳ chọn)
 *     responses:
 *       201:
 *         description: Đã tạo phiếu chi, chờ Manager duyệt
 */

/**
 * @swagger
 * /accountant/vouchers/{id}/pay:
 *   patch:
 *     tags: [Accountant]
 *     summary: Xác nhận đã chi tiền cho phiếu chi đã được Manager duyệt
 *     description: Chuyển phiếu chi sang status = paid và ghi sổ tài chính (financial_transactions).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã xác nhận chi tiền và ghi sổ tài chính
 *       404:
 *         description: Không tìm thấy phiếu chi
 */

/**
 * @swagger
 * /accountant/spending-summary:
 *   get:
 *     tags: [Accountant]
 *     summary: Tổng hợp chi (expenses + vouchers) theo tháng
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Tổng hợp chi phí công ty theo kỳ
 */

/**
 * @swagger
 * /accountant/ledger:
 *   get:
 *     tags: [Accountant]
 *     summary: Nhật ký tài chính (append-only ledger — financial_transactions)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: event_type
 *         schema:
 *           type: string
 *           enum: [shipment_revenue, prepaid_received, prepaid_refunded, cash_receipt, bank_receipt, driver_debt_created, driver_debt_paid, customer_debt_created, customer_payment, pass_through_cost, expense_recorded, payroll_paid, bonus_paid, advance_disbursed, advance_recovered, collect_on_behalf_held, collect_on_behalf_returned]
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: exported
 *         schema: { type: string, description: "true/false — lọc theo đã xuất hay chưa" }
 *       - in: query
 *         name: sort
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Danh sách bút toán phân trang kèm eventTypes (nhãn hiển thị)
 *       400:
 *         description: event_type không hợp lệ
 */

/**
 * @swagger
 * /accountant/ledger/stats:
 *   get:
 *     tags: [Accountant]
 *     summary: Thống kê nhật ký tài chính theo loại sự kiện
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Thống kê tổng hợp theo event_type
 */

/**
 * @swagger
 * /accountant/ledger/export:
 *   post:
 *     tags: [Accountant]
 *     summary: Xuất kỳ kế toán ra CSV (chốt các bút toán chưa export trong kỳ)
 *     description: |
 *       Đánh dấu các bản ghi financial_transactions chưa export trong khoảng [from, to] là đã
 *       xuất (exported_at + export_batch_id), trả về file CSV có BOM UTF-8 (để Excel/MISA đọc
 *       đúng tiếng Việt). Response KHÔNG phải JSON — Content-Type: text/csv; charset=utf-8,
 *       kèm header X-Export-Batch-Id.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [from, to]
 *             properties:
 *               from:
 *                 type: string
 *                 format: date
 *               to:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: File CSV (text/csv; charset=utf-8, có BOM) chứa các bút toán vừa chốt kỳ
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         description: Thiếu from/to hoặc from > to
 *       404:
 *         description: Không có bút toán nào chưa xuất trong kỳ này
 */

// Không có endpoint đảo bút toán thủ công — bút toán đảo chỉ sinh ra từ luồng nghiệp vụ
// (VD: POST /accountant/debt-payments/{id}/void).
