/**
 * @swagger
 * tags:
 *   name: Trips
 *   description: Quản lý chuyến vận chuyển (Driver)
 */

/**
 * @swagger
 * /api/trips/pool:
 *   get:
 *     tags: [Trips]
 *     summary: Danh sách chuyến có sẵn theo nhóm xe của driver
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng trips AVAILABLE thuộc vehicle group của driver
 *       422:
 *         description: Driver chưa được gán xe
 */

/**
 * @swagger
 * /api/trips/stats:
 *   get:
 *     tags: [Trips]
 *     summary: Thống kê chuyến của driver (hôm nay + tháng này)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: today_total, today_completed, month_completed
 */

/**
 * @swagger
 * /api/trips/history:
 *   get:
 *     tags: [Trips]
 *     summary: Lịch sử chuyến của driver (COMPLETED / CANCELLED / FAILED)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Danh sách chuyến đã kết thúc
 */

/**
 * @swagger
 * /api/trips/orders/{orderId}:
 *   get:
 *     tags: [Trips]
 *     summary: Chi tiết một order theo orderId
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết order
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /api/trips/pool-shipment/{shipmentId}:
 *   get:
 *     tags: [Trips]
 *     summary: Chi tiết shipment trong pool (chưa được claim)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shipmentId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết shipment
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /api/trips/pool/{orderId}:
 *   get:
 *     tags: [Trips]
 *     summary: Chi tiết order trong pool (chưa được claim)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết order
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /api/trips/active:
 *   get:
 *     tags: [Trips]
 *     summary: Lấy chuyến đang hoạt động của driver
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trip đang active hoặc null nếu không có
 */

/**
 * @swagger
 * /api/trips/{id}/claim:
 *   post:
 *     tags: [Trips]
 *     summary: Nhận chuyến (atomic optimistic lock — first commit wins)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Nhận chuyến thành công, trip chuyển sang CLAIMED
 *       409:
 *         description: Chuyến đã được tài xế khác nhận
 *       422:
 *         description: Driver đang có chuyến hoạt động hoặc không đúng nhóm xe
 */

/**
 * @swagger
 * /api/trips/{id}/status:
 *   patch:
 *     tags: [Trips]
 *     summary: Cập nhật trạng thái lifecycle (chỉ cho phép tiến về phía trước)
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [picking, transit, arrived, failed, returning]
 *                 example: transit
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 *       422:
 *         description: Transition không hợp lệ (skip / reverse)
 */

/**
 * @swagger
 * /api/trips/{id}/complete:
 *   post:
 *     tags: [Trips]
 *     summary: Hoàn thành chuyến (bắt buộc ít nhất 1 ảnh proof)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               proof:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh biên nhận giao hàng (camera only)
 *               receipt:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Hoàn thành, trip chuyển sang COMPLETED
 *       422:
 *         description: Thiếu ảnh proof hoặc trip không ở trạng thái ARRIVED
 */

/**
 * @swagger
 * /api/trips/{id}/cancel-delivery:
 *   post:
 *     tags: [Trips]
 *     summary: Báo không thể giao hàng (ARRIVED → CANCELLED) — cần lý do
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
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: Khách không có mặt, không liên lạc được
 *     responses:
 *       200:
 *         description: Đã ghi nhận, driver vẫn active để xác nhận trả hàng
 *       400:
 *         description: Thiếu lý do
 *       422:
 *         description: Trip không ở trạng thái ARRIVED
 */

/**
 * @swagger
 * /api/trips/{id}/release:
 *   post:
 *     tags: [Trips]
 *     summary: Hủy chuyến sớm (CLAIMED/PICKING → trả về pool)
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
 *               reason:
 *                 type: string
 *                 example: Xe hỏng đột xuất
 *     responses:
 *       200:
 *         description: Đã hủy, order trở về pool AVAILABLE
 *       422:
 *         description: Không đủ điều kiện hủy (trip đã qua trạng thái PICKING)
 */

/**
 * @swagger
 * /api/trips/{id}/start-transit:
 *   post:
 *     tags: [Trips]
 *     summary: Xác nhận đã lấy hàng, bắt đầu vận chuyển — PICKING → TRANSIT (bắt buộc ảnh, BR-013/014)
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [proof]
 *             properties:
 *               proof:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh chụp thực tế khi lấy hàng (camera realtime)
 *     responses:
 *       200:
 *         description: Trip chuyển sang TRANSIT
 *       422:
 *         description: Thiếu ảnh hoặc trip không ở trạng thái PICKING
 */

/**
 * @swagger
 * /api/trips/{id}/mark-unpaid:
 *   post:
 *     tags: [Trips]
 *     summary: Báo khách chưa thanh toán — tạo Customer Debt (TH3)
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
 *                 example: 500000
 *               notes:
 *                 type: string
 *                 example: Khách hẹn thanh toán sau
 *     responses:
 *       200:
 *         description: Đã tạo Customer Debt
 *       400:
 *         description: Số tiền không hợp lệ
 */

/**
 * @swagger
 * /api/trips/{id}/return-complete:
 *   post:
 *     tags: [Trips]
 *     summary: Hoàn tất trả hàng — RETURNING → COMPLETED (ảnh không bắt buộc)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               proof:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh xác nhận trả hàng (tuỳ chọn)
 *     responses:
 *       200:
 *         description: Trip chuyển sang COMPLETED
 *       422:
 *         description: Trip không ở trạng thái RETURNING
 */

/**
 * @swagger
 * /api/trips/{id}/payment:
 *   post:
 *     tags: [Trips]
 *     summary: Ghi nhận khách thanh toán tiền mặt cho driver — tạo Driver Debt (TH2)
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [amount, receipt]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 1500000
 *               paymentMethod:
 *                 type: string
 *                 enum: [cash, bank_transfer]
 *                 default: cash
 *               notes:
 *                 type: string
 *               receipt:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh biên lai (bắt buộc)
 *     responses:
 *       201:
 *         description: Đã ghi nhận, tạo Driver Debt
 *       422:
 *         description: Thiếu ảnh hoặc số tiền không hợp lệ
 */

/**
 * @swagger
 * /api/trips/{id}/payments:
 *   get:
 *     tags: [Trips]
 *     summary: Danh sách thanh toán đã ghi nhận cho chuyến
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Danh sách payment records
 */

/**
 * @swagger
 * /api/trips/{id}/payment-summary:
 *   get:
 *     tags: [Trips]
 *     summary: Tổng quan thanh toán của chuyến (tổng thu, còn nợ)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: total_collected, remaining, payment_status
 */

/**
 * @swagger
 * /api/trips/{id}/stops:
 *   get:
 *     tags: [Trips]
 *     summary: Danh sách stops của chuyến theo thứ tự (BR-011)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Mảng stops với sequence_order, type (PICKUP/DELIVERY), status
 */

/**
 * @swagger
 * /api/trips/{id}/stops/{stopId}/arrive:
 *   patch:
 *     tags: [Trips]
 *     summary: Xác nhận đã tới điểm stop
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: stopId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Stop chuyển sang arrived
 *       422:
 *         description: Stop trước chưa hoàn thành (BR-011)
 */

/**
 * @swagger
 * /api/trips/{id}/stops/{stopId}/complete:
 *   patch:
 *     tags: [Trips]
 *     summary: Hoàn thành stop (lấy hàng hoặc giao hàng)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: stopId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Stop hoàn thành
 *       422:
 *         description: Chưa arrive hoặc stop không thuộc chuyến này
 */
