const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/authMiddleware');
const { uploadIncident } = require('../middleware/uploadMiddleware');
const incidentController = require('../controllers/incidentController');

const driverOnly      = [verifyToken, requireRole('driver')];
const coordinatorOnly = [verifyToken, requireRole('coordinator')];

function handleUpload(middleware) {
    return (req, res, next) => {
        middleware(req, res, (err) => {
            if (err) return res.status(422).json({ error: err.message });
            next();
        });
    };
}

router.post('/',                         driverOnly,      handleUpload(uploadIncident.array('images', 3)), incidentController.createIncident);
router.get('/my/counts',                 driverOnly,      incidentController.getMyCounts);
router.get('/my',                        driverOnly,      incidentController.getMyIncidents);
router.get('/shipment/:shipmentId',      driverOnly,      incidentController.getShipmentIncidents);
router.get('/:id',                       driverOnly,      incidentController.getIncidentDetail);
router.patch('/:id',                     driverOnly,      incidentController.updateMyIncident);
router.patch('/:id/status',              coordinatorOnly, incidentController.updateIncidentStatus);

module.exports = router;
