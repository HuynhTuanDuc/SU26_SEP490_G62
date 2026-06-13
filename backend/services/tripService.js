const tripRepository     = require('../repositories/tripRepository');
const paymentRepository  = require('../repositories/paymentRepository');
const notificationService = require('./notificationService');
const kpiService          = require('./kpiService');
const pool = require('../config/database');

const fmtVND = (n) => Number(n).toLocaleString('vi-VN') + 'đ';
const {
    SHIPMENT_STATUS,
    ALLOWED_TRANSITIONS,
    CANCELLABLE_STATUSES,
    RELEASABLE_STATUSES,
} = require('../constants/tripConstants');

// Nội dung thông báo cho từng bước vòng đời chuyến
const STATUS_NOTIF = {
    picking: {
        title: 'Bắt đầu lấy hàng',
        message: 'Bạn đã bắt đầu di chuyển đến điểm lấy hàng.',
        type: 'TRIP_STATUS_UPDATED',
    },
    transit: {
        title: 'Đang vận chuyển',
        message: 'Chuyến đang trên đường vận chuyển đến điểm giao.',
        type: 'TRIP_STATUS_UPDATED',
    },
    arrived: {
        title: 'Đã đến điểm giao',
        message: 'Bạn đã đến điểm giao hàng — tiến hành giao cho khách.',
        type: 'TRIP_STATUS_UPDATED',
    },
    failed: {
        title: 'Giao hàng thất bại',
        message: 'Giao hàng không thành công, cần hoàn hàng về điểm lấy.',
        type: 'TRIP_STATUS_UPDATED',
    },
    returning: {
        title: 'Đang hoàn hàng',
        message: 'Đang trên đường hoàn hàng về điểm lấy ban đầu.',
        type: 'TRIP_STATUS_UPDATED',
    },
    completed: {
        title: 'Hoàn thành chuyến',
        message: 'Chuyến đã được hoàn thành và xác nhận giao hàng thành công.',
        type: 'ORDER_COMPLETED',
    },
    cancelled: {
        title: 'Chuyến đã bị hủy',
        message: 'Chuyến vận chuyển đã bị hủy và trả về pool.',
        type: 'TRIP_STATUS_UPDATED',
    },
};

const fireStatusNotif = (driverId, shipmentId, newStatus) => {
    const cfg = STATUS_NOTIF[newStatus];
    if (!cfg) return;
    notificationService.createForUser(driverId, {
        title: cfg.title,
        message: `${cfg.message} (Chuyến #${shipmentId})`,
        type: cfg.type,
        entityType: 'shipments',
        entityId: shipmentId,
    }, { displayMode: 'silent' }).catch(() => {});
};

// ─────────────────────────────────────────────────────────────────────────────

// BR-003: Auto-filter theo vehicle group của driver. vehicleGroupId override (coordinator dùng)
const getTripPool = async (driverId, { page = 1, limit = 5, vehicleGroupId = null } = {}) => {
    const effectiveGroupId = vehicleGroupId ?? await tripRepository.getDriverVehicleGroupId(driverId);
    const [paged, vehicleGroups] = await Promise.all([
        tripRepository.getAvailableShipments({ page, limit, vehicleGroupId: effectiveGroupId }),
        tripRepository.getAllVehicleGroups(),
    ]);
    return { ...paged, vehicleGroups };
};

const getActiveTrip = async (driverId) => {
    return tripRepository.getActiveTrip(driverId);
};

const claimTrip = async (shipmentId, driverId) => {
    const vehicleId = await tripRepository.getDriverVehicleId(driverId);
    if (!vehicleId) throw new Error('Tài xế chưa được gán xe');

    let claimed;
    try {
        claimed = await tripRepository.claimShipment(shipmentId, driverId, vehicleId);
    } catch (err) {
        if (err.message === 'ACTIVE_TRIP') {
            throw new Error('Bạn đang có chuyến đang hoạt động, không thể nhận thêm chuyến mới');
        }
        if (err.message === 'ACTIVE_VEHICLE_TRIP') {
            throw new Error('Xe dang co chuyen dang hoat dong, khong the nhan them chuyen moi');
        }
        if (err.message === 'VEHICLE_UNAVAILABLE') {
            throw new Error('Xe hien khong san sang cho van hanh');
        }
        if (err.message === 'VEHICLE_MAINTENANCE') {
            throw new Error('Xe dang trong bao tri, khong the nhan chuyen');
        }
        if (err.message === 'DRIVER_VEHICLE_MISMATCH') {
            throw new Error('Tai xe chua duoc gan hop le voi xe nay');
        }
        if (err.message === 'DRIVER_MAINTENANCE') {
            throw new Error('Tai xe dang phu trach bao tri xe khac');
        }
        if (err.message === 'SAME_ORDER') {
            throw new Error('SAME_ORDER:Bạn đã có một chuyến trong đơn hàng này rồi');
        }
        throw err;
    }
    if (!claimed) throw new Error('ALREADY_CLAIMED:Chuyến này đã được tài xế khác nhận');

    notificationService.createForUser(driverId, {
        title: 'Nhận chuyến thành công',
        message: `Chuyến #${claimed.id} đã được nhận. Hãy di chuyển đến điểm lấy hàng.`,
        type: 'TRIP_ASSIGNED',
        entityType: 'shipments',
        entityId: claimed.id,
    }, { displayMode: 'silent' }).catch(() => {});

    return claimed;
};

