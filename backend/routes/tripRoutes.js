const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadProof, uploadPaymentReceipt, uploadTripComplete, uploadReceiptCollectionProof } = require('../middleware/uploadMiddleware');
const tripController    = require('../controllers/tripController');
const paymentController = require('../controllers/paymentController');
const { handleUpload } = require('../middleware/handleUpload');

const driverOnly = [verifyToken, requireRole('driver')];

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

// Hoàn tác bước trạng thái vừa bấm nhầm (cửa sổ 90 giây, tầng 1).
// Đặt cạnh /status vì đây đúng là đường lùi của nó.
router.post('/:id/undo',    driverOnly, tripController.undoStatus);

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

// Đơn cash đã hoàn thành nhưng driver chưa gửi yêu cầu phiếu thu (dùng cho banner home)
router.get('/pending-receipt', driverOnly, tripController.getPendingReceiptOrder);

// Phiếu thu (coordinator đã tạo) — driver xem + show cho khách.
// Tham số đường dẫn là order_receipt_requests.id, KHÔNG phải shipment_receipts.id:
// hai bảng dùng sequence độc lập cùng START WITH 100000 nên một số nguyên trần không
// đủ phân biệt. Tên route nói rõ loại khoá để không gửi nhầm.
router.get('/receipt-requests',        driverOnly, tripController.getDriverReceipts);
router.get('/receipt-requests/:orrId', driverOnly, tripController.getDriverReceiptDetail);

// Driver gửi lại yêu cầu tạo phiếu thu sau khi bị coordinator từ chối
router.post('/receipt-requests/:orrId/resubmit', driverOnly, tripController.resubmitReceiptRequest);

// Driver ghi nhận cách khách thanh toán sau khi có phiếu thu
// Body: { payment_type: 'cash_collected' | 'bank_transfer' | 'client_credit', notes? }
// File: proof / image / photo (bắt buộc với cash_collected và bank_transfer)
router.post(
    '/receipt-requests/:orrId/record-collection',
    driverOnly,
    handleUpload(uploadReceiptCollectionProof.fields([
        { name: 'proof', maxCount: 1 },
        { name: 'image', maxCount: 1 },
        { name: 'photo', maxCount: 1 },
    ])),
    tripController.recordReceiptCollection,
);

// Multi-Stop: xác nhận từng stop (BR-011)
router.patch('/:id/stops/:stopId/arrive',   driverOnly, tripController.arriveAtStop);
router.patch(
    '/:id/stops/:stopId/complete',
    driverOnly,
    handleUpload(uploadProof.fields([
        { name: 'proof', maxCount: 1 },
        { name: 'image', maxCount: 1 },
    ])),
    tripController.completeStop,
);

module.exports = router;
