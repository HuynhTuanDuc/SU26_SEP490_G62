const vehicleManagementRepository = require('../repositories/vehicleManagementRepository');
const notificationService = require('./notificationService');
const notificationGateway = require('./notificationGateway');

const VEHICLE_STATUSES = ['active', 'maintenance', 'broken', 'retired'];
const FAILURE_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const MAINTENANCE_TYPES = ['scheduled', 'repair', 'inspection', 'emergency'];

const createError = (message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const parsePositiveInteger = (value, fieldName, { required = true } = {}) => {
    if (value === undefined || value === null || value === '') {
        if (required) throw createError(`${fieldName} is required`, 400);
        return null;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw createError(`${fieldName} must be a positive integer`, 400);
    }

    return parsed;
};

const parseNullableNumber = (value, fieldName, { min = null } = {}) => {
    if (value === undefined || value === null || value === '') return null;

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw createError(`${fieldName} must be a valid number`, 400);
    }

    if (min !== null && parsed < min) {
        throw createError(`${fieldName} must be greater than or equal to ${min}`, 400);
    }

    return parsed;
};

const parseNullableDate = (value, fieldName) => {
    if (value === undefined || value === null || value === '') return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw createError(`${fieldName} must be a valid date`, 400);
    }

    return value;
};

const normalizeString = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const normalizeStringArray = (value, fieldName) => {
    if (value === undefined || value === null || value === '') return [];

    const rawValues = Array.isArray(value) ? value : [value];
    const normalized = rawValues
        .map((item) => String(item || '').trim())
        .filter(Boolean);

    if (normalized.length === 0) {
        throw createError(`${fieldName} must include at least one non-empty value`, 400);
    }

    return normalized;
};

const resolvePreferredValue = (value, fallback = null) => (
    value === undefined || value === null || value === ''
        ? (fallback ?? null)
        : value
);

const normalizeVehicleGroupPayload = (payload = {}) => {
    const name = String(payload.name || '').trim();
    if (!name) throw createError('Vehicle group name is required', 400);

    const pricePerKm = parseNullableNumber(payload.price_per_km, 'price_per_km', { min: 0 });
    if (pricePerKm === null) throw createError('price_per_km is required', 400);

    return {
        name,
        description: payload.description?.trim?.() || null,
        max_load_weight_kg: parseNullableNumber(payload.max_load_weight_kg, 'max_load_weight_kg', { min: 0 }),
        price_per_km: pricePerKm,
        upgrade_allowed: Boolean(payload.upgrade_allowed),
    };
};

const validateVehicleGroupNameUniqueness = async (name, excludeId = null) => {
    const existing = await vehicleManagementRepository.getVehicleGroupByName(name, excludeId);
    if (existing) throw createError('Vehicle group name already exists', 409);
};

const getVehicleOrThrow = async (vehicleId) => {
    const id = parsePositiveInteger(vehicleId, 'vehicle_id');
    const vehicle = await vehicleManagementRepository.getVehicleById(id);
    if (!vehicle) throw createError('Vehicle not found', 404);
    return vehicle;
};

const ensureVehicleStatus = (vehicle, allowedStatuses, actionName) => {
    if (!allowedStatuses.includes(vehicle.status)) {
        throw createError(`${actionName} is not allowed when vehicle status is ${vehicle.status}`, 409);
    }
};

const ensureVehicleNotRetired = (vehicle, actionName) => {
    if (vehicle.status === 'retired') {
        throw createError(`${actionName} is not allowed for a retired vehicle`, 409);
    }
};

const driverHasUnverifiedMaintenance = (driver) => Number(driver?.unverified_maintenance_count || 0) > 0;

const driverHasActiveShipments = (driver) => Number(driver?.active_shipment_count || 0) > 0;

