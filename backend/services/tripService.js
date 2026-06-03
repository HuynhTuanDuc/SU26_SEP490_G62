const tripRepository = require('../repositories/tripRepository');
const {
    SHIPMENT_STATUS,
    ALLOWED_TRANSITIONS,
    CANCELLABLE_STATUSES,
    RELEASABLE_STATUSES,
} = require('../constants/tripConstants');

const getTripPool = async (_driverId, { page = 1, limit = 20, vehicleGroupId = null } = {}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
    const normalizedVehicleGroupId = vehicleGroupId && Number(vehicleGroupId) > 0 ? Number(vehicleGroupId) : null;
    const offset = (safePage - 1) * safeLimit;

    const [{ rows, total }, vehicleGroups] = await Promise.all([
        tripRepository.getAvailableOrders({
            limit: safeLimit,
            offset,
            vehicleGroupId: normalizedVehicleGroupId,
        }),
        tripRepository.getAllVehicleGroups(),
    ]);

    return {
        trips: rows,
        vehicleGroups,
        pagination: {
            total,
            page: safePage,
            limit: safeLimit,
            totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        },
    };
};

const getActiveTrip = async (driverId) => {
    return tripRepository.getActiveTrip(driverId);
};

const claimTrip = async (orderId, driverId) => {
    const vehicleId = await tripRepository.getDriverVehicleId(driverId);
    if (!vehicleId) throw new Error('Tài xế chưa được gán xe');

    // Việc kiểm tra active trip & lock order xảy ra trong 1 transaction ở repository
    let claimed;
    try {
        claimed = await tripRepository.claimOrder(orderId, driverId, vehicleId);
    } catch (err) {
        if (err.message === 'ACTIVE_TRIP') {
            throw new Error('Bạn đang có chuyến đang hoạt động, không thể nhận thêm đơn hàng mới');
        }
        throw err;
    }
    if (!claimed) throw new Error('ALREADY_CLAIMED:Đơn hàng đã được tài xế khác nhận');
    return claimed;
};

const updateStatus = async (tripId, driverId, newStatus) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền cập nhật chuyến này');

    const allowed = ALLOWED_TRANSITIONS[trip.status] ?? [];
    if (!allowed.includes(newStatus)) {
        throw new Error(`Không thể chuyển trạng thái từ "${trip.status}" sang "${newStatus}"`);
    }

    const updatedTrip = await tripRepository.updateTripStatus(tripId, newStatus);

    // Sau khi hoàn thành (COMPLETED): kích hoạt leg tiếp theo nếu có
    if (newStatus === SHIPMENT_STATUS.COMPLETED) {
        const vehicleId = await tripRepository.getDriverVehicleId(driverId);
        await tripRepository.activateNextShipment(tripId, driverId, vehicleId);
    }

    return updatedTrip;
};

// Không thể giao hàng: ARRIVED → CANCELLED + lý do bắt buộc
// Driver vẫn giữ chuyến (CANCELLED trong ACTIVE_STATUSES) để xác nhận đã trả hàng về
const cancelDelivery = async (tripId, driverId, reason) => {
    if (!reason || !reason.trim()) throw new Error('Lý do không thể giao hàng là bắt buộc');

    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền cập nhật chuyến này');
    if (trip.status !== SHIPMENT_STATUS.ARRIVED) throw new Error('Chỉ có thể báo không giao được khi đã đến điểm giao');

    return tripRepository.updateTripStatus(tripId, SHIPMENT_STATUS.CANCELLED, reason.trim());
};

// Hủy chuyến sớm: CLAIMED/PICKING → trả toàn bộ order về pool (available)
const releaseTrip = async (tripId, driverId, reason) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền hủy chuyến này');
    if (!RELEASABLE_STATUSES.includes(trip.status)) {
        throw new Error(`Chỉ có thể hủy chuyến khi ở trạng thái "claimed" hoặc "picking"`);
    }

    return tripRepository.releaseOrderToPool(tripId, driverId, reason);
};

const completeTrip = async (tripId, driverId, receiptFileUrl, proofFileUrl) => {
    const trip = await tripRepository.getTripById(tripId);
    if (!trip) throw new Error('Chuyến không tồn tại');
    if (Number(trip.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền hoàn thành chuyến này');
    if (trip.status !== SHIPMENT_STATUS.ARRIVED) throw new Error('Chuyến phải ở trạng thái "arrived" để hoàn thành');

    if (!receiptFileUrl) throw new Error('Ảnh biên lai giao hàng là bắt buộc');
    await tripRepository.saveShipmentReceipt(tripId, driverId, receiptFileUrl);

    const isFinal = await tripRepository.isFinalShipment(tripId);
    if (isFinal) {
        if (!proofFileUrl) throw new Error('Ảnh xác nhận hoàn thành đơn hàng là bắt buộc cho chuyến cuối');
        await tripRepository.saveCompletionProof(trip.order_id, tripId, driverId, proofFileUrl);
    }

    const completedTrip = await tripRepository.updateTripStatus(tripId, SHIPMENT_STATUS.COMPLETED);

    if (!isFinal) {
        const vehicleId = await tripRepository.getDriverVehicleId(driverId);
        await tripRepository.activateNextShipment(tripId, driverId, vehicleId);
    }

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
    cancelDelivery,
    releaseTrip,
    completeTrip,
    getDriverStats,
    getOrderHistory,
    getAvailableOrderDetail,
    getOrderDetail,
};
