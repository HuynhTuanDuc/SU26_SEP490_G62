/**
 * @swagger
 * tags:
 *   name: Expenses
 *   description: Chi phí phát sinh trong chuyến — bắt buộc ảnh chứng từ (BR-021/022)
 */

/**
 * @swagger
 * /api/expenses:
 *   post:
 *     tags: [Expenses]
 *     summary: Tạo chi phí phát sinh (Driver)
 *     description: |
 *       Expense gắn với Vehicle (BR-022). Bắt buộc ảnh chứng từ (BR-021).
 *       Expense KHÔNG tính vào KPI hay Revenue (mục 17).
 *
 *       Các loại expense: fuel, toll, parking, ferry, minor_repair, other
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [shipment_id, expense_type, amount, receipt]
 *             properties:
 *               shipment_id:
 *                 type: integer
 *                 description: Chuyến mà chi phí phát sinh
 *               expense_type:
 *                 type: string
 *                 enum: [fuel, toll, parking, ferry, minor_repair, other]
 *               amount:
 *                 type: number
 *                 example: 150000
 *               notes:
 *                 type: string
 *               receipt:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh chứng từ (bắt buộc — BR-021)
 *     responses:
 *       201:
 *         description: Tạo chi phí thành công
 *       400:
 *         description: Thiếu ảnh chứng từ hoặc thông tin bắt buộc
 */

/**
 * @swagger
 * /api/expenses/shipment/{shipmentId}:
 *   get:
 *     tags: [Expenses]
 *     summary: Danh sách chi phí phát sinh của một chuyến
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shipmentId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Mảng expense records của chuyến
 */

/**
 * @swagger
 * /api/expenses/{id}:
 *   patch:
 *     tags: [Expenses]
 *     summary: Sửa chi phí phát sinh (chỉ khi chưa được duyệt)
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
 *               amount:       { type: number }
 *               expense_type: { type: string }
 *               notes:        { type: string }
 *               receipt:
 *                 type: string
 *                 format: binary
 *                 description: Ảnh chứng từ mới (tuỳ chọn)
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       403:
 *         description: Không phải expense của driver này
 *       422:
 *         description: Expense đã được duyệt, không thể sửa
 */
