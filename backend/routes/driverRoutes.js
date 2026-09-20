const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadMaintenanceBill } = require('../middleware/uploadMiddleware');
const driverController = require('../controllers/driverController');
const { handleUpload } = require('../middleware/handleUpload');

router.get('/', verifyToken, requireRole('coordinator', 'manager', 'admin'), driverController.getAllDrivers);

router.get('/me/vehicle', verifyToken, requireRole('driver'), driverController.getMyVehicle);

router.get('/me/assignment-history', verifyToken, requireRole('driver'), driverController.getMyAssignmentHistory);

router.get(
    '/maintenance',
    verifyToken,
    requireRole('driver'),
    driverController.listMaintenance,
);
router.post(
    '/maintenance/request',
    verifyToken,
    requireRole('driver'),
    handleUpload(uploadMaintenanceBill.array('bills', 5)),
    driverController.requestMaintenance,
);
router.post(
    '/maintenance/:vehicleId/bills',
    verifyToken,
    requireRole('driver'),
    handleUpload(uploadMaintenanceBill.single('bill')),
    driverController.uploadMaintenanceBill,
);
router.delete(
    '/maintenance/:vehicleId/bills',
    verifyToken,
    requireRole('driver'),
    driverController.removeMaintenanceBill,
);
router.patch(
    '/maintenance/:vehicleId/cost',
    verifyToken,
    requireRole('driver'),
    driverController.updateMaintenanceCost,
);
router.post(
    '/maintenance/:vehicleId/complete',
    verifyToken,
    requireRole('driver'),
    driverController.completeMaintenance,
);

module.exports = router;
