/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: Hồ sơ cá nhân (tất cả role)
 */

/**
 * @swagger
 * /api/profile/me:
 *   get:
 *     tags: [Profile]
 *     summary: Lấy thông tin hồ sơ cá nhân
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin profile đầy đủ
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfile'
 *   patch:
 *     tags: [Profile]
 *     summary: Cập nhật thông tin hồ sơ (full_name, phone, ...)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               phone:     { type: string }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */

/**
 * @swagger
 * /api/profile/me/avatar:
 *   post:
 *     tags: [Profile]
 *     summary: Upload ảnh đại diện
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Upload thành công, trả về avatar_url mới
 */

/**
 * @swagger
 * /api/profile/me/password:
 *   patch:
 *     tags: [Profile]
 *     summary: Đổi mật khẩu
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string, minLength: 6 }
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       401:
 *         description: Mật khẩu hiện tại không đúng
 */

/**
 * @swagger
 * /api/profile/me/email/send-code:
 *   post:
 *     tags: [Profile]
 *     summary: Gửi mã xác nhận để đổi email
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newEmail]
 *             properties:
 *               newEmail: { type: string }
 *     responses:
 *       200:
 *         description: Đã gửi mã xác nhận về email mới
 *       409:
 *         description: Email đã được sử dụng
 */

/**
 * @swagger
 * /api/profile/me/email/verify:
 *   post:
 *     tags: [Profile]
 *     summary: Xác nhận mã và hoàn tất đổi email
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newEmail, code]
 *             properties:
 *               newEmail: { type: string }
 *               code:     { type: string, example: AB3X7Z }
 *     responses:
 *       200:
 *         description: Email đã được cập nhật thành công
 *       400:
 *         description: Mã sai hoặc hết hạn
 */

/**
 * @swagger
 * /api/profile/me/device-token:
 *   post:
 *     tags: [Profile]
 *     summary: Đăng ký Expo Push Token để nhận push notification
 *     description: Gọi sau khi login hoặc khi app khởi động để cập nhật device token.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 example: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
 *     responses:
 *       200:
 *         description: Đã đăng ký device token thành công
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     UserProfile:
 *       type: object
 *       properties:
 *         id:         { type: integer }
 *         email:      { type: string }
 *         full_name:  { type: string, nullable: true }
 *         phone:      { type: string, nullable: true }
 *         avatar_url: { type: string, nullable: true }
 *         role:       { type: string, enum: [driver, coordinator, manager, accountant] }
 *         is_active:  { type: boolean }
 *         last_login: { type: string, format: date-time, nullable: true }
 *         created_at: { type: string, format: date-time }
 */
