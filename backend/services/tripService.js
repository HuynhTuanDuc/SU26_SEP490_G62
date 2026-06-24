const tripRepository     = require('../repositories/tripRepository');
const paymentRepository  = require('../repositories/paymentRepository');
const revenueAllocationRepository = require('../repositories/revenueAllocationRepository');
const notificationService = require('./notificationService');
const notificationGateway = require('./notificationGateway');
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
const completeTrip = async (tripId, driverId, proofFileUrl) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền hoàn thành chuyến này');
    if (trip.status !== SHIPMENT_STATUS.ARRIVED) throw new Error('Chuyến phải ở trạng thái "arrived" để hoàn thành');
    if (!proofFileUrl) throw new Error('Ảnh xác nhận giao hàng là bắt buộc (BR-015)');

    await tripRepository.saveDeliveryProof(tripId, driverId, proofFileUrl);

    await tripRepository.updateTripStatus(tripId, SHIPMENT_STATUS.COMPLETED);

    // Lấy full trip (có order_payment_type, is_final_shipment) để mobile điều hướng đúng
    const completedTrip = await tripRepository.getFullTripById(tripId);

    const isFinal = completedTrip.is_final_shipment;

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

    // Tự động tính lại KPI cho mọi tài xế có phân bổ doanh thu của chuyến.
    const revenueDriverIds = await revenueAllocationRepository.getDriverIdsForShipment(tripId, driverId);
    kpiService.recalculateAfterCompletion(revenueDriverIds, new Date());

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
        notificationGateway.broadcastToRole('coordinator', {
            type: 'coordinator.receipt_requests.changed',
            action: 'created',
            orderId,
            requestId: request?.id ?? null,
        });
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

    const revenueDriverIds = await revenueAllocationRepository.getDriverIdsForShipment(tripId, driverId);
    kpiService.recalculateAfterCompletion(revenueDriverIds, new Date());

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

// Mọi driver đều nhập km sau khi hoàn thành; chỉ driver cuối của đơn cash mới tạo yêu cầu phiếu thu
const requestOrderReceipt = async (orderId, driverId, { shipmentId, actualKm }) => {
    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');
    if (Number(shipment.owner_driver_id) !== Number(driverId))
        throw new Error('Bạn không có quyền gửi yêu cầu phiếu thu cho chuyến này');
    if (shipment.status !== 'completed')
        throw new Error('Chuyến phải ở trạng thái "completed" để gửi yêu cầu phiếu thu');
    if (Number(shipment.order_id) !== Number(orderId))
        throw new Error('Chuyến không thuộc đơn hàng này');

    // km bắt buộc với mọi driver
    const km = actualKm !== undefined && actualKm !== null && String(actualKm).trim() !== ''
        ? Number(actualKm) : null;
    if (km === null || isNaN(km) || km <= 0)
        throw new Error('Số km thực tế là bắt buộc và phải lớn hơn 0');

    // Lưu km vào order_shipments cho mọi driver
    await tripRepository.saveShipmentActualKm(shipmentId, km);

    const isFinal = await tripRepository.isFinalShipment(shipmentId);

    // Kiểm tra payment_type của order
    const orderRes = await pool.query(`SELECT payment_type FROM orders WHERE id = $1`, [orderId]);
    const orderPaymentType = orderRes.rows[0]?.payment_type;

    // Chỉ driver cuối của đơn cash mới tạo yêu cầu phiếu thu
    if (!isFinal || orderPaymentType !== 'cash') {
        return { km_saved: true, receipt_request_created: false };
    }

    // Driver cuối đơn cash: tạo yêu cầu phiếu thu (BR-018B — chỉ 1 lần)
    const existing = await tripRepository.getOrderReceiptRequestByOrderId(orderId);
    if (existing) throw new Error('Đơn hàng này đã có yêu cầu tạo phiếu thu rồi (BR-018B)');

    let request;
    try {
        request = await tripRepository.createOrderReceiptRequest(orderId, driverId, shipmentId);
    } catch (err) {
        if (err.code === '23505') throw new Error('Đơn hàng này đã có yêu cầu tạo phiếu thu rồi (BR-018B)');
        throw err;
    }

    notificationGateway.broadcastToRole('coordinator', {
        type: 'coordinator.receipt_requests.changed',
        action: 'created',
        requestId: request.id,
        orderId,
    });

    // Thông báo cho coordinator
    const coordIds = await notificationService.getUserIdsByRole('coordinator');
    if (coordIds.length > 0) {
        notificationService.createForUsers(coordIds, {
            title: 'Yêu cầu tạo phiếu thu',
            message: `Tài xế yêu cầu phiếu thu cho đơn #${orderId} (${km} km).`,
            type: 'RECEIPT_REQUEST',
            entityType: 'orders',
            entityId: orderId,
        }, { displayMode: 'alert' }).catch(() => {});
    }

    notificationService.createForUser(driverId, {
        title: 'Đã gửi yêu cầu tạo phiếu thu',
        message: `Yêu cầu phiếu thu cho đơn #${orderId} đã được gửi. Coordinator sẽ xem xét sớm.`,
        type: 'RECEIPT_REQUESTED',
        entityType: 'orders',
        entityId: orderId,
    }, { displayMode: 'silent' }).catch(() => {});

    return { km_saved: true, receipt_request_created: true, request };
};

