const tripService    = require('../services/tripService');
const stopRepository = require('../repositories/stopRepository');
const tripRepository = require('../repositories/tripRepository');

// GET /api/trips/pool?page=1&limit=5&vehicleGroupId=123
const getTripPool = async (req, res) => {
    try {
        const page           = Math.max(1, Number(req.query.page) || 1);
        const limit          = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
        const vehicleGroupId = req.query.vehicleGroupId ? Number(req.query.vehicleGroupId) : null;

        const data = await tripService.getTripPool(req.user.userId, { page, limit, vehicleGroupId });
        res.json(data);
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

// POST /api/trips/:id/claim  — :id là shipment_id
const claimTrip = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        if (!shipmentId) return res.status(400).json({ error: 'Shipment ID không hợp lệ' });

        const trip = await tripService.claimTrip(shipmentId, req.user.userId);
        res.status(200).json({ message: 'Nhận chuyến thành công', trip });
    } catch (err) {
        if (err.message.startsWith('ALREADY_CLAIMED:')) {
            return res.status(409).json({ error: err.message.replace('ALREADY_CLAIMED:', '') });
        }
        if (err.message.startsWith('SAME_ORDER:')) {
            return res.status(409).json({ error: err.message.replace('SAME_ORDER:', '') });
        }
        const status = err.message.includes('đang có') ? 422
            : err.message.includes('chưa được gán') ? 422
            : 400;
        res.status(status).json({ error: err.message });
    }
};

// PATCH /api/trips/:id/status
// Body: { status, reason? }  — reason bắt buộc khi status = "failed"
const updateStatus = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        const { status, reason } = req.body;
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });
        if (!status) return res.status(400).json({ error: 'Trạng thái không được để trống' });

        const trip = await tripService.updateStatus(tripId, req.user.userId, status, reason);
        res.json({ message: 'Cập nhật trạng thái thành công', trip });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('không thể') || err.message.includes('bắt buộc') ? 422
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

// POST /api/trips/:id/complete  (multipart/form-data)
// Fields bắt buộc:
//   'proof' — ảnh xác nhận giao hàng (chụp hàng/người nhận, BR-015/016/017)
// Receipt/biên lai được xử lý riêng qua POST /orders/:id/request-receipt
const completeTrip = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });

        const proofUrl = req.files?.proof?.[0]?.path ?? req.files?.image?.[0]?.path ?? null;

        const trip = await tripService.completeTrip(tripId, req.user.userId, proofUrl);
        res.json({ message: 'Hoàn thành chuyến thành công', trip });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('bắt buộc') ? 422
            : err.message.includes('"arrived"') ? 422
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// POST /api/trips/:id/start-transit — PICKING → TRANSIT với ảnh lấy hàng bắt buộc (BR-013/014)
// Field name linh hoạt: 'proof' | 'image' | 'photo'
const startTransit = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });

        const proofUrl =
            req.files?.proof?.[0]?.path ??
            req.files?.image?.[0]?.path ??
            req.files?.photo?.[0]?.path ??
            req.file?.path ??
            null;

        const trip = await tripService.startTransit(tripId, req.user.userId, proofUrl);
        res.json({ message: 'Xác nhận lấy hàng thành công', trip });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('bắt buộc') ? 422
            : err.message.includes('"picking"') ? 422
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// POST /api/trips/:id/mark-unpaid — TH3: khách chưa trả tiền → tạo Customer Debt
// Body: { amount, notes? }
const markUnpaid = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });

        const { amount, notes } = req.body;
        const debt = await tripService.markUnpaid(tripId, req.user.userId, { amount, notes });
        res.status(201).json({ message: 'Đã ghi nhận công nợ khách hàng', debt });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('phải là số') ? 422
            : err.message.includes('trạng thái') ? 422
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// POST /api/trips/:id/return-complete — RETURNING → COMPLETED (ảnh không bắt buộc)
// Field name linh hoạt: 'proof' | 'image'
const returnComplete = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });

        const proofUrl =
            req.files?.proof?.[0]?.path ??
            req.files?.image?.[0]?.path ??
            req.file?.path ??
            null;

        const trip = await tripService.returnComplete(tripId, req.user.userId, proofUrl);
        res.json({ message: 'Hoàn hàng thành công', trip });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('"returning"') ? 422
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

// GET /api/trips/pool-shipment/:shipmentId — chi tiết 1 chuyến trong pool
const getAvailableShipmentDetail = async (req, res) => {
    try {
        const shipmentId = Number(req.params.shipmentId);
        if (!shipmentId) return res.status(400).json({ error: 'Shipment ID không hợp lệ' });
        const detail = await tripService.getAvailableShipmentDetail(shipmentId);
        res.json(detail);
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404 : 500;
        res.status(code).json({ error: err.message });
    }
};

// GET /api/trips/pool/:orderId — giữ lại để tương thích
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

// GET /api/trips/:id/stops
const getShipmentStops = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        const trip = await tripRepository.getTripById(shipmentId);
        if (!trip) return res.status(404).json({ error: 'Chuyến không tồn tại' });
        if (Number(trip.owner_driver_id) !== Number(req.user.userId)) {
            return res.status(403).json({ error: 'Bạn không có quyền xem stops của chuyến này' });
        }
        const stops = await stopRepository.getStopsByShipment(shipmentId);
        res.json({ stops });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PATCH /api/trips/:id/stops/:stopId/arrive
