const tripRepository     = require('../repositories/tripRepository');
const paymentRepository  = require('../repositories/paymentRepository');
const stopRepository     = require('../repositories/stopRepository');
const revenueAllocationRepository = require('../repositories/revenueAllocationRepository');
const incidentRepository = require('../repositories/incidentRepository');
const notificationService = require('./notificationService');
const notificationGateway = require('./notificationGateway');
const kpiService          = require('./kpiService');

const { money } = require('../utils/formatNumber');
const {
    SHIPMENT_STATUS,
    ALLOWED_TRANSITIONS,
    CANCELLABLE_STATUSES,
    RELEASABLE_STATUSES,
    UNDO_WINDOW_MS,
    UNDOABLE_TRANSITIONS,
} = require('../constants/tripConstants');
const reversalService = require('./reversalService');
const { requireMoney } = require('../utils/money');

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

// Mô tả khả năng hoàn tác của MỘT chuyến, tính từ chính dữ liệu chuyến đó.
//
// Server nói, không để mobile tự suy: nếu app tự tính cửa sổ 90 giây theo đồng hồ máy
// mình thì máy lệch giờ sẽ hiện nút lúc đã hết hạn (bấm vào báo lỗi) hoặc giấu nút lúc
// còn hạn. `undo_expires_at` là mốc tuyệt đối do server chốt — app chỉ việc đếm ngược.
const describeUndo = (trip) => {
    const rule = trip ? UNDOABLE_TRANSITIONS[trip.status] : null;
    if (!rule) return { can_undo: false };

    const stamp = trip[rule.clear];
    if (!stamp) return { can_undo: false };

    const expiresAt = new Date(new Date(stamp).getTime() + UNDO_WINDOW_MS);
    return {
        can_undo: expiresAt.getTime() > Date.now(),
        undo_back_to: rule.back,
        undo_expires_at: expiresAt.toISOString(),
    };
};

const getActiveTrip = async (driverId) => {
    const trip = await tripRepository.getActiveTrip(driverId);
    if (!trip) return null;
    return { ...trip, ...describeUndo(trip) };
};

// Hoàn tác bước trạng thái vừa bấm (tầng 1). Mọi kiểm tra thật sự nằm trong
// tripRepository.undoTransition, chạy sau khi đã giữ khoá dòng — ở đây chỉ chuyển tiếp
// và báo cho tài xế biết hệ thống đã lùi về đâu.
const undoLastTransition = async (tripId, driverId, { expectedVersion } = {}) => {
    reversalService.assertAllowed('trip.transition', {});

    const result = await tripRepository.undoTransition(tripId, driverId, { expectedVersion });

    reversalService.recordReversal({
        kind: 'trip.transition',
        entityId: tripId,
        actorId: driverId,
        oldData: {
            status: result.undoneFrom,
            version: result.fromVersion,
            [result.clearedColumn]: result.clearedStamp,
        },
        newData: {
            status: result.trip.status,
            version: Number(result.trip.version),
            stops_cleared: result.stopsCleared,
            // Giữ độ trễ để sau này đo được: người dùng thường nhận ra sau bao lâu?
            // Nếu phần lớn nằm sát mốc 90 giây thì cửa sổ đang quá ngắn.
            age_ms: result.ageMs,
        },
    });

    notificationService.createForUser(driverId, {
        title: 'Đã hoàn tác',
        message: `Chuyến #${tripId} đã quay lại trạng thái trước đó. Hãy bấm lại cho đúng bước.`,
        type: 'TRIP_STATUS_UPDATED',
        entityType: 'shipments',
        entityId: tripId,
    }, { displayMode: 'silent' }).catch(() => {});

    return { ...result.trip, ...describeUndo(result.trip), undone_from: result.undoneFrom };
};

