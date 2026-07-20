const accountantDebtRepository = require('../repositories/accountantDebtRepository');
const { posInt, enumVal, pageParams, sendError, err400 } = require('../utils/accountantValidate');

const DEBT_TYPES   = ['customer', 'driver'];
const DEBT_STATUSES = ['paid', 'partial', 'unpaid'];

const getDebts = async (req, res) => {
    try {
        const { page, limit } = pageParams(req.query);
        enumVal(req.query.debt_type, DEBT_TYPES,    'Loại công nợ');
        enumVal(req.query.status,    DEBT_STATUSES, 'Trạng thái công nợ');

        const result = await accountantDebtRepository.getAllDebts({
            debtType:       req.query.debt_type || null,
            status:         req.query.status    || null,
            customerSearch: req.query.customer?.trim() || null,
            driverSearch:   req.query.driver?.trim()   || null,
            page,
            limit,
        });

        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
};

const getDebtStats = async (_req, res) => {
    try {
        const stats = await accountantDebtRepository.getDebtStats();
        res.json(stats);
    } catch (err) {
        sendError(res, err);
    }
};

const getDebtsGrouped = async (req, res) => {
    try {
        const { page, limit } = pageParams(req.query);
        enumVal(req.query.debt_type, DEBT_TYPES,    'Loại công nợ');
        enumVal(req.query.status,    DEBT_STATUSES, 'Trạng thái công nợ');

        const result = await accountantDebtRepository.getDebtsGroupedByPerson({
            debtType:       req.query.debt_type || null,
            status:         req.query.status    || null,
            customerSearch: req.query.customer?.trim() || null,
            driverSearch:   req.query.driver?.trim()   || null,
            page,
            limit,
        });

        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
};

const getDebtsByPerson = async (req, res) => {
    try {
        const { personType, personId } = req.params;
        const { customer_ids } = req.query;

        if (!DEBT_TYPES.includes(personType))
            throw err400('Loại đối tượng không hợp lệ.');

        if (customer_ids) {
            const ids = customer_ids.split(',').map(Number).filter((n) => n > 0);
            if (ids.length === 0)
                throw err400('Danh sách mã khách hàng không hợp lệ.');
            const debts = await accountantDebtRepository.getDebtsByCustomerIds(ids);
            return res.json({ debts });
        }

        const id = posInt(personId, 'Mã đối tượng');
        const debts = await accountantDebtRepository.getDebtsByPerson(personType, id);
        res.json({ debts });
    } catch (err) {
        sendError(res, err);
    }
};

// POST /accountant/debts/:id/transfer-to-driver — Body: { driverId, notes? }
// Chuyển toàn bộ số dư còn lại của 1 công nợ khách hàng sang công nợ tài xế mới.
const transferToDriver = async (req, res) => {
    try {
        const debtId = posInt(req.params.id, 'Mã công nợ');
        const driverId = posInt(req.body.driverId, 'Tài xế');
        const result = await accountantDebtRepository.transferToDriver(
            debtId, { toDriverId: driverId, notes: req.body.notes?.trim() || null }, req.user.userId,
        );
        res.json({ message: 'Đã chuyển công nợ sang tài xế.', ...result });
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = { getDebts, getDebtStats, getDebtsGrouped, getDebtsByPerson, transferToDriver };