const normalizeVehiclePayload = async (payload = {}, { vehicleId = null, existingVehicle = null } = {}) => {
    const plateNumber = String(payload.plate_number || '').trim();
    if (!plateNumber) throw createError('plate_number is required', 400);

    const vehicleGroupId = parsePositiveInteger(payload.vehicle_group_id, 'vehicle_group_id');
    const vehicleGroup = await vehicleManagementRepository.getVehicleGroupReferenceById(vehicleGroupId);
    if (!vehicleGroup) throw createError('Vehicle group does not exist', 400);

    const duplicatePlate = await vehicleManagementRepository.getVehicleByPlateNumber(plateNumber, vehicleId);
    if (duplicatePlate) throw createError('Plate number already exists', 409);

    const manufactureYear = payload.manufacture_year === undefined || payload.manufacture_year === null || payload.manufacture_year === ''
        ? null
        : Number(payload.manufacture_year);

    if (manufactureYear !== null) {
        if (!Number.isInteger(manufactureYear)) {
            throw createError('manufacture_year must be an integer', 400);
        }
        if (manufactureYear > new Date().getFullYear()) {
            throw createError('Manufacture year cannot be in the future', 400);
        }
    }

    const loadCapacity = parseNullableNumber(payload.load_capacity_kg, 'load_capacity_kg');
    if (loadCapacity !== null && loadCapacity <= 0) {
        throw createError('Load capacity must be positive', 400);
    }

    const assignedDriverId = parsePositiveInteger(payload.assigned_driver_id, 'assigned_driver_id', { required: false });
    const isCurrentVehicleDriver = existingVehicle?.assigned_driver_id !== null
        && existingVehicle?.assigned_driver_id !== undefined
        && Number(existingVehicle.assigned_driver_id) === assignedDriverId;

    if (assignedDriverId !== null) {
        const driver = await vehicleManagementRepository.getDriverById(assignedDriverId);
        if (!driver) throw createError('Assigned driver does not exist', 400);
        if (driverHasActiveShipments(driver) && !isCurrentVehicleDriver) {
            throw createError('Assigned driver must not have active shipments', 409);
        }
        if (driverHasUnverifiedMaintenance(driver) && !isCurrentVehicleDriver) {
            throw createError('Assigned driver has an unverified maintenance record and cannot be assigned yet', 409);
        }

        if (driver.vehicle_id && Number(driver.vehicle_id) !== Number(vehicleId)) {
            throw createError('Assigned driver is already assigned to another vehicle', 409);
        }
    }

    const effectiveStatus = existingVehicle?.status || 'active';
    if (effectiveStatus === 'retired' && assignedDriverId !== null) {
        throw createError('Retired vehicles cannot keep an assigned driver', 409);
    }

    return {
        plate_number: plateNumber,
        vehicle_group_id: vehicleGroupId,
        brand: payload.brand?.trim?.() || null,
        model: payload.model?.trim?.() || null,
        load_capacity_kg: loadCapacity,
        manufacture_year: manufactureYear,
        purchase_date: parseNullableDate(payload.purchase_date, 'purchase_date'),
        assigned_driver_id: assignedDriverId,
    };
};

const listVehicleGroups = async () => vehicleManagementRepository.listVehicleGroups();

const getVehicleGroupDetail = async (vehicleGroupId) => {
    const id = parsePositiveInteger(vehicleGroupId, 'vehicle_group_id');
    const vehicleGroup = await vehicleManagementRepository.getVehicleGroupById(id);
    if (!vehicleGroup) throw createError('Vehicle group not found', 404);
    return vehicleGroup;
};

const createVehicleGroup = async (payload) => {
    const normalizedPayload = normalizeVehicleGroupPayload(payload);
    await validateVehicleGroupNameUniqueness(normalizedPayload.name);

    const vehicleGroupId = await vehicleManagementRepository.createVehicleGroup(normalizedPayload);
    return getVehicleGroupDetail(vehicleGroupId);
};

