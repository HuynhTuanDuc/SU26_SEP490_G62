const expenseRepository = require('../repositories/expenseRepository');
const tripRepository    = require('../repositories/tripRepository');
const pool              = require('../config/database');
const { ALLOWED_EXPENSE_TYPES, PASS_THROUGH_EXPENSE_TYPES } = require('../constants/expenseConstants');
const financialLedgerRepository = require('../repositories/financialLedgerRepository');

// Trạng thái trip cho phép thêm chi phí (chưa kết thúc)
const EXPENSE_ALLOWED_STATUSES = [
    'claimed', 'picking', 'transit', 'arrived', 'failed', 'returning',
];

const createExpense = async (driverId, { shipmentId, expenseType, amount, description, receiptUrl }) => {
    if (!receiptUrl) throw new Error('Ảnh bằng chứng là bắt buộc');
    if (!expenseType || !ALLOWED_EXPENSE_TYPES.includes(expenseType)) throw new Error('Loại chi phí không hợp lệ');
    if (!amount || Number(amount) <= 0) throw new Error('Số tiền phải lớn hơn 0');

    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');

    // Owner hiện tại HOẶC tài từng giữ chuyến (bị điều chuyển giữa đường do sự cố)
    // đều được khai chi phí — tài cũ vẫn có tiền dầu/vé đã ứng ở nửa đầu chuyến
    if (Number(shipment.owner_driver_id) !== Number(driverId)) {
        const { rows: [wasAssigned] } = await pool.query(
            `SELECT 1 FROM shipment_assignment_history
             WHERE shipment_id = $1 AND (to_driver_id = $2 OR from_driver_id = $2)
             LIMIT 1`,
            [shipmentId, driverId],
        );
        if (!wasAssigned) throw new Error('Bạn không có quyền thêm chi phí cho chuyến này');
    }
    if (!EXPENSE_ALLOWED_STATUSES.includes(shipment.status)) throw new Error('Không thể thêm chi phí khi chuyến đã kết thúc');

    const vehicleId = await tripRepository.getDriverVehicleId(driverId);

    const expense = await expenseRepository.createExpense({
        shipmentId,
        vehicleId,
        driverId,
        expenseType,
        amount: Number(amount),
        description: description?.trim() || null,
    });

    await expenseRepository.addExpenseAttachment(expense.id, receiptUrl);

    // Không ghi sổ FT ở đây — expense đang pending, FT được ghi khi coordinator duyệt

    return expenseRepository.getShipmentExpenses(shipmentId);
};

// Coordinator/Manager duyệt chi phí — ghi sổ nhật ký tài chính tại thời điểm duyệt
const approveExpense = async (expenseId, reviewerId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows: [expense] } = await client.query(
            `UPDATE expenses
             SET status = 'approved', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND status = 'pending'
             RETURNING id, shipment_id, expense_type, amount, created_by`,
            [expenseId, reviewerId],
        );
        if (!expense) throw new Error('Không tìm thấy chi phí hoặc chi phí đã được xử lý');

        const isPassThrough = PASS_THROUGH_EXPENSE_TYPES.has(expense.expense_type);
        await financialLedgerRepository.insertTransaction(client, {
            eventType: isPassThrough ? 'pass_through_cost' : 'expense_recorded',
            debitAccount: isPassThrough ? '3388' : '642',
            creditAccount: '1111',
            amount: Number(expense.amount),
            description: `${isPassThrough ? 'Chi hộ khách' : 'Chi phí vận hành'} (${expense.expense_type}) — chuyến #${expense.shipment_id}, duyệt chi phí tài xế khai`,
            refType: 'expense', refId: expense.id, actorId: reviewerId,
        });

        await client.query('COMMIT');
        return expense;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const rejectExpense = async (expenseId, reviewerId, reason) => {
    const { rows: [expense] } = await pool.query(
        `UPDATE expenses
         SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(),
             reject_reason = $3, updated_at = NOW()
         WHERE id = $1 AND status = 'pending'
         RETURNING id, shipment_id, expense_type, amount, created_by`,
        [expenseId, reviewerId, reason ?? null],
    );
    if (!expense) throw new Error('Không tìm thấy chi phí hoặc chi phí đã được xử lý');
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
    if (amount !== undefined && Number(amount) <= 0) throw new Error('Số tiền phải lớn hơn 0');
    return expenseRepository.updateExpense(expenseId, driverId, { expenseType, amount, description, fileUrl });
};

module.exports = {
    createExpense, getShipmentExpenses, getExpensesByShipment, updateExpense,
    approveExpense, rejectExpense,
};
