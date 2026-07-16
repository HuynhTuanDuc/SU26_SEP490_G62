const coordinatorService = require('../services/coordinatorService');
const expenseRepository  = require('../repositories/expenseRepository');
const { validateExpenseReceipt } = require('../services/expenseAiValidator');

const listVehicleGroups = async (_req, res) => {
  try {
    const vehicleGroups = await coordinatorService.listVehicleGroups();
    res.json({ vehicleGroups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const listPartners = async (_req, res) => {
  try {
    const partners = await coordinatorService.listPartners();
    res.json({ partners });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getIncidents = async (req, res) => {
    try {
        const { status, severity_level, search, sort, page, limit } = req.query;
        const result = await coordinatorService.getIncidents({
            status: status || null,
            severityLevel: severity_level || null,
            search: search || '',
            sort: sort || 'newest',
            page: page,
            limit: limit,
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/coordinator/receipt-requests?status=pending
const getReceiptRequests = async (req, res) => {
    try {
        const { status, kind, search, dateFrom, dateTo, sort, page, limit } = req.query;
        const result = await coordinatorService.getReceiptRequests({
            status: status || null,
            kind: kind || 'all',
            search: search || '',
            dateFrom: dateFrom || '',
            dateTo: dateTo || '',
            sort: sort || null,
            page: page,
            limit: limit,
        });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/coordinator/receipt-requests/:id
const getReceiptRequestDetail = async (req, res) => {
    try {
        const requestId = Number(req.params.id);
        if (!requestId) return res.status(400).json({ error: 'Request ID không hợp lệ' });
        const detail = await coordinatorService.getReceiptRequestDetail(requestId);
        res.json(detail);
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404 : 500;
        res.status(code).json({ error: err.message });
    }
};

// POST /api/coordinator/receipt-requests/:id/approve
// Body: { notes?, expenses?[] }
const approveReceiptRequest = async (req, res) => {
    try {
        const requestId = Number(req.params.id);
        if (!requestId) return res.status(400).json({ error: 'Request ID không hợp lệ' });
        const receipt = await coordinatorService.approveReceiptRequest(
            requestId, req.user.userId, req.body,
        );
        res.status(201).json({ message: 'Đã tạo phiếu thu thành công', receipt });
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404
            : err.message.includes('đã được duyệt') || err.message.includes('đã bị từ chối') ? 409
            : err.message.includes('không hợp lệ') || err.message.includes('lớn hơn 0') ? 422
            : 500;
        res.status(code).json({ error: err.message });
    }
};

// POST /api/coordinator/receipt-requests/:id/reject
// Body: { notes? }
const rejectReceiptRequest = async (req, res) => {
    try {
        const requestId = Number(req.params.id);
        if (!requestId) return res.status(400).json({ error: 'Request ID không hợp lệ' });
        await coordinatorService.rejectReceiptRequest(requestId, req.user.userId, req.body);
        res.json({ message: 'Đã từ chối yêu cầu phiếu thu' });
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404
            : err.message.includes('đã được') ? 409
            : 500;
        res.status(code).json({ error: err.message });
    }
};

const scanReceiptExpenses = async (req, res) => {
    try {
        const requestId = Number(req.params.id);
        if (!requestId) return res.status(400).json({ error: 'Request ID không hợp lệ' });

        const detail = await coordinatorService.getReceiptRequestDetail(requestId);
        if (!detail) return res.status(404).json({ error: 'Không tìm thấy yêu cầu phiếu thu' });

        // Gom tất cả expenses từ các shipment
        const allExpenses = (detail.shipments || []).flatMap((s) => s.expenses || []);

        // Lọc expense có ảnh hóa đơn
        const toScan = allExpenses.filter((e) => Array.isArray(e.receipt_urls) && e.receipt_urls.length > 0);

        // OCR song song
        const results = await Promise.all(
            toScan.map(async (expense) => {
                const imageUrl = expense.receipt_urls[0];
                try {
                    const result = await validateExpenseReceipt(imageUrl, { amount: expense.amount, expenseType: expense.expense_type });
                    return {
                        expense_id:        expense.id,
                        valid:             result.valid,
                        reject_reason:     result.reject_reason,
                    };
                } catch {
                    return { expense_id: expense.id, valid: true, reject_reason: null };
                }
            }),
        );

        // Expense không có ảnh → bỏ qua (không scan)
        const noImageIds = allExpenses
            .filter((e) => !Array.isArray(e.receipt_urls) || e.receipt_urls.length === 0)
            .map((e) => ({ expense_id: e.id, valid: null, reject_reason: null }));

        res.json({ results: [...results, ...noImageIds] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PATCH /api/coordinator/expenses/:id/approve
const approveExpense = async (req, res) => {
    try {
        const expenseId = Number(req.params.id);
        if (!expenseId) return res.status(400).json({ error: 'Expense ID không hợp lệ' });
        const expenseService = require('../services/expenseService');
        const expense = await expenseService.approveExpense(expenseId, req.user.userId);
        res.json({ message: 'Đã duyệt chi phí', expense });
    } catch (err) {
        const code = err.message.includes('Không tìm thấy') ? 404 : 500;
        res.status(code).json({ error: err.message });
    }
};

// PATCH /api/coordinator/expenses/:id/reject  Body: { reason? }
const rejectExpense = async (req, res) => {
    try {
        const expenseId = Number(req.params.id);
        if (!expenseId) return res.status(400).json({ error: 'Expense ID không hợp lệ' });
        const expenseService = require('../services/expenseService');
        const expense = await expenseService.rejectExpense(expenseId, req.user.userId, req.body?.reason);
        res.json({ message: 'Đã từ chối chi phí', expense });
    } catch (err) {
        const code = err.message.includes('Không tìm thấy') ? 404 : 500;
        res.status(code).json({ error: err.message });
    }
};

// PATCH /api/coordinator/trips/:id/cancel  Body: { reason }
const cancelShipment = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        if (!shipmentId) return res.status(400).json({ error: 'Shipment ID không hợp lệ' });
        const updated = await coordinatorService.cancelShipment(shipmentId, req.body?.reason, req.user.userId);
        res.json({ message: 'Đã hủy chuyến', shipment: updated });
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404
            : err.message.includes('bắt buộc') || err.message.includes('không thể') ? 422
            : 500;
        res.status(code).json({ error: err.message });
    }
};

// PATCH /api/coordinator/trips/:id/reassign  Body: { toDriverId }
const reassignShipment = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        if (!shipmentId) return res.status(400).json({ error: 'Shipment ID không hợp lệ' });
        const updated = await coordinatorService.reassignShipment(shipmentId, { toDriverId: req.body?.toDriverId }, req.user.userId);
        res.json({ message: 'Đã điều chuyển chuyến', shipment: updated });
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404
            : err.message.includes('bắt buộc') || err.message.includes('phải khác') || err.message.includes('vui lòng') || err.message.includes('chưa') ? 422
            : 500;
        res.status(code).json({ error: err.message });
    }
};

const getDashboard = async (_req, res) => {
    try {
        const dashboard = await coordinatorService.getDashboard();
        res.json(dashboard);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    listVehicleGroups,
    getDashboard,
    listPartners,
    getIncidents,
    getReceiptRequests,
    getReceiptRequestDetail,
    approveReceiptRequest,
    rejectReceiptRequest,
    scanReceiptExpenses,
    approveExpense,
    rejectExpense,
    cancelShipment,
    reassignShipment,
};
