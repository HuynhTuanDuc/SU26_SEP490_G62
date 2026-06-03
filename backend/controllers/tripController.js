const tripService = require('../services/tripService');

// GET /api/trips/pool
const getTripPool = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
        const vehicleGroupId = req.query.vehicleGroupId ? Number(req.query.vehicleGroupId) : null;

        if (req.query.vehicleGroupId && (!Number.isInteger(vehicleGroupId) || vehicleGroupId <= 0)) {
            return res.status(400).json({ error: 'Vehicle group ID không hợp lệ' });
        }

        const result = await tripService.getTripPool(req.user.userId, {
            page,
            limit,
            vehicleGroupId,
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/trips/active
const getActiveTrip = async (req, res) => {
    try {
        const trip = await tripService.getActiveTrip(req.user.userId);
        res.json({ trip });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/trips/:id/claim  — :id là order_id
const claimTrip = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });

        const trip = await tripService.claimTrip(orderId, req.user.userId);
        res.status(200).json({ message: 'Nhận đơn hàng thành công', trip });
    } catch (err) {
        // ALREADY_CLAIMED: → 409 Conflict (tài xế khác nhận trước)
        if (err.message.startsWith('ALREADY_CLAIMED:')) {
            return res.status(409).json({ error: err.message.replace('ALREADY_CLAIMED:', '') });
        }
        const status = err.message.includes('đang có') ? 422
            : err.message.includes('chưa được gán') ? 422
            : 400;
        res.status(status).json({ error: err.message });
    }
};

// PATCH /api/trips/:id/status
const updateStatus = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        const { status } = req.body;
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });
        if (!status) return res.status(400).json({ error: 'Trạng thái không được để trống' });

        const trip = await tripService.updateStatus(tripId, req.user.userId, status);
        res.json({ message: 'Cập nhật trạng thái thành công', trip });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('không thể') ? 422
            : 400;
        res.status(code).json({ error: err.message });
    }
};


const cancelDelivery = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        const { reason } = req.body;
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });
        if (!reason?.trim()) return res.status(400).json({ error: 'Lý do không thể giao hàng là bắt buộc' });

        const trip = await tripService.cancelDelivery(tripId, req.user.userId, reason);
        res.json({ message: 'Đã ghi nhận không thể giao hàng', trip });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('bắt buộc') ? 400
            : err.message.includes('khi đã đến') ? 422
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// POST /api/trips/:id/release
// Body: { reason?: string }
// CLAIMED/PICKING → toàn bộ order về available (back to pool)
const releaseTrip = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        const { reason } = req.body;
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });

        const result = await tripService.releaseTrip(tripId, req.user.userId, reason);
        res.json({ message: 'Đã hủy chuyến, đơn hàng trả về pool', ...result });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('Chỉ có thể') ? 422
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// POST /api/trips/:id/complete  (multipart/form-data, fields: receipt, proof?)
const completeTrip = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });

        const receiptUrl = req.files?.receipt?.[0]?.path ?? null;
        const proofUrl   = req.files?.proof?.[0]?.path   ?? null;

        const trip = await tripService.completeTrip(tripId, req.user.userId, receiptUrl, proofUrl);
        res.json({ message: 'Hoàn thành chuyến thành công', trip });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('bắt buộc') ? 422
            : err.message.includes('"arrived"') ? 422
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// GET /api/trips/stats
const getDriverStats = async (req, res) => {
    try {
        const stats = await tripService.getDriverStats(req.user.userId);
        res.json({ stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/trips/history?page=1&limit=20
const getOrderHistory = async (req, res) => {
    try {
        const page  = Math.max(1, Number(req.query.page)  || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
        const result = await tripService.getOrderHistory(req.user.userId, page, limit);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/trips/pool/:orderId — chi tiết đơn hàng có sẵn (chưa nhận)
const getAvailableOrderDetail = async (req, res) => {
    try {
        const orderId = Number(req.params.orderId);
        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });
        const detail = await tripService.getAvailableOrderDetail(orderId);
        res.json(detail);
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404 : 500;
        res.status(code).json({ error: err.message });
    }
};

// GET /api/trips/orders/:orderId
const getOrderDetail = async (req, res) => {
    try {
        const orderId = Number(req.params.orderId);
        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });
        const detail = await tripService.getOrderDetail(orderId, req.user.userId);
        res.json(detail);
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403 : 500;
        res.status(code).json({ error: err.message });
    }
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
