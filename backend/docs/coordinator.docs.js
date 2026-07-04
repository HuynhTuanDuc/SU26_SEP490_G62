/**
 * @swagger
 * tags:
 *   name: Coordinator
 *   description: Nghiệp vụ điều phối — tạo phiếu thu, quản lý sự cố, xem driver/xe (Coordinator only)
 */

/**
 * @swagger
 * /api/coordinator/vehicle-groups:
 *   get:
 *     tags: [Coordinator]
 *     summary: Danh sách nhóm xe (dùng cho form tạo order)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng vehicle groups
 */

/**
 * @swagger
 * /api/coordinator/partners:
 *   get:
 *     tags: [Coordinator]
 *     summary: Danh sách đối tác / khách hàng (dùng cho form tạo order)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng partners
 */

/**
 * @swagger
 * /api/coordinator/incidents:
 *   get:
 *     tags: [Coordinator]
 *     summary: Danh sách sự cố (Incident Management — mục 18)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách incidents phân trang
 */

/**
 * @swagger
 * /api/coordinator/receipt-requests:
 *   get:
 *     tags: [Coordinator]
 *     summary: Danh sách yêu cầu tạo phiếu thu từ driver (order_receipt_requests — mục 14)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, approved, rejected]
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách yêu cầu phiếu thu phân trang
 */

/**
 * @swagger
 * /api/coordinator/receipt-requests/{id}:
 *   get:
 *     tags: [Coordinator]
 *     summary: Chi tiết một yêu cầu phiếu thu
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết yêu cầu kèm thông tin đơn hàng và actual_km driver gửi
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /api/coordinator/receipt-requests/{id}/approve:
 *   post:
 *     tags: [Coordinator]
 *     summary: Duyệt yêu cầu — tạo phiếu thu thực tế (BR-019)
 *     description: |
 *       Sau khi approve:
 *       - INSERT shipment_receipts (payment_type = NULL — chờ driver xác nhận hình thức)
 *       - UPDATE order_shipments SET actual_price = amount, actual_distance_km = actual_km
 *       - Driver nhận notification và mở Receipt Detail để chọn 1 trong 3 hình thức thanh toán
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
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 1500000
 *                 description: Giá thực tế coordinator xác nhận
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Đã tạo phiếu thu thành công
 *       404:
 *         description: Yêu cầu không tồn tại
 *       409:
 *         description: Yêu cầu đã được xử lý trước đó
 *       422:
 *         description: amount phải lớn hơn 0
 */

/**
 * @swagger
 * /api/coordinator/receipt-requests/{id}/reject:
 *   post:
 *     tags: [Coordinator]
 *     summary: Từ chối yêu cầu tạo phiếu thu (driver có thể resubmit)
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
 *               notes:
 *                 type: string
 *                 example: Số km chênh lệch quá lớn so với lộ trình
 *     responses:
 *       200:
 *         description: Đã từ chối yêu cầu
 *       404:
 *         description: Yêu cầu không tồn tại
 *       409:
 *         description: Yêu cầu đã được xử lý
 */