const getOrderReceiptRequest = async (orderId) => {
    return tripRepository.getOrderReceiptRequestByOrderId(orderId);
};

const getPendingReceiptOrder = async (driverId) => {
    return tripRepository.getPendingReceiptOrder(driverId);
};

const getDriverReceipts = async (driverId, opts) => {
    return tripRepository.getDriverReceipts(driverId, opts);
};

const getDriverReceiptDetail = async (receiptId, driverId) => {
    const receipt = await tripRepository.getDriverReceiptDetail(receiptId, driverId);
    if (!receipt) throw new Error('Phiếu thu không tồn tại hoặc bạn không có quyền xem');
    return receipt;
};

// Driver xác nhận hình thức thu tiền thực tế sau khi coordinator tạo phiếu thu
// 3 lựa chọn: cash_collected (tài thu) | bank_transfer (công ty thu) | client_credit (chưa trả)
const recordReceiptCollection = async (receiptId, driverId, collectionType) => {
    const ALLOWED = ['cash_collected', 'bank_transfer', 'client_credit', 'qr_transfer'];
    if (!ALLOWED.includes(collectionType)) {
        throw new Error('Hình thức thanh toán không hợp lệ');
    }

    const receipt = await tripRepository.getDriverReceiptDetail(receiptId, driverId);
    if (!receipt) throw new Error('Phiếu thu không tồn tại hoặc bạn không có quyền');

    // Dùng driver_collection_type làm trạng thái authoritative (persistent, bao gồm cả bank_transfer)
    if (receipt.driver_collection_type) {
        throw new Error('Hình thức thanh toán đã được ghi nhận cho chuyến này');
    }

    const shipmentId = receipt.shipment_id;
    const amount     = Number(receipt.amount);

    if (collectionType === 'cash_collected') {
        const shipment = await tripRepository.getTripById(shipmentId);
        await paymentRepository.createDriverDebt({
            driverId,
            shipmentId,
            orderId: shipment.order_id,
            amount,
            notes: null,
        });
        notificationService.createForUser(driverId, {
            title: 'Đã ghi nhận thu tiền mặt',
            message: `Bạn đang giữ ${amount.toLocaleString('vi-VN')}đ — nộp về công ty khi có dịp.`,
            type: 'DEBT_CREATED',
            entityType: 'shipments',
            entityId: shipmentId,
        }, { displayMode: 'silent' }).catch(() => {});
    } else if (collectionType === 'client_credit') {
        const shipment = await tripRepository.getTripById(shipmentId);
        const orderRes = await pool.query(`SELECT customer_id FROM orders WHERE id = $1`, [shipment.order_id]);
        if (!orderRes.rows[0]) throw new Error('Không tìm thấy đơn hàng liên quan');
        await paymentRepository.createCustomerDebt({
            customerId: orderRes.rows[0].customer_id,
            driverId,
            shipmentId,
            orderId: shipment.order_id,
            amount,
        });
    }
    // bank_transfer / qr_transfer — không tạo debt; chỉ ghi driver_collection_type

    // Ghi xác nhận vào shipment_receipts để persist qua các lần reload
    if (receipt.shipment_receipt_id) {
        await pool.query(
            `UPDATE shipment_receipts
             SET driver_collection_type = $1, driver_confirmed_at = NOW()
             WHERE id = $2`,
            [collectionType, receipt.shipment_receipt_id],
        );
    }

    return { collection_type: collectionType, amount, recorded: true };
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
    getDriverStats,
    getOrderHistory,
    getAvailableShipmentDetail,
    getAvailableOrderDetail,
    getOrderDetail,
    requestOrderReceipt,
    getOrderReceiptRequest,
    getPendingReceiptOrder,
    getDriverReceipts,
    getDriverReceiptDetail,
    recordReceiptCollection,
};
