const coordinatorService = require('../services/coordinatorService');
const expenseRepository  = require('../repositories/expenseRepository');
const receiptValidationService = require('../services/receiptValidationService');
const { validDate, sendError } = require('../utils/accountantValidate');
const { money } = require('../utils/formatNumber');

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
            dateFrom: validDate(dateFrom, 'Ngày bắt đầu') || '',
            dateTo:   validDate(dateTo, 'Ngày kết thúc') || '',
            sort: sort || null,
            page: page,
            limit: limit,
        });
        res.json(result);
    } catch (err) {
        return sendError(res, err);
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
// Body: { notes?, expenses?[], priceOverride? } — priceOverride chốt giá cước khác gợi ý km×đơn giá
const approveReceiptRequest = async (req, res) => {
    try {
        const requestId = Number(req.params.id);
        if (!requestId) return res.status(400).json({ error: 'Request ID không hợp lệ' });
        const receipt = await coordinatorService.approveReceiptRequest(
            requestId, req.user.userId, req.body,
        );
        // Khách ứng dư thì việc duyệt này vừa sinh ra một khoản PHẢI CHI — nói thẳng ra,
        // đừng để coordinator chỉ thấy "đã tạo phiếu thu" rồi tưởng đơn đã khép lại.
        const message = receipt.refund
            ? `Đã tạo phiếu thu. Khách ứng dư ${money(Number(receipt.refund.amount))} — đã tạo phiếu hoàn #${receipt.refund.voucherId} để kế toán chi trả lại toàn bộ.`
            : 'Đã tạo phiếu thu thành công';
        res.status(201).json({ message, receipt });
    } catch (err) {
        // Lỗi đã mang sẵn mã HTTP từ tầng dưới (vd requireMoney kiểm số tiền) thì dùng
        // thẳng — đoán mã bằng cách dò chữ trong câu tiếng Việt chỉ đúng với câu đã biết.
        const known = err.statusCode || err.status;
        if (known) return res.status(known).json({ error: err.message });
        const code = err.message.includes('không tồn tại') ? 404
            : err.message.includes('đã được duyệt') || err.message.includes('đã bị từ chối') ? 409
            : err.message.includes('không hợp lệ') || err.message.includes('lớn hơn 0')
                || err.message.includes('chưa được xác nhận') || err.message.includes('chưa có số km')
                || err.message.includes('chưa duyệt hoặc từ chối') ? 422
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

        // Đọc song song. `profile` là loại chi phí đang khai — nó quyết định hạng mục
        // nào được coi là đúng chủ đề, nên hóa đơn xăng hợp lệ khi khai vào 'fuel' và
        // bị từ chối khi khai vào 'maintenance'. Trước đây expenseType được nhận vào
        // rồi bỏ không dùng, tức không hề kiểm tra hóa đơn có đúng loại chi phí hay không.
        const results = await Promise.all(
            toScan.map(async (expense) => {
                const imageUrl = expense.receipt_urls[0];
                try {
                    const result = await receiptValidationService.validateReceipt(imageUrl, {
                        claimedAmount: expense.amount,
                        profile: expense.expense_type,
                        entityType: 'expense',
                        entityId: expense.id,
                    });
                    return {
                        expense_id:    expense.id,
                        // `valid` giữ nguyên cho FE cũ: chỉ `rejected` mới là không hợp lệ.
                        valid:         !result.blocked,
                        verdict:       result.verdict,
                        reject_reason: result.reject_reason,
                        // Cảnh báo để người duyệt biết cần nhìn gì, không dùng để chặn.
                        warnings:      result.reasons.filter((r) => r.severity === 'warning'),
                        receipt_total: result.receipt_total,
                        line_items:    result.items,
                    };
                } catch (err) {
                    // Sự cố ở đây KHÔNG được thành "hợp lệ" một cách im lặng như trước:
                    // đánh dấu cần người xem để khoản đó không lọt khỏi tầm mắt.
                    console.warn('[coordinator] Không kiểm tra được hóa đơn:', err.message);
                    return {
                        expense_id: expense.id,
                        valid: true,
                        verdict: 'needs_review',
                        reject_reason: null,
                        warnings: [{
                            code: 'EXTRACTION_FAILED', severity: 'warning',
                            message: 'Không kiểm tra tự động được hóa đơn này. Vui lòng kiểm tra bằng mắt.',
                        }],
                    };
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
// PATCH /api/coordinator/expenses/:id/unapprove — gỡ duyệt để tài xế khai lại
const unapproveExpense = async (req, res) => {
    try {
        const expenseId = Number(req.params.id);
        if (!expenseId) return res.status(400).json({ error: 'Expense ID không hợp lệ' });
        const expenseService = require('../services/expenseService');
        const expense = await expenseService.unapproveExpense(
            expenseId, req.user.userId, req.body?.reason, req.user.role,
        );
        res.json({ message: 'Đã gỡ duyệt chi phí — tài xế có thể sửa lại', expense });
    } catch (err) {
        const [maybeCode, ...rest] = String(err.message).split(':');
        if (maybeCode === 'REASON_REQUIRED' || maybeCode === 'FORBIDDEN') {
            return res.status(maybeCode === 'FORBIDDEN' ? 403 : 422)
                .json({ error: rest.join(':').trim(), code: maybeCode });
        }
        const code = err.message.includes('Không gỡ duyệt được') ? 409 : 500;
        res.status(code).json({ error: err.message });
    }
};

// GET /api/coordinator/assignable-vehicles?order_id=123
// Xe đang SẴN SÀNG nhận chuyến — không lọc theo nhóm xe, vì gán xe khác nhóm là hợp lệ.
const listAssignableVehicles = async (req, res) => {
    try {
        const vehicles = await coordinatorService.listAssignableVehicles({
            excludeOrderId: req.query?.order_id ? Number(req.query.order_id) : null,
        });
        res.json({ vehicles });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/coordinator/orders/:id/assign-driver
// Body: { shipment_ids: [], driver_id, vehicle_id? }
// Gán trước nhiều chuyến của CÙNG đơn cho 1 tài xế (chạy tuần tự).
// vehicle_id tùy chọn — bỏ trống thì dùng xe biên chế của tài; truyền vào thì dùng đúng
// xe đó, kể cả khác nhóm xe ghi trong đơn (cước vẫn tính theo nhóm của đơn).
const assignOrderShipments = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!orderId) return res.status(400).json({ error: 'Order ID không hợp lệ' });

        const result = await coordinatorService.assignOrderShipments(orderId, {
            shipmentIds: req.body?.shipment_ids,
            driverId: req.body?.driver_id,
            vehicleId: req.body?.vehicle_id ?? null,
        }, req.user.userId);

        const count = result.assignedShipmentIds.length;
        res.json({ message: `Đã gán ${count} chuyến cho tài xế`, ...result });
    } catch (err) {
        const code = err.message.includes('không tồn tại') || err.message.includes('đã bị khóa') ? 404
            : err.message.includes('chỉ gán được') || err.message.includes('đã được tài xế khác')
                || err.message.includes('đang vướng chuyến') || err.message.includes('đang chạy chuyến')
                || err.message.includes('không sẵn sàng') || err.message.includes('đang trong bảo trì')
                || err.message.includes('phụ trách bảo trì') ? 409
            : err.message.includes('bắt buộc') || err.message.includes('không hợp lệ')
                || err.message.includes('Phải chọn') || err.message.includes('không thuộc')
                || err.message.includes('vui lòng chọn xe') ? 400
            : err.message.includes('chưa nhập km') ? 422
            : 500;
        res.status(code).json({ error: err.message });
    }
};

// POST /api/coordinator/trips/:id/resolve-failed
// Body: { action: 'redeliver' | 'return' }
// 'return' → chuyến tính GẤP ĐÔI cước (tài chạy cả hai chiều)
const resolveFailedShipment = async (req, res) => {
    try {
        const shipmentId = Number(req.params.id);
        if (!shipmentId) return res.status(400).json({ error: 'Shipment ID không hợp lệ' });

        const shipment = await coordinatorService.resolveFailedShipment(shipmentId, {
            action: req.body?.action,
        }, req.user.userId);

        const message = req.body?.action === 'redeliver'
            ? 'Đã cho giao lại chuyến'
            : 'Đã chuyển chuyến sang hoàn hàng — chuyến này tính gấp đôi cước';
        res.json({ message, shipment });
    } catch (err) {
        const code = err.message.includes('không tồn tại') ? 404
            : err.message.includes('Chỉ xử lý được') ? 409
            : err.message.includes('phải là') || err.message.includes('không hợp lệ')
                || err.message.includes('lớn hơn 0') ? 400
            : 500;
        res.status(code).json({ error: err.message });
    }
};

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
    listAssignableVehicles,
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
    unapproveExpense,
    cancelShipment,
    reassignShipment,
    assignOrderShipments,
    resolveFailedShipment,
};
