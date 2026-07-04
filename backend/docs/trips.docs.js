/**
 * @swagger
 * tags:
 *   name: Trips
 *   description: Quản lý chuyến vận chuyển (Driver only)
 */

/**
 * @swagger
 * /api/trips/pool:
 *   get:
 *     tags: [Trips]
 *     summary: Danh sách chuyến AVAILABLE theo nhóm xe của driver (Trip Pool)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 5 }
 *       - in: query
 *         name: vehicleGroupId
 *         schema: { type: integer }
 *         description: Lọc thêm theo nhóm xe cụ thể (tuỳ chọn)
 *     responses:
 *       200:
 *         description: Mảng trips AVAILABLE thuộc vehicle group của driver
 *       422:
 *         description: Driver chưa được gán xe
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
 *         description: Chi tiết shipment bao gồm stops, cargo, route
 *       404:
 *         description: Không tìm thấy hoặc đã được claim
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
 *         description: Chi tiết order và các shipments kèm theo
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /api/trips/active:
 *   get:
 *     tags: [Trips]
 *     summary: Chuyến đang hoạt động của driver (CLAIMED / PICKING / TRANSIT / ARRIVED / RETURNING)
 *     description: |
 *       Trả về trip kèm đầy đủ `stops[]` nhúng sẵn — không cần gọi API stops riêng.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trip đang active (hoặc null nếu không có chuyến nào)
 */

/**
 * @swagger
 * /api/trips/pending-receipt:
 *   get:
 *     tags: [Trips]
 *     summary: Đơn cash đã COMPLETED nhưng driver cuối chưa gửi yêu cầu phiếu thu
 *     description: Dùng để hiển thị banner nhắc nhở trên màn hình home.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: order object hoặc null nếu không có đơn nào đang chờ
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
 *     summary: Lịch sử chuyến đã kết thúc (COMPLETED / CANCELLED / FAILED)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách chuyến đã kết thúc phân trang
 */

/**
 * @swagger
 * /api/trips/orders/{orderId}:
 *   get:
 *     tags: [Trips]
 *     summary: Chi tiết order đã hoàn thành (dùng trong màn hình lịch sử)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết order và các shipments
 *       403:
 *         description: Driver không có quyền xem order này
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /api/trips/{id}/claim:
 *   post:
 *     tags: [Trips]
 *     summary: Nhận chuyến từ pool (atomic lock — BR-005/007)
 *     description: |
 *       Driver chỉ được có 1 active trip (BR-005).
 *       Dùng atomic optimistic lock — first commit wins (BR-007).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: shipment_id
 *     responses:
 *       200:
 *         description: Nhận chuyến thành công — trip chuyển sang CLAIMED
 *       409:
 *         description: Chuyến đã được tài xế khác nhận
 *       422:
 *         description: Driver đang có chuyến active hoặc không đúng nhóm xe
 */

/**
 * @swagger
 * /api/trips/{id}/status:
 *   patch:
 *     tags: [Trips]
 *     summary: Cập nhật trạng thái lifecycle (BR-009 — không được bỏ qua trạng thái)
 *     description: |
 *       Các transition hợp lệ: CLAIMED→PICKING, TRANSIT→ARRIVED, ARRIVED→RETURNING, TRANSIT→FAILED.
 *       Dùng endpoint chuyên biệt cho: PICKING→TRANSIT (`start-transit`), ARRIVED→COMPLETED (`complete`), RETURNING→COMPLETED (`return-complete`).
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
 *               reason:
 *                 type: string
 *                 description: Lý do (bắt buộc khi status = failed)
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 *       422:
 *         description: Transition không hợp lệ
 */

/**
 * @swagger
 * /api/trips/{id}/start-transit:
 *   post:
 *     tags: [Trips]
 *     summary: Xác nhận lấy hàng — PICKING → TRANSIT (bắt buộc ảnh, BR-013/014)
 *     description: |
 *       Nếu trip có pickup stops: gọi sau khi tất cả pickup stops đã COMPLETED.
 *       Nếu trip không có stops: bắt buộc upload ảnh lấy hàng realtime.
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
 *                 description: Ảnh lấy hàng realtime (bắt buộc khi không có pickup stops)
 *     responses:
 *       200:
 *         description: Trip chuyển sang TRANSIT
 *       422:
 *         description: Thiếu ảnh hoặc trip không ở trạng thái PICKING
 */

/**
 * @swagger
 * /api/trips/{id}/complete:
 *   post:
 *     tags: [Trips]
 *     summary: Hoàn thành chuyến — ARRIVED → COMPLETED (BR-015/016/017)
 *     description: |
 *       Nếu trip có delivery stops: gọi sau khi tất cả delivery stops đã COMPLETED — ảnh không cần gửi lại.
 *       Nếu trip không có stops: bắt buộc upload ảnh giao hàng realtime (camera only, BR-016/017).
 *
 *       Sau COMPLETED, nếu `is_final_shipment = true` và `payment_type = cash`:
 *       driver tiếp tục nhập `actual_km` và gửi `order_receipt_requests` (BR-008B).
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
 *                 description: Ảnh giao hàng realtime (bắt buộc khi không có delivery stops)
 *               actual_km:
 *                 type: number
 *                 description: Số km thực tế (bắt buộc cho mọi driver)
 *     responses:
 *       200:
 *         description: Hoàn thành, trip chuyển sang COMPLETED. KPI tính ngay lập tức (BR-030).
 *       422:
 *         description: Thiếu ảnh hoặc trip không ở trạng thái ARRIVED
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
 * /api/trips/{id}/release:
 *   post:
 *     tags: [Trips]
 *     summary: Hủy nhận chuyến sớm (CLAIMED/PICKING → trả về pool AVAILABLE)
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
 *               reason: { type: string, example: Xe hỏng đột xuất }
 *     responses:
 *       200:
 *         description: Đã hủy — order trở về pool AVAILABLE
 *       422:
 *         description: Trip đã qua trạng thái PICKING không thể release
 */

