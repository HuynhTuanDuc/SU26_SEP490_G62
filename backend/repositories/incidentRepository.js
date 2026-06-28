const pool = require('../config/database');


const getAllIncidents = async ({ page = 1, limit = 10, fromDate, toDate } = {}) => {
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let queryParams = [];
    let paramIndex = 1;

    if (fromDate) {
        whereClauses.push(`i.created_at >= $${paramIndex++}`);
        queryParams.push(fromDate);
    }

    if (toDate) {
        // Appending time to cover the whole day
        whereClauses.push(`i.created_at <= $${paramIndex++}`);
        queryParams.push(`${toDate} 23:59:59`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) FROM incidents i ${whereString}`;
    const totalResult = await pool.query(countQuery, queryParams);
    const total = parseInt(totalResult.rows[0].count, 10);

    const dataQuery = `
        SELECT
            i.*,
            i.status AS incident_status,
            os.order_id,
            os.status AS shipment_status,
            os.actual_price,
            os.estimated_price,
            v.plate_number,
            p.full_name,
            p.avatar_url,
            rp.full_name AS replacement_driver_name,
            rv.plate_number AS replacement_plate_number
        FROM incidents i
        JOIN order_shipments os ON os.id = i.shipment_id
        JOIN orders o ON o.id = os.order_id
        JOIN profiles p ON p.id = i.reported_by
        LEFT JOIN vehicles v ON v.id = os.vehicle_id
        LEFT JOIN profiles rp ON rp.id = i.replacement_driver_id
        LEFT JOIN vehicles rv ON rv.id = i.replacement_vehicle_id
        ${whereString}
        ORDER BY 
            CASE WHEN i.status IN ('open', 'investigating') THEN 1 ELSE 2 END ASC,
            i.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    queryParams.push(limit, offset);

    const result = await pool.query(dataQuery, queryParams);
    return {
        data: result.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
};


const createIncident = async ({ shipmentId, reportedBy, incidentType, severityLevel, description, location }) => {
    const result = await pool.query(
        `INSERT INTO incidents
            (shipment_id, reported_by, incident_type, severity_level, description, location)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [shipmentId, reportedBy, incidentType, severityLevel, description, location ?? null],
    );
    return result.rows[0];
};

const addIncidentEvidence = async (incidentId, fileUrl) => {
    const result = await pool.query(
        `INSERT INTO incident_evidences (incident_id, file_url)
         VALUES ($1, $2)
         RETURNING *`,
        [incidentId, fileUrl],
    );
    return result.rows[0];
};

const getIncidentById = async (incidentId) => {
    const result = await pool.query(
        `SELECT
            i.*,
            COALESCE(
                json_agg(ie.file_url ORDER BY ie.uploaded_at)
                FILTER (WHERE ie.id IS NOT NULL),
                '[]'::json
            ) AS image_urls
         FROM incidents i
         LEFT JOIN incident_evidences ie ON ie.incident_id = i.id
         WHERE i.id = $1
         GROUP BY i.id`,
        [incidentId],
    );
    return result.rows[0] ?? null;
};

const getIncidentsByDriver = async (driverId, { limit = 20, offset = 0 } = {}) => {
    const [rows, countRow] = await Promise.all([
        pool.query(
            `SELECT
                i.id,
                i.shipment_id,
                i.incident_type,
                i.severity_level,
                i.description,
                i.location,
                i.status,
                i.occurred_at,
                i.resolved_at,
                i.created_at,
                COALESCE(
                    json_agg(ie.file_url ORDER BY ie.uploaded_at)
                    FILTER (WHERE ie.id IS NOT NULL),
                    '[]'::json
                ) AS image_urls
             FROM incidents i
             LEFT JOIN incident_evidences ie ON ie.incident_id = i.id
             WHERE i.reported_by = $1
             GROUP BY i.id
             ORDER BY i.created_at DESC
             LIMIT $2 OFFSET $3`,
            [driverId, limit, offset],
        ),
        pool.query(
            `SELECT COUNT(*) FROM incidents WHERE reported_by = $1`,
            [driverId],
        ),
    ]);
    return { rows: rows.rows, total: Number(countRow.rows[0].count) };
};

const getCoordinatorIds = async () => {
    const result = await pool.query(
        `SELECT p.id
         FROM profiles p
         JOIN roles r ON r.id = p.role_id
         WHERE r.name = 'coordinator'`,
    );
    return result.rows.map((r) => r.id);
};

// Lấy incidents của 1 shipment (để check duplicate type + list)
const getIncidentsByShipment = async (shipmentId) => {
    const result = await pool.query(
        `SELECT
            i.id, i.shipment_id, i.incident_type, i.severity_level,
            i.description, i.location, i.status, i.occurred_at, i.resolved_at, i.created_at,
            COALESCE(
                json_agg(ie.file_url ORDER BY ie.uploaded_at)
                FILTER (WHERE ie.id IS NOT NULL), '[]'::json
            ) AS image_urls
         FROM incidents i
         LEFT JOIN incident_evidences ie ON ie.incident_id = i.id
         WHERE i.shipment_id = $1
         GROUP BY i.id
         ORDER BY i.created_at DESC`,
        [shipmentId],
    );
    return result.rows;
};

// Kiểm tra driver có sự cố đang mở (không gắn chuyến) cùng loại không
const getOpenIncidentsByDriverAndType = async (driverId, incidentType) => {
    const result = await pool.query(
        `SELECT id FROM incidents
         WHERE reported_by = $1
           AND incident_type = $2
           AND shipment_id IS NULL
           AND status IN ('open', 'investigating')
         LIMIT 1`,
        [driverId, incidentType],
    );
    return result.rows[0] ?? null;
};

// Driver cập nhật sự cố của mình (chỉ khi còn open)
const updateIncident = async (incidentId, driverId, { severityLevel, description, location }) => {
    const result = await pool.query(
        `UPDATE incidents
         SET severity_level = COALESCE($3, severity_level),
             description    = COALESCE($4, description),
             location       = COALESCE($5, location),
             updated_at     = NOW()
         WHERE id = $1 AND reported_by = $2 AND status = 'open'
         RETURNING *`,
        [incidentId, driverId, severityLevel ?? null, description ?? null, location ?? null],
    );
    return result.rows[0] ?? null;
};

const updateIncidentStatus = async (
    incidentId,
    {
        status,
        resolution = null
    }
) => {
    const isClosing =
        status === "resolved" ||
        status === "closed";

    const result = await pool.query(
        `
        UPDATE incidents
        SET
            status = $2,
            resolution_note = $3
            ${isClosing ? ", resolved_at = NOW()" : ""}
        WHERE id = $1
        RETURNING *
        `,
        [
            incidentId,
            status,
            resolution
        ]
    );

    return result.rows[0] ?? null;
};



module.exports = {
    getAllIncidents,
    createIncident,
    addIncidentEvidence,
    getIncidentById,
    getIncidentsByDriver,
    getIncidentsByShipment,
    getOpenIncidentsByDriverAndType,
    updateIncident,
    getCoordinatorIds,
    updateIncidentStatus,
};
