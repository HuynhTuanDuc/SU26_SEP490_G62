const incidentRepository = require('../repositories/incidentRepository');
const tripRepository = require('../repositories/tripRepository');
const notificationService = require('./notificationService');
const {
    ALLOWED_INCIDENT_TYPES,
    ALLOWED_SEVERITIES,
    ALLOWED_INCIDENT_STATUSES,
    INCIDENT_SEVERITY,
    MAX_IMAGES_PER_INCIDENT,
} = require('../constants/incidentConstants');

const ACTIVE_STATUSES = ['claimed', 'picking', 'transit', 'arrived', 'failed', 'returning'];

const TYPE_LABEL = {
    vehicle_breakdown: 'Sự cố xe',
    cargo_damage:      'Hàng hóa bị hỏng',
    road_incident:     'Đường sá / giao thông',
    customer_refusal:  'Khách từ chối nhận',
    traffic_jam:       'Tắc đường',
    other:             'Khác',
};

const STATUS_LABEL = {
    open:          'Mới tiếp nhận',
    investigating: 'Đang xử lý',
    resolved:      'Đã giải quyết',
    closed:        'Đã đóng',
};
// Lấy tất cả incidents (dành cho nhân viên điều phối)
const getAllIncidents = async () => {
    const result = await incidentRepository.getAllIncidents();
    if (!result) throw new Error('Không thể lấy danh sách sự cố từ dữ liệu');
    return result;
}

// Lấy incidents của 1 shipment (driver xem + check duplicate)
const getShipmentIncidents = async (shipmentId, driverId) => {
    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');
    if (Number(shipment.owner_driver_id) !== Number(driverId)) {
        throw new Error('Bạn không có quyền xem sự cố của chuyến này');
    }
    return incidentRepository.getIncidentsByShipment(shipmentId);
};

// Driver cập nhật sự cố của mình (chỉ khi còn open)
const updateMyIncident = async (incidentId, driverId, { severityLevel, description, location }) => {
    if (description !== undefined && description !== null) {
        if (!description.trim()) throw new Error('Mô tả sự cố không được để trống');
        if (description.trim().length < 10) throw new Error('Mô tả phải có ít nhất 10 ký tự');
    }

    const incident = await incidentRepository.getIncidentById(incidentId);
    if (!incident) throw new Error('Sự cố không tồn tại');
    if (Number(incident.reported_by) !== Number(driverId)) {
        throw new Error('Bạn không có quyền chỉnh sửa sự cố này');
    }
    if (incident.status !== 'open') {
        throw new Error('Chỉ có thể chỉnh sửa sự cố đang ở trạng thái "Đang chờ"');
    }

    const updated = await incidentRepository.updateIncident(incidentId, driverId, {
        severityLevel: severityLevel ?? null,
        description:   description ? description.trim() : null,
        location:      location !== undefined ? (location?.trim() || null) : undefined,
    });

    if (!updated) throw new Error('Không thể cập nhật sự cố');

    // Notify coordinators về cập nhật
    const coordinatorIds = await incidentRepository.getCoordinatorIds();
    notificationService.createForUsers(coordinatorIds, {
        title: `Cập nhật sự cố #${incidentId}`,
        message: `Tài xế đã cập nhật thông tin sự cố trên chuyến #${incident.shipment_id}`,
        type: 'INCIDENT_REPORTED',
        entityType: 'incidents',
        entityId: incidentId,
    }, { displayMode: 'silent' }).catch(() => {});

    return incidentRepository.getIncidentById(incidentId);
};

