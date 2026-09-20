const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadIncident } = require('../middleware/uploadMiddleware');
const incidentController = require('../controllers/incidentController');
const { handleUpload } = require('../middleware/handleUpload');

const driverOnly      = [verifyToken, requireRole('driver')];
const coordinatorOnly = [verifyToken, requireRole('coordinator')];
const staffOnly       = [verifyToken, requireRole('coordinator', 'manager')];

router.post('/',                         driverOnly,      handleUpload(uploadIncident.array('images', 3)), incidentController.createIncident);
router.get('/my/counts',                 driverOnly,      incidentController.getMyCounts);
router.get('/my',                        driverOnly,      incidentController.getMyIncidents);
router.get('/shipment/:shipmentId',      driverOnly,      incidentController.getShipmentIncidents);
router.get('/:id',                       driverOnly,      incidentController.getIncidentDetail);
router.patch('/:id',                     driverOnly,      incidentController.updateMyIncident);
router.patch('/:id/status',              staffOnly,       incidentController.updateIncidentStatus);
router.post('/:id/cancel-shipment',      staffOnly,       incidentController.cancelDamagedShipment);

// Coordinator/Manager tự tạo sự cố (VD: khách gọi điện báo, phát hiện qua giám sát)
router.post('/staff',                    staffOnly,       handleUpload(uploadIncident.array('images', 3)), incidentController.createIncidentByStaff);

module.exports = router;
