const accountantFinanceService = require('../../services/accountant/accountantFinanceService');
const { sendError } = require('./_validate');

const getFinanceStats = async (_req, res) => {
    try {
        const stats = await accountantFinanceService.getFinanceStats();
        res.json(stats);
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = { getFinanceStats };
