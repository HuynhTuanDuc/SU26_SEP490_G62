const XLSX = require('xlsx');
const pool = require('../config/database');
const orderRepository = require('../repositories/orderRepository');
const { SHIPMENT_STATUS } = require('../constants/tripConstants');


const normalizeNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numericValue = Number(String(value).replace(/,/g, '').trim());
    if (Number.isNaN(numericValue)) throw new Error('Nhập số không hợp lệ');
    return numericValue;
};

const safeTrim = (value) => String(value ?? '').trim();

const normalizeText = (value) => safeTrim(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const isLeaveNote = (value) => normalizeText(value) === 'nghi';
const normalizePhone = (value) => safeTrim(value).replace(/[^\d+]/g, '');

const normalizeDateInput = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    const text = safeTrim(value);
    const isoLike = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoLike) return text;

    const slashLike = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashLike) {
        const [, day, month, year] = slashLike;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
};

const isBeforeToday = (dateText) => {
    if (!dateText) return false;
    const inputDate = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(inputDate.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return inputDate < today;
};



const parseRoute = (routeStr) => {
    const route = safeTrim(routeStr);
    if (!route) return { pickupAddress: '', deliveryAddress: '' };
    const parts = route.split(/\s+-\s+|-/);
    if (parts.length >= 2) {
        return {
            pickupAddress: parts[0].trim(),
            deliveryAddress: parts.slice(1).join(' - ').trim(),
        };
    }
    return { pickupAddress: route, deliveryAddress: route };
};

const parseExcelDate = (value) => {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    const text = String(value).trim();
    const isoLike = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoLike) return text;

    const slashLike = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashLike) {
        const [, day, month, year] = slashLike;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
};

const findOrCreateCustomer = async (client, customerName, customerPhone) => {
    return orderRepository.findOrCreateCustomer(client, customerName, customerPhone, normalizePhone, safeTrim);
};

const listOrders = async (query = {}) => {
    return orderRepository.listOrders(query);
};

const createOrder = async (userId, payload) => {
    const {
        date,
        arrived_at,
        plate,
        driver_id,
        vehicle_id,
        customer_name,
        customer_phone,
        cargo_name,
        cargo_weight_kg,
        vehicle_group_id,
        pickup_address,
        delivery_address,
        distance,
        notes,
        is_partner,
        partner_name,
        partner_fee,
    } = payload;

    let { trips } = payload;

    if (!pickup_address || !delivery_address) {
        throw new Error('Thiếu điểm nhận hoặc điểm đến');
    }

    const normalizedDate = normalizeDateInput(arrived_at || date);
    if (!normalizedDate) {
        throw new Error('Ngày giao hàng là bắt buộc');
    }
    if (isBeforeToday(normalizedDate)) {
        throw new Error('Ngày không được trước hôm nay');
    }

    const normalizedWeight = normalizeNumber(cargo_weight_kg);
    
    let dbClient = null;

    try {
        dbClient = await pool.connect();

        await dbClient.query('BEGIN');
        
        const customer = await findOrCreateCustomer(dbClient, customer_name, customer_phone);
        const defaultVehicleGroupId = await orderRepository.getDefaultVehicleGroupId(dbClient);

        const shipmentsDataArray = [];

        for (const trip of trips) {
            const { plate, vehicle_group_id, distance, pickup_address: trip_pickup, delivery_address: trip_delivery } = trip;
            const normalizedDistance = normalizeNumber(distance);
            if (normalizedDistance === null || normalizedDistance <= 0) {
                throw new Error('Quãng đường là bắt buộc để tính cước');
            }

            if (!plate) {
                throw new Error('BKS là bắt buộc khi tạo đơn');
            }

            const finalVehicleGroupId = vehicle_group_id ? Number(vehicle_group_id) : defaultVehicleGroupId;

            if (!finalVehicleGroupId) {
                throw new Error('Chưa có nhóm xe trong hệ thống');
            }

            const vehicleGroup = await orderRepository.getVehicleGroupById(dbClient, finalVehicleGroupId);
            if (!vehicleGroup) {
                throw new Error('Nhóm xe không tồn tại');
            }

            const vehicle = await orderRepository.getVehicleByPlate(dbClient, plate, finalVehicleGroupId);

            if (plate && !vehicle) {
                throw new Error(`BKS ${plate} không tồn tại trong nhóm xe đã chọn`);
            }

            if (vehicle?.vehicle_status && vehicle.vehicle_status !== 'active') {
                throw new Error(`Xe ${vehicle.plate_number} hiện không sẵn sàng cho điều phối (trạng thái: ${vehicle.vehicle_status})`);
            }

            const normalizedPrice = normalizedDistance * Number(vehicleGroup.price_per_km || 0);

            const finalDriverId = vehicle?.assigned_driver_id ?? null;
            const finalVehicleId = vehicle?.id ?? null;
            const shipmentStatus = SHIPMENT_STATUS.AVAILABLE;

            const orderNotes = notes !== undefined ? safeTrim(notes) : '';

            shipmentsDataArray.push({
                vehicle_group_id: finalVehicleGroupId,
                owner_driver_id: finalDriverId,
                vehicle_id: finalVehicleId,
                cargo_name: safeTrim(cargo_name) || `${safeTrim(pickup_address)} - ${safeTrim(delivery_address)}`,
                cargo_weight_kg: normalizedWeight,
                estimated_price: normalizedPrice,
                estimated_distance_km: normalizedDistance,
                arrived_at: normalizedDate,
                plate_number: vehicle.plate_number,
                status: shipmentStatus,
                payment_type: payload.payment_type,
                notes: orderNotes,
                pickup_address: safeTrim(trip_pickup || pickup_address),
                delivery_address: safeTrim(trip_delivery || delivery_address),
                assignmentData: finalDriverId && finalVehicleId ? {
                    driver_id: finalDriverId,
                    vehicle_id: finalVehicleId,
                    assigned_by: userId,
                    pickup_address: safeTrim(trip_pickup || pickup_address),
                    delivery_address: safeTrim(trip_delivery || delivery_address),
                } : null,
            });
        }

        const result = await orderRepository.createOrderWithMultipleShipments({
            client: dbClient,
            userId,
            orderData: {
                customer_id: customer?.id ?? null,
                cargo_name: safeTrim(cargo_name) || `${safeTrim(pickup_address)} - ${safeTrim(delivery_address)}`,
                cargo_weight_kg: normalizedWeight,
                payment_type: payload.payment_type,
                notes: notes !== undefined ? safeTrim(notes) : '',
                partner_name: is_partner ? safeTrim(partner_name) : null,
                total_actual_price: is_partner ? normalizeNumber(partner_fee) : 0,
            },
            shipmentsDataArray
        });

        await dbClient.query('COMMIT');
        return result;
    } catch (err) {
        if (dbClient) {
            await dbClient.query('ROLLBACK');
        }
        throw err;
    } finally {
        dbClient?.release?.();
    }
};

