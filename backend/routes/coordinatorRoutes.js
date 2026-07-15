const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const coordinatorController = require('../controllers/coordinatorController');
const tripController = require('../controllers/tripController');

router.use(verifyToken, requireRole('coordinator'));

router.get('/dashboard', coordinatorController.getDashboard);
router.get('/vehicle-groups', coordinatorController.listVehicleGroups);
router.get('/partners', coordinatorController.listPartners);
router.get('/incidents', coordinatorController.getIncidents);

// Xem Trip Pool (toàn bộ nhóm xe, hoặc filter theo vehicleGroupId) — read-only, không claim được
router.get('/trip-pool', tripController.getTripPool);

// Hủy / điều chuyển 1 trip cụ thể — ngoài luồng sự cố
router.patch('/trips/:id/cancel',   coordinatorController.cancelShipment);
router.patch('/trips/:id/reassign', coordinatorController.reassignShipment);

// Receipt request management (driver yêu cầu → coordinator xử lý)
router.get('/receipt-requests',          coordinatorController.getReceiptRequests);
router.get('/receipt-requests/:id',      coordinatorController.getReceiptRequestDetail);
router.post('/receipt-requests/:id/approve',        coordinatorController.approveReceiptRequest);
router.post('/receipt-requests/:id/reject',         coordinatorController.rejectReceiptRequest);
router.get('/receipt-requests/:id/scan-expenses',   coordinatorController.scanReceiptExpenses);

// Duyệt / từ chối chi phí driver khai (luồng duyệt độc lập ngoài phiếu thu)
router.patch('/expenses/:id/approve', coordinatorController.approveExpense);
router.patch('/expenses/:id/reject',  coordinatorController.rejectExpense);

module.exports = router;
