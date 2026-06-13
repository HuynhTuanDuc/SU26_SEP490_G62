const XLSX = require('xlsx');
const pool = require('../config/database');
const orderRepository = require('../repositories/orderRepository');
const { SHIPMENT_STATUS } = require('../constants/tripConstants');

const COLUMN_ALIASES = {
  date: [
  'ngày',
  'ngày tháng năm',
  'ngày, tháng, năm',
  'ngay thang nam',
  'date'
],
  checkIn: ['chấm công', 'cham cong', 'check in', 'checkin'],
  plate: ['bks', 'biển số', 'bien so', 'plate'],
  driver: ['lái xe', 'lai xe', 'driver'],
  customer: ['khách hàng', 'khach hang', 'customer'],
  customerPhone: ['sđt', 'sdt', 'số điện thoại', 'so dien thoai', 'phone', 'customer phone'],
  route: ['hành trình', 'hanh trinh', 'route'],
  distance: ['quãng đường', 'quang duong', 'distance'],
  fare: ['cước xe', 'cuoc xe', 'fare'],
  ticket: ['vé', 've', 'ticket'],
  paid: ['kh đã thanh toán', 'kh da thanh toan', 'paid'],
  driverIncome: ['lái xe thu/chi', 'lai xe thu/chi', 'driver income'],
  fuel: ['đổ dầu', 'do dau', 'fuel'],
  advance: ['ứng lương', 'ung luong', 'advance'],
  note: ['ghi chú', 'ghi chu', 'note'],
  revenue1: ['doanh thu 1', 'doanh thu', 'revenue'],
  revenue2: ['doanh thu 2', 'revenue 2'],
};

const normalizeKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s/.-]/g, '');

const buildHeaderMap = (headerRow) => {
  const map = new Map();
  headerRow.forEach((cell, index) => {
    const normalized = normalizeKey(cell);
    if (normalized) map.set(normalized, index);
  });
  return map;
};

const getHeaderIndex = (headerMap, aliases) => {
  for (const alias of aliases) {
    const index = headerMap.get(normalizeKey(alias));
    if (index !== undefined) return index;
  }
  return undefined;
};

const extractValue = (row, headerMap, aliases) => {
  const index = getHeaderIndex(headerMap, aliases);
  return index !== undefined ? row[index] ?? '' : '';
};

const extractRouteValue = (row, headerMap) => {
  const routeIndex = getHeaderIndex(headerMap, COLUMN_ALIASES.route);
  if (routeIndex === undefined) return '';

  const nextKnownIndex = Array.from(headerMap.values())
    .filter((index) => index > routeIndex)
    .sort((a, b) => a - b)[0] ?? row.length;

  return row
    .slice(routeIndex, nextKnownIndex)
    .map((value) => safeTrim(value))
    .filter(Boolean)
    .join(' ');
};

const parseSpreadsheet = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('File Excel không có sheet nào');

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  const headerMap = buildHeaderMap(rows[0]);
  return rows.slice(1)
    .filter((row) => row.some((value) => String(value).trim() !== ''))
    .map((row) => ({
      date: extractValue(row, headerMap, COLUMN_ALIASES.date),
      checkIn: extractValue(row, headerMap, COLUMN_ALIASES.checkIn),
      plate: extractValue(row, headerMap, COLUMN_ALIASES.plate),
      driver: extractValue(row, headerMap, COLUMN_ALIASES.driver),
      customer: extractValue(row, headerMap, COLUMN_ALIASES.customer),
      customerPhone: extractValue(row, headerMap, COLUMN_ALIASES.customerPhone),
      route: extractRouteValue(row, headerMap),
      distance: extractValue(row, headerMap, COLUMN_ALIASES.distance),
      fare: extractValue(row, headerMap, COLUMN_ALIASES.fare),
      ticket: extractValue(row, headerMap, COLUMN_ALIASES.ticket),
      paid: extractValue(row, headerMap, COLUMN_ALIASES.paid),
      driverIncome: extractValue(row, headerMap, COLUMN_ALIASES.driverIncome),
      fuel: extractValue(row, headerMap, COLUMN_ALIASES.fuel),
      advance: extractValue(row, headerMap, COLUMN_ALIASES.advance),
      note: extractValue(row, headerMap, COLUMN_ALIASES.note),
      revenue1: extractValue(row, headerMap, COLUMN_ALIASES.revenue1),
      revenue2: extractValue(row, headerMap, COLUMN_ALIASES.revenue2),
    }));
};