const updateVehicleGroup = async (vehicleGroupId, payload) => {
    const id = parsePositiveInteger(vehicleGroupId, 'vehicle_group_id');
    const existingVehicleGroup = await vehicleManagementRepository.getVehicleGroupById(id);
    if (!existingVehicleGroup) throw createError('Vehicle group not found', 404);

    const normalizedPayload = normalizeVehicleGroupPayload(payload);
    await validateVehicleGroupNameUniqueness(normalizedPayload.name, id);

    await vehicleManagementRepository.updateVehicleGroup(id, normalizedPayload);
    return getVehicleGroupDetail(id);
};

const deleteVehicleGroup = async (vehicleGroupId) => {
    const id = parsePositiveInteger(vehicleGroupId, 'vehicle_group_id');
    const existingVehicleGroup = await vehicleManagementRepository.getVehicleGroupById(id);
    if (!existingVehicleGroup) throw createError('Vehicle group not found', 404);

    try {
        await vehicleManagementRepository.deleteVehicleGroup(id);
    } catch (err) {
        if (err.code === '23503') {
            throw createError('Vehicle group cannot be hidden because it is referenced by other records', 409);
        }
        throw err;
    }

    return { id };
};

const listVehicles = async (query = {}) => {
    const page = parsePositiveInteger(query.page ?? 1, 'page');
    const limit = parsePositiveInteger(query.limit ?? 10, 'limit');
    const vehicleGroupId = parsePositiveInteger(query.vehicle_group_id, 'vehicle_group_id', { required: false });
    const status = query.status ? String(query.status).trim() : null;

    if (status && !VEHICLE_STATUSES.includes(status)) {
        throw createError(`status must be one of: ${VEHICLE_STATUSES.join(', ')}`, 400);
    }

    const { rows, total } = await vehicleManagementRepository.listVehicles({
        page,
        limit,
        search: query.search?.trim?.() || null,
        status,
        vehicleGroupId,
    });

    return {
        items: rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        },
        filters: {
            search: query.search?.trim?.() || '',
            status: status || null,
            vehicle_group_id: vehicleGroupId,
        },
    };
};

const getVehicleDetail = async (vehicleId) => {
    const vehicle = await getVehicleOrThrow(vehicleId);
    const history = await vehicleManagementRepository.listVehicleStatusHistory(vehicle.id);
    return {
        ...vehicle,
        status_history: history,
    };
};

const validateAssignableDriver = async (
    assignedDriverId,
    {
        vehicleId = null,
        allowCurrentVehicleDriver = false,
        currentAssignedDriverId = null,
    } = {},
) => {
    const parsedDriverId = parsePositiveInteger(assignedDriverId, 'assigned_driver_id', { required: false });
    if (parsedDriverId === null) return null;

    const driver = await vehicleManagementRepository.getDriverById(parsedDriverId);
    if (!driver) throw createError('Assigned driver does not exist', 400);
    const isCurrentVehicleDriver = allowCurrentVehicleDriver
        && currentAssignedDriverId !== null
        && currentAssignedDriverId !== undefined
        && Number(currentAssignedDriverId) === parsedDriverId;
    if (driverHasActiveShipments(driver) && !isCurrentVehicleDriver) {
        throw createError('Assigned driver must not have active shipments', 409);
    }
    if (driverHasUnverifiedMaintenance(driver) && !isCurrentVehicleDriver) {
        throw createError('Assigned driver has an unverified maintenance record and cannot be assigned yet', 409);
    }
    if (driver.vehicle_id && Number(driver.vehicle_id) !== Number(vehicleId)) {
        throw createError('Assigned driver is already assigned to another vehicle', 409);
    }

    return parsedDriverId;
};

