const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadMaintenanceBill } = require('../middleware/uploadMiddleware');
const driverController = require('../controllers/driverController');

function handleUpload(middleware) {
    return (req, res, next) => {
        middleware(req, res, (err) => {
            if (err) return res.status(422).json({ error: err.message });
            next();
        });
    };
}

router.get('/', verifyToken, requireRole('coordinator', 'admin'), driverController.getAllDrivers);

router.get(
    '/maintenance',
    verifyToken,
    requireRole('driver'),
    driverController.listMaintenance,
);
router.post(
    '/maintenance/:vehicleId/bills',
    verifyToken,
    requireRole('driver'),
    handleUpload(uploadMaintenanceBill.single('bill')),
    driverController.uploadMaintenanceBill,
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