const safeTrim = (value) => String(value ?? '').trim();

const normalizeText = (value) => safeTrim(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/đ/g, 'd')
  .replace(/[\u0300-\u036f]/g, '');

const normalizePhone = (value) => safeTrim(value).replace(/[^\d+]/g, '');

const isLeaveNote = (value) => normalizeText(value) === 'nghi';

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

const normalizeNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const cleanStr = String(value)
    .replace(/đ/g, '')
    .replace(/d/g, '')
    .replace(/\s/g, '')
    .trim();
  let parsedStr = cleanStr;
  if ((cleanStr.match(/\./g) || []).length > 1) {
    parsedStr = cleanStr.replace(/\./g, '');
  } else if (cleanStr.includes('.') && cleanStr.includes(',')) {
    if (cleanStr.indexOf(',') < cleanStr.indexOf('.')) {
      parsedStr = cleanStr.replace(/,/g, '');
    } else {
      parsedStr = cleanStr.replace(/\./g, '').replace(/,/g, '.');
    }
  } else if (cleanStr.includes(',')) {
    if ((cleanStr.match(/,/g) || []).length > 1) {
      parsedStr = cleanStr.replace(/,/g, '');
    } else {
      const parts = cleanStr.split(',');
      if (parts[1].length === 3) {
        parsedStr = cleanStr.replace(/,/g, '');
      } else {
        parsedStr = cleanStr.replace(/,/g, '.');
      }
    }
  }
  const numericValue = Number(parsedStr);
  if (Number.isNaN(numericValue)) return null;
  return numericValue;
};

const parseRoute = (routeStr) => {
  const route = safeTrim(routeStr);
  if (!route) return { pickupAddress: 'Chưa xác định', deliveryAddress: 'Chưa xác định' };
  const parts = route.split(/ - |-/);
  if (parts.length >= 2) {
    return {
      pickupAddress: parts[0].trim(),
      deliveryAddress: parts[1].trim()
    };
  }
  return {
    pickupAddress: route,
    deliveryAddress: route
  };
};

const listVehicleGroups = async () => orderRepository.listCoordinatorVehicleGroups();

