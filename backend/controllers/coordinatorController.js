const coordinatorService = require('../services/coordinatorService');

const listVehicleGroups = async (_req, res) => {
  try {
    const vehicleGroups = await coordinatorService.listVehicleGroups();
    res.json({ vehicleGroups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const importExcel = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Vui lòng upload file Excel' });
    }

    const result = await coordinatorService.importExcel(req.user.userId, req.file.buffer);
    res.json({ message: 'Import Excel thành công', ...result });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
};

// GET /api/coordinator/receipt-requests?status=pending
const getReceiptRequests = async (req, res) => {
    try {
        const { status } = req.query;
        const rows = await coordinatorService.getReceiptRequests({ status: status || null });
        res.json({ requests: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/coordinator/receipt-requests/:id/approve
// Body: { payment_type, amount, notes?, qr_code_data? }
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

module.exports = { importExcel, listVehicleGroups, getReceiptRequests, approveReceiptRequest, rejectReceiptRequest };