/**
 * @swagger
 * /api/trips/{id}/payments:
 *   get:
 *     tags: [Trips]
 *     summary: Danh sách ghi nhận thanh toán tiền mặt của chuyến
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
 */

/**
 * @swagger
 * /api/trips/{id}/payment-summary:
 *   get:
 *     tags: [Trips]
 *     summary: Tổng quan thanh toán của chuyến
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
 * /api/trips/{id}/payments/{paymentId}:
 *   patch:
 *     tags: [Trips]
 *     summary: Sửa ghi nhận thanh toán tiền mặt — amount và/hoặc ảnh biên lai
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 1600000
 *               receipt:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh biên lai mới (tuỳ chọn)
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       403:
 *         description: Không phải payment của driver này
 *       404:
 *         description: Không tìm thấy payment
 */

/**
 * @swagger
 * /api/trips/receipts:
 *   get:
 *     tags: [Trips]
 *     summary: Danh sách phiếu thu coordinator đã tạo cho các đơn của driver
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *     responses:
 *       200:
 *         description: Danh sách phiếu thu (shipment_receipts) bao gồm total_expenses
 */

/**
 * @swagger
 * /api/trips/receipts/{receiptId}:
 *   get:
 *     tags: [Trips]
 *     summary: Chi tiết phiếu thu — dùng để show cho khách hàng, xác nhận thanh toán
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: receiptId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết phiếu thu kèm thông tin đơn hàng và chi phí phát sinh
 *       403:
 *         description: Phiếu thu không thuộc về driver này
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /api/trips/receipts/{receiptId}/record-collection:
 *   post:
 *     tags: [Trips]
 *     summary: Driver xác nhận hình thức thanh toán sau khi coordinator tạo phiếu thu
 *     description: |
 *       3 hình thức (mục 14 — CLAUDE.md §14/§15):
 *
 *       | payment_type | Ảnh | Công nợ |
 *       |---|---|---|
 *       | `bank_transfer` | Bắt buộc (screenshot chuyển khoản) | Không tạo debt |
 *       | `cash_collected` | Bắt buộc (tiền mặt driver nhận) | Tạo Driver Debt |
 *       | `client_credit` | Không cần | Tạo Customer Debt |
 *
 *       Màn hình Receipt Detail luôn hiển thị QR ngân hàng công ty để driver show cho khách.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: receiptId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [payment_type]
 *             properties:
 *               payment_type:
 *                 type: string
 *                 enum: [bank_transfer, cash_collected, client_credit]
 *               notes:
 *                 type: string
 *                 description: Ghi chú tuỳ chọn
 *               proof:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh xác nhận (bắt buộc với bank_transfer và cash_collected)
 *     responses:
 *       200:
 *         description: Đã ghi nhận hình thức thanh toán, debt được tạo tự động nếu cần
 *       400:
 *         description: payment_type không hợp lệ hoặc thiếu ảnh
 *       409:
 *         description: Phiếu thu đã được xác nhận trước đó
 */

/**
 * @swagger
 * /api/trips/receipt-request/{orrId}/resubmit:
 *   post:
 *     tags: [Trips]
 *     summary: Driver gửi lại yêu cầu phiếu thu sau khi bị coordinator từ chối
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orrId
 *         required: true
 *         schema: { type: integer }
 *         description: order_receipt_request id
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               actual_km:
 *                 type: number
 *                 description: Km thực tế (tuỳ chọn, cập nhật lại nếu có sai sót)
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Yêu cầu đã được gửi lại, status = pending
 *       400:
 *         description: Yêu cầu không ở trạng thái rejected
 *       403:
 *         description: Không phải yêu cầu của driver này
 */

/**
 * @swagger
 * /api/trips/{id}/stops/{stopId}/arrive:
 *   patch:
 *     tags: [Trips]
 *     summary: Xác nhận đã tới điểm stop (Multi-Stop — BR-011)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: shipment_id
 *       - in: path
 *         name: stopId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Stop chuyển sang arrived
 *       422:
 *         description: Stop trước chưa hoàn thành (BR-011 — thứ tự bắt buộc)
 */

/**
 * @swagger
 * /api/trips/{id}/stops/{stopId}/complete:
 *   patch:
 *     tags: [Trips]
 *     summary: Hoàn thành stop — lấy hàng (PICKUP) hoặc giao hàng (DELIVERY)
 *     description: |
 *       Ảnh là tuỳ chọn cho từng stop — ảnh chính của cả trip được upload khi gọi `start-transit` hoặc `complete`.
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
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               proof:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh xác nhận tại điểm stop (tuỳ chọn)
 *     responses:
 *       200:
 *         description: Stop hoàn thành
 *       422:
 *         description: Chưa arrive hoặc stop không thuộc chuyến này
 */
