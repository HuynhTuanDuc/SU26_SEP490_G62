const express = require('express');
const router = express.Router();

const accountantFinanceController = require('../../controllers/accountant/accountantFinanceController');
const accountantDebtController = require('../../controllers/accountant/accountantDebtController');
const accountantOrderRoutes = require('./accountantOrderRoutes');
const { verifyToken, requireRole } = require('../../middleware/authMiddleware');

router.use(verifyToken, requireRole('accountant'));

router.get('/finance/stats', accountantFinanceController.getFinanceStats);
router.use('/orders', accountantOrderRoutes);
router.get('/debts', accountantDebtController.getDebts);
router.get('/debts/stats', accountantDebtController.getDebtStats);

module.exports = router;
