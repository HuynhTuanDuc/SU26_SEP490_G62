const accountantOrderRepository = require('../repositories/accountantOrderRepository');
const accountantPaymentRepository = require('../repositories/accountantPaymentRepository');
const accountantLookupRepository = require('../repositories/accountantLookupRepository');
const kpiService = require('./kpiService');

// Đơn ngoài được tạo với shipment status='completed' ngay từ đầu (không qua luồng
// driver hoàn thành trip bình thường), nên phải tự trigger tính KPI ở đây — nếu không
// kpi_records sẽ không bao giờ được cập nhật cho các chuyến import này.
const triggerKpiRecalc = (result) => {
    (result?.kpiTriggers || []).forEach(({ driverId, completedAt }) => {
        kpiService.recalculateAfterCompletion(driverId, completedAt ? new Date(completedAt) : new Date());
    });
    delete result?.kpiTriggers;
    return result;
};

const getOrders = async (filters, page, limit) => {
    return accountantOrderRepository.getAllOrders(filters, page, limit);
};

const getOrderShipments = async (orderId) => {
    return accountantOrderRepository.getOrderShipments(orderId);
};

const createOrder = async (orderData) => {
    const result = await accountantOrderRepository.createOrderWithShipments(orderData);
    accountantLookupRepository.invalidateLookupCache();
    return triggerKpiRecalc(result);
};

const importOrders = async (orders, createdByUserId) => {
    const results = [];
    for (const order of orders) {
        const result = await accountantOrderRepository.createOrderWithShipments({
            ...order,
            created_by: createdByUserId,
        });
        results.push(triggerKpiRecalc(result));
    }
    accountantLookupRepository.invalidateLookupCache();
    return results;
};

const getPaymentsByOrderId = async (orderId) => {
    return accountantPaymentRepository.getPaymentsByOrderId(orderId);
};

const recordPayment = async (orderId, paymentData) => {
    return accountantPaymentRepository.recordPaymentWithOverflow(orderId, paymentData);
};

const getCustomerDebtSummary = async (orderId) => {
    return accountantPaymentRepository.getCustomerDebtSummary(orderId);
};

const confirmDriverPayment = async (shipmentId, driverPaymentState, amount, paymentMethod, confirmedBy) => {
    return accountantPaymentRepository.confirmDriverPayment(shipmentId, driverPaymentState, amount, paymentMethod, confirmedBy);
};

const updateOrder = async (orderId, orderData) => {
    return accountantOrderRepository.updateOrder(orderId, orderData);
};

const getVehicleDriverLookup = async () => {
    return accountantLookupRepository.getVehicleDriverLookup();
};

module.exports = {
    getOrders,
    getOrderShipments,
    createOrder,
    importOrders,
    getPaymentsByOrderId,
    recordPayment,
    getCustomerDebtSummary,
    confirmDriverPayment,
    getVehicleDriverLookup,
    updateOrder,
};
