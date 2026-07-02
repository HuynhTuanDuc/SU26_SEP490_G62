/**
 * @swagger
 * tags:
 *   name: Coordinator
 *   description: Nghiệp vụ điều phối (Coordinator only)
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
 *     summary: Danh sách đối tác (khách hàng) dùng cho form tạo order
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
 *     summary: Danh sách sự cố (Incident Management, mục 18)
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
 *     summary: Danh sách yêu cầu tạo phiếu thu từ driver (order_receipt_requests, mục 14)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, approved, rejected]
 *       - in: query
 *         name: kind
 *         schema: { type: string, default: all }
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
 *         description: Chi tiết yêu cầu
 *       400:
 *         description: Request ID không hợp lệ
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /api/coordinator/receipt-requests/{id}/approve:
 *   post:
 *     tags: [Coordinator]
 *     summary: >
 *       Duyệt yêu cầu, tạo phiếu thu thực tế (shipment_receipts) — BR-019.
 *       Ghi actual_price = amount, actual_distance_km = actual_km driver đã gửi.
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
 *             required: [payment_type, amount]
 *             properties:
 *               payment_type:
 *                 type: string
 *                 enum: [cash, bank_transfer, qr_transfer]
 *               amount:
 *                 type: number
 *                 example: 1500000
 *               notes:
 *                 type: string
 *               expenses:
 *                 type: array
 *                 items: { type: object }
 *     responses:
 *       201:
 *         description: Đã tạo phiếu thu thành công
 *       404:
 *         description: Yêu cầu không tồn tại
 *       409:
 *         description: Yêu cầu đã được duyệt hoặc đã bị từ chối
 *       422:
 *         description: amount không hợp lệ (phải lớn hơn 0)
 */

/**
 * @swagger
 * /api/coordinator/receipt-requests/{id}/reject:
 *   post:
 *     tags: [Coordinator]
 *     summary: Từ chối yêu cầu tạo phiếu thu (cần lý do)
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
