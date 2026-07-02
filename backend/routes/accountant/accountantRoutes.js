const express = require('express');
const router = express.Router();

const accountantFinanceController = require('../../controllers/accountant/accountantFinanceController');
const accountantDebtController    = require('../../controllers/accountant/accountantDebtController');
const accountantPaymentController = require('../../controllers/accountant/accountantPaymentController');
const accountantReportController  = require('../../controllers/accountant/accountantReportController');
const accountantOrderRoutes = require('./accountantOrderRoutes');
const accountantPayrollRoutes = require('./accountantPayrollRoutes');
const { verifyToken, requireRole } = require('../../middleware/authMiddleware');

router.use(verifyToken, requireRole('accountant'));

router.get('/finance/stats',      accountantFinanceController.getFinanceStats);
router.get('/reports/overview',  accountantReportController.getOverview);
router.use('/orders', accountantOrderRoutes);
router.use('/payroll', accountantPayrollRoutes);
router.get('/debts', accountantDebtController.getDebts);
router.get('/debts/stats', accountantDebtController.getDebtStats);
router.get('/debts/grouped', accountantDebtController.getDebtsGrouped);
router.get('/debts/person/:personType/:personId', accountantDebtController.getDebtsByPerson);

router.get ('/debts/payment/history/:personType/:personId', accountantPaymentController.getPaymentHistory);
router.post('/debts/payment/preview',    accountantPaymentController.previewAllocation);
router.post('/debts/payment/allocate',   accountantPaymentController.allocatePayment);
router.post('/debts/payment/by-shipment', accountantPaymentController.paymentByShipment);
router.post('/debts/payment/by-debt',    accountantPaymentController.paymentByDebt);

module.exports = router;
