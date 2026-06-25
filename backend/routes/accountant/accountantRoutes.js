const express = require('express');
const router = express.Router();

const accountantFinanceController = require('../../controllers/accountant/accountantFinanceController');
const accountantDebtController = require('../../controllers/accountant/accountantDebtController');
const accountantPaymentController = require('../../controllers/accountant/accountantPaymentController');
const accountantOrderRoutes = require('./accountantOrderRoutes');
const { verifyToken, requireRole } = require('../../middleware/authMiddleware');

router.use(verifyToken, requireRole('accountant'));

router.get('/finance/stats', accountantFinanceController.getFinanceStats);
router.use('/orders', accountantOrderRoutes);
router.get('/debts', accountantDebtController.getDebts);
router.get('/debts/stats', accountantDebtController.getDebtStats);
router.get('/debts/grouped', accountantDebtController.getDebtsGrouped);
router.get('/debts/person/:personType/:personId', accountantDebtController.getDebtsByPerson);

// Payment routes
router.post('/debts/payment/preview', accountantPaymentController.previewAllocation);
router.post('/debts/payment/allocate', accountantPaymentController.allocatePayment);
router.post('/debts/payment/by-shipment', accountantPaymentController.paymentByShipment);
router.post('/debts/payment/by-debt', accountantPaymentController.paymentByDebt);

module.exports = router;
