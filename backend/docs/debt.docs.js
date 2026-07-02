/**
 * @swagger
 * tags:
 *   - name: Debt — Driver
 *     description: |
 *       Driver chỉ xem công nợ. Công nợ được kế toán tạo thủ công
 *       (thường khi convert từ cash_collection bị không xác nhận).
 *       Driver không tự tạo hay nộp tiền qua đây — dùng Cash Collection để báo thu hộ.
 *   - name: Debt — Finance
 *     description: Accountant / Manager xác nhận các khoản driver nộp tiền (BR-020, mục 16)
 */

/**
 * @swagger
 * /api/debts/me:
 *   get:
 *     tags: [Debt — Driver]
 *     summary: Danh sách công nợ của driver (read-only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [unpaid, partial, paid, overdue]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 debts:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DriverDebt'
 */

/**
 * @swagger
 * /api/debts/summary:
 *   get:
 *     tags: [Debt — Driver]
 *     summary: Tổng quan công nợ (dùng cho dashboard)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DebtSummary'
 */

/**
 * @swagger
 * /api/debts/{id}/payments:
 *   get:
 *     tags: [Debt — Driver]
 *     summary: Lịch sử kế toán ghi nhận thanh toán cho một khoản nợ
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DebtPayment'
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     DriverDebt:
 *       type: object
 *       properties:
 *         id:           { type: integer }
 *         total_amount: { type: string, example: "1500000.00" }
 *         paid_amount:  { type: string, example: "500000.00" }
 *         remaining:    { type: string, example: "1000000.00" }
 *         status:
 *           type: string
 *           enum: [unpaid, partial, paid, overdue]
 *         due_date:     { type: string, format: date, nullable: true }
 *         notes:        { type: string, nullable: true }
 *         created_at:   { type: string, format: date-time }
 *         shipment_id:  { type: integer, nullable: true }
 *         trip_code:    { type: string, nullable: true }
 *         order_id:     { type: integer, nullable: true }
 *         cargo_name:   { type: string, nullable: true }
 *
 *     DebtPayment:
 *       type: object
 *       description: Ghi nhận bởi kế toán — driver chỉ xem
 *       properties:
 *         id:             { type: integer }
 *         amount:         { type: string, example: "500000.00" }
 *         payment_method:
 *           type: string
 *           enum: [cash, bank_transfer, offset]
 *         paid_at:        { type: string, format: date-time }
 *         notes:          { type: string, nullable: true }
 *
 *     DebtSummary:
 *       type: object
 *       properties:
 *         open_count:        { type: string, example: "1" }
 *         total_remaining:   { type: string, example: "1000000.00" }
 *         overdue_remaining: { type: string, example: "0.00" }
 */

/**
 * @swagger
 * /api/debts/{id}/repayments:
 *   post:
 *     tags: [Debt — Driver]
 *     summary: Driver nộp tiền một phần cho khoản nợ (bắt buộc ảnh biên lai, BR-020)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: debt_id
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
 *                 example: 3000000
 *               payment_method:
 *                 type: string
 *                 enum: [cash, bank_transfer]
 *                 default: cash
 *               notes:
 *                 type: string
 *               receipt:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh biên lai nộp tiền (bắt buộc)
 *     responses:
 *       201:
 *         description: Đã ghi nhận khoản nộp, debt.paid_amount cập nhật
 *       422:
 *         description: Thiếu ảnh, số tiền vượt quá remaining, hoặc nợ đã thanh toán
 *       404:
 *         description: Không tìm thấy khoản nợ
 */

/**
 * @swagger
 * /api/debts/repayments/{paymentId}:
 *   delete:
 *     tags: [Debt — Driver]
 *     summary: Hủy khoản nộp (chỉ khi kế toán chưa xác nhận — status pending)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Hủy thành công, debt.paid_amount hoàn lại
 *       403:
 *         description: Không phải khoản nộp của mình
 *       422:
 *         description: Kế toán đã xác nhận, không thể hủy
 */

/**
 * @swagger
 * /api/debts/repayments/pending:
 *   get:
 *     tags: [Debt — Finance]
 *     summary: Danh sách khoản driver nộp tiền đang chờ xác nhận (Accountant / Manager)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng repayments trạng thái pending
 */

/**
 * @swagger
 * /api/debts/repayments/{paymentId}/confirm:
 *   patch:
 *     tags: [Debt — Finance]
 *     summary: Xác nhận đã nhận tiền driver nộp — trừ vào debt.paid_amount
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đã xác nhận thanh toán
 *       404:
 *         description: Không tìm thấy khoản nộp
 *       409:
 *         description: Đã được xử lý trước đó
 */

/**
 * @swagger
 * /api/debts/repayments/{paymentId}/reject:
 *   patch:
 *     tags: [Debt — Finance]
 *     summary: Từ chối khoản driver nộp tiền (cần lý do)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
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
 *                 example: Ảnh biên lai không rõ số tiền
 *     responses:
 *       200:
 *         description: Đã từ chối yêu cầu nộp tiền
 *       404:
 *         description: Không tìm thấy khoản nộp
 *       409:
 *         description: Đã được xử lý trước đó
 */