const arriveAtStop = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        const stopId     = Number(req.params.stopId);
        const trip = await tripRepository.getTripById(shipmentId);
        if (!trip) return res.status(404).json({ error: 'Chuyến không tồn tại' });
        if (Number(trip.owner_driver_id) !== Number(req.user.userId)) {
            return res.status(403).json({ error: 'Bạn không có quyền cập nhật stop này' });
        }
        const stop = await stopRepository.markStopArrived(stopId, shipmentId);
        if (!stop) return res.status(409).json({ error: 'Stop không tồn tại hoặc đã đánh dấu đến' });
        res.json({ message: 'Đã đánh dấu đến điểm dừng', stop });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PATCH /api/trips/:id/stops/:stopId/complete
const completeStop = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        const stopId     = Number(req.params.stopId);
        const trip = await tripRepository.getTripById(shipmentId);
        if (!trip) return res.status(404).json({ error: 'Chuyến không tồn tại' });
        if (Number(trip.owner_driver_id) !== Number(req.user.userId)) {
            return res.status(403).json({ error: 'Bạn không có quyền cập nhật stop này' });
        }
        // BR-011: phải đúng thứ tự
        const prevDone = await stopRepository.isPreviousStopDone(stopId, shipmentId);
        if (!prevDone) return res.status(422).json({ error: 'Phải hoàn thành stop trước (BR-011)' });

        const stop = await stopRepository.markStopCompleted(stopId, shipmentId, req.body.proof_url ?? null);
        if (!stop) return res.status(409).json({ error: 'Stop không tồn tại hoặc đã hoàn thành' });
        res.json({ message: 'Đã hoàn thành điểm dừng', stop });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// POST /api/orders/:id/request-receipt  (application/json)
// Body: { shipment_id, actual_km }
// Non-final driver: lưu km → { km_saved, receipt_request_created: false }
// Final driver:     lưu km + tạo phiếu → { km_saved, receipt_request_created: true, request }
const requestOrderReceipt = async (req, res) => {
    try {
        const orderId    = Number(req.params.id);
        const shipmentId = Number(req.body.shipment_id);
        const actualKm   = req.body.actual_km !== undefined ? Number(req.body.actual_km) : undefined;

        if (!orderId)    return res.status(400).json({ error: 'Order ID không hợp lệ' });
        if (!shipmentId) return res.status(400).json({ error: 'shipment_id là bắt buộc' });

        const result = await tripService.requestOrderReceipt(orderId, req.user.userId, {
            shipmentId, actualKm,
        });

        const status = result.receipt_request_created ? 201 : 200;
        const message = result.receipt_request_created
            ? 'Đã gửi yêu cầu tạo phiếu thu. Coordinator sẽ xem xét sớm.'
            : 'Đã lưu số km thực tế.';
        res.status(status).json({ message, ...result });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('đã có yêu cầu') ? 409
            : err.message.includes('completed') || err.message.includes('bắt buộc') ? 422
            : 400;
        res.status(code).json({ error: err.message });
    }
};

// GET /api/trips/pending-receipt — đơn cash đã hoàn thành nhưng chưa gửi yêu cầu phiếu thu
const getPendingReceiptOrder = async (req, res) => {
    try {
        const order = await tripService.getPendingReceiptOrder(req.user.userId);
        res.json({ order: order ?? null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/orders/:id/receipt-request
const getOrderReceiptRequest = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });
        const request = await tripService.getOrderReceiptRequest(orderId);
        res.json({ request: request ?? null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/trips/receipts  — danh sách phiếu thu của driver
const getDriverReceipts = async (req, res) => {
    try {
        const page  = Math.max(1, Number(req.query.page)  || 1);
        const limit = Math.min(50, Number(req.query.limit) || 20);
        const receipts = await tripService.getDriverReceipts(req.user.userId, { page, limit });
        res.json({ receipts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/trips/receipts/:receiptId  — chi tiết phiếu thu (show cho khách)
const getDriverReceiptDetail = async (req, res) => {
    try {
        const receiptId = Number(req.params.receiptId);
        if (!receiptId) return res.status(400).json({ error: 'Receipt ID không hợp lệ' });
        const receipt = await tripService.getDriverReceiptDetail(receiptId, req.user.userId);
        res.json({ receipt });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403 : 500;
        res.status(code).json({ error: err.message });
    }
};

// POST /api/trips/receipts/:receiptId/record-collection — driver xác nhận hình thức thu tiền
// Body: { collection_type: 'cash_collected' | 'bank_transfer' | 'client_credit' }
const recordReceiptCollection = async (req, res) => {
    try {
        const receiptId = Number(req.params.receiptId);
        if (!receiptId) return res.status(400).json({ error: 'Receipt ID không hợp lệ' });
        const { collection_type } = req.body;
        if (!collection_type) return res.status(400).json({ error: 'Thiếu collection_type' });
        const result = await tripService.recordReceiptCollection(receiptId, req.user.userId, collection_type);
        res.status(201).json(result);
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('đã được ghi nhận') || err.message.includes('đã được cập nhật') ? 409
            : 500;
        res.status(code).json({ error: err.message });
    }
};

module.exports = {
    getTripPool,
    getActiveTrip,
    claimTrip,
    updateStatus,
    releaseTrip,
    getShipmentStops,
    arriveAtStop,
    completeStop,
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
