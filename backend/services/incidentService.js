const incidentRepository = require('../repositories/incidentRepository');
const tripRepository = require('../repositories/tripRepository');
const driverRepository = require('../repositories/driverRepository');
const revenueAllocationRepository = require('../repositories/revenueAllocationRepository');
const pool = require('../config/database');
const notificationService = require('./notificationService');
const notificationGateway = require('./notificationGateway');
const vehicleManagementService = require('./vehicleManagementService');
const {
    ALLOWED_INCIDENT_TYPES,
    ALLOWED_SEVERITIES,
    ALLOWED_INCIDENT_STATUSES,
    INCIDENT_SEVERITY,
    MAX_IMAGES_PER_INCIDENT,
} = require('../constants/incidentConstants');

const ACTIVE_STATUSES = ['claimed', 'picking', 'transit', 'arrived', 'failed', 'returning'];

const broadcastCoordinatorIncidentChange = (action, incidentId) => {
    notificationGateway.broadcastToRole('coordinator', {
        type: 'coordinator.incidents.changed',
        action,
        incidentId: incidentId ?? null,
    });
};

const TRAFFIC_TYPES = new Set(['road_incident', 'traffic_jam']);

const TYPE_LABEL = {
    vehicle_breakdown: 'Sự cố xe',
    cargo_damage:      'Hàng hóa bị hỏng',
    road_incident:     'Đường sá / giao thông',
    customer_refusal:  'Khách từ chối nhận',
    traffic_jam:       'Tắc đường',
};

// Types that can be reported without an active trip
const FREE_INCIDENT_TYPES = new Set(['vehicle_breakdown', 'traffic_jam']);

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
    broadcastCoordinatorIncidentChange('updated', incidentId);

    return incidentRepository.getIncidentById(incidentId);
};

const createIncident = async (driverId, { shipmentId, incidentType, severityLevel, description, location }, imageUrls = []) => {
    if (!incidentType || !ALLOWED_INCIDENT_TYPES.includes(incidentType)) {
        throw new Error('Loại sự cố không hợp lệ');
    }

    const isTrafficType = TRAFFIC_TYPES.has(incidentType);

    if (!isTrafficType) {
        if (!description || !description.trim()) {
            throw new Error('Mô tả sự cố là bắt buộc');
        }
        if (description.trim().length < 10) {
            throw new Error('Mô tả sự cố phải có ít nhất 10 ký tự');
        }
    }

    const finalDescription = description?.trim() || (isTrafficType ? `${TYPE_LABEL[incidentType]} — báo cáo tự động` : '');

    const severity = severityLevel && ALLOWED_SEVERITIES.includes(severityLevel)
        ? severityLevel
        : INCIDENT_SEVERITY.MEDIUM;

    const parsedShipmentId = shipmentId ? Number(shipmentId) : null;

    if (!FREE_INCIDENT_TYPES.has(incidentType) && !parsedShipmentId) {
        throw new Error('Loại sự cố này chỉ có thể báo cáo khi đang thực hiện chuyến vận chuyển');
    }

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
        description: finalDescription,
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
        message: `Tài xế báo cáo sự cố ${contextMsg}: ${finalDescription.slice(0, 80)}`,
        type: 'INCIDENT_REPORTED',
        entityType: 'incidents',
        entityId: incident.id,
    }, { displayMode: 'alert' }).catch(() => {});
    broadcastCoordinatorIncidentChange('created', incident.id);

    // Notify driver — xác nhận sự cố đã được ghi nhận (silent — họ vừa submit xong)
    notificationService.createForUser(driverId, {
        title: `Đã ghi nhận sự cố: ${TYPE_LABEL[incidentType]}`,
        message: `Sự cố #${incident.id} đã được ghi nhận và gửi đến điều phối viên. Họ sẽ liên hệ hỗ trợ bạn sớm.`,
        type: 'INCIDENT_REPORTED',
        entityType: 'incidents',
        entityId: incident.id,
    }, { displayMode: 'silent' }).catch(() => {});

    // Broadcast cảnh báo giao thông đến TẤT CẢ tài xế còn lại
    if (isTrafficType) {
        const locationText = location?.trim() || 'khu vực không xác định';
        const otherDriverIds = await incidentRepository.getActiveDriverIds(driverId);
        notificationService.createForUsers(otherDriverIds, {
            title: `Cảnh báo: ${TYPE_LABEL[incidentType]}`,
            message: `Vị trí: ${locationText}. Đề nghị tránh khu vực này và chọn đường khác để tối ưu thời gian giao hàng.`,
            type: 'TRAFFIC_ALERT',
            entityType: 'incidents',
            entityId: incident.id,
        }, { displayMode: 'traffic_alert' }).catch(() => {});
    }

    return incidentRepository.getIncidentById(incident.id);
};

