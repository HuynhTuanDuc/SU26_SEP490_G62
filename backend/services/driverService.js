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
const assertMaintenanceCostMatchesBills = async (cost, billPics, record, { deadlineAt = null } = {}) => {
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
        deadlineAt,
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
            // Ảnh chụp lúc yêu cầu là chứng từ/báo giá, KHÔNG phải hóa đơn — cột riêng, không
            // bao giờ bị chấm như hóa đơn ở bước hoàn tất.
            requestPics: billUrls,
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

// Các câu dưới đây hiện NGUYÊN VĂN trên app tài xế (Alert) — phải là tiếng Việt.
const MAINTENANCE_NOT_OPEN_MESSAGE = 'Không tìm thấy đợt bảo dưỡng đang mở của bạn cho xe này.';
const MAINTENANCE_ALREADY_SUBMITTED_MESSAGE = 'Đợt bảo dưỡng này đã được gửi duyệt. Vui lòng tải lại màn hình.';

const parseVehicleId = (vehicleId) => {
    const parsed = Number(vehicleId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw createError('Mã xe không hợp lệ', 400);
    }
    return parsed;
};

// Hạn trả lời cho request đang chạy. `receivedAt` là lúc request TỚI máy chủ (app.js),
// nên hạn này bao luôn đoạn đẩy ảnh lên Cloudinary — đoạn dài nhất và co giãn nhất khi
// sóng yếu. Không có nó thì tài xế chờ (tải ảnh) + (trần quét), vượt hạn chờ của app.
const scanDeadline = (receivedAt) => (receivedAt ?? Date.now()) + receiptValidationService.RESPONSE_BUDGET_MS;

const uploadMaintenanceBill = async (driverId, vehicleId, billUrl, { receivedAt = null } = {}) => {
    const parsedVehicleId = parseVehicleId(vehicleId);
    if (!billUrl) {
        throw createError('Thiếu ảnh hóa đơn', 400);
    }

    // Cho phép thêm bill cả khi yêu cầu bảo dưỡng còn chờ duyệt (requested)
    const record = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(
        parsedVehicleId, driverId, undefined, ['requested', 'open'],
    );
    if (!record) {
        throw createError(MAINTENANCE_NOT_OPEN_MESSAGE, 404);
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
            deadlineAt: scanDeadline(receivedAt),
        });
        if (scan.blocked) {
            const err = createError(scan.reject_reason || 'Ảnh hóa đơn không hợp lệ', 422);
            err.reject_reason = scan.reject_reason;
            err.invalidBill = true;
            err.receiptReasons = scan.reasons;
            throw err;
        }
    }

    // Thêm NGUYÊN TỬ và chỉ khi đợt vẫn ở đúng trạng thái đã quyết định việc quét ở trên.
    // Lượt quét vừa rồi có thể mất vài chục giây, và app không khoá nút "Hoàn thành" trong
    // lúc đó. Đã tái hiện với kiểu cũ (đọc mảng → quét → ghi đè cả mảng): tài xế bấm hoàn
    // tất giữa chừng → ảnh này lẻn vào đợt ĐÃ gửi duyệt mà chưa hề qua đối chiếu số tiền.
    //
    // Lúc còn chờ duyệt (requested) ảnh là chứng từ/báo giá → request_pics; ở bước bảo dưỡng
    // (open) ảnh là hóa đơn đã qua quét → bill_pics.
    let appended = null;
    try {
        appended = await vehicleManagementRepository.appendMaintenanceBill(record.id, billUrl, {
            expectedStatus: record.status,
            column: record.status === 'open' ? 'bill_pics' : 'request_pics',
        });
    } finally {
        // Ảnh đã quét (có dòng vết) mà không vào được đợt: thả dòng vết ra. Không thả thì
        // lần sau tài xế tải lại đúng tờ hóa đơn này sẽ bị chặn "ảnh đã tải lên rồi" — bởi
        // chính lần tải không thành này. Controller xoá tệp trên Cloudinary.
        if (!appended && record.status === 'open') {
            await receiptValidationService.releaseReceipts('maintenance_record', record.id, {
                imageUrl: billUrl, reason: 'not_attached',
            });
        }
    }
    if (!appended) {
        throw createError(
            'Đợt bảo dưỡng vừa được gửi duyệt hoặc đổi trạng thái nên ảnh này chưa được thêm. '
            + 'Vui lòng tải lại màn hình rồi thử lại.',
            409,
        );
    }

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

    return { maintenanceRecordId: record.id, bill_pics: appended.bill_pics, request_pics: appended.request_pics };
};

/**
 * Tài xế xoá MỘT ảnh đã tải — chụp nhầm, chọn nhầm, hoặc muốn thay bằng ảnh khác.
 *
 * Trước đây không có đường nào gỡ ảnh: chụp nhầm là ảnh đó nằm lại trong đợt, và bước hoàn
 * tất buộc phải nới lỏng để khỏi đẩy tài xế vào bế tắc — nên ảnh sai vẫn lọt tới bàn duyệt.
 *
 * Chỉ xoá được khi đợt chưa gửi duyệt. Ảnh hóa đơn đã quét thì dòng vết được thả ra với lý
 * do 'removed': tài xế tải lại đúng tờ đó (chụp rõ hơn) không bị chặn "đã tải lên rồi", mà
 * cũng không bị gắn cảnh báo vô cớ.
 */
