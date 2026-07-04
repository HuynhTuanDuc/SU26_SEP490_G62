const driverService = require('../services/driverService');

const getMyVehicle = async (req, res) => {
    try {
        const vehicle = await driverService.getDriverVehicle(req.user.userId);
        if (!vehicle) return res.status(404).json({ error: 'Tài xế chưa được phân công xe' });
        res.json({ vehicle });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const getAllDrivers = async (_req, res) => {
    try {
        const drivers = await driverService.getAllDrivers();
        res.json({ drivers });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const listMaintenance = async (req, res) => {
    try {
        const records = await driverService.listMaintenanceForDriver(req.user.userId);
        res.json({ records });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const uploadMaintenanceBill = async (req, res) => {
    try {
        const billUrl = req.file?.path ?? null;
        const result = await driverService.uploadMaintenanceBill(req.user.userId, req.params.vehicleId, billUrl);
        res.json({ message: 'Maintenance bill uploaded successfully', ...result });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const completeMaintenance = async (req, res) => {
    try {
        const result = await driverService.completeMaintenance(req.user.userId, req.params.vehicleId, req.body);
        res.json({ message: 'Maintenance marked ready for verification', ...result });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

module.exports = { getAllDrivers, getMyVehicle, listMaintenance, uploadMaintenanceBill, completeMaintenance };
