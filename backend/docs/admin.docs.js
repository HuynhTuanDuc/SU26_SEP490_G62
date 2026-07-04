/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Quản trị tài khoản người dùng (Manager only)
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Danh sách tài khoản (Manager)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [driver, coordinator, manager, accountant] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Danh sách tài khoản phân trang
 *   post:
 *     tags: [Admin]
 *     summary: Tạo tài khoản mới (Manager)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role, full_name]
 *             properties:
 *               email:     { type: string }
 *               role:      { type: string, enum: [driver, coordinator, manager, accountant] }
 *               full_name: { type: string }
 *               phone:     { type: string }
 *               password:  { type: string, description: Nếu không truyền, hệ thống tự sinh }
 *     responses:
 *       201:
 *         description: Tạo tài khoản thành công
 *       409:
 *         description: Email đã tồn tại
 */

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     tags: [Admin]
 *     summary: Cập nhật thông tin tài khoản (Manager)
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
 *               full_name: { type: string }
 *               phone:     { type: string }
 *               role:      { type: string }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Không tìm thấy tài khoản
 */

/**
 * @swagger
 * /api/admin/users/{id}/status:
 *   patch:
 *     tags: [Admin]
 *     summary: Kích hoạt / khoá tài khoản (Manager)
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
 *             required: [is_active]
 *             properties:
 *               is_active:
 *                 type: boolean
 *                 description: true = kích hoạt, false = khoá
 *     responses:
 *       200:
 *         description: Cập nhật trạng thái thành công
 */