const createIncident = async (driverId, { shipmentId, incidentType, severityLevel, description, location }, imageUrls = []) => {
    if (!incidentType || !ALLOWED_INCIDENT_TYPES.includes(incidentType)) {
        throw new Error('Loại sự cố không hợp lệ');
    }

    if (!description || !description.trim()) {
        throw new Error('Mô tả sự cố là bắt buộc');
    }
    if (description.trim().length < 10) {
        throw new Error('Mô tả sự cố phải có ít nhất 10 ký tự');
    }

    const severity = severityLevel && ALLOWED_SEVERITIES.includes(severityLevel)
        ? severityLevel
        : INCIDENT_SEVERITY.MEDIUM;

    const parsedShipmentId = shipmentId ? Number(shipmentId) : null;

    if (parsedShipmentId) {
        const shipment = await tripRepository.getTripById(parsedShipmentId);
        if (!shipment) throw new Error('Chuyến vận chuyển không tồn tại');
        if (Number(shipment.owner_driver_id) !== Number(driverId)) {
            throw new Error('Bạn không có quyền báo sự cố cho chuyến này');
        }
        if (!ACTIVE_STATUSES.includes(shipment.status)) {
            throw new Error('Chỉ có thể báo sự cố khi chuyến đang hoạt động');
        }

        // Chỉ 1 sự cố mỗi loại (incident_type) trên 1 chuyến
        const existing = await incidentRepository.getIncidentsByShipment(parsedShipmentId);
        const duplicate = existing.find((i) => i.incident_type === incidentType);
        if (duplicate) {
            throw new Error(`DUPLICATE_TYPE:Chuyến này đã có sự cố loại "${TYPE_LABEL[incidentType] ?? incidentType}". Vui lòng chỉnh sửa sự cố đã tạo thay vì tạo mới.`);
        }
    } else {
        // Không có chuyến: chỉ 1 sự cố đang mở (open/investigating) mỗi loại trên cùng driver
        const existing = await incidentRepository.getOpenIncidentsByDriverAndType(driverId, incidentType);
        if (existing) {
            throw new Error(`DUPLICATE_TYPE:Bạn đang có sự cố loại "${TYPE_LABEL[incidentType] ?? incidentType}" chưa được xử lý. Vui lòng chỉnh sửa sự cố đó thay vì tạo mới.`);
        }
    }

    if (imageUrls.length > MAX_IMAGES_PER_INCIDENT) {
        throw new Error(`Tối đa ${MAX_IMAGES_PER_INCIDENT} ảnh minh chứng`);
    }

    const incident = await incidentRepository.createIncident({
        shipmentId: parsedShipmentId,
        reportedBy: driverId,
        incidentType,
        severityLevel: severity,
        description: description.trim(),
        location: location?.trim() || null,
    });

    await Promise.all(imageUrls.map((url) => incidentRepository.addIncidentEvidence(incident.id, url)));

    const contextMsg = parsedShipmentId
        ? `trên chuyến #${parsedShipmentId}`
        : 'ngoài chuyến (xe không có chuyến)';

    // Notify coordinators (alert — họ cần xử lý ngay)
    const coordinatorIds = await incidentRepository.getCoordinatorIds();
    notificationService.createForUsers(coordinatorIds, {
        title: `Sự cố mới: ${TYPE_LABEL[incidentType]}`,
        message: `Tài xế báo cáo sự cố ${contextMsg}: ${description.trim().slice(0, 80)}`,
        type: 'INCIDENT_REPORTED',
        entityType: 'incidents',
        entityId: incident.id,
    }, { displayMode: 'alert' }).catch(() => {});

    // Notify driver — xác nhận sự cố đã được ghi nhận (silent — họ vừa submit xong)
    notificationService.createForUser(driverId, {
        title: `Đã ghi nhận sự cố: ${TYPE_LABEL[incidentType]}`,
        message: `Sự cố #${incident.id} đã được ghi nhận và gửi đến điều phối viên. Họ sẽ liên hệ hỗ trợ bạn sớm.`,
        type: 'INCIDENT_REPORTED',
        entityType: 'incidents',
        entityId: incident.id,
    }, { displayMode: 'silent' }).catch(() => {});

    return incidentRepository.getIncidentById(incident.id);
};

const getMyCounts = async (driverId) => {
    const result = await require('../config/database').query(
        `SELECT
            COUNT(*) FILTER (WHERE status IN ('open','investigating'))   AS open_count,
            COUNT(*) FILTER (WHERE status IN ('resolved','closed'))      AS closed_count
         FROM incidents
         WHERE reported_by = $1`,
        [driverId],
    );
    const row = result.rows[0];
    return {
        open_count:   Number(row.open_count   ?? 0),
        closed_count: Number(row.closed_count ?? 0),
    };
};

