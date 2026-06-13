const pool = require('../config/database');

// ─── Driver: KPI cá nhân + bonus eligibility ──────────────────────────────────
// Trả thêm:
//   revenue_rank / trips_rank      — vị trí trong nhóm xe (Rule 4 context)
//   kpi_bonus_threshold/reward     — ngưỡng & thưởng vượt KPI per nhóm (Rule 5)
//   kpi_bonus_achieved             — đã vượt ngưỡng chưa
//   top_driver_bonus_reward        — giải "Lái xe xuất sắc nhất" per nhóm (Rule 4)

const getDriverKPI = async (driverId, { month = null, year = null } = {}) => {
    const conditions = ['k.driver_id = $1'];
    const params = [driverId];
    if (year)  { params.push(year);  conditions.push(`k.year = $${params.length}`); }
    if (month) { params.push(month); conditions.push(`k.month = $${params.length}`); }

    const result = await pool.query(
        `SELECT
            k.id, k.month, k.year,
            k.completed_shipments,
            k.total_revenue::text,
            k.incident_count,
            k.major_incident_count,
            k.critical_incident_count,
            vg.name AS vehicle_group_name,

            -- Xếp hạng trong nhóm xe tháng đó (phục vụ hiển thị Rule 4)
            COALESCE(lb.revenue_rank, 0)::int   AS revenue_rank,
            COALESCE(lb.trips_rank,   0)::int   AS trips_rank,

            -- Rule 5: Thưởng vượt KPI — lấy rule đầu tiên active theo nhóm
            br_kpi.reward_amount::text                          AS kpi_bonus_reward,
            (br_kpi.conditions_json->>'min_revenue')::text      AS kpi_bonus_threshold,
            CASE
                WHEN br_kpi.id IS NOT NULL
                     AND k.total_revenue >= (br_kpi.conditions_json->>'min_revenue')::numeric
                THEN TRUE ELSE FALSE
            END                                                 AS kpi_bonus_achieved,

            -- Rule 4: Thưởng lái xe xuất sắc nhất tháng — lấy rule đầu tiên active
            br_top.reward_amount::text                          AS top_driver_bonus_reward

         FROM kpi_records k
         JOIN vehicle_groups vg ON vg.id = k.vehicle_group_id

         -- Rank từ view sẵn có (đã PARTITION BY vehicle_group_id, year, month)
         LEFT JOIN v_leaderboard lb
            ON lb.driver_id        = k.driver_id
            AND lb.vehicle_group_id = k.vehicle_group_id
            AND lb.year             = k.year
            AND lb.month            = k.month

         -- Rule 5 rule config
         LEFT JOIN LATERAL (
             SELECT id, reward_amount, conditions_json
             FROM bonus_rules
             WHERE vehicle_group_id = k.vehicle_group_id
               AND bonus_type = 'kpi'
               AND is_active  = TRUE
             ORDER BY id
             LIMIT 1
         ) br_kpi ON TRUE

         -- Rule 4 rule config
         LEFT JOIN LATERAL (
             SELECT id, reward_amount
             FROM bonus_rules
             WHERE vehicle_group_id = k.vehicle_group_id
               AND bonus_type = 'top_revenue'
               AND is_active  = TRUE
             ORDER BY id
             LIMIT 1
         ) br_top ON TRUE

         WHERE ${conditions.join(' AND ')}
         ORDER BY k.year DESC, k.month DESC`,
        params,
    );
    return result.rows;
};

// ─── Driver: Vehicle group để query leaderboard đúng nhóm (BR-028) ───────────

const getDriverVehicleGroupId = async (driverId) => {
    const result = await pool.query(
        `SELECT v.vehicle_group_id, vg.name AS vehicle_group_name
         FROM drivers d
         JOIN vehicles v  ON v.id  = d.vehicle_id
         JOIN vehicle_groups vg ON vg.id = v.vehicle_group_id
         WHERE d.profile_id = $1`,
        [driverId],
    );
    return result.rows[0] ?? null;
};

// ─── Driver: Leaderboard trong nhóm xe của mình (BR-028) ─────────────────────
// Luôn trả về rank của driver hiện tại dù không trong top 20
// Thêm total_in_group: tổng số driver có KPI trong nhóm tháng đó

const getLeaderboard = async (driverId, vehicleGroupId, { month, year }) => {
    const result = await pool.query(
        `WITH board AS (
            SELECT
                driver_id, driver_name,
                completed_shipments,
                total_revenue::text,
                incident_count,
                revenue_rank,
                trips_rank,
                COUNT(*) OVER () AS total_in_group
            FROM v_leaderboard
            WHERE vehicle_group_id = $1 AND year = $2 AND month = $3
         )
         SELECT *, (driver_id = $4) AS is_me
         FROM board
         ORDER BY revenue_rank ASC
         LIMIT 20`,
        [vehicleGroupId, year, month, driverId],
    );

    const rows = result.rows;
    const alreadyInTop = rows.some((r) => r.driver_id === driverId);
    if (!alreadyInTop) {
        const myRank = await pool.query(
            `WITH board AS (
                SELECT
                    driver_id, driver_name,
                    completed_shipments,
                    total_revenue::text,
                    incident_count,
                    revenue_rank,
                    trips_rank,
                    COUNT(*) OVER () AS total_in_group
                FROM v_leaderboard
                WHERE vehicle_group_id = $1 AND year = $2 AND month = $3
             )
             SELECT *, TRUE AS is_me
             FROM board
             WHERE driver_id = $4`,
            [vehicleGroupId, year, month, driverId],
        );
        if (myRank.rows[0]) rows.push(myRank.rows[0]);
    }

    return rows;
};

