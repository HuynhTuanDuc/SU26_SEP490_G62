const XLSX = require('xlsx');
const pool = require('../config/database');
const orderRepository = require('../repositories/orderRepository');
const expenseRepository = require('../repositories/expenseRepository');
const paymentRepository = require('../repositories/paymentRepository');
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
const VALID_EXPENSE_TYPES = ['fuel', 'toll', 'parking', 'repair', 'maintenance', 'depreciation', 'other'];

const normalizeAmount = (value, fieldLabel = 'Số tiền') => {
    const amount = Number(value);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
        throw new Error(`${fieldLabel} phải lớn hơn 0`);
    }
    return amount;
};

const normalizeExpenses = (expenses = []) => {
    if (!Array.isArray(expenses)) throw new Error('Danh sách chi phí không hợp lệ');

    return expenses.map((expense, index) => {
        const expenseType = String(expense?.expense_type ?? expense?.expenseType ?? '').trim();
        if (!VALID_EXPENSE_TYPES.includes(expenseType)) {
            throw new Error(`Loại chi phí #${index + 1} không hợp lệ`);
        }

        return {
            expense_type: expenseType,
            amount: normalizeAmount(expense?.amount, `Số tiền chi phí #${index + 1}`),
            description: String(expense?.description ?? '').trim() || null,
        };
    });
};

const updateOrderActualIncome = async (client, orderId) => {
    await client.query(
        `UPDATE orders o
         SET total_actual_price = COALESCE((
                SELECT SUM(COALESCE(os.actual_price, 0))
                FROM order_shipments os
                WHERE os.order_id = o.id
            ), 0),
             updated_at = NOW()
         WHERE o.id = $1`,
        [orderId],
    );
};

const getShipmentPricingSnapshot = async (db, requestId) => {
    const result = await db.query(
        `SELECT
            rr.actual_km,
            os.id AS shipment_id,
            os.estimated_distance_km,
            os.actual_distance_km,
            os.estimated_price,
            os.actual_price,
            o.id AS order_id,
            COALESCE(vg_vehicle.id, vg_order.id) AS vehicle_group_id,
            COALESCE(vg_vehicle.name, vg_order.name) AS vehicle_group_name,
            COALESCE(vg_vehicle.price_per_km, vg_order.price_per_km, 0) AS price_per_km
         FROM shipment_receipt_requests rr
         JOIN order_shipments os ON os.id = rr.shipment_id
         JOIN orders o ON o.id = os.order_id
         LEFT JOIN vehicles v ON v.id = os.vehicle_id
         LEFT JOIN vehicle_groups vg_vehicle ON vg_vehicle.id = v.vehicle_group_id
         LEFT JOIN vehicle_groups vg_order ON vg_order.id = o.vehicle_group_id
         WHERE rr.id = $1`,
        [requestId],
    );
    return result.rows[0] ?? null;
};

