const vehicleManagementService = require('../services/vehicleManagementService');
const receiptValidationService = require('../services/receiptValidationService');
const receiptChecks = require('../services/receiptChecks');
const vehicleManagementRepository = require('../repositories/vehicleManagementRepository');

// Lý do gắn với MỘT ảnh nhưng chỉ sinh ra ở bước gộp cả đợt — không có trên thẻ của tờ đó.
const RECORD_LEVEL_RECEIPT_CODES = new Set(['SUPPORTING_DOCUMENT', 'DUPLICATE_IMAGE_SAME_RECORD']);

const handleError = (res, err) => {
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) {
        console.error('Vehicle management error:', err);
    }
    res.status(statusCode).json({ error: err.message });
};

const listVehicleGroups = async (req, res) => {
    try {
        // ?include_hidden=1 → màn Quản lý xe thấy cả nhóm đã ẩn để bỏ ẩn lại
        const includeHidden = ['1', 'true', 'yes'].includes(String(req.query.include_hidden || '').toLowerCase());
        const vehicleGroups = await vehicleManagementService.listVehicleGroups({ includeHidden });
        res.json({ vehicleGroups });
    } catch (err) {
        handleError(res, err);
    }
};

const getVehicleGroupDetail = async (req, res) => {
    try {
        const vehicleGroup = await vehicleManagementService.getVehicleGroupDetail(req.params.id);
        res.json({ vehicleGroup });
    } catch (err) {
        handleError(res, err);
    }
};

const createVehicleGroup = async (req, res) => {
    try {
        const vehicleGroup = await vehicleManagementService.createVehicleGroup(req.body);
        res.status(201).json({ message: 'Vehicle group created successfully', vehicleGroup });
    } catch (err) {
        handleError(res, err);
    }
};

const updateVehicleGroup = async (req, res) => {
    try {
        const vehicleGroup = await vehicleManagementService.updateVehicleGroup(req.params.id, req.body);
        res.json({ message: 'Vehicle group updated successfully', vehicleGroup });
    } catch (err) {
        handleError(res, err);
    }
};

const deleteVehicleGroup = async (req, res) => {
    try {
        const result = await vehicleManagementService.deleteVehicleGroup(req.params.id);
        res.json({ message: 'Vehicle group hidden successfully', id: result.id });
    } catch (err) {
        handleError(res, err);
    }
};

const restoreVehicleGroup = async (req, res) => {
    try {
        const vehicleGroup = await vehicleManagementService.restoreVehicleGroup(req.params.id);
        res.json({ message: 'Đã bỏ ẩn nhóm xe', vehicleGroup });
    } catch (err) {
        handleError(res, err);
    }
};

const listVehicles = async (req, res) => {
    try {
        const result = await vehicleManagementService.listVehicles(req.query);
        res.json(result);
    } catch (err) {
        handleError(res, err);
    }
};

