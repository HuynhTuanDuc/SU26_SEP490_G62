const accountantPaymentRepository = require('../../repositories/accountant/accountantPaymentRepository');
const { posInt, posAmount, enumVal, sendError, err400 } = require('./_validate');

const PERSON_TYPES    = ['customer', 'driver'];
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'offset'];

const previewAllocation = async (req, res) => {
    try {
        const { personType, personId, amount } = req.body;

        if (!PERSON_TYPES.includes(personType))
            throw err400('Loại đối tượng không hợp lệ.');
        const id  = posInt(personId, 'Mã đối tượng');
        const amt = posAmount(amount, 'Số tiền');

        const result = await accountantPaymentRepository.previewAllocation(personType, id, amt);
        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
};

const allocatePayment = async (req, res) => {
    try {
        const { personType, personId, amount, paymentMethod, notes } = req.body;

        if (!PERSON_TYPES.includes(personType))
            throw err400('Loại đối tượng không hợp lệ.');
        const id  = posInt(personId, 'Mã đối tượng');
        const amt = posAmount(amount, 'Số tiền thanh toán');
        enumVal(paymentMethod, PAYMENT_METHODS, 'Hình thức thanh toán');

        if (notes && notes.length > 500)
            throw err400('Ghi chú không được vượt quá 500 ký tự.');

        const result = await accountantPaymentRepository.allocatePayment(personType, id, {
            amount:        amt,
            paymentMethod: paymentMethod || 'cash',
            notes:         notes?.trim() || '',
            createdBy:     req.user.userId,
        });

        res.json(result);
    } catch (err) {

        if (!err.status && err.message) err.status = 400;
        sendError(res, err);
    }
};

const paymentByShipment = async (req, res) => {
    try {
        const { shipmentId, amount, paymentMethod, notes } = req.body;

        const sid = posInt(shipmentId, 'Mã chuyến');
        const amt = posAmount(amount,  'Số tiền thanh toán');
        enumVal(paymentMethod, PAYMENT_METHODS, 'Hình thức thanh toán');

        if (notes && notes.length > 500)
            throw err400('Ghi chú không được vượt quá 500 ký tự.');

        const result = await accountantPaymentRepository.recordPaymentByShipment(sid, {
            amount:        amt,
            paymentMethod: paymentMethod || 'cash',
            notes:         notes?.trim() || '',
            createdBy:     req.user.userId,
        });

        res.json(result);
    } catch (err) {
        if (!err.status && err.message) err.status = 400;
        sendError(res, err);
    }
};

const paymentByDebt = async (req, res) => {
    try {
        const { debtId, amount, paymentMethod, notes } = req.body;

        const did = posInt(debtId, 'Mã công nợ');
        const amt = posAmount(amount, 'Số tiền thanh toán');
        enumVal(paymentMethod, PAYMENT_METHODS, 'Hình thức thanh toán');

        if (notes && notes.length > 500)
            throw err400('Ghi chú không được vượt quá 500 ký tự.');

        const result = await accountantPaymentRepository.recordPaymentByDebt(did, {
            amount:        amt,
            paymentMethod: paymentMethod || 'cash',
            notes:         notes?.trim() || '',
            createdBy:     req.user.userId,
        });

        res.json(result);
    } catch (err) {
        if (!err.status && err.message) err.status = 400;
        sendError(res, err);
    }
};

const getPaymentHistory = async (req, res) => {
    try {
        const { personType, personId } = req.params;

        if (!PERSON_TYPES.includes(personType))
            throw err400('Loại đối tượng không hợp lệ.');
        const id = posInt(personId, 'Mã đối tượng');

        const payments = await accountantPaymentRepository.getPaymentHistoryByPerson(personType, id);
        res.json({ payments });
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = {
    previewAllocation,
    allocatePayment,
    paymentByShipment,
    paymentByDebt,
    getPaymentHistory,
};
