/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Xác thực tài khoản và quản lý phiên đăng nhập
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng nhập bằng email / password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, example: driver@g62.vn }
 *               password: { type: string, example: "123456" }
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:        { type: string, description: Access token (Bearer) }
 *                 refreshToken: { type: string, description: Refresh token — mobile lưu vào SecureStore }
 *                 user:
 *                   $ref: '#/components/schemas/AuthUser'
 *       401:
 *         description: Sai email hoặc mật khẩu
 *       403:
 *         description: Tài khoản bị khoá hoặc chưa được gán vai trò
 */

/**
 * @swagger
 * /auth/google:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng nhập bằng Google OAuth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credential]
 *             properties:
 *               credential:
 *                 type: string
 *                 description: Google ID token từ Google Sign-In SDK
 *                 example: eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:        { type: string }
 *                 refreshToken: { type: string }
 *                 user:
 *                   $ref: '#/components/schemas/AuthUser'
 *       403:
 *         description: Tài khoản Google chưa được cấp quyền trong hệ thống
 */

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Làm mới access token bằng refresh token
 *     description: |
 *       **Web**: refresh token đọc tự động từ HttpOnly cookie — không cần body.
 *       **Mobile**: gửi `refreshToken` trong request body.
 *       Sau khi thành công, refresh token cũ bị revoke và token mới được trả về (rotation).
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Chỉ cần với mobile — web dùng cookie tự động
 *     responses:
 *       200:
 *         description: Token mới
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:        { type: string, description: Access token mới }
 *                 refreshToken: { type: string, description: Refresh token mới }
 *                 user:
 *                   $ref: '#/components/schemas/AuthUser'
 *       401:
 *         description: Refresh token không hợp lệ, hết hạn, hoặc đã bị revoke
 */

/**
 * @swagger
 * /auth/forgot-password/request:
 *   post:
 *     tags: [Auth]
 *     summary: Gửi mã 6 ký tự đặt lại mật khẩu về email (TTL 10 phút)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, example: driver@g62.vn }
 *     responses:
 *       200:
 *         description: Đã gửi mã (expires_in_seconds, retry_after_seconds)
 *       404:
 *         description: Email không tồn tại
 *       429:
 *         description: Gửi quá nhanh — chờ cooldown 60 giây
 */

/**
 * @swagger
 * /auth/forgot-password/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Xác nhận mã 6 ký tự từ email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string }
 *               code:  { type: string, example: AB3X7Z }
 *     responses:
 *       200:
 *         description: Mã hợp lệ — có thể đặt lại mật khẩu
 *       400:
 *         description: Mã sai hoặc hết hạn
 */

/**
 * @swagger
 * /auth/forgot-password/reset:
 *   post:
 *     tags: [Auth]
 *     summary: Đặt lại mật khẩu mới (sau khi verify mã thành công)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code, newPassword, confirmPassword]
 *             properties:
 *               email:           { type: string }
 *               code:            { type: string, example: AB3X7Z }
 *               newPassword:     { type: string, minLength: 6 }
 *               confirmPassword: { type: string }
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *       400:
 *         description: Mã sai, hết hạn, mật khẩu không khớp, hoặc chưa verify mã
 */

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Đăng xuất — revoke refresh token và xóa cookie
 *     responses:
 *       200:
 *         description: Logout successful
 */

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Thông tin user hiện tại (từ JWT)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthUser'
 *       401:
 *         description: Token không hợp lệ hoặc hết hạn
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     AuthUser:
 *       type: object
 *       properties:
 *         id:         { type: integer }
 *         email:      { type: string }
 *         full_name:  { type: string, nullable: true }
 *         phone:      { type: string, nullable: true }
 *         avatar_url: { type: string, nullable: true }
 *         role:
 *           type: string
 *           enum: [driver, coordinator, manager, accountant]
 */