const validateMaintenanceDriver = async (performedBy, { vehicle = null, currentPerformedById = null, required = true } = {}) => {
    const parsedDriverId = parsePositiveInteger(performedBy, 'performed_by', { required });
    if (parsedDriverId === null) return null;

    const driver = await vehicleManagementRepository.getDriverById(parsedDriverId);
    if (!driver) throw createError('performed_by driver does not exist', 400);

    const hasActiveShipments = driverHasActiveShipments(driver);

    if (hasActiveShipments) {
        throw createError('performed_by driver must not have active shipments', 409);
    }

    return parsedDriverId;
};

const createVehicle = async (payload) => {
    const requestedStatus = payload.status ? String(payload.status).trim() : 'active';
    if (!VEHICLE_STATUSES.includes(requestedStatus)) {
        throw createError(`status must be one of: ${VEHICLE_STATUSES.join(', ')}`, 400);
    }
    if (requestedStatus !== 'active') {
        throw createError('Vehicle creation only supports initial status ACTIVE. Use manager actions for later lifecycle changes.', 400);
    }

    const normalizedPayload = await normalizeVehiclePayload(payload);
    const vehicleId = await vehicleManagementRepository.createVehicle({
        ...normalizedPayload,
        status: 'active',
    });
    return getVehicleDetail(vehicleId);
};

const updateVehicle = async (vehicleId, payload) => {
    const id = parsePositiveInteger(vehicleId, 'vehicle_id');
    const existingVehicle = await vehicleManagementRepository.getVehicleById(id);
    if (!existingVehicle) throw createError('Vehicle not found', 404);

    if (payload.status !== undefined && String(payload.status).trim() !== existingVehicle.status) {
        throw createError('Vehicle status cannot be edited directly. Use lifecycle actions instead.', 400);
    }

    const normalizedPayload = await normalizeVehiclePayload(payload, {
        vehicleId: id,
        existingVehicle,
    });

    const driverAssignmentChanged = Number(existingVehicle.assigned_driver_id || 0) !== Number(normalizedPayload.assigned_driver_id || 0);
    if (driverAssignmentChanged) {
        if (normalizedPayload.assigned_driver_id === null) {
            if (!['active', 'maintenance', 'broken'].includes(existingVehicle.status)) {
                throw createError(`Cannot unassign a driver when vehicle status is ${existingVehicle.status}`, 409);
            }
        } else if (existingVehicle.status !== 'active') {
            throw createError(`Cannot assign a driver when vehicle status is ${existingVehicle.status}`, 409);
        }
    }

    await vehicleManagementRepository.updateVehicle(id, normalizedPayload);
    return getVehicleDetail(id);
};