const updateStatus = async (tripId, driverId, newStatus, reason = null) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền cập nhật chuyến này');

    const allowed = ALLOWED_TRANSITIONS[trip.status] ?? [];
    if (!allowed.includes(newStatus)) {
        throw new Error(`Không thể chuyển trạng thái từ "${trip.status}" sang "${newStatus}"`);
    }

    if (newStatus === SHIPMENT_STATUS.FAILED && (!reason || !reason.trim())) {
        throw new Error('Lý do giao thất bại là bắt buộc');
    }

    const updatedTrip = await tripRepository.updateTripStatus(tripId, newStatus, newStatus === SHIPMENT_STATUS.FAILED ? reason?.trim() : null);

    fireStatusNotif(driverId, tripId, newStatus);

    // RETURNING → COMPLETED: hàng đã về kho, KHÔNG auto-activate leg tiếp theo
    // Successful delivery COMPLETED được xử lý qua completeTrip (POST /complete)

    return updatedTrip;
};

// Driver tự hủy chuyến: CLAIMED/PICKING → trả shipment về pool (available)
const releaseTrip = async (tripId, driverId, reason) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền hủy chuyến này');
    if (!RELEASABLE_STATUSES.includes(trip.status)) {
        throw new Error(`Chỉ có thể hủy chuyến khi ở trạng thái "claimed" hoặc "picking"`);
    }

    const released = await tripRepository.releaseShipmentToPool(tripId, driverId, reason);

    notificationService.createForUser(driverId, {
        title: 'Đã hủy chuyến',
        message: `Chuyến #${tripId} đã được trả về pool${reason ? `: ${reason.slice(0, 60)}` : ''}.`,
        type: 'TRIP_STATUS_UPDATED',
        entityType: 'shipments',
        entityId: tripId,
    }, { displayMode: 'silent' }).catch(() => {});

    return released;
};

// ARRIVED → COMPLETED: driver xác nhận giao hàng thành công
// Bắt buộc 2 ảnh:
//   proofFileUrl   — ảnh xác nhận giao hàng (BR-015/016/017)
//   receiptFileUrl — ảnh biên lai/hóa đơn có chữ ký khách
const completeTrip = async (tripId, driverId, proofFileUrl, receiptFileUrl) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền hoàn thành chuyến này');
    if (trip.status !== SHIPMENT_STATUS.ARRIVED) throw new Error('Chuyến phải ở trạng thái "arrived" để hoàn thành');
    if (!proofFileUrl) throw new Error('Ảnh xác nhận giao hàng là bắt buộc (BR-015)');
    if (!receiptFileUrl) throw new Error('Ảnh biên lai/hóa đơn là bắt buộc');

    // Lưu cả 2 ảnh vào delivery_proofs
    await tripRepository.saveDeliveryProof(tripId, driverId, proofFileUrl);
    await tripRepository.saveDeliveryProof(tripId, driverId, receiptFileUrl);

    const completedTrip = await tripRepository.updateTripStatus(tripId, SHIPMENT_STATUS.COMPLETED);

    const isFinal = await tripRepository.isFinalShipment(tripId);

    notificationService.createForUser(driverId, {
        title: isFinal ? 'Hoàn thành toàn bộ đơn hàng!' : 'Hoàn thành chuyến',
        message: isFinal
            ? `Chuyến #${tripId} — chuyến cuối của đơn hàng #${trip.order_id} đã hoàn thành!`
            : `Chuyến #${tripId} của đơn hàng #${trip.order_id} đã hoàn thành.`,
        type: 'ORDER_COMPLETED',
        entityType: 'shipments',
        entityId: tripId,
    }, { displayMode: 'silent' }).catch(() => {});

    // Auto-activate leg tiếp theo nếu coordinator đã pre-assign cho driver này
    const vehicleId = await tripRepository.getDriverVehicleId(driverId);
    const nextShipment = await tripRepository.activateNextShipment(tripId, driverId, vehicleId);
    if (nextShipment) {
        notificationService.createForUser(driverId, {
            title: 'Chuyến tiếp theo đã sẵn sàng',
            message: `Chuyến #${nextShipment.id} trong cùng đơn hàng đã sẵn sàng. Hãy tiếp tục giao hàng.`,
            type: 'TRIP_QUEUED',
            entityType: 'shipments',
            entityId: nextShipment.id,
        }, { displayMode: 'alert' }).catch(() => {});
    }

    // Tự động tính lại KPI sau khi hoàn thành — fire-and-forget, không block response
    kpiService.recalculateAfterCompletion(driverId, new Date());

    return completedTrip;
};

