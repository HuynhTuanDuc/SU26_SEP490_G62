/**
 * @swagger
 * tags:
 *   name: Drivers
 *   description: Quản lý tài xế (Coordinator / Admin)
 */

/**
 * @swagger
 * /api/drivers:
 *   get:
 *     tags: [Drivers]
 *     summary: Danh sách tất cả tài xế
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng driver profiles
 *       403:
 *         description: Không có quyền (chỉ Coordinator / Admin)
 */

/**
 * @swagger
 * /api/drivers/maintenance:
 *   get:
 *     tags: [Drivers]
 *     summary: Danh sách bảo dưỡng của xe gắn với driver hiện tại (Driver only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng maintenance records
 */

/**
 * @swagger
 * /api/drivers/maintenance/{vehicleId}/bills:
 *   post:
 *     tags: [Drivers]
 *     summary: Upload ảnh hóa đơn bảo dưỡng (Driver only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [bill]
 *             properties:
 *               bill:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Đã upload hóa đơn
 */

/**
 * @swagger
 * /api/drivers/maintenance/{vehicleId}/cost:
 *   patch:
 *     tags: [Drivers]
 *     summary: Cập nhật chi phí bảo dưỡng thực tế (Driver only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cost]
 *             properties:
 *               cost:
 *                 type: number
 *                 example: 850000
 *     responses:
 *       200:
 *         description: Đã cập nhật chi phí
 */

/**
 * @swagger
 * /api/drivers/maintenance/{vehicleId}/complete:
 *   post:
 *     tags: [Drivers]
 *     summary: Driver báo hoàn tất bảo dưỡng, chờ coordinator xác nhận
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đánh dấu sẵn sàng để xác nhận (ready for verification)
 */
