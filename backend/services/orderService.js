const pool = require('../config/database');
const logger = require('../config/logger');
const orderRepository = require('../repositories/orderRepository');
const notificationGateway = require('./notificationGateway');
const { notifyRolesSafe } = require('./roleNotificationService');
const { SHIPMENT_STATUS } = require('../constants/tripConstants');
const { normalizeVietnamPhone } = require('../utils/phone');
const { money } = require('../utils/formatNumber');
const { optionalMoney } = require('../utils/money');


// CHỈ dùng cho ĐẠI LƯỢNG ĐO (quãng đường km, khối lượng kg) — KHÔNG dùng cho tiền.
//
// Với số đo, dấu chấm đúng là dấu thập phân: "12.5" km nghĩa là mười hai phẩy năm.
// Với tiền Việt thì ngược lại, dấu chấm phân cách hàng nghìn: "12.000" là mười hai
// nghìn chứ không phải mười hai. Cùng một chuỗi, hai nghĩa trái ngược — nên hai loại
// trường phải đi qua hai bộ kiểm khác nhau. Tiền dùng optionalMoney bên dưới.
const normalizeNumber = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const numericValue = Number(String(value).replace(/,/g, '').trim());
    if (Number.isNaN(numericValue)) throw new Error('Nhập số không hợp lệ');
    return numericValue;
};

// allowZero: điều phối để trống hoặc gõ 0 đều nghĩa là "không có khoản này" / "dùng giá
// tự tính", đó là thao tác hợp lệ — chỉ chặn khi con số thật sự sai định dạng.
const normalizeMoney = (value, fieldLabel) => optionalMoney(value, { field: fieldLabel, allowZero: true });

const normalizeNonNegativeAmount = (value, fieldLabel) => normalizeMoney(value, fieldLabel) ?? 0;

const safeTrim = (value) => String(value ?? '').trim();

