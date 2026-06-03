const XLSX = require('xlsx');
const pool = require('../config/database');
const orderRepository = require('../repositories/orderRepository');
const { SHIPMENT_STATUS } = require('../constants/tripConstants');

const normalizeNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numericValue = Number(String(value).replace(/,/g, '').trim());
    if (Number.isNaN(numericValue)) throw new Error('Số tiền hoặc khối lượng không hợp lệ');
    return numericValue;
};

const safeTrim = (value) => String(value ?? '').trim();
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

const buildNotes = ({ date, checkIn, plate, driverName, customerName, customerPhone, pickupAddress, deliveryAddress, notes }) => {
    return [
        date ? `Ngày: ${date}` : '',
        checkIn ? `Chấm công: ${checkIn}` : '',
        plate ? `BKS: ${plate}` : '',
        driverName ? `Lái xe: ${driverName}` : '',
        customerName ? `Khách hàng: ${customerName}` : '',
        customerPhone ? `SĐT: ${customerPhone}` : '',
        pickupAddress ? `Điểm lấy hàng: ${pickupAddress}` : '',
        deliveryAddress ? `Điểm giao hàng: ${deliveryAddress}` : '',
        notes ? safeTrim(notes) : '',
    ].filter(Boolean).join(' | ') || null;
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

const listOrders = async ({ page = 1, limit = 10, search = '', status = '' } = {}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));
    const offset = (safePage - 1) * safeLimit;
    const { rows, total } = await orderRepository.listOrders({
        limit: safeLimit,
        offset,
        search: safeTrim(search),
        status: safeTrim(status),
    });

    return {
        orders: rows,
        pagination: {
            total,
            page: safePage,
            limit: safeLimit,
            totalPages: Math.max(1, Math.ceil(total / safeLimit)),
        },
    };
};

