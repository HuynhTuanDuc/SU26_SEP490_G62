/**
 * @swagger
 * tags:
 *   name: Payroll
 *   description: Driver xem lương và yêu cầu ứng lương (BR-029 — phải được manager duyệt)
 */

/**
 * @swagger
 * /api/payroll/estimate:
 *   get:
 *     tags: [Payroll]
 *     summary: Ước tính lương tháng hiện tại (real-time, chưa chính thức)
 *     description: |
 *       Công thức (mục 24):
 *       Net = Base + KPI Bonus + Revenue Bonus + Special Bonus - Penalty - Outstanding Driver Debt - Advance Recovery
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *         description: Tháng (mặc định = tháng hiện tại)
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *         description: Năm (mặc định = năm hiện tại)
 *     responses:
 *       200:
 *         description: Ước tính lương tháng
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PayrollEstimate'
 */

/**
 * @swagger
 * /api/payroll/me:
 *   get:
 *     tags: [Payroll]
 *     summary: Lịch sử bảng lương chính thức của driver
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Danh sách payroll records chính thức (đã được kế toán confirm)
 */

/**
 * @swagger
 * /api/payroll/advance:
 *   get:
 *     tags: [Payroll]
 *     summary: Danh sách yêu cầu ứng lương của driver hiện tại
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách advance requests kèm trạng thái (pending / approved / rejected / disbursed)
 *   post:
 *     tags: [Payroll]
 *     summary: Tạo yêu cầu ứng lương (BR-029 — phải được Manager duyệt, Accountant giải ngân)
 *     description: |
 *       Flow: Driver request → Manager approve → Accountant disburse.
 *       Driver không được tự duyệt (BR-029).
 *       Khoản ứng được trừ vào lương tháng tiếp theo (advance_recovery).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, reason]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 3000000
 *               reason:
 *                 type: string
 *                 example: Chi phí sửa xe cá nhân
 *               requestMonth:
 *                 type: integer
 *                 description: Tháng ứng lương (mặc định = tháng hiện tại)
 *               requestYear:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Yêu cầu đã được gửi, chờ Manager duyệt
 *       422:
 *         description: Số tiền vượt quá giới hạn hoặc đã có yêu cầu đang chờ
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PayrollEstimate:
 *       type: object
 *       properties:
 *         month:              { type: integer }
 *         year:               { type: integer }
 *         base_salary:        { type: string, example: "10000000.00" }
 *         kpi_bonus:          { type: string, example: "2000000.00" }
 *         revenue_bonus:      { type: string, example: "1000000.00" }
 *         special_bonus:      { type: string, example: "0.00" }
 *         penalty:            { type: string, example: "0.00" }
 *         driver_debt:        { type: string, example: "1500000.00", description: Công nợ driver còn tồn đọng }
 *         advance_recovery:   { type: string, example: "3000000.00", description: Hoàn ứng lương }
 *         estimated_net:      { type: string, example: "8500000.00" }
 *         completed_trips:    { type: integer, example: 22 }
 *         total_revenue:      { type: string, example: "15500000.00" }
 */
