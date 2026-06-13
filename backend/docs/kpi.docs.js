/**
 * @swagger
 * tags:
 *   - name: KPI — Driver
 *     description: Driver xem KPI và bảng xếp hạng cá nhân
 *   - name: KPI — Staff
 *     description: Coordinator / Manager xem KPI toàn bộ driver. Accountant xem KPI từng driver để phục vụ tính lương.
 */

/**
 * @swagger
 * /api/kpi/me:
 *   get:
 *     tags: [KPI — Driver]
 *     summary: KPI cá nhân của driver (mặc định tất cả tháng, lọc bằng ?month=&year=)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *         description: Tháng cần xem (1–12). Bỏ trống = tất cả tháng.
 *       - in: query
 *         name: year
 *         schema: { type: integer, minimum: 2020 }
 *         description: Năm cần xem. Bỏ trống = tất cả năm.
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
 *     tags: [KPI — Driver]
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
 *         description: Leaderboard nhóm xe
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vehicle_group_name:
 *                   type: string
 *                   example: Small Van (1-2 tấn)
 *                 month:
 *                   type: integer
 *                   example: 6
 *                 year:
 *                   type: integer
 *                   example: 2026
 *                 total_in_group:
 *                   type: integer
 *                   example: 12
 *                   description: Tổng số driver có KPI trong nhóm xe tháng đó
 *                 leaderboard:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LeaderboardRow'
 *       422:
 *         description: Driver chưa được gán xe
 */

/**
 * @swagger
 * /api/kpi/all:
 *   get:
 *     tags: [KPI — Staff]
 *     summary: "[Coordinator/Manager] Xem KPI tất cả driver theo tháng"
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
 *       - in: query
 *         name: vehicle_group_id
 *         schema: { type: integer }
 *         description: Lọc theo nhóm xe (tuỳ chọn)
 *     responses:
 *       200:
 *         description: KPI toàn bộ driver trong tháng
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 kpi:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KpiRecordStaff'
 *       403:
 *         description: Không có quyền (chỉ Coordinator / Manager)
 */

/**
 * @swagger
 * /api/kpi/driver/{driverId}:
 *   get:
 *     tags: [KPI — Staff]
 *     summary: "[Coordinator/Manager/Accountant] Xem KPI của 1 driver cụ thể"
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema: { type: integer }
 *         description: Profile ID của driver
 *       - in: query
 *         name: month
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: KPI của driver được chỉ định
 *       403:
 *         description: Không có quyền
 */

/**
 * @swagger
 * /api/kpi/recalculate:
 *   post:
 *     tags: [KPI — Staff]
 *     summary: "[Coordinator/Manager] Tính lại KPI thủ công cho 1 driver trong 1 tháng"
 *     description: |
 *       Thông thường KPI tự động cập nhật sau mỗi lần driver hoàn thành chuyến.
 *       Endpoint này dùng để force sync khi cần (ví dụ: sửa actual_price sau khi hoàn thành).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [driverId]
 *             properties:
 *               driverId: { type: integer, description: Profile ID của driver }
 *               month:    { type: integer, minimum: 1, maximum: 12, description: Mặc định tháng hiện tại }
 *               year:     { type: integer, description: Mặc định năm hiện tại }
 *     responses:
 *       200:
 *         description: Tính lại thành công
 *       422:
 *         description: Driver chưa được gán xe
 *       403:
 *         description: Không có quyền
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     KpiRecord:
 *       type: object
 *       properties:
 *         id:               { type: integer }
 *         month:            { type: integer, example: 6 }
 *         year:             { type: integer, example: 2026 }
 *         completed_shipments: { type: integer, example: 22 }
 *         total_revenue:
 *           type: string
 *           example: "15500000.00"
 *           description: |
 *             Tổng giá trị chuyến đã hoàn thành trong tháng.
 *             Dùng actual_price nếu đã được accountant chốt, ngược lại dùng estimated_price.
 *             Không phụ thuộc trạng thái thanh toán (TH1/TH2/TH3) — driver hoàn thành chuyến là doanh thu tính.
 *         incident_count:   { type: integer, example: 0 }
 *         major_incident_count:    { type: integer, example: 0 }
 *         critical_incident_count: { type: integer, example: 0 }
 *         vehicle_group_name: { type: string, example: "Small Van (1-2 tấn)" }
 *         revenue_rank:     { type: integer, example: 2, description: "Xếp hạng doanh thu trong nhóm xe tháng đó (Rule 4)" }
 *         trips_rank:       { type: integer, example: 3, description: "Xếp hạng số chuyến trong nhóm xe" }
 *         kpi_bonus_reward:        { type: string, nullable: true, example: "2000000.00", description: "Rule 5: từ bonus_rules.reward_amount" }
 *         kpi_bonus_threshold:     { type: string, nullable: true, example: "70000000",   description: "Rule 5: từ bonus_rules.conditions_json.min_revenue" }
 *         kpi_bonus_achieved:      { type: boolean, example: false,                       description: "Rule 5: total_revenue >= threshold" }
 *         top_driver_bonus_reward: { type: string, nullable: true, example: "1000000.00", description: "Rule 4: từ bonus_rules.reward_amount, nhận khi revenue_rank = 1" }
 *
 *     KpiRecordStaff:
 *       allOf:
 *         - $ref: '#/components/schemas/KpiRecord'
 *         - type: object
 *           properties:
 *             driver_id:   { type: integer }
 *             driver_name: { type: string, example: "Le Driver" }
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
 *         total_in_group:      { type: integer, description: "Tổng số driver có KPI trong nhóm xe tháng đó (trước LIMIT)" }
 *         is_me:               { type: boolean, description: "TRUE nếu là chính driver đang request" }
 */
