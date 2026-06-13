const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadExcel } = require('../middleware/excelUploadMiddleware');
const coordinatorController = require('../controllers/coordinatorController');

router.use(verifyToken, requireRole('coordinator'));

router.get('/vehicle-groups', coordinatorController.listVehicleGroups);

router.post('/import-excel', uploadExcel.single('file'), coordinatorController.importExcel);

// Receipt request management (driver yêu cầu → coordinator xử lý)
router.get('/receipt-requests',          coordinatorController.getReceiptRequests);
router.post('/receipt-requests/:id/approve', coordinatorController.approveReceiptRequest);
router.post('/receipt-requests/:id/reject',  coordinatorController.rejectReceiptRequest);

module.exports = router;