// PICKING → TRANSIT with mandatory loading proof (BR-013/014)
const startTransit = async (tripId, driverId, proofFileUrl) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền cập nhật chuyến này');
    if (trip.status !== SHIPMENT_STATUS.PICKING) throw new Error('Chuyến phải ở trạng thái "picking" để xác nhận lấy hàng');
    if (!proofFileUrl) throw new Error('Ảnh xác nhận lấy hàng là bắt buộc (BR-013)');

    await tripRepository.saveLoadingProof(tripId, driverId, proofFileUrl);

    const updatedTrip = await tripRepository.updateTripStatus(tripId, SHIPMENT_STATUS.TRANSIT);

    notificationService.createForUser(driverId, {
        title: 'Đang vận chuyển',
        message: `Đã lấy hàng thành công — chuyến #${tripId} đang trên đường giao hàng.`,
        type: 'TRIP_STATUS_UPDATED',
        entityType: 'shipments',
        entityId: tripId,
    }, { displayMode: 'silent' }).catch(() => {});

    return updatedTrip;
};

// Driver gửi yêu cầu tạo phiếu thu — coordinator nhận và xử lý
// Chỉ được gửi 1 lần mỗi chuyến (UNIQUE constraint trên shipment_id)
const requestReceipt = async (tripId, driverId, { actual_km } = {}) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền yêu cầu phiếu thu cho chuyến này');
    if (!['transit', 'arrived', 'completed'].includes(trip.status)) {
        throw new Error('Chỉ có thể yêu cầu phiếu thu khi chuyến đang vận chuyển, đã đến nơi, hoặc đã hoàn thành');
    }

    const existing = await pool.query(
        'SELECT id, status FROM shipment_receipt_requests WHERE shipment_id = $1',
        [tripId],
    );
    if (existing.rows.length > 0) {
        throw new Error('Yêu cầu tạo phiếu thu đã được gửi cho chuyến này rồi. Vui lòng chờ coordinator xử lý.');
    }

    const km = actual_km ? Number(actual_km) : null;
    if (km !== null && (isNaN(km) || km <= 0)) {
        throw new Error('Số km thực tế không hợp lệ');
    }

    const result = await pool.query(
        `INSERT INTO shipment_receipt_requests (shipment_id, driver_id, actual_km, status, requested_at)
         VALUES ($1, $2, $3, 'pending', NOW())
         RETURNING *`,
        [tripId, driverId, km],
    );

    // Notify all active coordinators
    const coordResult = await pool.query(
        `SELECT a.id FROM accounts a
         JOIN roles r ON r.id = a.role_id
         WHERE r.name = 'coordinator' AND a.is_active = TRUE`,
    );
    const coordIds = coordResult.rows.map(r => r.id);
    if (coordIds.length > 0) {
        notificationService.createForUsers(coordIds, {
            title: 'Yêu cầu tạo phiếu thu',
            message: `Tài xế yêu cầu phiếu thu cho chuyến #${tripId}${km ? ` (${km} km thực tế)` : ''} — Đơn #${trip.order_id}.`,
            type: 'RECEIPT_REQUEST',
            entityType: 'shipments',
            entityId: tripId,
        }, { displayMode: 'alert' }).catch(() => {});
    }

    return result.rows[0];
};

const getReceiptRequest = async (tripId, driverId) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền xem chuyến này');

    const result = await pool.query(
        'SELECT * FROM shipment_receipt_requests WHERE shipment_id = $1',
        [tripId],
    );
    return result.rows[0] ?? null;
};

