const accountantFinanceService = require('../services/accountantFinanceService');
const { sendError } = require('../utils/accountantValidate');

const getFinanceStats = async (_req, res) => {
    try {
        const stats = await accountantFinanceService.getFinanceStats();
        res.json(stats);
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = { getFinanceStats };