const getVehicleDetail = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.getVehicleDetail(req.params.id);
        res.json({ vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const createVehicle = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.createVehicle(req.body, req.user.userId);
        res.status(201).json({ message: 'Vehicle created successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const updateVehicle = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.updateVehicle(req.params.id, req.body, req.user.userId);
        res.json({ message: 'Vehicle updated successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const changeVehicleStatus = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.changeVehicleStatus(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle lifecycle action completed successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const sendVehicleToMaintenance = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.sendVehicleToMaintenance(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle sent to maintenance successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const completeMaintenance = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.completeMaintenance(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle maintenance marked ready for verification', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const verifyMaintenance = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.verifyMaintenance(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle maintenance verified!', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

// GET /api/admin/maintenance/:recordId/receipts
// Máy đã đọc được gì trên từng hóa đơn của đợt bảo dưỡng này — để người duyệt đối chiếu
// bằng dữ liệu thay vì căng mắt vào ảnh.
const getMaintenanceReceipts = async (req, res) => {
    try {
        const recordId = Number(req.params.recordId);
        if (!Number.isInteger(recordId) || recordId <= 0) {
            return res.status(400).json({ error: 'Mã đợt bảo dưỡng không hợp lệ' });
        }
        const record = await vehicleManagementRepository.getMaintenanceRecordById(recordId);
        // Chỉ những ảnh ĐANG thuộc đợt. Không truyền thì màn duyệt hiện cả ảnh bị chặn lúc
        // tải lẫn ảnh của lần nộp trước khi bị trả về làm lại.
        const review = await receiptValidationService.getReceiptReview('maintenance_record', recordId, 'maintenance', {
            imageUrls: Array.isArray(record?.bill_pics) ? record.bill_pics : null,
        });

        // Điểm bước hoàn tất đã nêu ở mức CẢ ĐỢT — tổng hóa đơn so với số khai, ảnh chứng từ
        // bị gạt khỏi tổng, ảnh trùng trong đợt. Thông báo gửi quản lý đếm cả những điểm này
        // ("Có N điểm cần kiểm tra") mà trước đây màn duyệt không chỉ ra được. Điểm của từng
        // tờ đã hiện trên thẻ của tờ đó nên không lặp lại ở đây.
        const completionReasons = Array.isArray(record?.receipt_check?.reasons) ? record.receipt_check.reasons : [];
        let recordChecks = completionReasons.filter((r) => r.code !== 'COST_OUTLIER'
            && (r.image_index === undefined || RECORD_LEVEL_RECEIPT_CODES.has(r.code)));

        // Cảnh báo ở mức CẢ ĐỢT, không thuộc tờ hóa đơn nào: chi phí có bất thường so
        // với lịch sử chính chiếc xe đó không. Tính tươi mỗi lần mở màn thay vì lưu sẵn
        // — lịch sử xe dài thêm theo thời gian nên kết luận cũ có thể đã lạc hậu.
        if (record?.cost) {
            try {
                const history = await vehicleManagementRepository.getMaintenanceCostHistory(record.vehicle_id, {
                    excludeRecordId: recordId,
                });
                const { costs, scopeLabel } = receiptChecks.pickComparableCosts(history, record.maintenance_type);
                recordChecks = [...recordChecks, ...receiptChecks.checkCostOutlier(record.cost, costs, { scopeLabel })];
            } catch (err) {
                console.warn('[vehicleManagement] Không tính được cảnh báo chi phí bất thường:', err.message);
            }
        }

        res.json({
            ...review,
            record: record
                ? { id: record.id, cost: Number(record.cost), maintenance_type: record.maintenance_type, plate_number: record.plate_number }
                : null,
            record_checks: recordChecks,
        });
    } catch (err) {
        handleError(res, err);
    }
};

// POST /api/admin/receipt-extractions/:id/review
// Body: { action: 'agree'|'override_accept'|'override_reject', note?, learn_keywords?: [...] }
//
// Ghi đè của người duyệt là dữ liệu quý nhất ở đây: nó vừa là vết kiểm toán, vừa là
// tín hiệu máy sai, vừa là nguồn nuôi từ điển hạng mục.
const reviewReceiptExtraction = async (req, res) => {
    try {
        const extractionId = Number(req.params.id);
        if (!Number.isInteger(extractionId) || extractionId <= 0) {
            return res.status(400).json({ error: 'Mã bản ghi đọc hóa đơn không hợp lệ' });
        }
        const result = await receiptValidationService.submitReceiptReview(extractionId, req.user.userId, {
            action: req.body?.action,
            note: req.body?.note,
            learnKeywords: req.body?.learn_keywords,
        });
        res.json({ message: 'Đã ghi nhận kết quả kiểm tra hóa đơn', ...result });
    } catch (err) {
        handleError(res, err);
    }
};

const rejectMaintenance = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.rejectMaintenance(req.params.id, req.user.userId, req.body);
        const message = req.body?.mode === 'cancel'
            ? 'Đã huỷ bảo dưỡng'
            : 'Đã yêu cầu tài xế làm lại chứng từ bảo dưỡng';
        res.json({ message, vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const markVehicleAsBroken = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.markVehicleAsBroken(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle marked as broken successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const restoreVehicle = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.restoreVehicle(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle restored successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const retireVehicle = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.retireVehicle(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle retired successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const setVehicleDriverAssignment = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.setVehicleDriverAssignment(req.params.id, req.body, req.user.userId);
        res.json({ message: 'Vehicle driver assignment updated successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const softDeleteVehicle = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.softDeleteVehicle(req.params.id, req.user.userId);
        res.json({ message: 'Vehicle retired successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const listAssignableDrivers = async (req, res) => {
    try {
        const drivers = await vehicleManagementService.listAssignableDrivers(req.query.vehicle_id ?? null);
        res.json({ drivers });
    } catch (err) {
        handleError(res, err);
    }
};

const getVehicleAssignmentHistory = async (req, res) => {
    try {
        const history = await vehicleManagementService.getVehicleAssignmentHistory(req.params.id);
        res.json({ history });
    } catch (err) {
        handleError(res, err);
    }
};

const listMaintenanceRequests = async (req, res) => {
    try {
        const requests = await vehicleManagementService.listMaintenanceRequests();
        res.json({ requests });
    } catch (err) {
        handleError(res, err);
    }
};

const approveMaintenanceRequest = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.approveMaintenanceRequest(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Đã duyệt yêu cầu bảo dưỡng', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const rejectMaintenanceRequest = async (req, res) => {
    try {
        await vehicleManagementService.rejectMaintenanceRequest(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Đã từ chối yêu cầu bảo dưỡng' });
    } catch (err) {
        handleError(res, err);
    }
};

module.exports = {
    getMaintenanceReceipts,
    reviewReceiptExtraction,
    listVehicleGroups,
    getVehicleGroupDetail,
    createVehicleGroup,
    updateVehicleGroup,
    deleteVehicleGroup,
    restoreVehicleGroup,
    listVehicles,
    getVehicleDetail,
    createVehicle,
    updateVehicle,
    changeVehicleStatus,
    sendVehicleToMaintenance,
    completeMaintenance,
    verifyMaintenance,
    rejectMaintenance,
    markVehicleAsBroken,
    restoreVehicle,
    retireVehicle,
    setVehicleDriverAssignment,
    softDeleteVehicle,
    listAssignableDrivers,
    listMaintenanceRequests,
    approveMaintenanceRequest,
    rejectMaintenanceRequest,
    getVehicleAssignmentHistory,
};
