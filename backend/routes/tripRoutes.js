const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadProof, uploadPaymentReceipt, uploadTripComplete } = require('../middleware/uploadMiddleware');
const tripController    = require('../controllers/tripController');
const paymentController = require('../controllers/paymentController');

const driverOnly = [verifyToken, requireRole('driver')];

function handleUpload(middleware) {
    return (req, res, next) => {
        middleware(req, res, (err) => {
            if (err) return res.status(422).json({ error: err.message });
            next();
        });
    };
}

router.get('/stats',   driverOnly, tripController.getDriverStats);
router.get('/history', driverOnly, tripController.getOrderHistory);
router.get('/orders/:orderId', driverOnly, tripController.getOrderDetail);

router.get('/pool',                       driverOnly, tripController.getTripPool);
router.get('/pool-shipment/:shipmentId',  driverOnly, tripController.getAvailableShipmentDetail);
router.get('/pool/:orderId',              driverOnly, tripController.getAvailableOrderDetail);

router.get('/active', driverOnly, tripController.getActiveTrip);

router.post('/:id/claim',   driverOnly, tripController.claimTrip);
router.patch('/:id/status', driverOnly, tripController.updateStatus);
router.post('/:id/release', driverOnly, tripController.releaseTrip);

// ITEM 1: PICKING → TRANSIT — ảnh lấy hàng bắt buộc (BR-013/014)
// Field: 'proof' | 'image' | 'photo'
router.post(
    '/:id/start-transit',
    driverOnly,
    handleUpload(uploadProof.fields([
        { name: 'proof', maxCount: 1 },
        { name: 'image', maxCount: 1 },
        { name: 'photo', maxCount: 1 },
    ])),
    tripController.startTransit,
);

// ITEM 2: TH3 — Driver báo khách chưa trả tiền → tạo Customer Debt
// Body: { amount, notes? }
router.post('/:id/mark-unpaid', driverOnly, tripController.markUnpaid);

// ITEM 5: RETURNING → COMPLETED (hoàn hàng) — ảnh không bắt buộc
// Field: 'proof' | 'image'
router.post(
    '/:id/return-complete',
    driverOnly,
    handleUpload(uploadProof.fields([
        { name: 'proof', maxCount: 1 },
        { name: 'image', maxCount: 1 },
    ])),
    tripController.returnComplete,
);

// 2 ảnh bắt buộc: 'proof' (xác nhận giao) + 'receipt' (biên lai/hóa đơn)
router.post(
    '/:id/complete',
    driverOnly,
    handleUpload(uploadTripComplete.fields([
        { name: 'proof',   maxCount: 1 },
        { name: 'image',   maxCount: 1 },   // alias cho proof
        { name: 'receipt', maxCount: 1 },
        { name: 'invoice', maxCount: 1 },   // alias cho receipt
    ])),
    tripController.completeTrip,
);

// TH2: Ghi nhận khách trả tiền mặt cho driver → tạo driver debt
// Field: 'receipt' | 'image' | 'photo'
router.post(
    '/:id/payment',
    driverOnly,
    handleUpload(uploadPaymentReceipt.fields([
        { name: 'receipt', maxCount: 1 },
        { name: 'image',   maxCount: 1 },
        { name: 'photo',   maxCount: 1 },
    ])),
    paymentController.recordCashPayment,
);
router.get('/:id/payments',        driverOnly, paymentController.getShipmentPayments);
router.get('/:id/payment-summary', driverOnly, paymentController.getPaymentSummary);

// Sửa ghi nhận tiền mặt (TH2) — amount + thay ảnh nếu có
router.patch(
    '/:id/payments/:paymentId',
    driverOnly,
    handleUpload(uploadPaymentReceipt.fields([
        { name: 'receipt', maxCount: 1 },
        { name: 'image',   maxCount: 1 },
        { name: 'photo',   maxCount: 1 },
    ])),
    paymentController.updatePayment,
);

// Yêu cầu tạo phiếu thu (driver → coordinator) — chỉ 1 lần mỗi chuyến
// Body: { actual_km?: number }
router.post('/:id/request-receipt', driverOnly, tripController.requestReceipt);
router.get('/:id/receipt-request',  driverOnly, tripController.getReceiptRequest);

// Multi-Stop: xem + xác nhận từng stop (BR-011)
router.get('/:id/stops', driverOnly, tripController.getShipmentStops);
router.patch('/:id/stops/:stopId/arrive',   driverOnly, tripController.arriveAtStop);
router.patch('/:id/stops/:stopId/complete', driverOnly, tripController.completeStop);

module.exports = router;
