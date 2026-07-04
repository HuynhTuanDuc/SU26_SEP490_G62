/**
 * @swagger
 * tags:
 *   - name: Vehicle Groups
 *     description: Quản lý nhóm xe (Manager)
 *   - name: Vehicles
 *     description: Quản lý xe và vòng đời xe (Manager)
 */

/**
 * @swagger
 * /api/admin/vehicle-groups:
 *   get:
 *     tags: [Vehicle Groups]
 *     summary: Danh sách nhóm xe
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng vehicle groups
 *   post:
 *     tags: [Vehicle Groups]
 *     summary: Tạo nhóm xe mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:        { type: string, example: 5m2 }
 *               description: { type: string }
 *               max_weight:  { type: number, description: Tải trọng tối đa (kg) }
 *     responses:
 *       201:
 *         description: Tạo nhóm xe thành công
 */

/**
 * @swagger
 * /api/admin/vehicle-groups/{id}:
 *   get:
 *     tags: [Vehicle Groups]
 *     summary: Chi tiết nhóm xe
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết nhóm xe kèm số lượng xe và driver
 *   put:
 *     tags: [Vehicle Groups]
 *     summary: Cập nhật nhóm xe
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
 *               name:        { type: string }
 *               description: { type: string }
 *               max_weight:  { type: number }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     tags: [Vehicle Groups]
 *     summary: Xóa nhóm xe (chỉ khi không có xe nào thuộc nhóm)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Xóa thành công
 *       422:
 *         description: Nhóm xe đang có xe, không thể xóa
 */

/**
 * @swagger
 * /api/admin/vehicles:
 *   get:
 *     tags: [Vehicles]
 *     summary: Danh sách xe toàn hệ thống
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: vehicle_group_id
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách xe kèm driver và nhóm xe
 *   post:
 *     tags: [Vehicles]
 *     summary: Thêm xe mới
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [license_plate, vehicle_group_id]
 *             properties:
 *               license_plate:    { type: string, example: 51F-123.45 }
 *               vehicle_group_id: { type: integer }
 *               brand:            { type: string }
 *               model:            { type: string }
 *               year:             { type: integer }
 *     responses:
 *       201:
 *         description: Thêm xe thành công
 *       409:
 *         description: Biển số đã tồn tại
 */

/**
 * @swagger
 * /api/admin/vehicles/driver-options:
 *   get:
 *     tags: [Vehicles]
 *     summary: Danh sách driver chưa được gán xe (để dùng trong form phân công)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mảng driver chưa có xe
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}:
 *   get:
 *     tags: [Vehicles]
 *     summary: Chi tiết xe
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Chi tiết xe kèm driver và lịch sử bảo dưỡng
 *   put:
 *     tags: [Vehicles]
 *     summary: Cập nhật thông tin xe
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
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     tags: [Vehicles]
 *     summary: Xóa xe (chỉ khi xe đang inactive / retired)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Xóa thành công
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}/send-to-maintenance:
 *   post:
 *     tags: [Vehicles]
 *     summary: Đưa xe vào bảo dưỡng (Coordinator / Manager — mục 19)
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
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Xe chuyển sang trạng thái in_maintenance
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}/verify-maintenance:
 *   post:
 *     tags: [Vehicles]
 *     summary: Xác nhận bảo dưỡng hoàn tất — xe sẵn sàng hoạt động
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Xe chuyển về trạng thái active
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}/mark-broken:
 *   post:
 *     tags: [Vehicles]
 *     summary: Đánh dấu xe hỏng (sau sự cố vehicle_breakdown — BR-024)
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
 *               notes: { type: string, example: Hỏng hộp số tại QL1A km 45 }
 *     responses:
 *       200:
 *         description: Xe chuyển sang trạng thái broken
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}/restore:
 *   post:
 *     tags: [Vehicles]
 *     summary: Khôi phục xe về active (sau khi sửa chữa xong)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Xe chuyển về trạng thái active
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}/retire:
 *   post:
 *     tags: [Vehicles]
 *     summary: Thanh lý / nghỉ hưu xe — trạng thái cuối (không thể hoàn tác)
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
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Xe chuyển sang trạng thái retired
 *       422:
 *         description: Xe đang có driver active hoặc trip active
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}/status:
 *   patch:
 *     tags: [Vehicles]
 *     summary: Cập nhật trạng thái xe trực tiếp (admin override)
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
 *                 enum: [active, inactive, in_maintenance, broken, retired]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */

/**
 * @swagger
 * /api/admin/vehicles/{id}/driver-assignment:
 *   patch:
 *     tags: [Vehicles]
 *     summary: Phân công / hủy phân công driver cho xe
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
 *               driver_id:
 *                 type: integer
 *                 nullable: true
 *                 description: ID profile driver để phân công, null để hủy phân công
 *     responses:
 *       200:
 *         description: Phân công thành công
 *       422:
 *         description: Driver đã được phân công xe khác
 */
