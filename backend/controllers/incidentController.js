const incidentService = require('../services/incidentService');
const { money } = require('../utils/formatNumber');

// ─── POST /api/incidents ──────────────────────────────────────────────────────

const createIncident = async (req, res) => {
    try {
        const driverId = req.user.userId;
        const { shipmentId, incidentType, severityLevel, description, location } = req.body;

        // shipmentId có thể null: sự cố ngoài chuyến (hỏng xe / tắc đường) — service tự validate theo loại
        const parsedShipmentId = Number(shipmentId);

        const imageUrls = (req.files ?? []).map((f) => f.path);

        const incident = await incidentService.createIncident(
            driverId,
            {
                shipmentId: Number.isInteger(parsedShipmentId) && parsedShipmentId > 0 ? parsedShipmentId : null,
                incidentType,
                severityLevel,
                description,
                location,
            },
            imageUrls,
        );

        res.status(201).json({ incident });
    } catch (err) {
        if (err.message.startsWith('DUPLICATE_TYPE:')) {
            return res.status(409).json({ error: err.message.replace('DUPLICATE_TYPE:', '') });
        }
        const status = err.message.includes('không tồn tại') ? 404
            : err.message.includes('quyền') ? 403
            : err.message.includes('không hợp lệ') || err.message.includes('bắt buộc') || err.message.includes('ít nhất') || err.message.includes('Tối đa') || err.message.includes('chỉ có thể báo cáo') ? 400
            : err.message.includes('đang hoạt động') ? 422
            : 500;
        res.status(status).json({ error: err.message });
    }
};

// ─── POST /api/incidents/staff (coordinator/manager tự tạo) ──────────────────

const createIncidentByStaff = async (req, res) => {
    try {
        const actorId = req.user.userId;
        const { shipmentId, incidentType, severityLevel, description, location } = req.body;
        const parsedShipmentId = Number(shipmentId);
        const imageUrls = (req.files ?? []).map((f) => f.path);

        const incident = await incidentService.createIncidentByStaff(
            actorId,
            {
                shipmentId: Number.isInteger(parsedShipmentId) && parsedShipmentId > 0 ? parsedShipmentId : null,
                incidentType,
                severityLevel,
                description,
                location,
            },
            imageUrls,
        );

        res.status(201).json({ incident });
    } catch (err) {
        if (err.message.startsWith('DUPLICATE_TYPE:')) {
            return res.status(409).json({ error: err.message.replace('DUPLICATE_TYPE:', '') });
        }
        const status = err.message.includes('không tồn tại') ? 404
            : err.message.includes('không hợp lệ') || err.message.includes('bắt buộc') || err.message.includes('ít nhất') || err.message.includes('Tối đa') ? 400
            : 500;
        res.status(status).json({ error: err.message });
    }
};

// ─── GET /api/incidents/my/counts ────────────────────────────────────────────