const getMyIncidents = async (driverId, page = 1, limit = 20) => {
    const offset = (page - 1) * limit;
    const { rows, total } = await incidentRepository.getIncidentsByDriver(driverId, { limit, offset });
    return {
        incidents: rows,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
};

const getIncidentDetail = async (incidentId, driverId) => {
    const incident = await incidentRepository.getIncidentById(incidentId);
    if (!incident) throw new Error('Sự cố không tồn tại');
    if (Number(incident.reported_by) !== Number(driverId)) {
        throw new Error('Bạn không có quyền xem sự cố này');
    }
    return incident;
};

// Coordinator cập nhật trạng thái sự cố → notify driver
const updateIncidentStatus = async (incidentId, coordinatorId, { status, resolution }) => {
    if (!status || !ALLOWED_INCIDENT_STATUSES.includes(status)) {
        throw new Error('Trạng thái sự cố không hợp lệ');
    }

    const incident = await incidentRepository.getIncidentById(incidentId);
    if (!incident) throw new Error('Sự cố không tồn tại');

    const updated = await incidentRepository.updateIncidentStatus(incidentId, { status, resolution });
    if (!updated) throw new Error('Không thể cập nhật sự cố');

    // Notify driver về phản hồi từ coordinator
    const driverId = incident.reported_by;
    const statusText = STATUS_LABEL[status] ?? status;
    const msgBody = resolution
        ? `Trạng thái: ${statusText}. Phản hồi: ${resolution.slice(0, 100)}`
        : `Sự cố #${incidentId} được cập nhật trạng thái: ${statusText}.`;

    notificationService.createForUser(driverId, {
        title: `Phản hồi sự cố #${incidentId}`,
        message: msgBody,
        type: 'INCIDENT_FEEDBACK',
        entityType: 'incidents',
        entityId: incidentId,
    }, { displayMode: status === 'resolved' || status === 'closed' ? 'toast' : 'silent' }).catch(() => {});

    return updated;
};

const reassignVehicle = async (incidentId, coordinatorId, replacementDriverId, replacementVehicleId) => {
    const incident = await incidentRepository.getIncidentById(incidentId);
    if (!incident) throw new Error('Sự cố không tồn tại');
    if (!incident.shipment_id) throw new Error('Sự cố này không liên kết với chuyến nào');

    const pool = require('../config/database');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lấy thông tin shipment hiện tại
        const shipmentResult = await client.query('SELECT * FROM order_shipments WHERE id = $1 FOR UPDATE', [incident.shipment_id]);
        const shipment = shipmentResult.rows[0];
        if (!shipment) throw new Error('Chuyến vận chuyển không tồn tại');

        // Cập nhật shipment với tài xế và xe mới
        await client.query(
            `UPDATE order_shipments 
             SET owner_driver_id = $1, vehicle_id = $2, updated_at = NOW() 
             WHERE id = $3`,
            [replacementDriverId, replacementVehicleId, shipment.id]
        );

        // Đóng assignment cũ
        await client.query(
            `UPDATE shipment_assignments
             SET completed_at = NOW()
             WHERE shipment_id = $1 AND driver_id = $2 AND completed_at IS NULL`,
            [shipment.id, shipment.owner_driver_id]
        );

        // Ghi lịch sử điều phối (shipment_assignment_history)
        await client.query(
            `INSERT INTO shipment_assignment_history
                 (shipment_id, from_driver_id, from_vehicle_id, to_driver_id, to_vehicle_id, changed_by, change_reason, incident_id, changed_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'incident_reassign', $7, NOW())`,
            [shipment.id, shipment.owner_driver_id, shipment.vehicle_id, replacementDriverId, replacementVehicleId, coordinatorId, incidentId]
        );

        // Tạo assignment mới
        await client.query(
            `INSERT INTO shipment_assignments
                 (shipment_id, driver_id, vehicle_id, assignment_type, assigned_by)
             VALUES ($1, $2, $3, 'coordinator_assign', $4)`,
            [shipment.id, replacementDriverId, replacementVehicleId, coordinatorId]
        );

        // Cập nhật sự cố (đã được xử lý bằng cách thay xe)
        await client.query(
            `UPDATE incidents
             SET replacement_driver_id = $1, replacement_vehicle_id = $2, status = 'resolved', resolved_at = NOW(), resolved_by = $3, resolution_note = 'Điều phối xe/tài xế thay thế'
             WHERE id = $4`,
            [replacementDriverId, replacementVehicleId, coordinatorId, incidentId]
        );

        await client.query('COMMIT');

        // Thông báo cho tài xế mới
        notificationService.createForUser(replacementDriverId, {
            title: 'Nhiệm vụ đột xuất: Thay thế xe sự cố',
            message: `Bạn được điều phối để tiếp tục chuyến #${shipment.id} thay cho xe bị sự cố. Vui lòng kiểm tra ứng dụng ngay.`,
            type: 'TRIP_ASSIGNED',
            entityType: 'shipments',
            entityId: shipment.id,
        }, { displayMode: 'alert' }).catch(() => {});

        return incidentRepository.getIncidentById(incidentId);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = {
    getAllIncidents,
    createIncident, getMyCounts, getMyIncidents, getIncidentDetail,
    getShipmentIncidents, updateMyIncident, updateIncidentStatus, reassignVehicle,
};