const sendVehicleToMaintenance = async (vehicleId, managerId, payload = {}) => {
    const vehicle = await getVehicleOrThrow(vehicleId);
    ensureVehicleStatus(vehicle, ['active', 'broken'], 'Send vehicle to maintenance');

    const maintenanceType = String(payload.maintenance_type || '').trim();
    if (!MAINTENANCE_TYPES.includes(maintenanceType)) {
        throw createError(`maintenance_type must be one of: ${MAINTENANCE_TYPES.join(', ')}`, 400);
    }

    const description = String(payload.description || '').trim();
    if (!description) {
        throw createError('description is required', 400);
    }

    const maintenanceDate = parseNullableDate(payload.maintenance_date, 'maintenance_date') || new Date().toISOString().slice(0, 10);
    const nextDueDate = parseNullableDate(payload.next_due_date, 'next_due_date');
    const performedBy = await validateMaintenanceDriver(
        resolvePreferredValue(payload.performed_by, vehicle.assigned_driver_id),
        { vehicle, required: true },
    );
    const parsedManagerId = parsePositiveInteger(managerId, 'manager_id');
    const note = normalizeString(payload.note) || description;
    let maintenanceResult;

    if (vehicle.status === 'broken') {
        if (!vehicle.active_failure_id) {
            throw createError('Cannot send broken vehicle to maintenance without an open breakdown incident', 409);
        }

        maintenanceResult = await vehicleManagementRepository.moveBrokenVehicleToMaintenance({
            vehicleId: vehicle.id,
            managerId: parsedManagerId,
            maintenanceType,
            description,
            maintenanceDate,
            nextDueDate,
            performedBy,
            note,
            failureResolutionNote: normalizeString(payload.failure_resolution_note)
                || normalizeString(payload.resolution_note)
                || `Breakdown moved to maintenance: ${description}`,
        });
    } else {
        maintenanceResult = await vehicleManagementRepository.createMaintenanceRecordAndSetStatus({
            vehicleId: vehicle.id,
            managerId: parsedManagerId,
            maintenanceType,
            description,
            maintenanceDate,
            nextDueDate,
            performedBy,
            note,
        });
    }

    // Notify driver via WS + persistent notification
    if (performedBy) {
        try {
            await notificationService.createForUser(performedBy, {
                title: 'Xe cần bảo dưỡng',
                message: `Xe ${vehicle.plate_number} cần đưa đi bảo dưỡng. ${description}`,
                type: 'MAINTENANCE_ASSIGNED',
                entityType: 'maintenance_record',
                entityId: maintenanceResult?.maintenanceId ?? null,
                displayMode: 'alert',
            });
            // Typed event for maintenance screen real-time refresh
            notificationGateway.broadcastToUser(performedBy, {
                type: 'maintenance.assigned',
                vehicleId: vehicle.id,
                maintenanceRecordId: maintenanceResult?.maintenanceId ?? null,
            });
        } catch { /* notification failure must not abort the main flow */ }
    }

    return getVehicleDetail(vehicle.id);
};

const completeMaintenance = async (vehicleId, managerId, payload = {}) => {
    const vehicle = await getVehicleOrThrow(vehicleId);
    ensureVehicleStatus(vehicle, ['maintenance'], 'Complete maintenance');
    const currentPerformedById = vehicle.active_maintenance_performed_by ?? null;
    const performedBy = await validateMaintenanceDriver(
        resolvePreferredValue(payload.performed_by, currentPerformedById ?? vehicle.assigned_driver_id),
        { vehicle, currentPerformedById, required: true },
    );
    const billPics = normalizeStringArray(payload.bill_pics, 'bill_pics');

    await vehicleManagementRepository.completeMaintenanceRecordAndSetStatus({
        vehicleId: vehicle.id,
        maintenanceRecordId: parsePositiveInteger(payload.maintenance_record_id, 'maintenance_record_id', { required: false }),
        driverId: parsePositiveInteger(managerId, 'driver_id'),
        billPics,
        performedBy,
    });

    return getVehicleDetail(vehicle.id);
};

const verifyMaintenance = async (vehicleId, managerId, payload = {}) => {
    const vehicle = await getVehicleOrThrow(vehicleId);
    ensureVehicleStatus(vehicle, ['maintenance'], 'Verify maintenance');

    if (!vehicle.active_maintenance_id) {
        throw createError('No active maintenance record found for this vehicle', 404);
    }

    if (vehicle.active_maintenance_status !== 'pending_verification') {
        throw createError('Maintenance is not ready for verification yet. Driver must upload bill images and mark it ready first.', 409);
    }

    try {
        await vehicleManagementRepository.verifyMaintenanceRecordAndSetStatus({
            vehicleId: vehicle.id,
            maintenanceRecordId: parsePositiveInteger(payload.maintenance_record_id, 'maintenance_record_id', { required: false }),
            managerId: parsePositiveInteger(managerId, 'manager_id'),
            note: normalizeString(payload.verification_note) || normalizeString(payload.note) || 'Maintenance verified',
        });
    } catch (err) {
        if (err.code === 'PENDING_MAINTENANCE_NOT_FOUND') {
            throw createError('Maintenance is not ready for verification yet. Refresh the page and ensure the driver has marked it ready.', 409);
        }
        if (err.code === 'MAINTENANCE_BILL_REQUIRED') {
            throw createError('Maintenance bill evidence is required before verification', 400);
        }
        if (err.code === 'MAINTENANCE_COST_REQUIRED') {
            throw createError('Maintenance cost must be greater than 0 before verification', 400);
        }
        throw err;
    }

    return getVehicleDetail(vehicle.id);
};