const removeMaintenancePhoto = async (driverId, vehicleId, photoUrl) => {
    const parsedVehicleId = parseVehicleId(vehicleId);
    if (!photoUrl) {
        throw createError('Thiếu đường dẫn ảnh cần xoá', 400);
    }

    const record = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(
        parsedVehicleId, driverId, undefined, ['requested', 'open'],
    );
    if (!record) {
        throw await notOpenError(parsedVehicleId, driverId);
    }

    const removed = await vehicleManagementRepository.removeMaintenancePhoto(record.id, photoUrl, {
        statuses: ['requested', 'open'],
    });
    if (!removed) {
        throw createError('Không tìm thấy ảnh này trong đợt bảo dưỡng — có thể đã được xoá. Vui lòng tải lại màn hình.', 404);
    }
    if (removed.was_bill) {
        await receiptValidationService.releaseReceipts('maintenance_record', record.id, {
            imageUrl: photoUrl, reason: 'removed',
        });
    }

    notificationGateway.broadcastToRole('manager', {
        type: 'manager.vehicles.changed',
        action: 'maintenance_bill_removed',
        vehicleId: parsedVehicleId,
        maintenanceRecordId: record.id,
    });

    return { maintenanceRecordId: record.id, bill_pics: removed.bill_pics, request_pics: removed.request_pics };
};

// Không còn đợt 'open' thường là vì chính tài xế vừa gửi duyệt (bấm hai lần, hoặc app hết
// thời gian chờ trong khi máy chủ vẫn hoàn tất). Nói "không tìm thấy" lúc đó là sai sự thật.
const notOpenError = async (vehicleId, driverId) => {
    const submitted = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(
        vehicleId, driverId, undefined, ['pending_verification'],
    );
    return submitted
        ? createError(MAINTENANCE_ALREADY_SUBMITTED_MESSAGE, 409)
        : createError(MAINTENANCE_NOT_OPEN_MESSAGE, 404);
};

const updateMaintenanceCost = async (driverId, vehicleId, cost) => {
    const parsedVehicleId = parseVehicleId(vehicleId);
    // allowZero: bảo dưỡng trong bảo hành thì chi phí bằng 0 là hợp lệ.
    const parsedCost = requireMoney(cost, { field: 'Chi phí bảo dưỡng', allowZero: true });

    const record = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(parsedVehicleId, driverId);
    if (!record) {
        throw await notOpenError(parsedVehicleId, driverId);
    }

    await vehicleManagementRepository.updateMaintenanceCost(record.id, parsedCost);
    return { maintenanceRecordId: record.id, cost: parsedCost };
};

/** Phần của kết quả đối chiếu cả đợt đáng lưu lại cho màn duyệt của quản lý. */
const summarizeReceiptCheck = (result) => ({
    verdict: result?.verdict ?? 'needs_review',
    reasons: result?.reasons ?? [],
    receipt_total: result?.receipt_total ?? null,
    confidence: result?.confidence ?? null,
    checked_at: new Date().toISOString(),
});

const completeMaintenance = async (driverId, vehicleId, payload, { receivedAt = null } = {}) => {
    const parsedVehicleId = parseVehicleId(vehicleId);

    const cost = parsePositiveAmount(payload?.cost, 'Chi phí bảo dưỡng');

    const record = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(parsedVehicleId, driverId);
    if (!record) {
        throw await notOpenError(parsedVehicleId, driverId);
    }

    const billPics = Array.isArray(record.bill_pics) ? record.bill_pics : [];
    if (billPics.length === 0) {
        // Ảnh gửi kèm yêu cầu (request_pics) là chứng từ/báo giá, không thay cho hóa đơn.
        throw createError('Cần ít nhất một ảnh hóa đơn thanh toán (chụp ở bước bảo dưỡng) trước khi hoàn tất', 400);
    }

    const receiptCheck = await assertMaintenanceCostMatchesBills(cost, billPics, record, {
        deadlineAt: scanDeadline(receivedAt),
    });
    const reviewCount = (receiptCheck?.reasons ?? []).filter((r) => r.severity === 'warning').length;

    try {
        await vehicleManagementRepository.completeMaintenanceRecordAndSetStatus({
            vehicleId: parsedVehicleId,
            maintenanceRecordId: record.id,
            driverId,
            billPics,
            performedBy: driverId,
            cost,
            // Đúng danh sách ảnh vừa được đối chiếu — repository so lại dưới khoá.
            expectedBillPics: billPics,
            receiptCheck: summarizeReceiptCheck(receiptCheck),
        });
    } catch (err) {
        if (err.code === 'OPEN_MAINTENANCE_NOT_FOUND') {
            throw createError(MAINTENANCE_ALREADY_SUBMITTED_MESSAGE, 409);
        }
        if (err.code === 'MAINTENANCE_BILLS_CHANGED') {
            throw createError(
                'Có ảnh hóa đơn vừa được thêm trong lúc hệ thống kiểm tra. '
                + 'Vui lòng bấm "Hoàn thành bảo dưỡng" lại để kiểm tra đủ mọi ảnh.',
                409,
            );
        }
        throw err;
    }

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
    removeMaintenancePhoto,
    updateMaintenanceCost,
    completeMaintenance,
};
