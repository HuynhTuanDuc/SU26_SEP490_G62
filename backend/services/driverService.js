const driverRepository = require('../repositories/driverRepository');
const vehicleManagementRepository = require('../repositories/vehicleManagementRepository');
const notificationService = require('./notificationService');
const notificationGateway = require('./notificationGateway');
const { notifyRolesSafe } = require('./roleNotificationService');
// Gọi qua object (không destructure) để test thay được hàm kiểm tra — helper mock
// của repo swap property trên module object.
const receiptValidationService = require('./receiptValidationService');
const { requireMoney } = require('../utils/money');

const createError = (message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

// Chi phi bao duong tai xe khai. Trước đây dùng `Number()` trần nên "500.000" thành 500:
// tài xế khai đúng số trên hoá đơn mà hệ thống ghi năm trăm đồng, rồi chốt đối chiếu
// ảnh-với-số tiền lại chặn họ bằng một câu không liên quan tới lỗi thật.
const parsePositiveAmount = (value, fieldName) => requireMoney(value, { field: fieldName });

// Chốt kiểm tra hóa đơn ở bước hoàn tất bảo dưỡng.
//
// Vì sao phải chạy LẠI dù lúc upload đã quét: lúc upload, chi phí có thể chưa được nhập
// (cost = NULL) nên chỉ kiểm tra được "ảnh có phải hóa đơn bảo dưỡng hợp lệ" mà KHÔNG
// so khớp số tiền. Tài xế vì thế có thể up ảnh hóa đơn 200k trước rồi khai 5 triệu —
// vượt rào toàn bộ lớp kiểm tra. Đây là điểm duy nhất biết cả ảnh lẫn số tiền cuối cùng.
//
// Lần chạy này KHÔNG gọi lại model: bản đọc của từng ảnh đã được lưu ở bước upload và
// được dùng lại, chỉ có phép đối chiếu số tiền là mới.
//
// Chỉ CHẶN khi verdict là `rejected`. Còn `needs_review` (ảnh mờ một phần, dòng chưa
// phân loại được, model lỗi/timeout) thì cho đi tiếp và trả về để báo cho người duyệt —
// không chặn cứng tài xế vì sự cố hạ tầng, nhưng cũng không để khoản đó lọt khỏi tầm mắt.
const assertMaintenanceCostMatchesBills = async (cost, billPics, record) => {
    // Lịch sử chi phí của chính chiếc xe. Lỗi tra cứu chỉ làm mất một lớp CẢNH BÁO,
    // không được làm hỏng cả bước hoàn tất.
    let costHistory = [];
    try {
        costHistory = await vehicleManagementRepository.getMaintenanceCostHistory(record?.vehicle_id, {
            excludeRecordId: record?.id ?? null,
        });
    } catch (err) {
        console.warn('[driverService] Không lấy được lịch sử chi phí bảo dưỡng:', err.message);
    }

    const result = await receiptValidationService.validateMaintenanceBills(billPics, {
        claimedAmount: cost,
        plateNumber: record?.plate_number ?? null,
        windowStart: record?.started_at ?? null,
        entityType: 'maintenance_record',
        entityId: record?.id ?? null,
        profile: 'maintenance',
        costHistory,
        maintenanceType: record?.maintenance_type ?? null,
    });

    if (result.blocked) {
        const err = createError(
            result.reject_reason
            ?? 'Hóa đơn tải lên không hợp lệ. Vui lòng kiểm tra lại số tiền và ảnh hóa đơn.',
            422,
        );
        err.reject_reason = err.message;
        err.invalidBill = true;
        err.receiptReasons = result.reasons;
        throw err;
    }

    return result;
};

const buildMaintenanceVerificationMessage = (vehicle, reviewCount = 0) => {
    const vehicleLabel = vehicle?.plate_number ? `xe ${vehicle.plate_number}` : 'xe vừa bảo dưỡng';
    const base = `Tài xế đã hoàn tất bảo dưỡng ${vehicleLabel}.`;
    // Đưa số điểm cần kiểm ngay vào thông báo: đây là thứ biến trạng thái needs_review
    // thành hành động thật của người duyệt, thay vì một cờ nằm im trong DB.
    return reviewCount > 0
        ? `${base} Có ${reviewCount} điểm cần kiểm tra trên hóa đơn. Vui lòng xem và xác nhận.`
        : `${base} Vui lòng kiểm tra hóa đơn và xác nhận.`;
};

const getAllDrivers = async () => driverRepository.getAllDrivers();

const getDriverVehicle = async (profileId) => driverRepository.getDriverVehicle(profileId);

const getMyAssignmentHistory = async (driverId) =>
    vehicleManagementRepository.getDriverAssignmentHistory(driverId);

const MAINTENANCE_REQUEST_TYPES = ['scheduled', 'repair', 'inspection', 'emergency'];

const requestMaintenance = async (driverId, payload, billUrls = []) => {
    const maintenanceType = payload?.maintenance_type;
    const reason = payload?.reason?.trim();

    if (!MAINTENANCE_REQUEST_TYPES.includes(maintenanceType)) {
        throw createError('Loại bảo dưỡng không hợp lệ', 400);
    }
    if (!reason) {
        throw createError('Vui lòng nhập lý do yêu cầu bảo dưỡng', 400);
    }

    const vehicle = await driverRepository.getDriverVehicle(driverId);
    if (!vehicle) {
        throw createError('Tài xế chưa được phân công xe', 404);
    }

    let result;
    try {
        result = await vehicleManagementRepository.createMaintenanceRequest({
            vehicleId: vehicle.id,
            driverId,
            maintenanceType,
            reason,
            billPics: billUrls,
        });
    } catch (err) {
        if (err.code === 'OPEN_MAINTENANCE_EXISTS') {
            throw createError('Xe đang có yêu cầu hoặc đợt bảo dưỡng chưa hoàn tất', 409);
        }
        throw err;
    }

    {
        const payload = {
            type: 'manager.vehicles.changed',
            action: 'maintenance_requested',
            vehicleId: vehicle.id,
            maintenanceRecordId: result.maintenanceId,
        };
        notificationGateway.broadcastToRole('manager', payload);
        notificationGateway.broadcastToRole('accountant', payload);
    }

    try {
        const managerIds = await notificationService.getUserIdsByRole('manager');
        if (managerIds.length > 0) {
            await notificationService.createForUsers(managerIds, {
                title: 'Yêu cầu bảo dưỡng xe',
                message: `Tài xế yêu cầu bảo dưỡng xe ${vehicle.plate_number ?? ''}: ${reason}`,
                type: 'MAINTENANCE_REQUESTED',
                entityType: 'vehicle',
                entityId: vehicle.id,
                displayMode: 'alert',
            });
        }
    } catch (err) {
        console.error('[driverService] Không gửi được notification yêu cầu bảo dưỡng:', err.message);
    }

    notifyRolesSafe(['accountant'], {
        title: 'Yêu cầu bảo dưỡng xe',
        message: `Tài xế yêu cầu bảo dưỡng xe ${vehicle.plate_number ?? ''}: ${reason}`,
        type: 'MAINTENANCE_REQUESTED',
        entityType: 'vehicle',
        entityId: vehicle.id,
    }, { displayMode: 'alert', excludeUserId: driverId });

    return { maintenanceRecordId: result.maintenanceId };
};

const listMaintenanceForDriver = async (driverId) => {
    const records = await vehicleManagementRepository.getMaintenanceRecordsForDriver(driverId);
    return records;
};

const uploadMaintenanceBill = async (driverId, vehicleId, billUrl) => {
    const parsedVehicleId = Number(vehicleId);
    if (!Number.isInteger(parsedVehicleId) || parsedVehicleId <= 0) {
        throw createError('vehicle_id must be a positive integer', 400);
    }
    if (!billUrl) {
        throw createError('Bill image is required', 400);
    }

    // Cho phép thêm bill cả khi yêu cầu bảo dưỡng còn chờ duyệt (requested)
    const record = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(
        parsedVehicleId, driverId, undefined, ['requested', 'open'],
    );
    if (!record) {
        throw createError('Open maintenance record for this driver and vehicle was not found', 404);
    }

    // Quét tự động NGAY khi upload — chỉ với ảnh hóa đơn ở bước bảo dưỡng (open),
    // không quét ảnh chứng từ/báo giá lúc còn chờ duyệt (requested). Ảnh vi phạm rõ
    // ràng bị từ chối ngay (422) và KHÔNG được lưu → tài xế phải upload ảnh khác.
    //
    // allowCache = false: ảnh vừa upload xong, chắc chắn chưa có bản đọc nào, tra DB
    // trước chỉ tốn thêm một vòng truy vấn vô ích.
    if (record.status === 'open') {
        const scan = await receiptValidationService.validateReceipt(billUrl, {
            claimedAmount: record.cost,
            // Trần, không phải đích danh: đợt bảo dưỡng có thể còn hóa đơn khác chưa nộp
            // nên chưa được đòi tấm này phải bằng đúng số đã khai.
            claimedAmountMode: 'ceiling',
            plateNumber: record.plate_number,
            windowStart: record.started_at,
            entityType: 'maintenance_record',
            entityId: record.id,
            profile: 'maintenance',
            allowCache: false,
        });
        if (scan.blocked) {
            const err = createError(scan.reject_reason || 'Ảnh hóa đơn không hợp lệ', 422);
            err.reject_reason = scan.reject_reason;
            err.invalidBill = true;
            err.receiptReasons = scan.reasons;
            throw err;
        }
    }

    const currentBillPics = Array.isArray(record.bill_pics) ? record.bill_pics : [];
    const nextBillPics = [...currentBillPics, billUrl];
    await vehicleManagementRepository.updateMaintenanceBillPics(record.id, nextBillPics);

    {
        const payload = {
            type: 'manager.vehicles.changed',
            action: 'maintenance_bill_uploaded',
            vehicleId: parsedVehicleId,
            maintenanceRecordId: record.id,
        };
        notificationGateway.broadcastToRole('manager', payload);
        notificationGateway.broadcastToRole('accountant', payload);
    }

    notifyRolesSafe(['manager', 'accountant'], {
        title: 'Tài xế đã tải hóa đơn bảo dưỡng',
        message: `Tài xế đã tải hóa đơn bảo dưỡng cho xe #${parsedVehicleId}.`,
        type: 'MAINTENANCE_BILL_UPLOADED',
        entityType: 'maintenance_record',
        entityId: record.id,
    }, { displayMode: 'toast', excludeUserId: driverId });

    return { maintenanceRecordId: record.id, bill_pics: nextBillPics };
};

const updateMaintenanceCost = async (driverId, vehicleId, cost) => {
    const parsedVehicleId = Number(vehicleId);
    if (!Number.isInteger(parsedVehicleId) || parsedVehicleId <= 0) {
        throw createError('vehicle_id must be a positive integer', 400);
    }
    // allowZero: bảo dưỡng trong bảo hành thì chi phí bằng 0 là hợp lệ.
    const parsedCost = requireMoney(cost, { field: 'Chi phí bảo dưỡng', allowZero: true });

    const record = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(parsedVehicleId, driverId);
    if (!record) {
        throw createError('Open maintenance record for this driver and vehicle was not found', 404);
    }

    await vehicleManagementRepository.updateMaintenanceCost(record.id, parsedCost);
    return { maintenanceRecordId: record.id, cost: parsedCost };
};

const completeMaintenance = async (driverId, vehicleId, payload) => {
    const parsedVehicleId = Number(vehicleId);
    if (!Number.isInteger(parsedVehicleId) || parsedVehicleId <= 0) {
        throw createError('vehicle_id must be a positive integer', 400);
    }

    const cost = parsePositiveAmount(payload?.cost, 'Chi phí bảo dưỡng');

    const record = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(parsedVehicleId, driverId);
    if (!record) {
        throw createError('Open maintenance record for this driver and vehicle was not found', 404);
    }

    const billPics = Array.isArray(record.bill_pics) ? record.bill_pics : [];
    if (billPics.length === 0) {
        throw createError('At least one maintenance bill image is required before completion', 400);
    }

    const receiptCheck = await assertMaintenanceCostMatchesBills(cost, billPics, record);
    const reviewCount = (receiptCheck?.reasons ?? []).filter((r) => r.severity === 'warning').length;

    await vehicleManagementRepository.completeMaintenanceRecordAndSetStatus({
        vehicleId: parsedVehicleId,
        maintenanceRecordId: record.id,
        driverId,
        billPics,
        performedBy: driverId,
        cost,
    });

    const vehicle = await vehicleManagementRepository.getVehicleById(parsedVehicleId);
    const notificationMessage = buildMaintenanceVerificationMessage(vehicle, reviewCount);

    {
        const payload = {
            type: 'manager.vehicles.changed',
            action: 'maintenance_completed',
            vehicleId: parsedVehicleId,
            maintenanceRecordId: record.id,
            status: vehicle?.status ?? 'maintenance',
        };
        notificationGateway.broadcastToRole('manager', payload);
        notificationGateway.broadcastToRole('accountant', payload);
    }

    notificationGateway.broadcastToRole('manager', {
        type: 'maintenance.completed',
        vehicleId: parsedVehicleId,
        maintenanceRecordId: record.id,
        message: notificationMessage,
    });

    try {
        const managerIds = await notificationService.getUserIdsByRole('manager');
        if (managerIds.length > 0) {
            await notificationService.createForUsers(managerIds, {
                title: 'Tài xế đã hoàn tất bảo dưỡng',
                message: notificationMessage,
                type: 'MAINTENANCE_COMPLETED',
                entityType: 'vehicle',
                entityId: parsedVehicleId,
                displayMode: 'alert',
            });
        }
    } catch {
        // Notification failure must not abort the main flow.
    }

    notifyRolesSafe(['accountant'], {
        title: 'Tài xế đã hoàn tất bảo dưỡng',
        message: notificationMessage,
        type: 'MAINTENANCE_COMPLETED',
        entityType: 'vehicle',
        entityId: parsedVehicleId,
    }, { displayMode: 'alert', excludeUserId: driverId });

    return {
        maintenanceRecordId: record.id,
        receipt_verdict: receiptCheck?.verdict ?? 'needs_review',
        receipt_reasons: receiptCheck?.reasons ?? [],
    };
};

module.exports = {
    getAllDrivers,
    getDriverVehicle,
    getMyAssignmentHistory,
    requestMaintenance,
    listMaintenanceForDriver,
    uploadMaintenanceBill,
    updateMaintenanceCost,
    completeMaintenance,
};
