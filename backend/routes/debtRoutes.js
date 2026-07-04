const express = require('express');
const router  = express.Router();

const { verifyToken, requireRole }  = require('../middleware/authMiddleware');
const { uploadDebtRepayment }       = require('../middleware/uploadMiddleware');
const debtController                = require('../controllers/debtController');

const driverOnly   = [verifyToken, requireRole('driver')];
const financeRoles = [verifyToken, requireRole('accountant', 'manager')];

function handleUpload(middleware) {
    return (req, res, next) => {
        middleware(req, res, (err) => {
            if (err) return res.status(422).json({ error: err.message });
            next();
        });
    };
}

// Driver endpoints
router.get('/me',                             driverOnly, debtController.getMyDebts);
router.get('/summary',                        driverOnly, debtController.getMyDebtSummary);
router.get('/:id/payments',                   driverOnly, debtController.getDebtPayments);
router.post('/:id/repayments',                driverOnly, handleUpload(uploadDebtRepayment.single('receipt')), debtController.submitRepayment);
router.delete('/repayments/:paymentId',       driverOnly, debtController.cancelRepayment);

module.exports = router;
