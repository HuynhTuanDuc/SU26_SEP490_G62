const accountantPaymentRepository = require('../repositories/accountantPaymentRepository');
const { posInt, posAmount, enumVal, sendError, err400 } = require('../utils/accountantValidate');

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

// Lịch sử thanh toán công nợ toàn cục (mọi khách + tài xế) — có lọc/phân trang
const getAllPaymentHistory = async (req, res) => {
    try {
        const { person_type, status, method, month, year, search, sort, page, limit } = req.query;

        if (person_type && !PERSON_TYPES.includes(person_type))
            throw err400('Loại đối tượng không hợp lệ.');
        if (status && !['pending', 'confirmed', 'rejected', 'voided'].includes(status))
            throw err400('Trạng thái không hợp lệ.');
        if (method && !PAYMENT_METHODS.includes(method))
            throw err400('Hình thức thanh toán không hợp lệ.');

        const result = await accountantPaymentRepository.listAllDebtPayments({
            personType: person_type || null,
            status: status || null,
            method: method || null,
            month: month || null,
            year: year || null,
            search: search || '',
            sort: sort || null,
            page, limit,
        });
        res.json(result);
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
    getAllPaymentHistory,
};