const computeReceiptAmount = (pricingSnapshot) => {
    if (!pricingSnapshot) throw new Error('Không thể lấy cấu hình giá cho chuyến');

    const actualKm = pricingSnapshot.actual_km ?? pricingSnapshot.actual_distance_km ?? pricingSnapshot.estimated_distance_km;
    const pricePerKm = Number(pricingSnapshot.price_per_km || 0);

    if (actualKm === null || actualKm === undefined || Number.isNaN(Number(actualKm)) || Number(actualKm) <= 0) {
        throw new Error('Yêu cầu phiếu thu chưa có số km thực tế hợp lệ để tính thu nhập');
    }
    if (!pricePerKm || Number.isNaN(pricePerKm) || pricePerKm <= 0) {
        throw new Error('Chuyến chưa có đơn giá xe hợp lệ để tính thu nhập thực tế');
    }

    return {
        actual_km: Number(actualKm),
        price_per_km: pricePerKm,
        actual_income: Number(actualKm) * pricePerKm,
    };
};

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
            c.full_name          AS customer_name,
            c.phone              AS customer_phone,
            os.shipment_index,
            os.status            AS shipment_status,
            v.plate_number,
            COALESCE(exp.total_expenses, 0) AS total_expenses
         FROM shipment_receipt_requests rr
         JOIN profiles p       ON p.id  = rr.driver_id
         JOIN order_shipments os ON os.id = rr.shipment_id
         JOIN orders o          ON o.id  = os.order_id
         LEFT JOIN customers c  ON c.id  = o.customer_id
         LEFT JOIN vehicles v   ON v.id  = os.vehicle_id
         LEFT JOIN LATERAL (
            SELECT SUM(e.amount) AS total_expenses
            FROM expenses e
            WHERE e.shipment_id = rr.shipment_id
         ) exp ON TRUE
         ${where}
         ORDER BY rr.requested_at DESC`,
        params,
    );
    return result.rows;
};

const getReceiptRequestDetail = async (requestId) => {
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
            rr.processed_by,
            os.order_id,
            os.shipment_index,
            os.owner_driver_id,
            os.vehicle_id,
            os.status                  AS shipment_status,
            os.estimated_distance_km,
            os.actual_distance_km,
            os.estimated_price,
            os.actual_price,
            os.notes                   AS shipment_notes,
            o.cargo_name,
            o.notes                    AS order_notes,
            o.payment_type             AS order_payment_type,
            o.total_actual_price       AS order_actual_income,
            c.id                       AS customer_id,
            c.full_name                AS customer_name,
            c.phone                    AS customer_phone,
            c.company_name             AS customer_company,
            c.address                  AS customer_address,
            d.full_name                AS driver_name,
            v.plate_number,
            COALESCE(vg_vehicle.id, vg_order.id) AS vehicle_group_id,
            COALESCE(vg_vehicle.name, vg_order.name) AS vehicle_group_name,
            COALESCE(vg_vehicle.price_per_km, vg_order.price_per_km, 0) AS price_per_km,
            sp.id                      AS receipt_id,
            sp.payment_type            AS receipt_payment_type,
            sp.amount                  AS receipt_amount,
            sp.notes                   AS receipt_notes,
            sp.qr_code_data,
            sp.collected_at
         FROM shipment_receipt_requests rr
         JOIN order_shipments os ON os.id = rr.shipment_id
         JOIN orders o ON o.id = os.order_id
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN profiles d ON d.id = rr.driver_id
         LEFT JOIN vehicles v ON v.id = os.vehicle_id
         LEFT JOIN vehicle_groups vg_vehicle ON vg_vehicle.id = v.vehicle_group_id
         LEFT JOIN vehicle_groups vg_order ON vg_order.id = o.vehicle_group_id
         LEFT JOIN shipment_receipts sp ON sp.receipt_request_id = rr.id
         WHERE rr.id = $1`,
        [requestId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Yêu cầu phiếu thu không tồn tại');

    const stopsResult = await pool.query(
        `SELECT stop_type, stop_index, address, contact_name, contact_phone
         FROM trip_stops
         WHERE shipment_id = $1
         ORDER BY stop_index ASC`,
        [row.shipment_id],
    );
    const expenses = await expenseRepository.getShipmentExpenses(row.shipment_id);
    const payments = await paymentRepository.getShipmentPayments(row.shipment_id);
    const computed = computeReceiptAmount({
        actual_km: row.actual_km,
        actual_distance_km: row.actual_distance_km,
        estimated_distance_km: row.estimated_distance_km,
        price_per_km: row.price_per_km,
    });

    const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const suggestedAmount = Number(row.receipt_amount ?? row.actual_price ?? computed.actual_income ?? 0);
    const actualIncome = Number(row.receipt_amount ?? row.actual_price ?? computed.actual_income ?? 0);

    return {
        request: {
            id: row.id,
            shipment_id: row.shipment_id,
            driver_id: row.driver_id,
            driver_name: row.driver_name,
            actual_km: row.actual_km,
            status: row.status,
            requested_at: row.requested_at,
            processed_at: row.processed_at,
            coordinator_notes: row.coordinator_notes,
            plate_number: row.plate_number,
            receipt: row.receipt_id ? {
                id: row.receipt_id,
                payment_type: row.receipt_payment_type,
                amount: row.receipt_amount,
                notes: row.receipt_notes,
                qr_code_data: row.qr_code_data,
                collected_at: row.collected_at,
            } : null,
        },
        customer: {
            id: row.customer_id,
            full_name: row.customer_name,
            phone: row.customer_phone,
            company_name: row.customer_company,
            address: row.customer_address,
        },
        order: {
            id: row.order_id,
            cargo_name: row.cargo_name,
            payment_type: row.order_payment_type,
            notes: row.order_notes,
            total_actual_income: row.order_actual_income,
        },
        shipment: {
            id: row.shipment_id,
            shipment_index: row.shipment_index,
            status: row.shipment_status,
            plate_number: row.plate_number,
            vehicle_group_id: row.vehicle_group_id,
            vehicle_group_name: row.vehicle_group_name,
            price_per_km: row.price_per_km,
            estimated_distance_km: row.estimated_distance_km,
            actual_distance_km: row.actual_distance_km,
            estimated_price: row.estimated_price,
            actual_price: row.actual_price,
            notes: row.shipment_notes,
            stops: stopsResult.rows,
        },
        expenses,
        payments,
        summary: {
            suggested_amount: suggestedAmount,
            actual_km: computed.actual_km,
            price_per_km: computed.price_per_km,
            actual_income: actualIncome,
            total_expenses: totalExpenses,
            net_after_expenses: actualIncome - totalExpenses,
        },
    };
};