// ITEM 2 — TH3: Driver marks customer unpaid → creates Customer Debt
const markUnpaid = async (tripId, driverId, { amount, notes } = {}) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền cập nhật chuyến này');
    if (!['completed', 'arrived'].includes(trip.status)) {
        throw new Error('Chỉ có thể báo nợ khi chuyến ở trạng thái "arrived" hoặc "completed"');
    }

    const amt = Number(amount);
    if (!amt || isNaN(amt) || amt <= 0) {
        throw new Error('Số tiền nợ phải là số dương hợp lệ');
    }

    // Anti-spam + TH2+TH3 overflow guard
    const summary = await paymentRepository.getShipmentFinancialSummary(tripId);
    if (summary && summary.remaining !== null) {
        if (amt > summary.remaining) {
            const msg = summary.remaining <= 0
                ? `Chuyến này đã được ghi nhận đủ số tiền (${fmtVND(summary.trip_value)}). Không thể báo thêm nợ.`
                : `Số tiền báo nợ ${fmtVND(amt)} vượt quá phần còn lại ${fmtVND(summary.remaining)} ` +
                  `(giá trị chuyến ${fmtVND(summary.trip_value)}, đã thu mặt ${fmtVND(summary.cash_collected)}, đã báo nợ ${fmtVND(summary.customer_debt_total)}).`;
            throw new Error(msg);
        }
    }

    // Get customer_id from orders table via shipment's order_id
    const orderResult = await pool.query(
        `SELECT customer_id FROM orders WHERE id = $1`,
        [trip.order_id],
    );
    if (!orderResult.rows[0]) throw new Error('Không tìm thấy đơn hàng liên quan');
    const customerId = orderResult.rows[0].customer_id;

    const debtResult = await pool.query(
        `INSERT INTO debts (debt_type, customer_id, driver_id, shipment_id, order_id, total_amount, paid_amount, status, notes, created_at, updated_at)
         VALUES ('customer', $1, $2, $3, $4, $5, 0, 'unpaid', $6, NOW(), NOW())
         RETURNING *`,
        [customerId, driverId, tripId, trip.order_id, amt, notes ?? null],
    );

    notificationService.createForUser(driverId, {
        title: 'Đã ghi nhận công nợ khách hàng',
        message: `Chuyến #${tripId} — khách chưa thanh toán ${Number(amount).toLocaleString('vi-VN')}đ.`,
        type: 'DEBT_CREATED',
        entityType: 'shipments',
        entityId: tripId,
    }, { displayMode: 'silent' }).catch(() => {});

    return debtResult.rows[0];
};

// ITEM 5 — RETURNING → COMPLETED with optional return proof
const returnComplete = async (tripId, driverId, proofFileUrl) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền hoàn thành chuyến này');
    if (trip.status !== SHIPMENT_STATUS.RETURNING) throw new Error('Chuyến phải ở trạng thái "returning" để xác nhận hoàn hàng');

    // Photo is optional for return completion
    if (proofFileUrl) {
        await tripRepository.saveDeliveryProof(tripId, driverId, proofFileUrl);
    }

    const completedTrip = await tripRepository.updateTripStatus(tripId, SHIPMENT_STATUS.COMPLETED);

    const isFinal = await tripRepository.isFinalShipment(tripId);
    if (isFinal) {
        await pool.query(
            `UPDATE orders SET derived_status = 'completed', updated_at = NOW() WHERE id = $1`,
            [trip.order_id],
        );
    }

    notificationService.createForUser(driverId, {
        title: isFinal ? 'Hoàn thành toàn bộ đơn hàng (hoàn hàng)' : 'Hoàn hàng thành công',
        message: isFinal
            ? `Chuyến #${tripId} — chuyến cuối của đơn hàng #${trip.order_id} đã hoàn tất (hoàn hàng).`
            : `Chuyến #${tripId} đã hoàn hàng thành công.`,
        type: 'ORDER_COMPLETED',
        entityType: 'shipments',
        entityId: tripId,
    }, { displayMode: 'silent' }).catch(() => {});

    // Tự động tính lại KPI — fire-and-forget
    kpiService.recalculateAfterCompletion(driverId, new Date());

    return completedTrip;
};

const getDriverStats = async (driverId) => {
    return tripRepository.getDriverStats(driverId);
};

const getOrderHistory = async (driverId, page = 1, limit = 30) => {
    const offset = (page - 1) * limit;
    const { rows, total } = await tripRepository.getDriverOrderHistory(driverId, { limit, offset });
    return {
        orders: rows,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
};

const getAvailableShipmentDetail = async (shipmentId) => {
    const detail = await tripRepository.getAvailableShipmentDetail(shipmentId);
    if (!detail) throw new Error('Chuyến không tồn tại hoặc đã được nhận');
    return detail;
};

const getAvailableOrderDetail = async (orderId) => {
    const detail = await tripRepository.getAvailableOrderDetail(orderId);
    if (!detail) throw new Error('Đơn hàng không tồn tại hoặc đã được nhận');
    return detail;
};

const getOrderDetail = async (orderId, driverId) => {
    const detail = await tripRepository.getOrderWithShipments(orderId, driverId);
    if (!detail) throw new Error('Đơn hàng không tồn tại hoặc bạn không có quyền xem');
    return detail;
};

module.exports = {
    getTripPool,
    getActiveTrip,
    claimTrip,
    updateStatus,
    releaseTrip,
    completeTrip,
    startTransit,
    markUnpaid,
    returnComplete,
    requestReceipt,
    getReceiptRequest,
    getDriverStats,
    getOrderHistory,
    getAvailableShipmentDetail,
    getAvailableOrderDetail,
    getOrderDetail,
};