const importExcel = async (userId, fileBuffer) => {
  if (!fileBuffer) throw new Error('Thiếu file Excel');
  const rows = parseSpreadsheet(fileBuffer);
  if (!rows.length) return { rows: [] };

  let dbClient = null;
  const createdOrders = [];

  try {
    dbClient = await pool.connect();
    await dbClient.query('BEGIN');

    const defaultVehicleGroupId = await orderRepository.getDefaultVehicleGroupId(dbClient);
    if (!defaultVehicleGroupId) {
      throw new Error('Chưa có nhóm xe trong hệ thống');
    }

    for (const row of rows) {
      const date = parseExcelDate(row.date);
      const plate = safeTrim(row.plate);
      const driverName = safeTrim(row.driver);
      const customerName = safeTrim(row.customer);
      const customerPhone = normalizePhone(row.customerPhone);
      const route = safeTrim(row.route);
      const distanceValue = normalizeNumber(row.distance);
      let fare = 0;
      const note = safeTrim(row.note);

      if (isLeaveNote(note)) {
        continue;
      }

      if (!date) {
        throw new Error('Ngày tháng năm là bắt buộc trong file Excel');
      }
      if (distanceValue === null || distanceValue <= 0) {
        throw new Error('Quãng đường là bắt buộc trong file Excel để tính cước');
      }

      const { pickupAddress, deliveryAddress } = parseRoute(route);

      let customer = null;
      if (customerPhone) {
        customer = await orderRepository.findOrCreateCustomer(
          dbClient,
          customerName,
          customerPhone,
          normalizePhone,
          safeTrim,
        );
      } else if (customerName) {
        const existingCust = await dbClient.query(
          `SELECT id, full_name, phone
           FROM customers
           WHERE LOWER(full_name) = LOWER($1)
           LIMIT 1`,
          [customerName],
        );
        customer = existingCust.rows[0] ?? null;
      }

      const vehicle = plate ? await orderRepository.getVehicleByPlate(dbClient, plate) : null;
      if (plate && !vehicle) {
        throw new Error(`BKS ${plate} không tồn tại trong hệ thống`);
      }
      if (vehicle?.vehicle_status && vehicle.vehicle_status !== 'active') {
        throw new Error(`Xe ${plate} hiện không sẵn sàng cho vận hành (trạng thái: ${vehicle.vehicle_status})`);
      }

      const finalDriverId = null;
      const finalVehicleId = vehicle?.id ?? null;
      const finalVehicleGroupId = vehicle?.vehicle_group_id ?? defaultVehicleGroupId;
      const vehicleGroup = await orderRepository.getVehicleGroupById(dbClient, finalVehicleGroupId);
      if (distanceValue !== null && vehicleGroup) {
        fare = distanceValue * Number(vehicleGroup.price_per_km || 0);
      }

      const shipmentStatus = SHIPMENT_STATUS.AVAILABLE;

      const notes = [
        plate ? `BKS: ${plate}` : '',
        driverName ? `Lái xe: ${driverName}` : '',
        note,
      ].filter(Boolean).join(' | ');

      const result = await orderRepository.importOrderWithShipment({
        client: dbClient,
        userId,
        orderData: {
          customer_id: customer?.id ?? null,
          cargo_name: route || `${pickupAddress} - ${deliveryAddress}`,
          cargo_weight_kg: null,
          pickup_address: pickupAddress,
          delivery_address: deliveryAddress,
          estimated_price: fare || 0,
          payment_type: 'cash',
          vehicle_group_id: finalVehicleGroupId,
          customer_name: customerName,
          customer_phone: customerPhone,
          notes,
        },
        shipmentData: {
          owner_driver_id: finalDriverId,
          vehicle_id: finalVehicleId,
          pickup_address: pickupAddress,
          delivery_address: deliveryAddress,
          cargo_name: route || `${pickupAddress} - ${deliveryAddress}`,
          cargo_weight_kg: null,
          estimated_price: fare || 0,
          estimated_distance_km: distanceValue,
          arrived_at: date,
          plate_number: vehicle?.plate_number || plate,
          status: shipmentStatus,
          payment_type: 'cash',
          notes,
        },
      });

      createdOrders.push(result.order);
    }

    await dbClient.query('COMMIT');
    return { rows: createdOrders };
  } catch (err) {
    if (dbClient) {
      await dbClient.query('ROLLBACK');
    }
    throw err;
  } finally {
    dbClient?.release?.();
  }
};

// ─── Receipt Request Management ───────────────────────────────────────────────

const VALID_PAYMENT_TYPES = ['cash_collected', 'bank_transfer', 'client_credit', 'qr_transfer'];

