const express = require('express');
const multer  = require('multer');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const orderController = require('../controllers/orderController');
const tripController  = require('../controllers/tripController');

const coordinatorOnly = [verifyToken, requireRole('coordinator', 'manager', 'admin')];
const driverOnly      = [verifyToken, requireRole('driver')];

// File Excel chỉ cần đọc buffer để parse — không lưu Cloudinary như ảnh
const uploadExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Driver routes ─────────────────────────────────────────────────────────────
router.post('/:id/request-receipt', driverOnly, tripController.requestOrderReceipt);
router.get('/:id/receipt-request', driverOnly, tripController.getOrderReceiptRequest);

// ── Coordinator / Manager / Admin routes ──────────────────────────────────────
router.get('/',                  coordinatorOnly, orderController.listOrders);
router.post('/',                 coordinatorOnly, orderController.createOrder);
router.patch('/:id',             coordinatorOnly, orderController.updateOrder);
router.delete('/:id',            coordinatorOnly, orderController.cancelOrder);
router.post('/import',           coordinatorOnly, uploadExcel.single('file'), orderController.importOrders);

module.exports = router;
