const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadExpense } = require('../middleware/uploadMiddleware');
const expenseController = require('../controllers/expenseController');
const { handleUpload } = require('../middleware/handleUpload');

const driverOnly = [verifyToken, requireRole('driver')];

router.post('/',                       driverOnly, handleUpload(uploadExpense.single('receipt')), expenseController.createExpense);
router.patch('/:id',                   driverOnly, handleUpload(uploadExpense.single('receipt')), expenseController.updateExpense);
router.delete('/:id',                  driverOnly, expenseController.deleteExpense);
router.get('/shipment/:shipmentId',    driverOnly, expenseController.getShipmentExpenses);

module.exports = router;
