/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Quản lý đơn hàng (Coordinator / Manager) và luồng phiếu thu (Driver)
 */

/**
 * @swagger
 * /api/orders:
 *   get:
 *     tags: [Orders]
 *     summary: Danh sách đơn hàng (Coordinator / Manager)
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
 *         description: Danh sách đơn hàng phân trang
 *   post:
 *     tags: [Orders]
 *     summary: Tạo đơn hàng mới (Coordinator / Manager)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customer_id, shipments]
 *             properties:
 *               customer_id:  { type: integer }
 *               payment_type:
 *                 type: string
 *                 enum: [cash, bank_transfer, qr_transfer, credit]
 *               notes:        { type: string }
 *               shipments:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Tạo đơn hàng thành công
 */

/**
 * @swagger
 * /api/orders/{id}:
 *   patch:
 *     tags: [Orders]
 *     summary: Cập nhật thông tin đơn hàng (Coordinator / Manager)
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
 *               notes:        { type: string }
 *               payment_type: { type: string }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Không tìm thấy đơn hàng
 *   delete:
 *     tags: [Orders]
 *     summary: Hủy đơn hàng (Coordinator / Manager)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã hủy đơn hàng
 *       422:
 *         description: Đơn hàng có trip đang hoạt động, không thể hủy
 */

/**
 * @swagger
 * /api/orders/{id}/request-receipt:
 *   post:
 *     tags: [Orders]
 *     summary: Driver gửi yêu cầu tạo phiếu thu (BR-008B — driver cuối đơn cash)
 *     description: |
 *       Chỉ driver cuối (`is_final_shipment = true`) của đơn `payment_type = cash` gọi endpoint này.
 *       Mỗi order chỉ được gửi 1 yêu cầu (BR-018).
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
 *             required: [actual_km, requesting_shipment_id]
 *             properties:
 *               actual_km:
 *                 type: number
 *                 example: 42.5
 *                 description: Số km thực tế driver đã chạy
 *               requesting_shipment_id:
 *                 type: integer
 *                 description: shipment_id của driver cuối gửi yêu cầu
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Yêu cầu phiếu thu đã được gửi (status = pending)
 *       409:
 *         description: Order đã có yêu cầu phiếu thu (BR-018)
 *       422:
 *         description: Driver không phải driver cuối hoặc order chưa COMPLETED
 */

/**
 * @swagger
 * /api/orders/{id}/receipt-request:
 *   get:
 *     tags: [Orders]
 *     summary: Trạng thái yêu cầu phiếu thu của order
 *     description: Driver dùng để kiểm tra yêu cầu đã gửi (pending / processing / approved / rejected).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: order_id
 *     responses:
 *       200:
 *         description: Thông tin yêu cầu phiếu thu hoặc null nếu chưa gửi
 */