const importOrdersFromExcel = async (userId, fileBuffer) => {
    if (!fileBuffer) throw new Error('Thiếu file Excel');

    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('File Excel không có sheet nào');

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) return [];

    let dbClient = null;
    const createdOrders = [];

    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');

        for (const row of rows) {
            const date = parseExcelDate(row['Ngày'] ?? row.date);
            const checkIn = safeTrim(row['Chấm công'] ?? row.checkIn);
            const plate = safeTrim(row['BKS'] ?? row.plate);
            const driverName = safeTrim(row['Lái xe'] ?? row.driver);
            const customerName = safeTrim(row['Khách hàng'] ?? row.customer_name);
            const customerPhone = normalizePhone(row['SĐT'] ?? row.phone);
            const route = safeTrim(row['Hành trình'] ?? row.route);
            const routeAddresses = parseRoute(route);
            const pickupAddress = safeTrim(row['Điểm lấy hàng'] ?? row.pickup_address) || routeAddresses.pickupAddress;
            const deliveryAddress = safeTrim(row['Điểm giao hàng'] ?? row.delivery_address) || routeAddresses.deliveryAddress;
            const distanceValue = normalizeNumber(row['Quãng đường'] ?? row.distance);
            let estimatedPrice = 0;
            const cargoWeight = normalizeNumber(row['Khối lượng'] ?? row.cargo_weight_kg);
            const note = safeTrim(row['Ghi chú'] ?? row.notes ?? row.note);

            if (isLeaveNote(note)) {
                continue;
            }

            const missing = [];
            if (!date) missing.push('Ngày');
            if (!checkIn) missing.push('Chấm công');
            if (!plate) missing.push('BKS');
            if (!pickupAddress) missing.push('Điểm lấy hàng');
            if (!deliveryAddress) missing.push('Điểm giao hàng');
            if (distanceValue === null || distanceValue <= 0) missing.push('Quãng đường');
            if (missing.length > 0) {
                throw new Error(`Thiếu thông tin bắt buộc trong file Excel: ${missing.join(', ')}`);
            }

            const customer = await findOrCreateCustomer(dbClient, customerName, customerPhone);
            const defaultVehicleGroupId = await orderRepository.getDefaultVehicleGroupId(dbClient);
            if (!defaultVehicleGroupId) {
                throw new Error('Chưa có nhóm xe trong hệ thống');
            }
            const vehicle = await orderRepository.getVehicleByPlate(dbClient, plate);
            if (!vehicle) {
                throw new Error(`BKS ${plate} không tồn tại trong hệ thống`);
            }
            if (vehicle.vehicle_status !== 'active') {
                throw new Error(`Xe ${plate} hiện không sẵn sàng cho vận hành (trạng thái: ${vehicle.vehicle_status})`);
            }
            const finalDriverId = null;
            const finalVehicleId = vehicle.id;
            const finalVehicleGroupId = vehicle.vehicle_group_id ?? defaultVehicleGroupId;
            const vehicleGroup = await orderRepository.getVehicleGroupById(dbClient, finalVehicleGroupId);
            estimatedPrice = distanceValue * Number(vehicleGroup?.price_per_km || 0);
            const shipmentStatus = SHIPMENT_STATUS.AVAILABLE;

            const notes = note !== undefined ? safeTrim(note) : '';

            const result = await orderRepository.importOrderWithShipment({
                client: dbClient,
                userId,
                orderData: {
                    customer_id: customer?.id ?? null,
                    cargo_name: route || `${pickupAddress} - ${deliveryAddress}`,
                    cargo_weight_kg: cargoWeight,
                    pickup_address: pickupAddress,
                    delivery_address: deliveryAddress,
                    estimated_price: estimatedPrice,
                    notes,
                    status: shipmentStatus,
                },
                shipmentData: {
                    pickup_address: pickupAddress,
                    delivery_address: deliveryAddress,
                    cargo_weight_kg: cargoWeight,
                    estimated_price: estimatedPrice,
                    estimated_distance_km: distanceValue,
                    arrived_at: date,
                    plate_number: plate,
                    notes,
                    vehicle_group_id: finalVehicleGroupId,
                    owner_driver_id: finalDriverId,
                    vehicle_id: finalVehicleId,
                    status: shipmentStatus,
                },
            });

            createdOrders.push(result);
        }

        await dbClient.query('COMMIT');
        return createdOrders;
    } catch (err) {
        if (dbClient) {
            await dbClient.query('ROLLBACK');
        }
        throw err;
    } finally {
        dbClient?.release?.();
    }
};

