const driverRepository = require('../repositories/driverRepository');
const vehicleManagementRepository = require('../repositories/vehicleManagementRepository');
const notificationService = require('./notificationService');
const notificationGateway = require('./notificationGateway');

const createError = (message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const getAllDrivers = async () => driverRepository.getAllDrivers();

const listMaintenanceForDriver = async (driverId) => {
    const records = await vehicleManagementRepository.getMaintenanceRecordsForDriver(driverId);
    return records;
};

const uploadMaintenanceBill = async (driverId, vehicleId, billUrl) => {
    const parsedVehicleId = Number(vehicleId);
    if (!Number.isInteger(parsedVehicleId) || parsedVehicleId <= 0) {
        throw createError('vehicle_id must be a positive integer', 400);
    }
    if (!billUrl) {
        throw createError('Bill image is required', 400);
    }

    const record = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(parsedVehicleId, driverId);
    if (!record) {
        throw createError('Open maintenance record for this driver and vehicle was not found', 404);
    }

    const currentBillPics = Array.isArray(record.bill_pics) ? record.bill_pics : [];
    const nextBillPics = [...currentBillPics, billUrl];
    await vehicleManagementRepository.updateMaintenanceBillPics(record.id, nextBillPics);

    return { maintenanceRecordId: record.id, bill_pics: nextBillPics };
};

const updateMaintenanceCost = async (driverId, vehicleId, cost) => {
    const parsedVehicleId = Number(vehicleId);
    if (!Number.isInteger(parsedVehicleId) || parsedVehicleId <= 0) {
        throw createError('vehicle_id must be a positive integer', 400);
    }
    const parsedCost = Number(cost);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
        throw createError('cost must be a non-negative number', 400);
    }

    const record = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(parsedVehicleId, driverId);
    if (!record) {
        throw createError('Open maintenance record for this driver and vehicle was not found', 404);
    }

    await vehicleManagementRepository.updateMaintenanceCost(record.id, parsedCost);
    return { maintenanceRecordId: record.id, cost: parsedCost };
};

const completeMaintenance = async (driverId, vehicleId) => {
    const parsedVehicleId = Number(vehicleId);
    if (!Number.isInteger(parsedVehicleId) || parsedVehicleId <= 0) {
        throw createError('vehicle_id must be a positive integer', 400);
    }

    const record = await vehicleManagementRepository.getActiveMaintenanceRecordForDriver(parsedVehicleId, driverId);
    if (!record) {
        throw createError('Open maintenance record for this driver and vehicle was not found', 404);
    }

    const billPics = Array.isArray(record.bill_pics) ? record.bill_pics : [];
    if (billPics.length === 0) {
        throw createError('At least one maintenance bill image is required before completion', 400);
    }

    await vehicleManagementRepository.completeMaintenanceRecordAndSetStatus({
        vehicleId: parsedVehicleId,
        maintenanceRecordId: record.id,
        driverId,
        billPics,
        performedBy: driverId,
    });

    // Notify manager role via WS for real-time dashboard update
    notificationGateway.broadcastToRole('manager', {
        type: 'maintenance.completed',
        vehicleId: parsedVehicleId,
        maintenanceRecordId: record.id,
    });

    // Persistent notification for the manager who created the record
    if (record.created_by) {
        try {
            await notificationService.createForUser(record.created_by, {
                title: 'Tài xế đã hoàn tất bảo dưỡng',
                message: 'Tài xế đã bảo dưỡng xong và tải lên hóa đơn. Vui lòng kiểm tra và xác nhận.',
                type: 'MAINTENANCE_COMPLETED',
                entityType: 'vehicle',
                entityId: parsedVehicleId,
                displayMode: 'alert',
            });
        } catch { /* notification failure must not abort the main flow */ }
    }

    return { maintenanceRecordId: record.id };
};

module.exports = {
    getAllDrivers,
    listMaintenanceForDriver,
    uploadMaintenanceBill,
    updateMaintenanceCost,
    completeMaintenance,
};