const claimTrip = async (shipmentId, driverId) => {
    // Chặn nhận chuyến mới nếu còn chuyến cash đã COMPLETED mà chưa nhập km /
    // chưa gửi yêu cầu tạo phiếu thu — bắt buộc tài xế xử lý xong nghĩa vụ tài
    // chính của chuyến trước rồi mới được nhận chuyến tiếp theo.
    const pendingReceipt = await tripRepository.getPendingReceiptOrder(driverId);
    if (pendingReceipt) {
        throw new Error(
            `PENDING_RECEIPT:Bạn còn chuyến #${pendingReceipt.shipment_id} (đơn #${pendingReceipt.order_id}) chưa nhập km thực tế / chưa gửi yêu cầu tạo phiếu thu. Vui lòng hoàn tất trước khi nhận chuyến mới.`
        );
    }

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
            throw new Error('Xe đang có chuyến đang hoạt động, không thể nhận thêm chuyến mới');
        }
        if (err.message === 'VEHICLE_UNAVAILABLE') {
            throw new Error('Xe hiện không sẵn sàng cho vận hành');
        }
        if (err.message === 'VEHICLE_MAINTENANCE') {
            throw new Error('Xe đang trong bảo trì, không thể nhận chuyến');
        }
        if (err.message === 'DRIVER_VEHICLE_MISMATCH') {
            throw new Error('Tài xế chưa được gán hợp lệ với xe này');
        }
        if (err.message === 'VEHICLE_GROUP_MISMATCH') {
            throw new Error('VEHICLE_GROUP_MISMATCH:Chuyến này thuộc nhóm xe khác — xe bạn đang lái không chở được. Chỉ nhận các chuyến hiện trong danh sách chuyến khả dụng.');
        }
        if (err.message === 'DRIVER_MAINTENANCE') {
            throw new Error('Tài xế đang phụ trách bảo trì xe khác');
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

const updateStatus = async (tripId, driverId, newStatus, reason = null, expectedVersion = null) => {
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

    const updatedTrip = await tripRepository.updateTripStatus(tripId, newStatus, newStatus === SHIPMENT_STATUS.FAILED ? reason?.trim() : null, driverId, expectedVersion);

    fireStatusNotif(driverId, tripId, newStatus);

    // Giao thất bại = một SỰ CỐ, không chỉ là đổi trạng thái. Tự sinh bản ghi
    // incidents loại 'customer_refusal' để coordinator xử lý ở màn Sự cố (nơi tập
    // trung mọi việc cần can thiệp), và để KPI incident_count phản ánh đúng — trước
    // đây loại sự cố này bị bỏ sót hoàn toàn vì không ai tạo incident.
    if (newStatus === SHIPMENT_STATUS.FAILED) {
        let incident = null;
        try {
            incident = await incidentRepository.createIncident({
                shipmentId: Number(tripId),
                reportedBy: Number(driverId),
                incidentType: 'customer_refusal',
                severityLevel: 'medium',
                description: `Giao hàng thất bại: ${reason.trim()}`,
                location: null,
            });
        } catch { /* không tạo được sự cố thì vẫn phải cho đổi trạng thái */ }

        const coordinatorIds = await notificationService.getUserIdsByRole('coordinator');
        notificationService.createForUsers(coordinatorIds, {
            title: 'Giao hàng thất bại — cần xử lý',
            message: `Chuyến #${tripId} (đơn #${trip.order_id}) giao thất bại: ${reason.trim()}. Vào màn Sự cố để cho giao lại hoặc cho hoàn hàng.`,
            type: 'INCIDENT_REPORTED',
            entityType: 'incidents',
            entityId: incident?.id ?? null,
        }, { displayMode: 'alert' }).catch(() => {});

        try {
            notificationGateway.broadcastToRole('coordinator', {
                type: 'coordinator.shipment.failed',
                action: 'failed',
                shipmentId: Number(tripId),
                orderId: trip.order_id ?? null,
                incidentId: incident?.id ?? null,
                reason: reason.trim(),
            });
        } catch { /* realtime failure must not abort the status change */ }
    }

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
// proofFileUrl bắt buộc TRỪ KHI chuyến có delivery stops — proof đã được lưu per-stop
const completeTrip = async (tripId, driverId, proofFileUrl) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền hoàn thành chuyến này');
    if (trip.status !== SHIPMENT_STATUS.ARRIVED) throw new Error('Chuyến phải ở trạng thái "arrived" để hoàn thành');

    const allStops = await stopRepository.getStopsByShipment(tripId);
    const deliveryStops = allStops.filter(s => s.stop_type === 'delivery');
    const allDeliveryStopsDone = deliveryStops.length > 0 && deliveryStops.every(s => s.completed_at);

    // Bỏ bắt buộc ảnh khi đã có delivery stops hoàn thành (proof đã capture per-stop)
    if (!proofFileUrl && !allDeliveryStopsDone) throw new Error('Ảnh xác nhận giao hàng là bắt buộc (BR-015)');

    if (proofFileUrl) await tripRepository.saveDeliveryProof(tripId, driverId, proofFileUrl);

    await tripRepository.updateTripStatus(tripId, SHIPMENT_STATUS.COMPLETED, null, driverId);

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
    // await: đây là việc cuối trước khi trả response, mà Cloud Run bóp CPU ngay sau đó.
    const revenueDriverIds = await revenueAllocationRepository.getDriverIdsForShipment(tripId, driverId);
    await kpiService.recalculateAfterCompletion(revenueDriverIds, new Date());

    return completedTrip;
};

// PICKING → TRANSIT with mandatory loading proof (BR-013/014)
// proofFileUrl bắt buộc TRỪ KHI chuyến có pickup stops — proof đã được lưu per-stop
const startTransit = async (tripId, driverId, proofFileUrl) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền cập nhật chuyến này');
    if (trip.status !== SHIPMENT_STATUS.PICKING) throw new Error('Chuyến phải ở trạng thái "picking" để xác nhận lấy hàng');

    const allStops = await stopRepository.getStopsByShipment(tripId);
    const pickupStops = allStops.filter(s => s.stop_type === 'pickup');
    const allPickupStopsDone = pickupStops.length > 0 && pickupStops.every(s => s.completed_at);

    if (!proofFileUrl && !allPickupStopsDone) throw new Error('Ảnh xác nhận lấy hàng là bắt buộc (BR-013)');

    if (proofFileUrl) await tripRepository.saveLoadingProof(tripId, driverId, proofFileUrl);

    const updatedTrip = await tripRepository.updateTripStatus(tripId, SHIPMENT_STATUS.TRANSIT, null, driverId);

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
    if (trip.status !== 'completed') {
        throw new Error('Chỉ có thể báo nợ khi chuyến đã hoàn thành (completed)');
    }

    const amt = requireMoney(amount, { field: 'Số tiền nợ' });

    // Anti-spam + TH2+TH3 overflow guard
    const summary = await paymentRepository.getShipmentFinancialSummary(tripId);
    if (summary && summary.remaining !== null) {
        if (amt > summary.remaining) {
            const msg = summary.remaining <= 0
                ? `Chuyến này đã được ghi nhận đủ số tiền (${money(summary.trip_value)}). Không thể báo thêm nợ.`
                : `Số tiền báo nợ ${money(amt)} vượt quá phần còn lại ${money(summary.remaining)} ` +
                  `(giá trị chuyến ${money(summary.trip_value)}, đã thu mặt ${money(summary.cash_collected)}, đã báo nợ ${money(summary.customer_debt_total)}).`;
            throw new Error(msg);
        }
    }

    // Get customer_id from orders table via shipment's order_id
    const customerId = await tripRepository.getOrderCustomerId(trip.order_id);
    if (!customerId) throw new Error('Không tìm thấy đơn hàng liên quan');

    const debt = await tripRepository.createCustomerDebtForTrip({
        customerId, driverId, shipmentId: tripId, orderId: trip.order_id, amount: amt, notes,
    });

    notificationService.createForUser(driverId, {
        title: 'Đã ghi nhận công nợ khách hàng',
        message: `Chuyến #${tripId} — khách chưa thanh toán ${money(Number(amount))}.`,
        type: 'DEBT_CREATED',
        entityType: 'shipments',
        entityId: tripId,
    }, { displayMode: 'silent' }).catch(() => {});

    return debt;
};

