const tripService = require('../services/tripService');
const { money } = require('../utils/formatNumber');
const { optionalMoney } = require('../utils/money');

// GET /api/trips/pool?page=1&limit=5&vehicleGroupId=123
const getTripPool = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
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
        if (err.message.startsWith('PENDING_RECEIPT:')) {
            return res.status(422).json({ error: err.message.replace('PENDING_RECEIPT:', ''), code: 'PENDING_RECEIPT' });
        }
        // Nhận chuyến sai nhóm xe: dữ liệu gửi lên không hợp lệ với xe đang lái (422),
        // kèm code để app phân biệt được với các lỗi 422 khác.
        if (err.message.startsWith('VEHICLE_GROUP_MISMATCH:')) {
            return res.status(422).json({
                error: err.message.replace('VEHICLE_GROUP_MISMATCH:', ''),
                code: 'VEHICLE_GROUP_MISMATCH',
            });
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
        const { status, reason, version } = req.body;
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });
        if (!status) return res.status(400).json({ error: 'Trạng thái không được để trống' });

        // version tuỳ chọn: client cũ không gửi thì bỏ qua kiểm tra, client mới gửi thì
        // được bảo vệ khỏi ghi đè lên thay đổi mình chưa thấy.
        const expectedVersion = version === undefined || version === null ? null : Number(version);

        const trip = await tripService.updateStatus(tripId, req.user.userId, status, reason, expectedVersion);
        res.json({ message: 'Cập nhật trạng thái thành công', trip });
    } catch (err) {
        // 409 cho xung đột phiên bản: đây không phải lỗi của người dùng, app chỉ cần
        // tải lại rồi thử lại — khác hẳn 400/422 vốn nghĩa là "yêu cầu sai".
        if (err.code === 'STALE_VERSION') {
            return res.status(409).json({ error: err.message.split(':').slice(1).join(':'), code: 'STALE_VERSION' });
        }
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('không thể') || err.message.includes('bắt buộc') ? 422
                : 400;
        res.status(code).json({ error: err.message });
    }
};

// POST /api/trips/:id/undo
// Body: { version?: number }
// Hoàn tác MỘT bước trạng thái vừa bấm nhầm, trong cửa sổ ngắn (tầng 1).
const undoStatus = async (req, res) => {
    try {
        const tripId = Number(req.params.id);
        if (!tripId) return res.status(400).json({ error: 'Trip ID không hợp lệ' });

        const { version } = req.body ?? {};
        if (version === undefined || version === null) {
            return res.status(400).json({ error: 'Thiếu số phiên bản chuyến', code: 'VERSION_REQUIRED' });
        }

        const trip = await tripService.undoLastTransition(tripId, req.user.userId, {
            expectedVersion: Number(version),
        });
        res.json({ message: 'Đã hoàn tác bước vừa rồi', trip });
    } catch (err) {
        // Lỗi ở đây mang tiền tố mã ("WINDOW_EXPIRED:..."). Tách ra để app phân biệt
        // "hết hạn hoàn tác" (hiện hướng dẫn báo điều phối) với "không phải chuyến của
        // bạn" (ẩn nút hẳn) — hai việc app phải xử lý khác nhau.
        const [maybeCode, ...rest] = String(err.message).split(':');
        const known = ['NOT_FOUND', 'FORBIDDEN', 'NOT_UNDOABLE', 'WINDOW_EXPIRED', 'STALE_VERSION', 'CONFLICT', 'VERSION_REQUIRED'];
        if (known.includes(maybeCode)) {
            const status = maybeCode === 'FORBIDDEN' ? 403
                : maybeCode === 'NOT_FOUND' ? 404
                    : maybeCode === 'STALE_VERSION' || maybeCode === 'CONFLICT' ? 409
                        : maybeCode === 'VERSION_REQUIRED' ? 400
                            : 422;
            return res.status(status).json({ error: rest.join(':').trim(), code: maybeCode });
        }
        res.status(400).json({ error: err.message });
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

// POST /api/trips/:id/return-complete — RETURNING → COMPLETED (ảnh BẮT BUỘC — xem tripService.returnComplete)
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
        const page = Math.max(1, Number(req.query.page) || 1);
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


// PATCH /api/trips/:id/stops/:stopId/arrive
const arriveAtStop = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        const stopId = Number(req.params.stopId);
        const stop = await tripService.arriveAtStop(shipmentId, stopId, req.user.userId);
        res.json({ message: 'Đã đánh dấu đến điểm dừng', stop });
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404
            : err.message.includes('không có quyền') ? 403
                : err.message.includes('đã đánh dấu') ? 409
                    : 500;
        res.status(code).json({ error: err.message });
    }
};