const createOrder = async (userId, payload) => {
    const {
        date,
        check_in,
        plate,
        driver_id,
        customer_name,
        customer_phone,
        cargo_name,
        cargo_weight_kg,
        vehicle_group_id,
        pickup_address,
        delivery_address,
        estimated_price,
        notes,
    } = payload;

    if (!pickup_address || !delivery_address || estimated_price === undefined || estimated_price === null || estimated_price === '') {
        throw new Error('Thiếu thông tin bắt buộc');
    }

    const normalizedDate = normalizeDateInput(date);
    if (normalizedDate && isBeforeToday(normalizedDate)) {
        throw new Error('Ngày không được trước hôm nay');
    }

    const normalizedWeight = normalizeNumber(cargo_weight_kg);
    const normalizedPrice = normalizeNumber(estimated_price);
    const normalizedDriverId = driver_id ? Number(driver_id) : null;
    let dbClient = null;

    try {
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');
        const customer = await findOrCreateCustomer(dbClient, customer_name, customer_phone);
        const driver = normalizedDriverId ? await orderRepository.getDriverById(dbClient, normalizedDriverId) : await orderRepository.getDriverByPlate(dbClient, plate);

        if (driver_id && !driver) {
            throw new Error('Tài xế không tồn tại');
        }

        if (plate && !driver) {
            throw new Error('BKS không tồn tại hoặc chưa được gán cho tài xế');
        }

        if (plate && driver && driver.plate_number && driver.plate_number !== safeTrim(plate)) {
            throw new Error('BKS không khớp với tài xế đã chọn');
        }

        if (normalizedDriverId && plate && driver?.plate_number && driver.plate_number !== safeTrim(plate)) {
            throw new Error('Chọn BKS hoặc tài xế chưa khớp');
        }

        const finalDriverId = driver?.id ?? null;
        const finalVehicleId = driver?.vehicle_id ?? null;
        const finalVehicleGroupId = vehicle_group_id ? Number(vehicle_group_id) : driver?.vehicle_group_id ?? 1;
        const shipmentStatus = finalDriverId ? SHIPMENT_STATUS.CLAIMED : SHIPMENT_STATUS.AVAILABLE;

        const result = await orderRepository.createOrderWithShipment({
            client: dbClient,
            userId,
            orderData: {
                customer_id: customer?.id ?? null,
                cargo_name: safeTrim(cargo_name) || `${safeTrim(pickup_address)} - ${safeTrim(delivery_address)}`,
                cargo_weight_kg: normalizedWeight,
                pickup_address: safeTrim(pickup_address),
                delivery_address: safeTrim(delivery_address),
                estimated_price: normalizedPrice,
                status: shipmentStatus,
                notes: notes,
            },
            shipmentData: {
                vehicle_group_id: finalVehicleGroupId,
                owner_driver_id: finalDriverId,
                pickup_address: safeTrim(pickup_address),
                delivery_address: safeTrim(delivery_address),
                cargo_weight_kg: normalizedWeight,
                estimated_price: normalizedPrice,
                status: shipmentStatus,
                notes: notes,
            },
            assignmentData: finalDriverId && finalVehicleId ? {
                driver_id: finalDriverId,
                vehicle_id: finalVehicleId,
                assigned_by: userId,
            } : null,
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
            const pickupAddress = safeTrim(row['Điểm lấy hàng'] ?? row.pickup_address);
            const deliveryAddress = safeTrim(row['Điểm giao hàng'] ?? row.delivery_address);
            const route = safeTrim(row['Hành trình'] ?? row.route);
            const estimatedPrice = normalizeNumber(row['Cước xe'] ?? row.fare);
            const cargoWeight = normalizeNumber(row['Khối lượng'] ?? row.cargo_weight_kg);

            const missing = [];
            if (!date) missing.push('Ngày');
            if (!checkIn) missing.push('Chấm công');
            if (!plate) missing.push('BKS');
            if (!driverName) missing.push('Tài xế');
            if (!pickupAddress) missing.push('Điểm lấy hàng');
            if (!deliveryAddress) missing.push('Điểm giao hàng');
            if (estimatedPrice === null) missing.push('Cước xe');
            if (missing.length > 0) {
                throw new Error(`Thiếu thông tin bắt buộc trong file Excel: ${missing.join(', ')}`);
            }

            const customer = await findOrCreateCustomer(dbClient, customerName, customerPhone);
            const notes = [
                `Ngày: ${date}`,
                `Chấm công: ${checkIn}`,
                `BKS: ${plate}`,
                `Lái xe: ${driverName}`,
                customerName ? `Khách hàng: ${customerName}` : '',
                customerPhone ? `SĐT: ${customerPhone}` : '',
                route ? `Hành trình: ${route}` : `Hành trình: ${pickupAddress} - ${deliveryAddress}`,
                row['Doanh thu'] ? `Doanh thu: ${safeTrim(row['Doanh thu'])}` : '',
            ].filter(Boolean).join(' | ');

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
                },
                shipmentData: {
                    pickup_address: pickupAddress,
                    delivery_address: deliveryAddress,
                    cargo_weight_kg: cargoWeight,
                    estimated_price: estimatedPrice,
                    notes,
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
    } = payload;

    const result = await pool.query(
        `UPDATE orders
         SET cargo_name = COALESCE(NULLIF($2, ''), cargo_name),
             cargo_weight_kg = COALESCE($3, cargo_weight_kg),
             pickup_address = COALESCE(NULLIF($4, ''), pickup_address),
             delivery_address = COALESCE(NULLIF($5, ''), delivery_address),
             estimated_price = COALESCE($6, estimated_price),
             notes = COALESCE(NULLIF($7, ''), notes),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
            orderId,
            safeTrim(cargo_name),
            normalizeNumber(cargo_weight_kg),
            safeTrim(pickup_address),
            safeTrim(delivery_address),
            normalizeNumber(estimated_price),
            safeTrim(notes) || [
                customer_name ? `Khách hàng: ${safeTrim(customer_name)}` : '',
                customer_phone ? `SĐT: ${normalizePhone(customer_phone)}` : '',
            ].filter(Boolean).join(' | ') || null,
        ],
    );

    return result.rows[0] ?? null;
};

module.exports = { listOrders, createOrder, importOrdersFromExcel, updateOrder };
