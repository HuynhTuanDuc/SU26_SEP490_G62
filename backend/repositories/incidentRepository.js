const pool = require('../config/database');

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

const updateIncidentStatus = async (incidentId, { status, resolution = null }) => {
    const isClosing = status === 'resolved' || status === 'closed';
    const result = await pool.query(
        `UPDATE incidents
         SET status     = $2
             ${isClosing ? ', resolved_at = NOW()' : ''}
         WHERE id = $1
         RETURNING *`,
        [incidentId, status],
    );
    return result.rows[0] ?? null;
};

module.exports = {
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
