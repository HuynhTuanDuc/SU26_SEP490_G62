const driverService = require('../services/driverService');
const { deleteUploadedFile, deleteUploadedUrl } = require('../services/uploadCleanup');

const getMyVehicle = async (req, res) => {
    try {
        const vehicle = await driverService.getDriverVehicle(req.user.userId);
        if (!vehicle) return res.status(404).json({ error: 'Tài xế chưa được phân công xe' });
        res.json({ vehicle });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const getAllDrivers = async (_req, res) => {
    try {
        const drivers = await driverService.getAllDrivers();
        res.json({ drivers });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const requestMaintenance = async (req, res) => {
    try {
        const billUrls = (req.files ?? []).map((f) => f.path);
        const result = await driverService.requestMaintenance(req.user.userId, req.body, billUrls);
        res.status(201).json({ message: 'Đã gửi yêu cầu bảo dưỡng. Chờ quản lý duyệt.', ...result });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const getMyAssignmentHistory = async (req, res) => {
    try {
        const history = await driverService.getMyAssignmentHistory(req.user.userId);
        res.json({ history });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const listMaintenance = async (req, res) => {
    try {
        const records = await driverService.listMaintenanceForDriver(req.user.userId);
        res.json({ records });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const uploadMaintenanceBill = async (req, res) => {
    const billUrl = req.file?.path ?? null;
    const filePublicId = req.file?.filename ?? null;
    try {
        const result = await driverService.uploadMaintenanceBill(
            req.user.userId, req.params.vehicleId, billUrl, { receivedAt: req.receivedAt },
        );
        res.json({ message: 'Maintenance bill uploaded successfully', ...result });
    } catch (err) {
        // Ảnh không hợp lệ hoặc lưu lỗi → xoá ảnh vừa upload, tránh rác trên Cloudinary.
        deleteUploadedFile(filePublicId);
        res.status(err.statusCode || 500).json({
            error: err.message,
            reject_reason: err.reject_reason ?? null,
            invalid_bill: err.invalidBill === true,
        });
    }
};

// DELETE /api/drivers/maintenance/:vehicleId/bills?url=<url ảnh>
// Tài xế gỡ một ảnh chụp nhầm khỏi đợt bảo dưỡng (hóa đơn hoặc ảnh gửi kèm yêu cầu).
const removeMaintenanceBill = async (req, res) => {
    try {
        const url = typeof req.query?.url === 'string' ? req.query.url : null;
        const result = await driverService.removeMaintenancePhoto(req.user.userId, req.params.vehicleId, url);
        // Ảnh đã ra khỏi đợt thì tệp không còn ai tham chiếu. await: Cloud Run bóp CPU ngay
        // khi response đi ra, bắn-rồi-quên thì tệp rác ở lại.
        await deleteUploadedUrl(url);
        res.json({ message: 'Đã xoá ảnh', ...result });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

// PATCH /api/drivers/maintenance/:vehicleId/cost
// Lưu chi phí TRƯỚC khi tải hóa đơn để bước quét lúc upload có số tiền mà đối chiếu
// (nếu không, ảnh nào cũng qua rồi tài xế khai số tuỳ ý sau).
const updateMaintenanceCost = async (req, res) => {
    try {
        const result = await driverService.updateMaintenanceCost(
            req.user.userId, req.params.vehicleId, req.body?.cost,
        );
        res.json({ message: 'Đã lưu chi phí bảo dưỡng', ...result });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const completeMaintenance = async (req, res) => {
    try {
        const result = await driverService.completeMaintenance(
            req.user.userId, req.params.vehicleId, req.body, { receivedAt: req.receivedAt },
        );
        res.json({ message: 'Maintenance marked ready for verification', ...result });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

module.exports = { getAllDrivers, getMyVehicle, getMyAssignmentHistory, requestMaintenance, listMaintenance, uploadMaintenanceBill, removeMaintenanceBill, updateMaintenanceCost, completeMaintenance };