// ITEM 5 — RETURNING → COMPLETED with optional return proof
const returnComplete = async (tripId, driverId, proofFileUrl) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền hoàn thành chuyến này');
    if (trip.status !== SHIPMENT_STATUS.RETURNING) throw new Error('Chuyến phải ở trạng thái "returning" để xác nhận hoàn hàng');

    // Ảnh BẮT BUỘC: đây là bằng chứng duy nhất chứng minh hàng đã thực sự về kho.
    // Trước đây ảnh tuỳ chọn nên không có gì xác nhận hàng đã được trả lại.
    if (!proofFileUrl) {
        throw new Error('Ảnh xác nhận đã trả hàng về điểm lấy là bắt buộc');
    }
    await tripRepository.saveDeliveryProof(tripId, driverId, proofFileUrl);

    await tripRepository.updateTripStatus(tripId, SHIPMENT_STATUS.COMPLETED, null, driverId);

    // Lấy full trip (order_payment_type, is_final_shipment, max_shipment_index, địa chỉ...)
    // — KHÔNG dùng row thô từ updateTripStatus (chỉ có cột order_shipments). Mobile cần
    // đủ các trường này để điều hướng sang màn nhập km/gửi phiếu thu sau khi hoàn hàng
    // (BR-008A) — thiếu field nào thì màn đó nhận params rỗng/undefined và tài không bao
    // giờ được hỏi km, nên actual_price của chuyến hoàn hàng không bao giờ được chốt.
    const completedTrip = await tripRepository.getFullTripById(tripId);

    // isFinal (dùng để chọn câu chữ thông báo) và derived_status của đơn (dùng để đóng
    // đơn/báo coordinator) là 2 việc KHÁC nhau, tính riêng: isFinalShipment còn đòi hỏi
    // các chuyến khác đã nhập actual_distance_km (sẵn sàng đối soát giá), trong khi đơn
    // vẫn nên đóng (completed/partial/cancelled) ngay khi mọi chuyến kết thúc, bất kể km
    // đã nhập hay chưa — km chỉ ảnh hưởng độ chính xác giá, không phải điều kiện đóng đơn.
    const isFinal = await tripRepository.isFinalShipment(tripId);
    const newOrderStatus = await tripRepository.recomputeOrderDerivedStatus(trip.order_id);
    if (newOrderStatus) {
        notificationGateway.broadcastToRole('coordinator', {
            type: 'coordinator.order.completed',
            action: newOrderStatus,
            orderId: trip.order_id,
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
    await kpiService.recalculateAfterCompletion(revenueDriverIds, new Date());

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

    const { isMaxIndex, allOthersReady } = await tripRepository.getShipmentFinalStatus(shipmentId);
    const isFinal = isMaxIndex && allOthersReady;

    // Kiểm tra payment_type của order
    const orderPaymentType = await tripRepository.getOrderPaymentType(orderId);

    // Là chuyến cuối (theo thứ tự) nhưng có chuyến khác trong đơn chưa nhập km xong
    // → chưa cho tạo yêu cầu, báo rõ lý do thay vì im lặng trả về như "không phải chuyến cuối".
    if (isMaxIndex && !allOthersReady && orderPaymentType === 'cash') {
        return { km_saved: true, receipt_request_created: false, waiting_for_other_shipments: true };
    }

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

const getDriverReceiptDetail = async (orrId, driverId) => {
    const receipt = await tripRepository.getDriverReceiptDetail(orrId, driverId);
    if (!receipt) throw new Error('Phiếu thu không tồn tại hoặc bạn không có quyền xem');

    // eslint-disable-next-line global-require
    const expenseService = require('./expenseService');
    const expenses = receipt.shipment_id
        ? await expenseService.getExpensesByShipment(receipt.shipment_id)
        : [];
    // Kèm tất cả chuyến trong đơn + chi phí để hiển thị tổng cộng cho khách
    const orderShipments = receipt.order_id
        ? await tripRepository.getOrderShipmentsWithExpenses(receipt.order_id)
        : [];

    return { ...receipt, expenses, order_shipments: orderShipments };
};

const recordReceiptCollection = async (orrId, driverId, { paymentType, proofUrl, notes, collectedAmount }) => {
    const VALID = ['cash_collected', 'bank_transfer', 'client_credit'];
    if (!VALID.includes(paymentType)) throw new Error('Hình thức thanh toán không hợp lệ');
    if (['cash_collected', 'bank_transfer'].includes(paymentType) && !proofUrl) {
        // Phiếu thu 0đ (mọi chuyến của đơn bị hủy vì hàng hư hại — toàn bộ chi phí chuyển
        // sang DN chịu; hoặc khách đã trả trước đủ) thì không có giao dịch nào để chụp:
        // giữ nguyên yêu cầu ảnh sẽ khóa cứng tài xế, không cách nào đóng được phiếu.
        // Chỉ tra DB ở nhánh THIẾU ảnh nên luồng bình thường không tốn thêm truy vấn.
        const receiptAmount = await tripRepository.getReceiptAmountForDriver(orrId, driverId);
        if (receiptAmount === null || receiptAmount > 0.01) {
            throw new Error('Ảnh xác minh là bắt buộc cho hình thức này');
        }
    }
    const result = await tripRepository.recordReceiptCollection(orrId, driverId, { paymentType, proofUrl, notes, collectedAmount });

    if (paymentType === 'bank_transfer') {
        // entityId PHẢI là shipment_receipts.id: kế toán xác nhận chuyển khoản qua
        // POST /api/accountant/receipts/:receiptId/confirm-bank-transfer, tra theo sr.id.
        // Hàm này nhận orr.id — hai dải khoá khác nhau, truyền nhầm sẽ deep-link sai phiếu.
        const shipmentReceiptId = result.shipmentReceiptId;
        notificationService.getUserIdsByRole('accountant').then((ids) =>
            notificationService.createForUsers(ids, {
                title: 'Khách chuyển khoản về công ty — cần xác nhận',
                message: `Tài xế đã xác nhận khách chuyển khoản cho phiếu thu #${shipmentReceiptId}. Vui lòng kiểm tra và xác nhận đã nhận tiền.`,
                type: 'BANK_TRANSFER_PENDING',
                // entityType riêng để bấm thông báo mở đúng màn "Xác nhận chuyển khoản"
                // (dùng 'receipt' sẽ nhảy sang màn Doanh thu như mọi phiếu thu khác)
                entityType: 'bank_transfer',
                entityId: shipmentReceiptId,
            }, { displayMode: 'alert' })
        ).catch(() => {});
    }

    return result;
};

const arriveAtStop = async (shipmentId, stopId, driverId) => {
    const trip = await tripRepository.getTripById(shipmentId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) {
        throw new Error('Bạn không có quyền cập nhật stop này');
    }
    const stop = await stopRepository.markStopArrived(stopId, shipmentId);
    if (!stop) throw new Error('Stop không tồn tại hoặc đã đánh dấu đến');
    return stop;
};

// BR-011: phải hoàn thành stop trước đó theo đúng thứ tự
const completeStop = async (shipmentId, stopId, driverId, proofUrl) => {
    const trip = await tripRepository.getTripById(shipmentId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) {
        throw new Error('Bạn không có quyền cập nhật stop này');
    }
    const prevDone = await stopRepository.isPreviousStopDone(stopId, shipmentId);
    if (!prevDone) throw new Error('Phải hoàn thành stop trước (BR-011)');

    const stop = await stopRepository.markStopCompleted(stopId, shipmentId, proofUrl);
    if (!stop) throw new Error('Stop không tồn tại hoặc đã hoàn thành');
    return stop;
};

const resubmitReceiptRequest = async (orrId, driverId, driverNotes) => {
    return tripRepository.resubmitReceiptRequest(orrId, driverId, driverNotes);
};

module.exports = {
    getTripPool,
    getActiveTrip,
    describeUndo,
    undoLastTransition,
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
    resubmitReceiptRequest,
    arriveAtStop,
    completeStop,
};