// Coordinator/Manager tự tạo sự cố (khách báo qua điện thoại, giám sát phát hiện...).
// Khác createIncident (driver): không giới hạn theo owner_driver_id của chuyến,
// không bắt buộc chuyến đang ACTIVE (staff có thể ghi nhận cả sau khi việc đã xảy ra).
const createIncidentByStaff = async (actorId, { shipmentId, incidentType, severityLevel, description, location }, imageUrls = []) => {
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

        const existing = await incidentRepository.getIncidentsByShipment(parsedShipmentId);
        const duplicate = existing.find((i) => i.incident_type === incidentType);
        if (duplicate) {
            throw new Error(`DUPLICATE_TYPE:Chuyến này đã có sự cố loại "${TYPE_LABEL[incidentType] ?? incidentType}". Vui lòng cập nhật sự cố đã tạo thay vì tạo mới.`);
        }
    }

    if (imageUrls.length > MAX_IMAGES_PER_INCIDENT) {
        throw new Error(`Tối đa ${MAX_IMAGES_PER_INCIDENT} ảnh minh chứng`);
    }

    const incident = await incidentRepository.createIncident({
        shipmentId: parsedShipmentId,
        reportedBy: actorId,
        incidentType,
        severityLevel: severity,
        description: description.trim(),
        location: location?.trim() || null,
    });

    await Promise.all(imageUrls.map((url) => incidentRepository.addIncidentEvidence(incident.id, url)));

    // Nếu có gắn chuyến, thông báo cho tài xế đang giữ chuyến biết sự cố đã được ghi nhận hộ
    if (parsedShipmentId) {
        const shipment = await tripRepository.getTripById(parsedShipmentId);
        if (shipment?.owner_driver_id) {
            notificationService.createForUser(shipment.owner_driver_id, {
                title: `Sự cố được ghi nhận: ${TYPE_LABEL[incidentType]}`,
                message: `Điều phối/Quản lý đã ghi nhận sự cố cho chuyến #${parsedShipmentId} của bạn.`,
                type: 'INCIDENT_REPORTED',
                entityType: 'incidents',
                entityId: incident.id,
            }, { displayMode: 'silent' }).catch(() => {});
        }
    }

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

// Chia doanh thu khi điều chuyển giữa đường:
// - Chưa lấy hàng → tài mới hưởng 100%
// - Đã lấy hàng   → chia ĐỀU cho mọi tài từng tham gia chuyến + tài mới
//   (điều 1 lần: 50/50; điều lần 2: 33.33/33.33/33.34 — không xoá phần tài trước)
const buildRevenueAllocationPlan = ({ existingDriverIds = [], originalDriverId, replacementDriverId, pickupCompleted }) => {
    if (!pickupCompleted) {
        return {
            allocationReason: 'incident_full_transfer',
            allocations: [
                { driverId: replacementDriverId, sharePercent: 100 },
            ],
            modeLabel: 'full_transfer',
        };
    }

    const participants = [...new Set([
        ...(existingDriverIds.length > 0 ? existingDriverIds : [originalDriverId]),
        replacementDriverId,
    ].map(Number).filter(Boolean))];

    const n = participants.length;
    const base = Math.floor(10000 / n) / 100;                       // 2 chữ số thập phân
    const last = Math.round((100 - base * (n - 1)) * 100) / 100;    // dồn phần dư cho tài mới

    return {
        allocationReason: 'incident_split',
        allocations: participants.map((driverId, idx) => ({
            driverId,
            sharePercent: idx === n - 1 ? last : base,
        })),
        modeLabel: n === 2 ? 'split_50_50' : `split_equal_${n}`,
    };
};