const normalizeText = (value) => safeTrim(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const isLeaveNote = (value) => normalizeText(value) === 'nghi';
// Chuẩn hoá SĐT VN (bỏ dấu cách/gạch, +84→0...) để khớp khách cũ dù gõ khác định dạng
const normalizePhone = (value) => normalizeVietnamPhone(value);

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

const ensureUniqueActiveAssignment = (seen, key, label) => {
    if (!key) return;
    if (seen.has(String(key))) {
        throw new Error(`${label} đã được gán cho một chuyến khác trong cùng yêu cầu`);
    }
    seen.add(String(key));
};

const broadcastCoordinatorOrderChange = (action, order) => {
    notificationGateway.broadcastToRole('coordinator', {
        type: 'coordinator.orders.changed',
        action,
        orderId: order?.id ?? null,
    });
};

const notifyOrderChange = (action, order, actorId = null, extra = {}) => {
    const customerText = order?.customer_name ? ` cho ${order.customer_name}` : '';
    const titleByAction = {
        created: 'Có đơn hàng mới',
        imported: 'Đã import đơn hàng',
        updated: 'Đơn hàng đã được cập nhật',
        cancelled: 'Đơn hàng đã bị hủy',
    };
    const messageByAction = {
        created: `Đơn hàng #${order?.id ?? ''}${customerText} vừa được tạo.`,
        imported: `Đã import ${extra.count ?? 0} đơn hàng từ Excel.`,
        updated: `Đơn hàng #${order?.id ?? ''}${customerText} vừa được cập nhật.`,
        cancelled: `Đơn hàng #${order?.id ?? ''}${customerText} vừa bị hủy${extra.reason ? `: ${extra.reason}` : '.'}`,
    };

    notifyRolesSafe(['coordinator', 'accountant', 'manager'], {
        title: titleByAction[action] || 'Đơn hàng có thay đổi',
        message: messageByAction[action] || `Đơn hàng #${order?.id ?? ''} có thay đổi.`,
        type: `ORDER_${String(action || 'changed').toUpperCase()}`,
        entityType: 'orders',
        entityId: order?.id ?? null,
    }, { displayMode: action === 'cancelled' ? 'alert' : 'toast', excludeUserId: actorId });
};

/**
 * Ảnh chụp "chuyến nào đang thuộc về tài nào" của một đơn, dạng Map<shipmentId, driverId>.
 * Chụp TRƯỚC khi sửa đơn để sau đó biết ai là người MỚI được giao việc.
 */
const snapshotShipmentOwners = async (orderId) => {
    const owners = await orderRepository.listShipmentOwners(orderId);
    return new Map(owners.map((row) => [row.id, row.owner_driver_id]));
};

/**
 * Báo cho tài xế khi chuyến rơi thẳng vào tay họ ngay lúc tạo/sửa đơn.
 *
 * Vì sao cần: chọn biển số xe đã có tài xế cố định là chuyến sinh ra đã thuộc về tài đó
 * với status = 'claimed' luôn — tài xế KHÔNG phải bấm nhận, chuyến tự nằm trong danh
 * sách của họ. Nhưng luồng tạo/sửa đơn chỉ gọi notifyOrderChange, mà hàm đó bắn theo
 * VAI TRÒ (coordinator/accountant/manager) — tài xế không nằm trong danh sách nào nên
 * tuyệt đối không nhận được gì. Điều phối viên tưởng đã giao việc xong, tài xế thì
 * không hề biết mình có chuyến.
 *
 * Khác với assignOrderShipments (gán sau, tài đã có đơn sẵn), đây là đường "gán ngay
 * lúc tạo/sửa đơn" nên phải tự lo phần báo tin.
 *
 * Chủ chuyến LUÔN đọc lại từ DB (v_shipment_current), không nhận từ hàng vừa insert:
 * order_shipments không có cột owner_driver_id nên `RETURNING *` không hề mang tài xế
 * theo. Bản trước duyệt owner_driver_id trên chính những hàng đó, giá trị luôn là
 * undefined nên vòng lặp bỏ qua sạch và hàm thoát ở "không có ai để báo" — thông báo
 * giao chuyến chưa từng tới tay tài xế lần nào, dù code trông như đã gửi.
 *
 * `truoc` = ảnh chụp chủ chuyến trước thao tác. Chỉ báo cho người có thay đổi, nên sửa
 * lại giá cước hay địa chỉ của đơn cũ không bắn lại thông báo cho tài đã biết chuyến.
 */
const notifyDriversAssignedOnOrder = async (orderId, { truoc = new Map(), isUpdate = false } = {}) => {
    if (!orderId) return;
    // require trễ: notificationService kéo ngược lại orderService qua chuỗi service khác.
    // notificationGateway thì đã nạp sẵn ở đầu file, không vướng vòng.
    const notificationService = require('./notificationService');

    const shipments = await orderRepository.listShipmentOwners(orderId);

    // Một tài có thể ôm nhiều chuyến trong cùng đơn — gộp lại, đừng bắn n lần.
    const shipmentsByDriver = new Map();
    for (const shipment of shipments) {
        const driverId = shipment.owner_driver_id;
        if (!driverId) continue;
        if (truoc.get(shipment.id) === driverId) continue;   // tài này đã biết chuyến rồi
        if (!shipmentsByDriver.has(driverId)) shipmentsByDriver.set(driverId, []);
        shipmentsByDriver.get(driverId).push(shipment.id);
    }
    if (shipmentsByDriver.size === 0) return;

    for (const [driverId, shipmentIds] of shipmentsByDriver) {
        try {
            notificationGateway.broadcastToUser(driverId, {
                type: 'trip.assigned',
                orderId: Number(orderId),
                shipmentIds,
                activatedShipmentId: shipmentIds[0],
            });
        } catch { /* realtime failure must not abort order creation */ }
    }

    // await: việc cuối trước khi controller trả response, mà Cloud Run bóp CPU ngay sau
    // đó. Đơn đã commit rồi nên lỗi báo tin không được phép ném ra ngoài.
    await Promise.all([...shipmentsByDriver].map(([driverId, shipmentIds]) => {
        const nhieu = shipmentIds.length > 1;
        return notificationService.createForUser(driverId, {
            title: nhieu ? `Bạn được giao ${shipmentIds.length} chuyến mới` : 'Bạn được giao 1 chuyến mới',
            message: nhieu
                ? `Điều phối viên đã giao ${shipmentIds.length} chuyến của đơn #${orderId} cho bạn.`
                : `Điều phối viên đã giao chuyến #${shipmentIds[0]} (đơn #${orderId}) cho bạn.`,
            type: 'TRIP_ASSIGNED',
            entityType: 'shipments',
            entityId: shipmentIds[0],
        }, { displayMode: 'alert' });
    })).catch((err) => {
        logger.warn('[order] không gửi được thông báo giao chuyến cho tài xế', {
            orderId, isUpdate, message: err.message,
        });
    });
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
        partner_id,
        prepaid_amount,
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
        const usedVehicleIds = new Set();
        const usedDriverIds = new Set();

        for (const trip of trips) {
            const { plate, vehicle_group_id, distance, pickup_address: trip_pickup, delivery_address: trip_delivery } = trip;
            const normalizedDistance = normalizeNumber(distance);
            if (normalizedDistance === null || normalizedDistance <= 0) {
                throw new Error('Quãng đường là bắt buộc để tính cước');
            }

            // CẢNH BÁO NGHIỆP VỤ: defaultVehicleGroupId là nhóm có id NHỎ NHẤT — dòng đầu
            // bảng, không mang nghĩa "nhóm phù hợp". Bỏ trống nhóm xe nghĩa là chuyến nhận
            // một bảng giá ngẫu nhiên, và kể từ khi os.vehicle_group_id trở thành cơ sở
            // tính cước DUY NHẤT (xe chạy thật có thể khác nhóm) thì đoán hộ giá trị này
            // chính là đoán hộ số tiền khách phải trả.
            //
            // Form điều phối đã bắt buộc chọn nhóm xe nên đường này không còn đi vào trong
            // thực tế; fallback giữ lại để không phá hợp đồng API hiện có (import, kiểm thử,
            // client cũ). Muốn siết cứng thì đổi thành `: null` và ném lỗi ngay dưới —
            // nhớ cập nhật các ca kiểm thử đang gọi createOrder không kèm nhóm xe.
            const finalVehicleGroupId = vehicle_group_id ? Number(vehicle_group_id) : defaultVehicleGroupId;

            if (!finalVehicleGroupId) {
                throw new Error('Chưa có nhóm xe trong hệ thống');
            }

            const vehicleGroup = await orderRepository.getVehicleGroupById(dbClient, finalVehicleGroupId);
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
            // Đơn giá/km chỉ là gợi ý — coordinator có thể chốt giá cước khác cho từng chuyến
            const manualPrice = normalizeMoney(trip.price, 'Giá cước chuyến');
            const isPriceManual = manualPrice !== null && manualPrice > 0;
            const finalPrice = isPriceManual ? manualPrice : normalizedPrice;

            const finalDriverId = vehicle?.assigned_driver_id ?? null;
            const finalVehicleId = vehicle?.id ?? null;

            if (finalDriverId && finalVehicleId) {
                await orderRepository.validateVehicleShipmentAssignment(dbClient, {
                    vehicleId: finalVehicleId,
                    driverId: finalDriverId,
                });
            }
            ensureUniqueActiveAssignment(usedVehicleIds, finalVehicleId, `Xe ${vehicle?.plate_number || plate}`);
            ensureUniqueActiveAssignment(usedDriverIds, finalDriverId, 'Tài xe');

            const shipmentStatus =
                finalDriverId && finalVehicleId
                    ? SHIPMENT_STATUS.CLAIMED
                    : SHIPMENT_STATUS.AVAILABLE;

            const orderNotes = notes !== undefined ? safeTrim(notes) : '';

            shipmentsDataArray.push({
                owner_driver_id: finalDriverId,
                vehicle_id: finalVehicleId,
                vehicle_group_id: finalVehicleGroupId,
                cargo_name: safeTrim(cargo_name) || `${safeTrim(pickup_address)} - ${safeTrim(delivery_address)}`,
                cargo_weight_kg: normalizedWeight,
                estimated_price: finalPrice,
                is_price_manual: isPriceManual,
                estimated_distance_km: normalizedDistance,
                arrived_at: normalizedDate,
                plate_number: vehicle?.plate_number || null,
                status: shipmentStatus,
                payment_type: payload.payment_type,
                notes: orderNotes,
                pickup_address: safeTrim(trip_pickup || pickup_address),
                delivery_address: safeTrim(trip_delivery || delivery_address),
                pickup_addresses: (Array.isArray(trip.pickup_addresses) ? trip.pickup_addresses : [trip_pickup || pickup_address]).filter(Boolean),
                delivery_addresses: (Array.isArray(trip.delivery_addresses) ? trip.delivery_addresses : [trip_delivery || delivery_address]).filter(Boolean),
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
                partner_id: is_partner ? (Number(partner_id) || null) : null,
                prepaid_amount: normalizeNonNegativeAmount(prepaid_amount, 'Số tiền khách ứng trước'),
            },
            shipmentsDataArray
        });

        await dbClient.query('COMMIT');
        broadcastCoordinatorOrderChange('created', result.order);
        notifyOrderChange('created', result.order, userId);
        await notifyDriversAssignedOnOrder(result.order?.id);
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

    // Nạp muộn — xem ghi chú ở coordinatorService.parseSpreadsheet.
    const XLSX = require('xlsx');
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
                    pickup_addresses: [pickupAddress],
                    delivery_addresses: [deliveryAddress],
                    estimated_price: estimatedPrice,
                    notes,
                    status: shipmentStatus,
                },
                shipmentData: {
                    pickup_address: pickupAddress,
                    delivery_address: deliveryAddress,
                    pickup_addresses: [pickupAddress],
                    delivery_addresses: [deliveryAddress],
                    cargo_weight_kg: cargoWeight,
                    vehicle_group_id: finalVehicleGroupId,
                    estimated_price: estimatedPrice,
                    estimated_distance_km: distanceValue,
                    arrived_at: date,
                    plate_number: plate,
                    notes,
                    owner_driver_id: finalDriverId,
                    vehicle_id: finalVehicleId,
                    status: shipmentStatus,
                },
            });

            createdOrders.push(result);
        }

        await dbClient.query('COMMIT');
        if (createdOrders.length > 0) {
            notifyOrderChange('imported', createdOrders[0]?.order ?? createdOrders[0], userId, {
                count: createdOrders.length,
            });
            broadcastCoordinatorOrderChange('created', createdOrders[0]?.order ?? createdOrders[0]);
        }
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
        partner_id,
        prepaid_amount,
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
        const existingShipments = await orderRepository.getExistingShipmentIds(dbClient, orderId);
        const usedVehicleIds = new Set();
        const usedDriverIds = new Set();

        for (let index = 0; index < trips.length; index++) {
            const trip = trips[index];
            const { plate, vehicle_group_id, distance, pickup_address: trip_pickup, delivery_address: trip_delivery } = trip;
            const normalizedDistance = normalizeNumber(distance);

            if (normalizedDistance === null || normalizedDistance <= 0) {
                throw new Error('Quãng đường là bắt buộc để tính cước');
            }

            // Sửa đơn: thiếu nhóm xe thì GIỮ NHÓM CŨ CỦA CHUYẾN, không rơi về nhóm mặc
            // định của hệ thống. Nhóm cũ là cơ sở cước đã chốt với khách; thay nó bằng
            // "nhóm id nhỏ nhất" là âm thầm đổi giá của một đơn đang chạy. Chỉ khi chuyến
            // chưa từng có nhóm (dữ liệu cũ) mới đành dùng nhóm mặc định.
            const finalVehicleGroupId = vehicle_group_id
                ? Number(vehicle_group_id)
                : (existingShipments[index]?.vehicle_group_id ?? defaultVehicleGroupId);
            const vehicleGroup = finalVehicleGroupId ? await orderRepository.getVehicleGroupById(dbClient, finalVehicleGroupId) : null;
            if (!vehicleGroup) {
                throw new Error('Nhóm xe không tồn tại');
            }

            const existing = existingShipments[index] ?? null;

            // Tra xe theo BKS: ưu tiên trong nhóm xe của đơn (giữ nguyên quy tắc cũ cho
            // luồng chọn xe lúc sửa đơn), nhưng CHẤP NHẬN xe ngoài nhóm nếu đó đúng là
            // chiếc xe chuyến này đang chạy. Coordinator gán được xe ad-hoc khác nhóm ở
            // màn chi tiết đơn, và form sửa đơn nạp lại đúng BKS đó — không có nhánh dự
            // phòng này thì mở ra sửa mỗi ghi chú cũng ăn lỗi "BKS không tồn tại trong
            // nhóm xe đã chọn", tức là chuyến đã gán xe ad-hoc thành không sửa được nữa.
            let vehicle = plate ? await orderRepository.getVehicleByPlate(dbClient, plate, finalVehicleGroupId) : null;
            if (plate && !vehicle && existing?.plate_number
                && String(existing.plate_number).trim().toUpperCase() === String(plate).trim().toUpperCase()) {
                vehicle = await orderRepository.getVehicleByPlate(dbClient, plate);
            }
            if (plate && !vehicle) {
                throw new Error(`BKS ${plate} không tồn tại trong nhóm xe đã chọn`);
            }
            if (vehicle?.vehicle_status && vehicle.vehicle_status !== 'active') {
                throw new Error(`Xe ${vehicle.plate_number} hiện không sẵn sàng cho điều phối (trạng thái: ${vehicle.vehicle_status})`);
            }

            const normalizedPrice = normalizedDistance * Number(vehicleGroup.price_per_km || 0);
            // Đơn giá/km chỉ là gợi ý — coordinator có thể chốt giá cước khác cho từng chuyến
            const manualPrice = normalizeMoney(trip.price, 'Giá cước chuyến');
            const isPriceManual = manualPrice !== null && manualPrice > 0;
            const finalPrice = isPriceManual ? manualPrice : normalizedPrice;
            const finalVehicleId = vehicle?.id ?? null;

            // Chuyến VẪN GIỮ ĐÚNG CHIẾC XE CŨ thì giữ luôn chủ chuyến cũ, KHÔNG suy lại
            // từ vehicles.assigned_driver_id.
            //
            // Suy lại là sai kể từ khi tài và xe tách rời nhau: chuyến do coordinator gán
            // ad-hoc có chủ là tài A trong khi chiếc xe đó biên chế cho tài B (hoặc chưa
            // biên chế ai). Suy từ xe sẽ ra B/null, và với chuyến còn 'available' thì lớp
            // dưới lặng lẽ ghi lịch sử chuyển chủ — tài A mất chuyến mà không ai báo, chỉ
            // vì có người mở đơn ra sửa một dòng ghi chú.
            const keepsCurrentVehicle = existing?.vehicle_id && finalVehicleId
                && Number(existing.vehicle_id) === Number(finalVehicleId);
            const finalDriverId = keepsCurrentVehicle && existing.owner_driver_id
                ? Number(existing.owner_driver_id)
                : (vehicle?.assigned_driver_id ?? null);

            // Chỉ kiểm tra khi cặp tài–xe THỰC SỰ ĐỔI. Giữ nguyên cặp đang chạy mà vẫn
            // kiểm thì cặp ad-hoc luôn trượt: validateVehicleShipmentAssignment đòi
            // vehicles.assigned_driver_id ↔ drivers.vehicle_id khớp nhau, đúng thứ mà việc
            // gán xe bất kỳ đã cố ý bỏ.
            const assignmentChanged = Number(existing?.owner_driver_id || 0) !== Number(finalDriverId || 0)
                || Number(existing?.vehicle_id || 0) !== Number(finalVehicleId || 0);
            if (finalDriverId && finalVehicleId && assignmentChanged) {
                await orderRepository.validateVehicleShipmentAssignment(dbClient, {
                    vehicleId: finalVehicleId,
                    driverId: finalDriverId,
                    excludeShipmentId: existing?.id ?? null,
                });
            }
            ensureUniqueActiveAssignment(usedVehicleIds, finalVehicleId, `Xe ${vehicle?.plate_number || plate}`);
            ensureUniqueActiveAssignment(usedDriverIds, finalDriverId, 'Tài xe');

            const shipmentStatus =
                finalDriverId && finalVehicleId
                    ? SHIPMENT_STATUS.CLAIMED
                    : SHIPMENT_STATUS.AVAILABLE;

            shipmentsDataArray.push({
                owner_driver_id: finalDriverId,
                vehicle_id: finalVehicleId,
                vehicle_group_id: finalVehicleGroupId,
                estimated_price: finalPrice,
                is_price_manual: isPriceManual,
                estimated_distance_km: normalizedDistance,
                plate_number: vehicle?.plate_number,
                pickup_address: safeTrim(trip_pickup || pickup_address),
                delivery_address: safeTrim(trip_delivery || delivery_address),
                pickup_addresses: (Array.isArray(trip.pickup_addresses) ? trip.pickup_addresses : [trip_pickup || pickup_address]).filter(Boolean),
                delivery_addresses: (Array.isArray(trip.delivery_addresses) ? trip.delivery_addresses : [trip_delivery || delivery_address]).filter(Boolean),
                status: shipmentStatus,
                assignmentData: {
                    driver_id: finalDriverId,
                    vehicle_id: finalVehicleId,
                    assigned_by: payload.updated_by ?? null,
                },
            });
        }

    } finally {
        dbClient.release();
    }

    // Chụp chủ chuyến TRƯỚC khi sửa: sửa đơn cũng là một đường giao việc (chuyến đang
    // trống được điền BKS thì thuộc luôn về tài của xe đó, status = 'claimed'), nên tài
    // xế phải được báo y như lúc tạo đơn. Có ảnh chụp này mới phân biệt được "vừa giao
    // cho người mới" với "chỉ sửa giá cước của chuyến tài đã cầm".
    const chuTruocKhiSua = await snapshotShipmentOwners(orderId);

    const updatedOrder = await orderRepository.updateOrder(orderId, {
        customer_name,
        customer_phone,
        cargo_name,
        cargo_weight_kg,
        pickup_address,
        delivery_address,
        notes,
        arrived_at: arrived_at || date,
        partner_name: is_partner ? safeTrim(partner_name) : null,
        partner_id: is_partner ? (Number(partner_id) || null) : null,
        prepaid_amount: normalizeNonNegativeAmount(prepaid_amount, 'Số tiền khách ứng trước'),
    }, normalizeNumber, safeTrim, normalizePhone, shipmentsDataArray);
    broadcastCoordinatorOrderChange('updated', updatedOrder);
    notifyOrderChange('updated', updatedOrder, payload.updated_by ?? null);
    await notifyDriversAssignedOnOrder(orderId, { truoc: chuTruocKhiSua, isUpdate: true });
    return updatedOrder;
};