const updateOrder = async (orderId, payload) => {
    const {
        customer_name,
        customer_phone,
        cargo_name,
        cargo_weight_kg,
        pickup_address,
        delivery_address,
        estimated_price,
        notes,
        date,
        arrived_at,
        plate,
        driver_id,
        vehicle_id,
        vehicle_group_id,
        distance,
        is_partner,
        partner_name,
        partner_fee,
    } = payload;

    let { trips } = payload;
    if (!trips || !Array.isArray(trips) || trips.length === 0) {
        trips = [{
            plate: payload.plate,
            vehicle_group_id: payload.vehicle_group_id,
            distance: payload.distance
        }];
    }

    const shipmentsDataArray = [];
    const dbClient = await pool.connect();
    
    try {
        const defaultVehicleGroupId = await orderRepository.getDefaultVehicleGroupId(dbClient);

        for (const trip of trips) {
            const { plate, vehicle_group_id, distance, pickup_address: trip_pickup, delivery_address: trip_delivery } = trip;
            const normalizedDistance = normalizeNumber(distance);
            
            if (normalizedDistance === null || normalizedDistance <= 0) {
                throw new Error('Quãng đường là bắt buộc để tính cước');
            }

            const finalVehicleGroupId = vehicle_group_id ? Number(vehicle_group_id) : defaultVehicleGroupId;
            const vehicleGroup = finalVehicleGroupId ? await orderRepository.getVehicleGroupById(dbClient, finalVehicleGroupId) : null;
            if (!vehicleGroup) {
                throw new Error('Nhóm xe không tồn tại');
            }

            const vehicle = plate ? await orderRepository.getVehicleByPlate(dbClient, plate, finalVehicleGroupId) : null;
            if (plate && !vehicle) {
                throw new Error(`BKS ${plate} không tồn tại trong nhóm xe đã chọn`);
            }
            if (vehicle?.vehicle_status && vehicle.vehicle_status !== 'active') {
                throw new Error(`Xe ${vehicle.plate_number} hiện không sẵn sàng cho điều phối (trạng thái: ${vehicle.vehicle_status})`);
            }

            const normalizedPrice = normalizedDistance * Number(vehicleGroup.price_per_km || 0);

            shipmentsDataArray.push({
                vehicle_group_id: finalVehicleGroupId,
                owner_driver_id: vehicle?.assigned_driver_id ?? null,
                vehicle_id: vehicle?.id ?? null,
                estimated_price: normalizedPrice,
                estimated_distance_km: normalizedDistance,
                plate_number: vehicle?.plate_number,
                pickup_address: safeTrim(trip_pickup || pickup_address),
                delivery_address: safeTrim(trip_delivery || delivery_address),
            });
        }
    
    } finally {
        dbClient.release();
    }

    return orderRepository.updateOrder(orderId, {
        customer_name,
        customer_phone,
        cargo_name,
        cargo_weight_kg,
        pickup_address,
        delivery_address,
        notes,
        arrived_at: arrived_at || date,
        partner_name: is_partner ? safeTrim(partner_name) : null,
        total_actual_price: is_partner ? normalizeNumber(partner_fee) : 0,
    }, normalizeNumber, safeTrim, normalizePhone, shipmentsDataArray);
};

const cancelOrder = async (orderId, reason) => {
    return orderRepository.cancelOrder(orderId, safeTrim(reason) || 'Coordinator cancelled order');
};

module.exports = { listOrders, createOrder, importOrdersFromExcel, updateOrder, cancelOrder };
