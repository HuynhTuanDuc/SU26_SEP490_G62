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
 *           enum: [driver, customer]
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
 *         schema: { type: string, enum: [driver, customer] }
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
 *               personType: { type: string, enum: [driver, customer] }
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
