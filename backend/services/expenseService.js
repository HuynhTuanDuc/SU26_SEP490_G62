const expenseRepository = require('../repositories/expenseRepository');
const reversalService = require('./reversalService');
const tripRepository    = require('../repositories/tripRepository');
const profileRepository = require('../repositories/profileRepository');
const roleRepository    = require('../repositories/roleRepository');
const notificationService = require('./notificationService');
const { ALLOWED_EXPENSE_TYPES, EXPENSE_TYPE_LABEL } = require('../constants/expenseConstants');
const { money } = require('../utils/formatNumber');
const { requireMoney } = require('../utils/money');

// Trạng thái trip cho phép thêm chi phí (chưa kết thúc)
const EXPENSE_ALLOWED_STATUSES = [
    'claimed', 'picking', 'transit', 'arrived', 'failed', 'returning',
];

const createExpense = async (driverId, { shipmentId, expenseType, amount, description, receiptUrl, clientRequestId }) => {
    if (!receiptUrl) throw new Error('Ảnh bằng chứng là bắt buộc');
    if (!expenseType || !ALLOWED_EXPENSE_TYPES.includes(expenseType)) throw new Error('Loại chi phí không hợp lệ');
    // requireMoney thay cho `Number(amount) <= 0`: phép so cũ để NaN lọt qua
    // (NaN <= 0 là false) và Postgres nhận 'NaN' như một NUMERIC hợp lệ.
    const soTien = requireMoney(amount, { field: 'Số tiền' });

    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');

    // Owner hiện tại HOẶC tài từng giữ chuyến (bị điều chuyển giữa đường do sự cố)
    // đều được khai chi phí — tài cũ vẫn có tiền dầu/vé đã ứng ở nửa đầu chuyến
    if (Number(shipment.owner_driver_id) !== Number(driverId)) {
        const wasAssigned = await expenseRepository.wasDriverAssignedToShipment(shipmentId, driverId);
        if (!wasAssigned) throw new Error('Bạn không có quyền thêm chi phí cho chuyến này');
    }
    // Chuyến đang chạy thì khai chi phí bình thường. Chuyến đã kết thúc thì CHỈ mở lại
    // khi yêu cầu phiếu thu của đơn đang bị TỪ CHỐI — đó là lúc hệ thống bắt tài sửa
    // lại, mà điều phối có thể từ chối chính vì THIẾU một khoản (ví dụ thiếu hoá đơn
    // phí bãi). Không mở thì tài chỉ sửa/xoá được khoản cũ, không có đường bổ sung.
    // Tài gửi lại rồi (status 'pending') thì đóng ngay — cùng lý do với sửa/xoá:
    // không để con số đổi dưới tay điều phối đang xem xét.
    if (!EXPENSE_ALLOWED_STATUSES.includes(shipment.status)) {
        const wasRejected = await expenseRepository.hasRejectedReceiptRequest(shipmentId);
        if (!wasRejected) {
            throw new Error('Không thể thêm chi phí khi chuyến đã kết thúc');
        }
    }

    const vehicleId = await tripRepository.getDriverVehicleId(driverId);

    const expense = await expenseRepository.createExpense({
        shipmentId,
        vehicleId,
        driverId,
        expenseType,
        amount: soTien,
        description: description?.trim() || null,
        clientRequestId: clientRequestId || null,
    });

    // App gửi lại đúng thao tác cũ (hàng đợi offline) → bản ghi đã có sẵn, không tạo
    // thêm ảnh đính kèm và không bắn lại thông báo cho điều phối.
    if (expense._daTonTai) {
        delete expense._daTonTai;
        return expense;
    }

    await expenseRepository.addExpenseAttachment(expense.id, receiptUrl);

    // Mọi chi phí đều giữ 'pending', kể cả đơn không thu tiền mặt.
    //
    // Đơn cash: được duyệt TỰ ĐỘNG khi coordinator phát hành phiếu thu
    // (autoApproveOrderExpenses trong approveReceiptRequest).
    //
    // Đơn non-cash: trước đây auto-duyệt ngay lúc tạo để không kẹt 'pending' vĩnh
    // viễn (vì không đi qua luồng phiếu thu). Nhưng 'approved' khoá luôn quyền sửa
    // của tài xế, nên tài gõ sai số tiền là hết đường — đúng bug đã báo. Giờ để
    // 'pending' và coordinator duyệt tay ở màn "Chi phí tài xế"; chi phí pending
    // không còn chặn gì nên cũng không kẹt.
    const driver = await profileRepository.getProfileById(driverId);
    // Chỉ coordinator duyệt chi phí tài xế — Manager không còn vai trò này,
    // màn "Quản lý chi phí" bên Manager chỉ để xem lịch sử.
    const coordinatorIds = await roleRepository.getUserIdsByRole('coordinator');
    notificationService.createForUsers(coordinatorIds, {
        title: 'Chi phí mới chờ duyệt',
        message: `${driver?.full_name ?? 'Tài xế'} khai ${EXPENSE_TYPE_LABEL[expenseType] ?? expenseType} — ${money(soTien)} cho chuyến #${shipmentId}.`,
        type: 'EXPENSE_SUBMITTED',
        entityType: 'expenses',
        entityId: expense.id,
    }, { displayMode: 'silent' }).catch(() => {});

    return expenseRepository.getShipmentExpenses(shipmentId);
};

