/**
 * @swagger
 * tags:
 *   name: Drivers
 *   description: Thông tin tài xế và bảo dưỡng xe
 */

/**
 * @swagger
 * /api/drivers:
 *   get:
 *     tags: [Drivers]
 *     summary: Danh sách tất cả tài xế (Coordinator / Admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng driver profiles kèm thông tin xe
 *       403:
 *         description: Không có quyền (chỉ Coordinator / Admin)
 */

/**
 * @swagger
 * /api/drivers/me/vehicle:
 *   get:
 *     tags: [Drivers]
 *     summary: Thông tin xe của driver hiện tại (Driver only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin xe gắn với driver (vehicle_group, license_plate, ...)
 *       404:
 *         description: Driver chưa được phân công xe
 */

/**
 * @swagger
 * /api/drivers/maintenance:
 *   get:
 *     tags: [Drivers]
 *     summary: Danh sách lịch bảo dưỡng của xe gắn với driver hiện tại (Driver only)
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
 *                 description: Ảnh hóa đơn bảo dưỡng
 *     responses:
 *       200:
 *         description: Đã upload hóa đơn
 */

/**
 * @swagger
 * /api/drivers/maintenance/{vehicleId}/complete:
 *   post:
 *     tags: [Drivers]
 *     summary: Driver báo hoàn tất bảo dưỡng — chờ coordinator xác nhận
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Đánh dấu ready for verification — coordinator sẽ kiểm tra
 */