const markVehicleAsBroken = async (vehicleId, managerId, payload = {}) => {
    const vehicle = await getVehicleOrThrow(vehicleId);
    ensureVehicleStatus(vehicle, ['active'], 'Mark vehicle as broken');

    const failureType = String(payload.failure_type || '').trim();
    if (!failureType) {
        throw createError('failure_type is required', 400);
    }

    const description = String(payload.description || '').trim();
    if (!description) {
        throw createError('description is required', 400);
    }

    const severityLevel = payload.severity_level ? String(payload.severity_level).trim() : 'medium';
    if (!FAILURE_SEVERITIES.includes(severityLevel)) {
        throw createError(`severity_level must be one of: ${FAILURE_SEVERITIES.join(', ')}`, 400);
    }

    await vehicleManagementRepository.createFailureRecordAndSetStatus({
        vehicleId: vehicle.id,
        managerId: parsePositiveInteger(managerId, 'manager_id'),
        failureType,
        description,
        severityLevel,
        occurredAt: payload.occurred_at ? String(payload.occurred_at).trim() : null,
        note: normalizeString(payload.note) || description,
    });

    return getVehicleDetail(vehicle.id);
};

const restoreVehicle = async (vehicleId, managerId, payload = {}) => {
    const vehicle = await getVehicleOrThrow(vehicleId);
    ensureVehicleStatus(vehicle, ['broken'], 'Restore vehicle');

    await vehicleManagementRepository.resolveFailureRecordAndSetStatus({
        vehicleId: vehicle.id,
        failureRecordId: parsePositiveInteger(payload.failure_record_id, 'failure_record_id', { required: false }),
        managerId: parsePositiveInteger(managerId, 'manager_id'),
        resolutionNote: normalizeString(payload.resolution_note) || normalizeString(payload.note),
    });

    return getVehicleDetail(vehicle.id);
};

const retireVehicle = async (vehicleId, managerId, payload = {}) => {
    const vehicle = await getVehicleOrThrow(vehicleId);
    ensureVehicleNotRetired(vehicle, 'Retire vehicle');

    if (vehicle.status === 'maintenance') {
        throw createError('Cannot retire a vehicle while maintenance is still open. Verify or resolve maintenance first.', 409);
    }

    if (vehicle.status === 'broken' && vehicle.active_failure_id) {
        throw createError('Cannot retire a vehicle while a breakdown incident is still open. Restore or resolve the incident first.', 409);
    }

    await vehicleManagementRepository.retireVehicle({
        vehicleId: vehicle.id,
        managerId: parsePositiveInteger(managerId, 'manager_id'),
        note: normalizeString(payload.note),
    });

    return getVehicleDetail(vehicle.id);
};

const changeVehicleStatus = async (vehicleId, managerId, payload = {}) => {
    const vehicle = await getVehicleOrThrow(vehicleId);
    const nextStatus = String(payload.status || '').trim();
    if (!VEHICLE_STATUSES.includes(nextStatus)) {
        throw createError(`status must be one of: ${VEHICLE_STATUSES.join(', ')}`, 400);
    }

    if (nextStatus === vehicle.status) {
        return getVehicleDetail(vehicle.id);
    }

    switch (`${vehicle.status}->${nextStatus}`) {
        case 'active->maintenance':
        case 'broken->maintenance':
            return sendVehicleToMaintenance(vehicle.id, managerId, payload);
        case 'maintenance->active':
            return verifyMaintenance(vehicle.id, managerId, payload);
        case 'active->broken':
            return markVehicleAsBroken(vehicle.id, managerId, payload);
        case 'broken->active':
            return restoreVehicle(vehicle.id, managerId, payload);
        case 'active->retired':
        case 'maintenance->retired':
        case 'broken->retired':
            return retireVehicle(vehicle.id, managerId, payload);
        default:
            throw createError(`Invalid status transition from ${vehicle.status} to ${nextStatus}`, 409);
    }
};

