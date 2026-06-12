const accountantOrderRepository = require('../../repositories/accountant/accountantOrderRepository');
const accountantPaymentRepository = require('../../repositories/accountant/accountantPaymentRepository');
const accountantLookupRepository = require('../../repositories/accountant/accountantLookupRepository');

const getOrders = async (filters, page, limit) => {
    return accountantOrderRepository.getAllOrders(filters, page, limit);
};

const getOrderShipments = async (orderId) => {
    return accountantOrderRepository.getOrderShipments(orderId);
};

const createOrder = async (orderData) => {
    return accountantOrderRepository.createOrderWithShipments(orderData);
};

const importOrders = async (orders, createdByUserId) => {
    const results = [];
    for (const order of orders) {
        const result = await accountantOrderRepository.createOrderWithShipments({
            ...order,
            created_by: createdByUserId,
        });
        results.push(result);
    }
    return results;
};

const getPaymentsByOrderId = async (orderId) => {
    return accountantPaymentRepository.getPaymentsByOrderId(orderId);
};

const recordPayment = async (orderId, paymentData) => {
    return accountantPaymentRepository.recordPayment(orderId, paymentData);
};

const confirmDriverPayment = async (shipmentId, driverPaymentState, amount, paymentMethod, confirmedBy) => {
    return accountantPaymentRepository.confirmDriverPayment(shipmentId, driverPaymentState, amount, paymentMethod, confirmedBy);
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
    confirmDriverPayment,
    getVehicleDriverLookup,
};