// GET danh sách yêu cầu phiếu thu (mặc định: pending + processing)
const getReceiptRequests = async ({ status = null } = {}) => {
    const conditions = [];
    const params = [];

    if (status) {
        params.push(status);
        conditions.push(`rr.status = $${params.length}`);
    } else {
        conditions.push(`rr.status IN ('pending', 'processing')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
        `SELECT
            rr.id,
            rr.shipment_id,
            rr.driver_id,
            rr.actual_km,
            rr.status,
            rr.requested_at,
            rr.processed_at,
            rr.coordinator_notes,
            p.full_name          AS driver_name,
            os.estimated_price,
            os.actual_price,
            o.cargo_name,
            o.id                 AS order_id,
            os.shipment_index,
            os.status            AS shipment_status
         FROM shipment_receipt_requests rr
         JOIN profiles p       ON p.id  = rr.driver_id
         JOIN order_shipments os ON os.id = rr.shipment_id
         JOIN orders o          ON o.id  = os.order_id
         ${where}
         ORDER BY rr.requested_at DESC`,
        params,
    );
    return result.rows;
};

// POST approve — tạo shipment_receipts + cập nhật request status
const approveReceiptRequest = async (requestId, coordinatorId, { payment_type, amount, notes, qr_code_data } = {}) => {
    if (!payment_type || !VALID_PAYMENT_TYPES.includes(payment_type)) {
        throw new Error(`payment_type không hợp lệ. Chọn một trong: ${VALID_PAYMENT_TYPES.join(', ')}`);
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) throw new Error('Số tiền phải lớn hơn 0');

    const reqResult = await pool.query(
        `SELECT rr.*, os.owner_driver_id
         FROM shipment_receipt_requests rr
         JOIN order_shipments os ON os.id = rr.shipment_id
         WHERE rr.id = $1`,
        [requestId],
    );
    const req = reqResult.rows[0];
    if (!req) throw new Error('Yêu cầu phiếu thu không tồn tại');
    if (req.status === 'approved') throw new Error('Yêu cầu này đã được duyệt rồi');
    if (req.status === 'rejected') throw new Error('Yêu cầu này đã bị từ chối');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Tạo shipment_receipts
        const receiptResult = await client.query(
            `INSERT INTO shipment_receipts
                (shipment_id, payment_type, amount, notes, qr_code_data,
                 receipt_request_id, created_by, collected_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             RETURNING *`,
            [req.shipment_id, payment_type, amt, notes ?? null, qr_code_data ?? null, requestId, coordinatorId],
        );

        // Cập nhật actual_price + actual_distance_km vào order_shipments
        // actual_price = giá chốt thực tế do coordinator xác nhận
        // actual_distance_km = km thực tế driver nhập lúc yêu cầu phiếu thu
        await client.query(
            `UPDATE order_shipments
             SET actual_price        = $1,
                 actual_distance_km  = COALESCE($2, actual_distance_km),
                 updated_at          = NOW()
             WHERE id = $3`,
            [amt, req.actual_km ?? null, req.shipment_id],
        );

        // Cập nhật trạng thái request → approved
        await client.query(
            `UPDATE shipment_receipt_requests
             SET status = 'approved', processed_by = $1, processed_at = NOW()
             WHERE id = $2`,
            [coordinatorId, requestId],
        );

        await client.query('COMMIT');

        // Notify driver
        const notificationService = require('./notificationService');
        notificationService.createForUser(req.driver_id, {
            title: 'Phiếu thu đã được tạo',
            message: `Coordinator đã tạo phiếu thu cho chuyến #${req.shipment_id}.`,
            type: 'RECEIPT_APPROVED',
            entityType: 'shipments',
            entityId: req.shipment_id,
        }, { displayMode: 'alert' }).catch(() => {});

        return receiptResult.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// POST reject — từ chối yêu cầu phiếu thu
const rejectReceiptRequest = async (requestId, coordinatorId, { notes } = {}) => {
    const reqResult = await pool.query(
        `SELECT * FROM shipment_receipt_requests WHERE id = $1`,
        [requestId],
    );
    const req = reqResult.rows[0];
    if (!req) throw new Error('Yêu cầu phiếu thu không tồn tại');
    if (req.status === 'approved') throw new Error('Yêu cầu này đã được duyệt rồi');
    if (req.status === 'rejected') throw new Error('Yêu cầu này đã bị từ chối rồi');

    await pool.query(
        `UPDATE shipment_receipt_requests
         SET status = 'rejected', processed_by = $1, processed_at = NOW(), coordinator_notes = $2
         WHERE id = $3`,
        [coordinatorId, notes ?? null, requestId],
    );

    const notificationService = require('./notificationService');
    notificationService.createForUser(req.driver_id, {
        title: 'Yêu cầu phiếu thu bị từ chối',
        message: `Yêu cầu phiếu thu cho chuyến #${req.shipment_id} bị từ chối${notes ? `: ${notes}` : ''}.`,
        type: 'RECEIPT_REJECTED',
        entityType: 'shipments',
        entityId: req.shipment_id,
    }, { displayMode: 'alert' }).catch(() => {});

    return { success: true };
};

module.exports = { importExcel, listVehicleGroups, getReceiptRequests, approveReceiptRequest, rejectReceiptRequest };
