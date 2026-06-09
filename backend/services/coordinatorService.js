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
      const distance = safeTrim(row.distance);
      const fare = normalizeNumber(row.fare);
      const note = safeTrim(row.note);

      if (isLeaveNote(note)) {
        continue;
      }

      if (!date) {
        throw new Error('Ngày tháng năm là bắt buộc trong file Excel');
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

      const driver = await orderRepository.findOrCreateDriverWithVehicle(dbClient, {
        driverName,
        plateNumber: plate,
        vehicleGroupId: defaultVehicleGroupId,
      });
      if (driver?.vehicle_id && driver?.vehicle_status !== 'active') {
        throw new Error(`Xe ${plate} hiện không sẵn sàng cho vận hành (trạng thái: ${driver.vehicle_status})`);
      }

      const finalDriverId = driver?.id ?? null;
      const finalVehicleId = driver?.vehicle_status === 'active' ? driver?.vehicle_id ?? null : null;
      const finalVehicleGroupId = driver?.vehicle_group_id ?? defaultVehicleGroupId;

      const shipmentStatus = finalDriverId ? SHIPMENT_STATUS.CLAIMED : SHIPMENT_STATUS.AVAILABLE;

      const notes = note;

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
          customer_name: customerName,
          customer_phone: customerPhone,
          notes,
          created_at: date,
        },
        shipmentData: {
          vehicle_group_id: finalVehicleGroupId,
          owner_driver_id: finalDriverId,
          vehicle_id: finalVehicleId,
          pickup_address: pickupAddress,
          delivery_address: deliveryAddress,
          cargo_name: route || `${pickupAddress} - ${deliveryAddress}`,
          cargo_weight_kg: null,
          estimated_price: fare || 0,
          status: shipmentStatus,
          payment_type: 'cash',
          notes,
          created_at: date,
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


const listVehicleOptions = async () => {
  const result = await pool.query(`
    SELECT
      vg.id,
      vg.name,
      vg.price_per_km,
      COALESCE(
        json_agg(
          json_build_object(
            'id', v.id,
            'plate_number', v.plate_number,
            'vehicle_group_id', v.vehicle_group_id,
            'status', v.status
          ) ORDER BY v.plate_number
        ) FILTER (WHERE v.id IS NOT NULL),
        '[]'::json
      ) AS vehicles
    FROM vehicle_groups vg
    LEFT JOIN vehicles v ON v.vehicle_group_id = vg.id AND v.status = 'active'
    GROUP BY vg.id, vg.name, vg.price_per_km
    ORDER BY vg.name ASC, vg.id ASC
  `);
  return result.rows;
};

module.exports = { importExcel, listVehicleOptions };
