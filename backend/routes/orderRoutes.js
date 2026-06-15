const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadExcel } = require('../middleware/excelUploadMiddleware');
const orderController = require('../controllers/orderController');
const tripController  = require('../controllers/tripController');

const coordinatorOnly = [verifyToken, requireRole('coordinator', 'admin')];
const driverOnly      = [verifyToken, requireRole('driver')];

// ── Driver routes ─────────────────────────────────────────────────────────────
router.post('/:id/request-receipt', driverOnly, tripController.requestOrderReceipt);
router.get('/:id/receipt-request', driverOnly, tripController.getOrderReceiptRequest);

// ── Coordinator / Admin routes ────────────────────────────────────────────────
router.get('/',                  coordinatorOnly, orderController.listOrders);
router.post('/import-excel',     coordinatorOnly, uploadExcel.single('file'), orderController.importOrders);
router.post('/',                 coordinatorOnly, orderController.createOrder);
router.patch('/:id',             coordinatorOnly, orderController.updateOrder);
router.delete('/:id',            coordinatorOnly, orderController.cancelOrder);

module.exports = router;
