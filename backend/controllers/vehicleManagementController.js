const vehicleManagementService = require('../services/vehicleManagementService');

const handleError = (res, err) => {
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) {
        console.error('Vehicle management error:', err);
    }
    res.status(statusCode).json({ error: err.message });
};

const listVehicleGroups = async (_req, res) => {
    try {
        const vehicleGroups = await vehicleManagementService.listVehicleGroups();
        res.json({ vehicleGroups });
    } catch (err) {
        handleError(res, err);
    }
};

const getVehicleGroupDetail = async (req, res) => {
    try {
        const vehicleGroup = await vehicleManagementService.getVehicleGroupDetail(req.params.id);
        res.json({ vehicleGroup });
    } catch (err) {
        handleError(res, err);
    }
};

const createVehicleGroup = async (req, res) => {
    try {
        const vehicleGroup = await vehicleManagementService.createVehicleGroup(req.body);
        res.status(201).json({ message: 'Vehicle group created successfully', vehicleGroup });
    } catch (err) {
        handleError(res, err);
    }
};

const updateVehicleGroup = async (req, res) => {
    try {
        const vehicleGroup = await vehicleManagementService.updateVehicleGroup(req.params.id, req.body);
        res.json({ message: 'Vehicle group updated successfully', vehicleGroup });
    } catch (err) {
        handleError(res, err);
    }
};

const deleteVehicleGroup = async (req, res) => {
    try {
        const result = await vehicleManagementService.deleteVehicleGroup(req.params.id);
        res.json({ message: 'Vehicle group hidden successfully', id: result.id });
    } catch (err) {
        handleError(res, err);
    }
};

const listVehicles = async (req, res) => {
    try {
        const result = await vehicleManagementService.listVehicles(req.query);
        res.json(result);
    } catch (err) {
        handleError(res, err);
    }
};

const getVehicleDetail = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.getVehicleDetail(req.params.id);
        res.json({ vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const createVehicle = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.createVehicle(req.body);
        res.status(201).json({ message: 'Vehicle created successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const updateVehicle = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.updateVehicle(req.params.id, req.body);
        res.json({ message: 'Vehicle updated successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const changeVehicleStatus = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.changeVehicleStatus(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle lifecycle action completed successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const sendVehicleToMaintenance = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.sendVehicleToMaintenance(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle sent to maintenance successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const completeMaintenance = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.completeMaintenance(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle maintenance marked ready for verification', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const verifyMaintenance = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.verifyMaintenance(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle maintenance verified!', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const markVehicleAsBroken = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.markVehicleAsBroken(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle marked as broken successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const restoreVehicle = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.restoreVehicle(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle restored successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const retireVehicle = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.retireVehicle(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Vehicle retired successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const setVehicleDriverAssignment = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.setVehicleDriverAssignment(req.params.id, req.body);
        res.json({ message: 'Vehicle driver assignment updated successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const softDeleteVehicle = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.softDeleteVehicle(req.params.id, req.user.userId);
        res.json({ message: 'Vehicle retired successfully', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const listAssignableDrivers = async (req, res) => {
    try {
        const drivers = await vehicleManagementService.listAssignableDrivers(req.query.vehicle_id ?? null);
        res.json({ drivers });
    } catch (err) {
        handleError(res, err);
    }
};

const listMaintenanceRequests = async (req, res) => {
    try {
        const requests = await vehicleManagementService.listMaintenanceRequests();
        res.json({ requests });
    } catch (err) {
        handleError(res, err);
    }
};

const approveMaintenanceRequest = async (req, res) => {
    try {
        const vehicle = await vehicleManagementService.approveMaintenanceRequest(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Đã duyệt yêu cầu bảo dưỡng', vehicle });
    } catch (err) {
        handleError(res, err);
    }
};

const rejectMaintenanceRequest = async (req, res) => {
    try {
        await vehicleManagementService.rejectMaintenanceRequest(req.params.id, req.user.userId, req.body);
        res.json({ message: 'Đã từ chối yêu cầu bảo dưỡng' });
    } catch (err) {
        handleError(res, err);
    }
};

module.exports = {
    listVehicleGroups,
    getVehicleGroupDetail,
    createVehicleGroup,
    updateVehicleGroup,
    deleteVehicleGroup,
    listVehicles,
    getVehicleDetail,
    createVehicle,
    updateVehicle,
    changeVehicleStatus,
    sendVehicleToMaintenance,
    completeMaintenance,
    verifyMaintenance,
    markVehicleAsBroken,
    restoreVehicle,
    retireVehicle,
    setVehicleDriverAssignment,
    softDeleteVehicle,
    listAssignableDrivers,
    listMaintenanceRequests,
    approveMaintenanceRequest,
    rejectMaintenanceRequest,
};