// PATCH /api/trips/:id/stops/:stopId/complete
const completeStop = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        const stopId = Number(req.params.stopId);
        const proofUrl = req.files?.['proof']?.[0]?.path
            ?? req.files?.['image']?.[0]?.path
            ?? req.body.proof_url
            ?? null;
        const stop = await tripService.completeStop(shipmentId, stopId, req.user.userId, proofUrl);
        res.json({ message: 'Đã hoàn thành điểm dừng', stop });
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404
            : err.message.includes('không có quyền') ? 403
                : err.message.includes('BR-011') ? 422
                    : err.message.includes('đã hoàn thành') ? 409
                        : 500;
        res.status(code).json({ error: err.message });
    }
};


// POST /api/orders/:id/request-receipt  (application/json)
// Body: { shipment_id, actual_km }
// Non-final driver: lưu km → { km_saved, receipt_request_created: false }
// Final driver:     lưu km + tạo phiếu → { km_saved, receipt_request_created: true, request }
const requestOrderReceipt = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        const shipmentId = Number(req.body.shipment_id);
        const actualKm = req.body.actual_km !== undefined ? Number(req.body.actual_km) : undefined;

        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });
        if (!shipmentId) return res.status(400).json({ error: 'shipment_id là bắt buộc' });

        const result = await tripService.requestOrderReceipt(orderId, req.user.userId, {
            shipmentId, actualKm,
        });

        const status = result.receipt_request_created ? 201 : 200;
        const message = result.receipt_request_created
            ? 'Đã gửi yêu cầu tạo phiếu thu. Coordinator sẽ xem xét sớm.'
            : result.waiting_for_other_shipments
                ? 'Đã lưu số km thực tế. Đơn còn chuyến khác chưa nhập km — chờ chuyến đó xong mới gửi được yêu cầu tạo phiếu thu.'
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

// GET /api/trips/receipt-requests  — danh sách phiếu thu của driver
const getDriverReceipts = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Number(req.query.limit) || 20);
        const receipts = await tripService.getDriverReceipts(req.user.userId, { page, limit });
        res.json({ receipts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/trips/receipt-requests/:orrId  — chi tiết phiếu thu (show cho khách)
const getDriverReceiptDetail = async (req, res) => {
    try {
        const orrId = Number(req.params.orrId);
        if (!orrId) return res.status(400).json({ error: 'ID yêu cầu phiếu thu không hợp lệ' });
        const receipt = await tripService.getDriverReceiptDetail(orrId, req.user.userId);
        res.json({ receipt });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403 : 500;
        res.status(code).json({ error: err.message });
    }
};

const resubmitReceiptRequest = async (req, res) => {
    try {
        const orrId = Number(req.params.orrId);
        if (!orrId) return res.status(400).json({ error: 'ID yêu cầu không hợp lệ' });
        const { driver_notes } = req.body;
        await tripService.resubmitReceiptRequest(orrId, req.user.userId, driver_notes ?? null);
        res.json({ message: 'Đã gửi lại yêu cầu tạo phiếu thu' });
    } catch (err) {
        const code = err.message.includes('không tìm thấy') ? 404 : 500;
        res.status(code).json({ error: err.message });
    }
};

const recordReceiptCollection = async (req, res) => {
    try {
        const orrId = Number(req.params.orrId);
        if (!orrId) return res.status(400).json({ error: 'ID yêu cầu phiếu thu không hợp lệ' });

        const { payment_type, notes, collected_amount } = req.body;
        if (!payment_type) return res.status(400).json({ error: 'Thiếu hình thức thanh toán' });

        // optionalMoney: bỏ trống = không khai số tiền (hợp lệ), còn đã gõ thì phải
        // hiểu đúng — phép `Number()` cũ đọc "500.000" thành 500.
        let collectedAmount;
        try {
            collectedAmount = optionalMoney(collected_amount, { field: 'Số tiền nhận từ khách' });
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }

        const file = req.files?.proof?.[0] ?? req.files?.image?.[0] ?? req.files?.photo?.[0];
        const proofUrl = file?.path ?? null;

        const result = await tripService.recordReceiptCollection(orrId, req.user.userId, {
            paymentType: payment_type,
            proofUrl,
            notes: notes ?? null,
            collectedAmount,
        });

        const message = result?.excessDistributed
            ? 'Đã ghi nhận thanh toán — phần thừa tự động phân bổ vào nợ cũ của khách.'
            : result?.partialPayment
                ? `Đã ghi nhận thanh toán một phần — khách còn nợ ${money(Number(result.shortfall))}.`
                : 'Đã ghi nhận thanh toán phiếu thu';

        res.json({
            message,
            excessDistributed: result?.excessDistributed ?? false,
            partialPayment: result?.partialPayment ?? false,
            shortfall: result?.shortfall ?? 0,
        });
    } catch (err) {
        const code = err.message.includes('không có quyền') ? 403
            : err.message.includes('Ảnh') ? 422
                : err.message.includes('đã được ghi nhận') ? 409
                    : err.message.includes('không hợp lệ') ? 400
                        : 500;
        res.status(code).json({ error: err.message });
    }
};

module.exports = {
    getTripPool,
    getActiveTrip,
    claimTrip,
    updateStatus,
    undoStatus,
    releaseTrip,
    arriveAtStop,
    completeStop,
    completeTrip,
    startTransit,
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
};
