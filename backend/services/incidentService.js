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

    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến vận chuyển không tồn tại');
    if (Number(shipment.owner_driver_id) !== Number(driverId)) {
        throw new Error('Bạn không có quyền báo sự cố cho chuyến này');
    }
    if (!ACTIVE_STATUSES.includes(shipment.status)) {
        throw new Error('Chỉ có thể báo sự cố khi chuyến đang hoạt động');
    }

    if (imageUrls.length > MAX_IMAGES_PER_INCIDENT) {
        throw new Error(`Tối đa ${MAX_IMAGES_PER_INCIDENT} ảnh minh chứng`);
    }

    // Chỉ 1 sự cố mỗi loại (incident_type) trên 1 chuyến
    const existing = await incidentRepository.getIncidentsByShipment(shipmentId);
    const duplicate = existing.find((i) => i.incident_type === incidentType);
    if (duplicate) {
        throw new Error(`DUPLICATE_TYPE:Chuyến này đã có sự cố loại "${TYPE_LABEL[incidentType] ?? incidentType}". Vui lòng chỉnh sửa sự cố đã tạo thay vì tạo mới.`);
    }

    const incident = await incidentRepository.createIncident({
        shipmentId,
        reportedBy: driverId,
        incidentType,
        severityLevel: severity,
        description: description.trim(),
        location: location?.trim() || null,
    });

    await Promise.all(imageUrls.map((url) => incidentRepository.addIncidentEvidence(incident.id, url)));

    // Notify coordinators (alert — họ cần xử lý ngay)
    const coordinatorIds = await incidentRepository.getCoordinatorIds();
    notificationService.createForUsers(coordinatorIds, {
        title: `Sự cố mới: ${TYPE_LABEL[incidentType]}`,
        message: `Tài xế báo cáo sự cố trên chuyến #${shipmentId}: ${description.trim().slice(0, 80)}`,
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

module.exports = {
    createIncident, getMyCounts, getMyIncidents, getIncidentDetail,
    getShipmentIncidents, updateMyIncident, updateIncidentStatus,
};