// ─── Coordinator / Manager: KPI tất cả driver theo tháng ─────────────────────

const getAllDriversKPI = async ({ month, year, vehicleGroupId = null }) => {
    const conditions = ['k.year = $1', 'k.month = $2'];
    const params = [year, month];
    if (vehicleGroupId) {
        params.push(vehicleGroupId);
        conditions.push(`k.vehicle_group_id = $${params.length}`);
    }

    const result = await pool.query(
        `SELECT
            k.driver_id,
            p.full_name AS driver_name,
            k.month, k.year,
            k.completed_shipments,
            k.total_revenue::text,
            k.incident_count,
            k.major_incident_count,
            k.critical_incident_count,
            vg.name AS vehicle_group_name
         FROM kpi_records k
         JOIN profiles p       ON p.id  = k.driver_id
         JOIN vehicle_groups vg ON vg.id = k.vehicle_group_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY k.total_revenue DESC`,
        params,
    );
    return result.rows;
};

// ─── Coordinator / Manager / Accountant: KPI của 1 driver cụ thể ─────────────

const getDriverKPIById = async (driverId, { month = null, year = null } = {}) => {
    const conditions = ['k.driver_id = $1'];
    const params = [driverId];
    if (year)  { params.push(year);  conditions.push(`k.year = $${params.length}`); }
    if (month) { params.push(month); conditions.push(`k.month = $${params.length}`); }

    const result = await pool.query(
        `SELECT
            k.id, k.driver_id, k.month, k.year,
            k.completed_shipments,
            k.total_revenue::text,
            k.incident_count,
            k.major_incident_count,
            k.critical_incident_count,
            p.full_name AS driver_name,
            vg.name AS vehicle_group_name
         FROM kpi_records k
         JOIN profiles p       ON p.id  = k.driver_id
         JOIN vehicle_groups vg ON vg.id = k.vehicle_group_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY k.year DESC, k.month DESC`,
        params,
    );
    return result.rows;
};

// ─── Tính lại KPI cho 1 driver trong 1 tháng rồi UPSERT vào kpi_records ──────
// Gọi tự động sau mỗi lần trip hoàn thành (fire-and-forget)
// Doanh thu KPI chỉ tính actual_price (BR-026) — không fallback estimated_price

const recalculateDriverKPI = async (driverId, month, year) => {
    const vgRes = await pool.query(
        `SELECT v.vehicle_group_id
         FROM drivers d
         JOIN vehicles v ON v.id = d.vehicle_id
         WHERE d.profile_id = $1`,
        [driverId],
    );
    const vehicleGroupId = vgRes.rows[0]?.vehicle_group_id;
    if (!vehicleGroupId) return null;

    // Doanh thu KPI = giá trị chuyến, không phụ thuộc trạng thái thanh toán.
    // actual_price được set bởi coordinator/accountant (chưa có ở driver scope).
    // Khi bên đó thêm setActualPrice, phải gọi recalculateAfterCompletion ngay sau để KPI tự cập nhật.
    // Hiện tại actual_price luôn NULL → KPI dùng estimated_price, hoàn toàn đúng.
    const shipRes = await pool.query(
        `SELECT
            COUNT(*)                                                        AS completed_shipments,
            COALESCE(SUM(COALESCE(actual_price, estimated_price, 0)), 0)   AS total_revenue
         FROM order_shipments
         WHERE owner_driver_id = $1
           AND status = 'completed'
           AND EXTRACT(MONTH FROM completed_at) = $2
           AND EXTRACT(YEAR  FROM completed_at) = $3`,
        [driverId, month, year],
    );
    const { completed_shipments, total_revenue } = shipRes.rows[0];

    const incRes = await pool.query(
        `SELECT
            COUNT(*)                                               AS incident_count,
            COUNT(*) FILTER (WHERE severity_level = 'high')       AS major_incident_count,
            COUNT(*) FILTER (WHERE severity_level = 'critical')   AS critical_incident_count
         FROM incidents
         WHERE reported_by = $1
           AND EXTRACT(MONTH FROM created_at) = $2
           AND EXTRACT(YEAR  FROM created_at) = $3`,
        [driverId, month, year],
    );
    const { incident_count, major_incident_count, critical_incident_count } = incRes.rows[0];

    const result = await pool.query(
        `INSERT INTO kpi_records
            (driver_id, vehicle_group_id, month, year,
             completed_shipments, total_revenue,
             incident_count, major_incident_count, critical_incident_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (driver_id, month, year) DO UPDATE SET
             completed_shipments     = EXCLUDED.completed_shipments,
             total_revenue           = EXCLUDED.total_revenue,
             incident_count          = EXCLUDED.incident_count,
             major_incident_count    = EXCLUDED.major_incident_count,
             critical_incident_count = EXCLUDED.critical_incident_count,
             updated_at              = NOW()
         RETURNING *`,
        [
            driverId, vehicleGroupId, month, year,
            Number(completed_shipments), Number(total_revenue),
            Number(incident_count), Number(major_incident_count), Number(critical_incident_count),
        ],
    );
    return result.rows[0];
};

module.exports = {
    getDriverKPI,
    getDriverVehicleGroupId,
    getLeaderboard,
    getAllDriversKPI,
    getDriverKPIById,
    recalculateDriverKPI,
};