const getMyCounts = async (req, res) => {
    try {
        const counts = await incidentService.getMyCounts(req.user.userId);
        res.json(counts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── GET /api/incidents/my ────────────────────────────────────────────────────

const getMyIncidents = async (req, res) => {
    try {
        const driverId = req.user.userId;
        const page     = Math.max(1, Number(req.query.page) || 1);
        const limit    = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

        const data = await incidentService.getMyIncidents(driverId, page, limit);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── GET /api/incidents/:id ───────────────────────────────────────────────────

const getIncidentDetail = async (req, res) => {
    try {
        const incidentId = Number(req.params.id);
        if (!incidentId) return res.status(400).json({ error: 'ID không hợp lệ' });

        const incident = await incidentService.getIncidentDetail(incidentId, req.user.userId);
        res.json({ incident });
    } catch (err) {
        const status = err.message.includes('không tồn tại') ? 404
            : err.message.includes('quyền') ? 403
            : 500;
        res.status(status).json({ error: err.message });
    }
};

// ─── PATCH /api/incidents/:id/status  (coordinator only) ─────────────────────

const updateIncidentStatus = async (req, res) => {
    try {
        const incidentId   = Number(req.params.id);
        const coordinatorId = req.user.userId;
        if (!incidentId) return res.status(400).json({ error: 'ID không hợp lệ' });

        const { status, resolution, replacementDriverId, compensation } = req.body;
        if (!status) return res.status(400).json({ error: 'status là bắt buộc' });

        const incident = await incidentService.updateIncidentStatus(incidentId, coordinatorId, {
            status,
            resolution,
            replacementDriverId,
            compensation,
        });
        res.json({ incident });
    } catch (err) {
        // Lỗi đã mang sẵn mã HTTP từ tầng dưới (vd requireMoney kiểm số tiền) thì dùng
        // thẳng — đoán mã bằng cách dò chữ trong câu tiếng Việt chỉ đúng với câu đã biết.
        const known = err.statusCode || err.status;
        if (known) return res.status(known).json({ error: err.message });
        const code = err.message.includes('không tồn tại') ? 404
            : err.message.includes('không hợp lệ') || err.message.includes('Cần ghi rõ') ? 400
            : 500;
        res.status(code).json({ error: err.message });
    }
};

// ─── POST /api/incidents/:id/cancel-shipment  (coordinator/manager) ──────────
// Outcome duy nhất hỗ trợ cho sự cố cargo_damage: hủy dứt điểm chuyến gắn với sự cố
// (cho phép hủy dù đã lấy hàng), đồng thời tự đóng sự cố và tính lại trạng thái đơn.

const cancelDamagedShipment = async (req, res) => {
    try {
        const incidentId = Number(req.params.id);
        const coordinatorId = req.user.userId;
        if (!incidentId) return res.status(400).json({ error: 'ID không hợp lệ' });

        const { reason } = req.body;
        const result = await incidentService.cancelDamagedShipment(incidentId, coordinatorId, { reason });
        // Nói rõ ra khi việc hủy này sinh phiếu hoàn tiền ứng trước — coordinator cần biết
        // đơn vừa phát sinh một khoản phải chi, không chỉ là "đã hủy xong".
        const message = result.refund
            ? `Đã hủy chuyến do hàng hóa hư hại. Đơn còn ${money(Number(result.refund.amount))} tiền khách ứng trước — đã tạo phiếu hoàn #${result.refund.voucherId} cho kế toán chi.`
            : 'Đã hủy chuyến do hàng hóa hư hại';
        res.json({ message, ...result });
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404
            : err.message.includes('hoàn thành hoặc đã hủy') ? 409
            : err.message.includes('bắt buộc') || err.message.includes('Chỉ áp dụng') ? 400
            : 500;
        res.status(code).json({ error: err.message });
    }
};

// GET /api/incidents/shipment/:shipmentId  (driver — incidents của 1 chuyến)
const getShipmentIncidents = async (req, res) => {
    try {
        const shipmentId = Number(req.params.shipmentId);
        if (!shipmentId) return res.status(400).json({ error: 'shipmentId không hợp lệ' });
        const incidents = await incidentService.getShipmentIncidents(shipmentId, req.user.userId);
        res.json({ incidents });
    } catch (err) {
        const code = err.message.includes('quyền') ? 403
            : err.message.includes('không tồn tại') ? 404 : 500;
        res.status(code).json({ error: err.message });
    }
};

// PATCH /api/incidents/:id  (driver — tự sửa sự cố của mình khi còn open)
const updateMyIncident = async (req, res) => {
    try {
        const incidentId = Number(req.params.id);
        if (!incidentId) return res.status(400).json({ error: 'ID không hợp lệ' });
        const { severityLevel, description, location } = req.body;
        const incident = await incidentService.updateMyIncident(incidentId, req.user.userId, {
            severityLevel, description, location,
        });
        res.json({ incident });
    } catch (err) {
        const code = err.message.includes('quyền') ? 403
            : err.message.includes('không tồn tại') ? 404
            : err.message.includes('trạng thái') ? 422 : 400;
        res.status(code).json({ error: err.message });
    }
};

module.exports = {
    createIncident, createIncidentByStaff, getMyCounts, getMyIncidents, getIncidentDetail,
    getShipmentIncidents, updateMyIncident, updateIncidentStatus, cancelDamagedShipment,
};
