/**
 * @swagger
 * tags:
 *   - name: Leave
 *     description: Driver đăng ký nghỉ phép. Ghi nhận ngay — kế toán dùng để tính ngày công.
 */

/**
 * @swagger
 * /api/leave/me:
 *   get:
 *     tags: [Leave]
 *     summary: Danh sách đơn nghỉ phép của driver hiện tại
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
 *         description: Danh sách đơn nghỉ
 */

/**
 * @swagger
 * /api/leave/summary:
 *   get:
 *     tags: [Leave]
 *     summary: Tổng hợp ngày nghỉ theo tháng (dùng cho dashboard)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Số ngày nghỉ đã sử dụng, số ngày còn lại
 */

/**
 * @swagger
 * /api/leave:
 *   post:
 *     tags: [Leave]
 *     summary: Đăng ký nghỉ phép (tự động ghi nhận)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [leaveDate, leaveType]
 *             properties:
 *               leaveDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-07-15"
 *               leaveType:
 *                 type: string
 *                 enum: [annual, sick, unpaid, other]
 *               reason:
 *                 type: string
 *                 example: Khám bệnh định kỳ
 *     responses:
 *       201:
 *         description: Đăng ký nghỉ thành công
 *       409:
 *         description: Đã đăng ký nghỉ ngày này rồi
 */

/**
 * @swagger
 * /api/leave/{id}:
 *   delete:
 *     tags: [Leave]
 *     summary: Hủy đơn nghỉ phép (chỉ khi ngày nghỉ chưa đến)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Hủy đơn thành công
 *       403:
 *         description: Không phải đơn của driver này
 *       422:
 *         description: Ngày nghỉ đã qua, không thể hủy
 */