const cancelOrder = async (orderId, reason, actorId = null) => {
    const result = await orderRepository.cancelOrder(orderId, safeTrim(reason) || 'Coordinator cancelled order', actorId);
    if (!result) return null;
    const { order: cancelledOrder, refund } = result;

    broadcastCoordinatorOrderChange('cancelled', cancelledOrder);
    notifyOrderChange('cancelled', cancelledOrder, actorId, { reason: safeTrim(reason) });

    // Có tiền ứng trước cần hoàn → báo Kế toán vào chi phiếu hoàn tiền.
    if (refund) {
        notifyRolesSafe(['accountant'], {
            title: `Cần hoàn tiền ứng trước — đơn #${orderId} đã hủy`,
            message: `Hoàn ${money(Number(refund.amount))} cho "${refund.payee}". Phiếu hoàn tiền #${refund.voucherId} đã tạo, chờ Kế toán chi.`,
            type: 'PREPAID_REFUND_REQUESTED',
            entityType: 'payment_vouchers',
            entityId: refund.voucherId,
        });
    }
    return { ...cancelledOrder, refund };
};

const searchCustomersByPhone = async (phonePrefix) => orderRepository.searchCustomersByPhone(phonePrefix);

// ── Tiền trả trước: xác nhận / từ chối / danh sách chờ ────────────────────────
const listPendingPrepaid = () => orderRepository.listPendingPrepaid();

const confirmPrepaid = async (orderId, actorId, { paymentMethod, proofUrl } = {}) => {
    const order = await orderRepository.confirmPrepaid(orderId, actorId, { paymentMethod, proofUrl });
    if (!order) return null;
    broadcastCoordinatorOrderChange('updated', order);
    notifyRolesSafe(['accountant', 'coordinator'], {
        title: `Đã xác nhận tiền trả trước — đơn #${orderId}`,
        message: `${money(Number(order.prepaid_amount || 0))} (${paymentMethod === 'cash' ? 'tiền mặt' : 'chuyển khoản'}) đã ghi sổ.`,
        type: 'PREPAID_CONFIRMED',
        entityType: 'orders',
        entityId: orderId,
    }, { excludeUserId: actorId });
    return order;
};

const rejectPrepaid = async (orderId, actorId = null) => {
    const order = await orderRepository.rejectPrepaid(orderId);
    if (order) broadcastCoordinatorOrderChange('updated', order);
    return order;
};

module.exports = {
    listOrders, createOrder, importOrdersFromExcel, updateOrder, cancelOrder, searchCustomersByPhone,
    listPendingPrepaid, confirmPrepaid, rejectPrepaid,
};
