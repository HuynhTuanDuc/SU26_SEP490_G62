const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadExpense } = require('../middleware/uploadMiddleware');
const expenseController = require('../controllers/expenseController');

const driverOnly = [verifyToken, requireRole('driver')];

function handleUpload(middleware) {
    return (req, res, next) => {
        middleware(req, res, (err) => {
            if (err) return res.status(422).json({ error: err.message });
            next();
        });
    };
}

router.post('/',                       driverOnly, handleUpload(uploadExpense.single('receipt')), expenseController.createExpense);
router.patch('/:id',                   driverOnly, handleUpload(uploadExpense.single('receipt')), expenseController.updateExpense);
router.get('/shipment/:shipmentId',    driverOnly, expenseController.getShipmentExpenses);

module.exports = router;