const setVehicleDriverAssignment = async (vehicleId, payload = {}) => {
    const id = parsePositiveInteger(vehicleId, 'vehicle_id');
    const existingVehicle = await vehicleManagementRepository.getVehicleById(id);
    if (!existingVehicle) throw createError('Vehicle not found', 404);

    const assignedDriverId = payload.assigned_driver_id === undefined ? undefined : payload.assigned_driver_id;
    const parsedAssignedDriverId = parsePositiveInteger(assignedDriverId, 'assigned_driver_id', { required: false });
    const isUnassignAction = parsedAssignedDriverId === null;

    if (assignedDriverId === undefined) {
        throw createError('assigned_driver_id is required', 400);
    }

    if (isUnassignAction) {
        if (!['active', 'maintenance', 'broken'].includes(existingVehicle.status)) {
            throw createError(`Cannot unassign a driver when vehicle status is ${existingVehicle.status}`, 409);
        }
    } else if (existingVehicle.status !== 'active') {
        throw createError(`Cannot assign a driver when vehicle status is ${existingVehicle.status}`, 409);
    }

    const nextAssignedDriverId = isUnassignAction
        ? null
        : await validateAssignableDriver(parsedAssignedDriverId, {
            vehicleId: id,
            allowCurrentVehicleDriver: true,
            currentAssignedDriverId: existingVehicle.assigned_driver_id,
        });

    await vehicleManagementRepository.updateVehicle(id, {
        plate_number: existingVehicle.plate_number,
        vehicle_group_id: existingVehicle.vehicle_group_id,
        brand: existingVehicle.brand,
        model: existingVehicle.model,
        load_capacity_kg: existingVehicle.load_capacity_kg,
        manufacture_year: existingVehicle.manufacture_year,
        purchase_date: existingVehicle.purchase_date,
        assigned_driver_id: nextAssignedDriverId,
    });

    return getVehicleDetail(id);
};

const softDeleteVehicle = async (vehicleId, managerId) => retireVehicle(vehicleId, managerId, {});

const listAssignableDrivers = async (vehicleId = null) => {
    const currentVehicleId = vehicleId === null
        ? null
        : parsePositiveInteger(vehicleId, 'vehicle_id', { required: false });
    const vehicle = currentVehicleId === null
        ? null
        : await vehicleManagementRepository.getVehicleById(currentVehicleId);

    if (currentVehicleId !== null && !vehicle) {
        throw createError('Vehicle not found', 404);
    }

    const drivers = await vehicleManagementRepository.listDriverOptions();
    return drivers.map((driver) => ({
        ...driver,
        is_assignable: (
            (vehicle && Number(vehicle.assigned_driver_id) === Number(driver.id))
            || (
                (!driver.current_vehicle_id || Number(driver.current_vehicle_id) === Number(currentVehicleId))
                && !driverHasActiveShipments(driver)
                && !driverHasUnverifiedMaintenance(driver)
            )
        ),
        has_active_shipment: driverHasActiveShipments(driver),
        has_unverified_maintenance: driverHasUnverifiedMaintenance(driver),
        is_selected_vehicle_driver: vehicle ? Number(vehicle.assigned_driver_id) === Number(driver.id) : false,
        is_maintenance_eligible: !driverHasActiveShipments(driver) && !driverHasUnverifiedMaintenance(driver),
    }));
};

module.exports = {
    VEHICLE_STATUSES,
    MAINTENANCE_TYPES,
    FAILURE_SEVERITIES,
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
};
