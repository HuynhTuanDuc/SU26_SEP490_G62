/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Quản lý đơn hàng (Coordinator / Admin)
 */

/**
 * @swagger
 * /api/orders:
 *   get:
 *     tags: [Orders]
 *     summary: Danh sách tất cả orders
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
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách orders
 *       403:
 *         description: Không có quyền
 *   post:
 *     tags: [Orders]
 *     summary: Tạo order mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customer_id, pickup_address, destination_address, vehicle_group]
 *             properties:
 *               customer_id:        { type: integer }
 *               pickup_address:     { type: string }
 *               destination_address: { type: string }
 *               vehicle_group:      { type: string, example: 5m2 }
 *               cargo_note:         { type: string }
 *               priority:           { type: string, enum: [low, normal, high], default: normal }
 *     responses:
 *       201:
 *         description: Tạo order thành công, trip vào pool AVAILABLE
 *       422:
 *         description: Dữ liệu không hợp lệ
 */

/**
 * @swagger
 * /api/orders/{id}/request-receipt:
 *   post:
 *     tags: [Orders]
 *     summary: >
 *       Driver gửi actual_km sau khi COMPLETED shipment (Driver only).
 *       Driver không phải là is_final_shipment: chỉ lưu actual_km.
 *       Driver là is_final_shipment của đơn cash: lưu actual_km và tạo
 *       order_receipt_requests (status pending) cho coordinator duyệt (BR-008A/B, mục 14).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: order_id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shipment_id]
 *             properties:
 *               shipment_id: { type: integer }
 *               actual_km:   { type: number, example: 42.5 }
 *     responses:
 *       200:
 *         description: Đã lưu actual_km (không phải final shipment cash) — receipt_request_created false
 *       201:
 *         description: Đã lưu actual_km và tạo order_receipt_requests — receipt_request_created true
 *       403:
 *         description: Driver không có quyền trên shipment này
 *       409:
 *         description: Order đã có yêu cầu phiếu thu (BR-018)
 *       422:
 *         description: Shipment chưa COMPLETED hoặc thiếu dữ liệu bắt buộc
 */

/**
 * @swagger
 * /api/orders/{id}/receipt-request:
 *   get:
 *     tags: [Orders]
 *     summary: Trạng thái yêu cầu phiếu thu của order (Driver only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: >
 *           request (object|null) — status: pending | processing | approved | rejected
 */

/**
 * @swagger
 * /api/orders/{id}:
 *   patch:
 *     tags: [Orders]
 *     summary: Cập nhật thông tin order (Coordinator / Admin)
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
 *             properties:
 *               pickup_address:      { type: string }
 *               destination_address: { type: string }
 *               vehicle_group:       { type: string }
 *               cargo_note:          { type: string }
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high]
 *               status:
 *                 type: string
 *                 enum: [pending, in_progress, completed, cancelled]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Không tìm thấy order
 *       422:
 *         description: Dữ liệu không hợp lệ
 *   delete:
 *     tags: [Orders]
 *     summary: Hủy order (Coordinator / Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã hủy order
 *       404:
 *         description: Không tìm thấy order
 *       422:
 *         description: Không thể hủy order đã có trip đang chạy
 */
