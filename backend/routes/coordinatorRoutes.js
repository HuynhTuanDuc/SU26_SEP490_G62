const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const coordinatorController = require('../controllers/coordinatorController');

router.use(verifyToken, requireRole('coordinator'));

router.get('/vehicle-groups', coordinatorController.listVehicleGroups);
router.get('/partners', coordinatorController.listPartners);
router.get('/incidents', coordinatorController.getIncidents);

// Receipt request management (driver yêu cầu → coordinator xử lý)
router.get('/receipt-requests',          coordinatorController.getReceiptRequests);
router.get('/receipt-requests/:id',      coordinatorController.getReceiptRequestDetail);
router.post('/receipt-requests/:id/approve',        coordinatorController.approveReceiptRequest);
router.post('/receipt-requests/:id/reject',         coordinatorController.rejectReceiptRequest);
router.get('/receipt-requests/:id/scan-expenses',   coordinatorController.scanReceiptExpenses);

module.exports = router;
