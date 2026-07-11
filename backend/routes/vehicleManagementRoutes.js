const express = require('express');
const vehicleManagementController = require('../controllers/vehicleManagementController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(verifyToken);
router.use(requireRole('manager'));

router.get('/vehicle-groups', vehicleManagementController.listVehicleGroups);
router.post('/vehicle-groups', vehicleManagementController.createVehicleGroup);
router.get('/vehicle-groups/:id', vehicleManagementController.getVehicleGroupDetail);
router.put('/vehicle-groups/:id', vehicleManagementController.updateVehicleGroup);
router.delete('/vehicle-groups/:id', vehicleManagementController.deleteVehicleGroup);

router.get('/vehicles/driver-options', vehicleManagementController.listAssignableDrivers);
router.get('/vehicles', vehicleManagementController.listVehicles);
router.post('/vehicles', vehicleManagementController.createVehicle);
router.get('/vehicles/:id', vehicleManagementController.getVehicleDetail);
router.put('/vehicles/:id', vehicleManagementController.updateVehicle);
router.get('/maintenance-requests', vehicleManagementController.listMaintenanceRequests);
router.post('/maintenance-requests/:id/approve', vehicleManagementController.approveMaintenanceRequest);
router.post('/maintenance-requests/:id/reject', vehicleManagementController.rejectMaintenanceRequest);
router.post('/vehicles/:id/send-to-maintenance', vehicleManagementController.sendVehicleToMaintenance);
router.post('/vehicles/:id/complete-maintenance', vehicleManagementController.completeMaintenance);
router.post('/vehicles/:id/verify-maintenance', vehicleManagementController.verifyMaintenance);
router.post('/vehicles/:id/mark-broken', vehicleManagementController.markVehicleAsBroken);
router.post('/vehicles/:id/restore', vehicleManagementController.restoreVehicle);
router.post('/vehicles/:id/retire', vehicleManagementController.retireVehicle);
router.patch('/vehicles/:id/status', vehicleManagementController.changeVehicleStatus);
router.patch('/vehicles/:id/driver-assignment', vehicleManagementController.setVehicleDriverAssignment);
router.delete('/vehicles/:id', vehicleManagementController.softDeleteVehicle);

module.exports = router;