// Coordinator/Manager duyệt chi phí — ghi sổ nhật ký tài chính tại thời điểm duyệt
const approveExpense = async (expenseId, reviewerId) => {
    const expense = await expenseRepository.approveExpense(expenseId, reviewerId);

    notificationService.createForUser(expense.created_by, {
        title: 'Chi phí đã được duyệt',
        message: `Chi phí "${EXPENSE_TYPE_LABEL[expense.expense_type] ?? expense.expense_type}" — ${money(Number(expense.amount))} đã được duyệt.`,
        type: 'EXPENSE_APPROVED',
        entityType: 'expenses',
        entityId: expense.id,
    }, { displayMode: 'silent' }).catch(() => {});

    return expense;
};

// Gỡ duyệt — cách duy nhất để cứu một chi phí đã duyệt nhưng sai số tiền.
//
// Tầng 2: đã sinh bút toán ghi nhận chi phí nên phải có lý do và phải để lại vết.
// Trước đây hàm này không hỏi gì và không ghi gì — kế toán tự duyệt rồi tự gỡ thì
// không ai truy được, mà đó đúng là chỗ dễ bị lạm dụng nhất.
const unapproveExpense = async (expenseId, reviewerId, reason = null, actorRole = 'accountant') => {
    reversalService.assertAllowed('expense.approve', { actorRole, reason });

    const expense = await expenseRepository.unapproveExpense(expenseId, reviewerId);
    if (!expense) {
        throw new Error('Không gỡ duyệt được: chi phí chưa được duyệt, đã được hoàn tiền cho tài xế, hoặc phiếu thu của đơn đã chốt');
    }

    reversalService.recordReversal({
        kind: 'expense.approve',
        entityId: expense.id,
        actorId: reviewerId,
        reason,
        oldData: { status: 'approved', amount: expense.amount, expense_type: expense.expense_type },
        newData: { status: 'pending' },
    });

    notificationService.createForUser(expense.created_by, {
        title: 'Chi phí cần khai lại',
        message: `Chi phí "${EXPENSE_TYPE_LABEL[expense.expense_type] ?? expense.expense_type}" — ${money(Number(expense.amount))} đã bị gỡ duyệt. Bạn có thể sửa hoặc xoá khoản này.`,
        type: 'EXPENSE_REJECTED',
        entityType: 'expenses',
        entityId: expense.id,
    }, { displayMode: 'alert' }).catch(() => {});

    return expense;
};

const rejectExpense = async (expenseId, reviewerId, reason) => {
    const expense = await expenseRepository.rejectExpense(expenseId, reviewerId, reason);
    if (!expense) throw new Error('Không tìm thấy chi phí hoặc chi phí đã được xử lý');

    notificationService.createForUser(expense.created_by, {
        title: 'Chi phí bị từ chối',
        message: `Chi phí "${EXPENSE_TYPE_LABEL[expense.expense_type] ?? expense.expense_type}" bị từ chối${reason ? `: ${reason}` : ''}.`,
        type: 'EXPENSE_REJECTED',
        entityType: 'expenses',
        entityId: expense.id,
    }, { displayMode: 'alert' }).catch(() => {});

    return expense;
};

const getShipmentExpenses = async (shipmentId, driverId) => {
    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');
    if (Number(shipment.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền xem chi phí này');

    return expenseRepository.getShipmentExpenses(shipmentId);
};

// Dùng khi đã verify quyền từ context khác (receipt detail)
const getExpensesByShipment = async (shipmentId) => {
    return expenseRepository.getShipmentExpenses(shipmentId);
};

const updateExpense = async (driverId, expenseId, { expenseType, amount, description, fileUrl }) => {
    if (expenseType && !ALLOWED_EXPENSE_TYPES.includes(expenseType)) throw new Error('Loại chi phí không hợp lệ');
    const soTienMoi = amount === undefined ? undefined : requireMoney(amount, { field: 'Số tiền' });
    return expenseRepository.updateExpense(expenseId, driverId, {
        expenseType, amount: soTienMoi, description, fileUrl,
    });
};

const deleteExpense = async (driverId, expenseId) => {
    return expenseRepository.deleteExpense(expenseId, driverId);
};

module.exports = {
    createExpense, getShipmentExpenses, getExpensesByShipment, updateExpense, deleteExpense,
    approveExpense, rejectExpense, unapproveExpense,
};