// Coordinator cập nhật trạng thái sự cố → notify driver
const updateIncidentStatus = async (incidentId, coordinatorId, { status, resolution, replacementDriverId = null }) => {
    if (!status || !ALLOWED_INCIDENT_STATUSES.includes(status)) {
        throw new Error('Trạng thái sự cố không hợp lệ');
    }

    const incident = await incidentRepository.getIncidentById(incidentId);
    if (!incident) throw new Error('Sự cố không tồn tại');

    let replacementDriver = null;
    let replacementVehicleId = null;
    let revenueMode = null;
    let originalVehicleId = null;

    const parsedReplacementDriverId = replacementDriverId ? Number(replacementDriverId) : null;
    if (parsedReplacementDriverId) {
        if (!incident.shipment_id) {
            throw new Error('Chỉ có thể điều chuyển tài xế cho sự cố gắn với chuyến');
        }

        replacementDriver = (await driverRepository.getAllDrivers())
            .find((driver) => Number(driver.id) === parsedReplacementDriverId) ?? null;
        if (!replacementDriver) {
            throw new Error('Tài xế thay thế không tồn tại');
        }
        if (!replacementDriver.vehicle_id) {
            throw new Error('Tài xế thay thế chưa được gán xe');
        }

        replacementVehicleId = Number(replacementDriver.vehicle_id);
    }

    const updated = parsedReplacementDriverId
        ? await (async () => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                const currentShipment = await tripRepository.getTripById(incident.shipment_id);
                if (!currentShipment) {
                    throw new Error('Chuyến gắn với sự cố không tồn tại');
                }
                if (Number(currentShipment.owner_driver_id) === parsedReplacementDriverId) {
                    throw new Error('Tài xế thay thế phải khác tài xế đang giữ chuyến');
                }

                const originalDriverId = Number(currentShipment.owner_driver_id);
                originalVehicleId = currentShipment.vehicle_id ?? null;
                const reassignedShipment = await tripRepository.reassignShipmentAfterIncident(incident.shipment_id, {
                    incidentId,
                    fromDriverId: originalDriverId,
                    toDriverId: parsedReplacementDriverId,
                    toVehicleId: replacementVehicleId,
                    changedBy: coordinatorId,
                    note: Boolean(currentShipment.pickup_completed_at)
                        ? 'Dieu chuyen sau khi da lay hang, doanh thu chia doi'
                        : 'Dieu chuyen truoc khi lay hang, doanh thu chuyen toan bo',
                    client,
                });

                // Giữ phần các tài từng tham gia (điều chuyển lần 2+ không xoá phần tài trước)
                const existingDriverIds = await revenueAllocationRepository.getDriverIdsForShipment(
                    incident.shipment_id,
                    originalDriverId,
                );

                const allocationPlan = buildRevenueAllocationPlan({
                    existingDriverIds,
                    originalDriverId,
                    replacementDriverId: parsedReplacementDriverId,
                    pickupCompleted: Boolean(reassignedShipment.pickup_completed_at),
                });
                revenueMode = allocationPlan.modeLabel;

                await revenueAllocationRepository.replaceShipmentAllocations(
                    client,
                    incident.shipment_id,
                    allocationPlan.allocations,
                    {
                        allocationReason: allocationPlan.allocationReason,
                        incidentId,
                        createdBy: coordinatorId,
                    },
                );

                const updatedIncident = await incidentRepository.updateIncidentResolution(client, incidentId, {
                    status,
                    resolution,
                    resolvedBy: coordinatorId,
                    replacementDriverId: parsedReplacementDriverId,
                    replacementVehicleId,
                });
                if (!updatedIncident) throw new Error('Không thể cập nhật sự cố');

                await client.query('COMMIT');
                return updatedIncident;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        })()
        : await (async () => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const updatedIncident = await incidentRepository.updateIncidentResolution(client, incidentId, {
                    status,
                    resolution,
                    resolvedBy: coordinatorId,
                    replacementDriverId: incident.replacement_driver_id ?? null,
                    replacementVehicleId: incident.replacement_vehicle_id ?? null,
                });
                await client.query('COMMIT');
                return updatedIncident;
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        })();
    if (!updated) throw new Error('Không thể cập nhật sự cố');

    // Xe hỏng giữa chuyến + đã điều tài xế thay thế → tự đồng bộ trạng thái xe cũ sang "broken"
    // để Manager thấy đồng nhất bên Vehicle Management, không cần tự cập nhật thủ công.
    // Best-effort: không chặn kết quả resolve incident nếu đồng bộ thất bại (VD: xe đã broken/maintenance từ trước).
    if (incident.incident_type === 'vehicle_breakdown' && originalVehicleId) {
        vehicleManagementService.markVehicleAsBroken(originalVehicleId, coordinatorId, {
            failure_type: 'breakdown_in_transit',
            description: resolution?.trim() || incident.description || 'Xe hỏng giữa chuyến — ghi nhận tự động từ sự cố',
            severity_level: 'high',
            note: `Tự động đồng bộ từ sự cố #${incidentId}`,
        }).catch((err) => {
            console.error(`[Incident] Không thể đồng bộ trạng thái xe #${originalVehicleId} sau sự cố #${incidentId}:`, err.message);
        });
    }

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
    broadcastCoordinatorIncidentChange('status_updated', incidentId);

    if (replacementDriver) {
        notificationService.createForUser(replacementDriver.id, {
            title: 'Bạn được điều chuyển thay chuyến',
            message: revenueMode === 'full_transfer'
                ? `Bạn đã được phân công tiếp quản chuyến #${incident.shipment_id}. Doanh thu chuyến thuộc về bạn.`
                : revenueMode === 'split_50_50'
                    ? `Bạn đã được phân công tiếp quản chuyến #${incident.shipment_id}. Doanh thu chuyến sẽ chia 50/50.`
                    : `Bạn đã được phân công tiếp quản chuyến #${incident.shipment_id}. Doanh thu chuyến chia đều cho các tài xế tham gia.`,
            type: 'TRIP_ASSIGNED',
            entityType: 'shipments',
            entityId: incident.shipment_id,
        }, { displayMode: 'alert' }).catch(() => {});
    }

    return incidentRepository.getIncidentById(incidentId);
};

module.exports = {
    createIncident, createIncidentByStaff, getMyCounts, getMyIncidents, getIncidentDetail,
    getShipmentIncidents, updateMyIncident, updateIncidentStatus,
};