// POST approve — tạo shipment_receipts + cập nhật request status
const approveReceiptRequest = async (requestId, coordinatorId, { payment_type, notes, qr_code_data, expenses = [] } = {}) => {
    if (!payment_type || !VALID_PAYMENT_TYPES.includes(payment_type)) {
        throw new Error(`payment_type không hợp lệ. Chọn một trong: ${VALID_PAYMENT_TYPES.join(', ')}`);
    }
    const normalizedExpenses = normalizeExpenses(expenses);

    const reqResult = await pool.query(
        `SELECT rr.*, os.owner_driver_id, os.vehicle_id, os.order_id, o.customer_id
         FROM shipment_receipt_requests rr
         JOIN order_shipments os ON os.id = rr.shipment_id
         JOIN orders o ON o.id = os.order_id
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
        const pricingSnapshot = await getShipmentPricingSnapshot(client, requestId);
        const computed = computeReceiptAmount(pricingSnapshot);
        const amt = computed.actual_income;

        // Tạo shipment_receipts
        const receiptResult = await client.query(
            `INSERT INTO shipment_receipts
                (shipment_id, payment_type, amount, notes, qr_code_data,
                 receipt_request_id, created_by, collected_by, collected_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             RETURNING *`,
            [
                req.shipment_id,
                payment_type,
                amt,
                notes ?? null,
                qr_code_data ?? null,
                requestId,
                coordinatorId,
                payment_type === 'cash_collected' ? req.driver_id : null,
            ],
        );

        for (const expense of normalizedExpenses) {
            await client.query(
                `INSERT INTO expenses
                    (shipment_id, vehicle_id, created_by, updated_by, expense_type, amount, description, expense_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $3, $4, $5, $6, CURRENT_DATE, NOW(), NOW())`,
                [
                    req.shipment_id,
                    req.vehicle_id ?? null,
                    coordinatorId,
                    expense.expense_type,
                    expense.amount,
                    expense.description,
                ],
            );
        }

        // Cập nhật actual_price + actual_distance_km vào order_shipments
        // actual_price = giá chốt thực tế do coordinator xác nhận
        // actual_distance_km = km thực tế driver nhập lúc yêu cầu phiếu thu
        await client.query(
            `UPDATE order_shipments
             SET actual_price        = $1,
                 actual_distance_km  = $2,
                 updated_at          = NOW()
             WHERE id = $3`,
            [amt, computed.actual_km, req.shipment_id],
        );

        await updateOrderActualIncome(client, req.order_id);

        if (payment_type === 'cash_collected') {
            await client.query(
                `INSERT INTO debts
                    (debt_type, driver_id, customer_id, order_id, shipment_id, total_amount, paid_amount, status, notes, updated_by, created_at, updated_at)
                 VALUES ('driver', $1, $2, $3, $4, $5, 0, 'unpaid', $6, $7, NOW(), NOW())`,
                [
                    req.driver_id,
                    req.customer_id ?? null,
                    req.order_id,
                    req.shipment_id,
                    amt,
                    notes?.trim() || 'Coordinator tạo phiếu thu: tài xế đang giữ tiền khách',
                    coordinatorId,
                ],
            );
        }

        if (payment_type === 'client_credit') {
            if (!req.customer_id) {
                throw new Error('Không thể ghi nợ khách hàng vì đơn chưa có thông tin khách hàng');
            }

            await client.query(
                `INSERT INTO debts
                    (debt_type, customer_id, order_id, shipment_id, total_amount, paid_amount, status, notes, updated_by, created_at, updated_at)
                 VALUES ('customer', $1, $2, $3, $4, 0, 'unpaid', $5, $6, NOW(), NOW())`,
                [
                    req.customer_id,
                    req.order_id,
                    req.shipment_id,
                    amt,
                    notes?.trim() || 'Coordinator tạo phiếu thu theo hình thức khách nợ',
                    coordinatorId,
                ],
            );
            await client.query(
                `UPDATE customers
                 SET current_debt = COALESCE(current_debt, 0) + $1,
                     updated_at = NOW()
                 WHERE id = $2`,
                [amt, req.customer_id],
            );
        }

        // Cập nhật trạng thái request → approved
        await client.query(
            `UPDATE shipment_receipt_requests
             SET status = 'approved', processed_by = $1, processed_at = NOW(), coordinator_notes = $3
             WHERE id = $2`,
            [coordinatorId, requestId, notes ?? null],
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

        const detail = await getReceiptRequestDetail(requestId);
        return {
            ...receiptResult.rows[0],
            actual_income: detail.summary.actual_income,
            total_expenses: detail.summary.total_expenses,
            net_after_expenses: detail.summary.net_after_expenses,
        };
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

module.exports = {
    importExcel,
    listVehicleGroups,
    getReceiptRequests,
    getReceiptRequestDetail,
    approveReceiptRequest,
    rejectReceiptRequest,
};
