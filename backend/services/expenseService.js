const expenseRepository = require('../repositories/expenseRepository');
const tripRepository    = require('../repositories/tripRepository');

// Trạng thái trip cho phép thêm chi phí (chưa kết thúc)
const EXPENSE_ALLOWED_STATUSES = [
    'claimed', 'picking', 'transit', 'arrived', 'failed', 'returning',
];

const ALLOWED_EXPENSE_TYPES = ['fuel', 'toll', 'parking', 'repair', 'maintenance', 'depreciation', 'other'];

const createExpense = async (driverId, { shipmentId, expenseType, amount, description, receiptUrl }) => {
    if (!receiptUrl) throw new Error('Ảnh bằng chứng là bắt buộc');
    if (!expenseType || !ALLOWED_EXPENSE_TYPES.includes(expenseType)) throw new Error('Loại chi phí không hợp lệ');
    if (!amount || Number(amount) <= 0) throw new Error('Số tiền phải lớn hơn 0');

    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');
    if (Number(shipment.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền thêm chi phí cho chuyến này');
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

    return expenseRepository.getShipmentExpenses(shipmentId);
};

const getShipmentExpenses = async (shipmentId, driverId) => {
    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');
    if (Number(shipment.owner_driver_id) !== Number(driverId)) throw new Error('Bạn không có quyền xem chi phí này');

    return expenseRepository.getShipmentExpenses(shipmentId);
};

module.exports = { createExpense, getShipmentExpenses };
