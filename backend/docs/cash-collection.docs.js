/**
 * @swagger
 * tags:
 *   name: Cash Collection
 *   description: Ghi nhận thu hộ tiền mặt từ khách ngoài luồng phiếu thu (Driver)
 */

/**
 * @swagger
 * /api/cash-collections/me:
 *   get:
 *     tags: [Cash Collection]
 *     summary: Danh sách ghi nhận thu hộ của driver hiện tại
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
 *         description: Danh sách cash collection records
 */

/**
 * @swagger
 * /api/cash-collections/summary:
 *   get:
 *     tags: [Cash Collection]
 *     summary: Tổng quan thu hộ (tổng thu, chưa nộp, đã nộp)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thống kê thu hộ
 */

/**
 * @swagger
 * /api/cash-collections/{id}:
 *   get:
 *     tags: [Cash Collection]
 *     summary: Chi tiết một ghi nhận thu hộ
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết cash collection
 *       403:
 *         description: Không phải của driver này
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /api/cash-collections:
 *   post:
 *     tags: [Cash Collection]
 *     summary: Tạo ghi nhận thu hộ mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, shipment_id, payment_method]
 *             properties:
 *               shipment_id:    { type: integer }
 *               amount:         { type: number, example: 1500000 }
 *               payment_method:
 *                 type: string
 *                 enum: [cash, bank_transfer]
 *               notes:          { type: string }
 *     responses:
 *       201:
 *         description: Tạo ghi nhận thành công
 */
