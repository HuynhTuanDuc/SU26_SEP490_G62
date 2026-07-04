/**
 * @swagger
 * tags:
 *   name: KPI
 *   description: Driver xem KPI cá nhân và bảng xếp hạng nhóm xe (BR-028/030)
 */

/**
 * @swagger
 * /api/kpi/me:
 *   get:
 *     tags: [KPI]
 *     summary: KPI cá nhân của driver theo tháng
 *     description: |
 *       KPI tính ngay khi trip COMPLETED — không phụ thuộc thanh toán hay phiếu thu (BR-030).
 *       Bỏ trống month/year = lấy tất cả tháng.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *         description: Tháng (1–12). Bỏ trống = tất cả tháng.
 *       - in: query
 *         name: year
 *         schema: { type: integer, minimum: 2020 }
 *         description: Năm. Bỏ trống = tất cả năm.
 *     responses:
 *       200:
 *         description: Danh sách KPI record của driver
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 kpi:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KpiRecord'
 *       400:
 *         description: Tháng / năm không hợp lệ
 */

/**
 * @swagger
 * /api/kpi/leaderboard:
 *   get:
 *     tags: [KPI]
 *     summary: Bảng xếp hạng trong nhóm xe của driver (BR-028 — không so sánh chéo nhóm)
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
 *         description: Leaderboard nhóm xe theo doanh thu và số chuyến
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vehicle_group_name: { type: string, example: Small Van (1-2 tấn) }
 *                 month:              { type: integer, example: 6 }
 *                 year:               { type: integer, example: 2026 }
 *                 total_in_group:     { type: integer, description: Tổng số driver có KPI trong nhóm tháng đó }
 *                 leaderboard:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LeaderboardRow'
 *       422:
 *         description: Driver chưa được gán xe
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     KpiRecord:
 *       type: object
 *       properties:
 *         id:                   { type: integer }
 *         month:                { type: integer, example: 6 }
 *         year:                 { type: integer, example: 2026 }
 *         completed_shipments:  { type: integer, example: 22 }
 *         total_revenue:
 *           type: string
 *           example: "15500000.00"
 *           description: |
 *             Tổng giá trị chuyến hoàn thành. Dùng actual_price nếu coordinator đã chốt,
 *             ngược lại dùng estimated_price. Không phụ thuộc trạng thái thanh toán (BR-026).
 *         incident_count:            { type: integer, example: 0 }
 *         major_incident_count:      { type: integer, example: 0 }
 *         critical_incident_count:   { type: integer, example: 0 }
 *         vehicle_group_name:        { type: string, example: Small Van (1-2 tấn) }
 *         revenue_rank:              { type: integer, example: 2, description: Xếp hạng doanh thu trong nhóm xe }
 *         trips_rank:                { type: integer, example: 3, description: Xếp hạng số chuyến trong nhóm xe }
 *         kpi_bonus_reward:          { type: string, nullable: true, example: "2000000.00" }
 *         kpi_bonus_threshold:       { type: string, nullable: true, example: "70000000" }
 *         kpi_bonus_achieved:        { type: boolean, example: false }
 *         top_driver_bonus_reward:   { type: string, nullable: true, example: "1000000.00" }
 *
 *     LeaderboardRow:
 *       type: object
 *       properties:
 *         driver_id:           { type: integer }
 *         driver_name:         { type: string }
 *         completed_shipments: { type: integer }
 *         total_revenue:       { type: string }
 *         incident_count:      { type: integer }
 *         revenue_rank:        { type: integer }
 *         trips_rank:          { type: integer }
 *         is_me:               { type: boolean, description: TRUE nếu là chính driver đang request }
 */
