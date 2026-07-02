const accountantFinanceRepository = require('../repositories/accountantFinanceRepository');

const getFinanceStats = async () => {
    return accountantFinanceRepository.getFinanceStats();
};

module.exports = {
    getFinanceStats,
};
