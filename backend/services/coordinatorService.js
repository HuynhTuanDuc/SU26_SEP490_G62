const XLSX = require('xlsx');
const pool = require('../config/database');
const orderRepository = require('../repositories/orderRepository');
const expenseRepository = require('../repositories/expenseRepository');
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

const VALID_EXPENSE_TYPES = ['fuel', 'toll', 'parking', 'repair', 'maintenance', 'depreciation', 'other'];
const PASS_THROUGH_EXPENSE_TYPES = new Set(['parking', 'toll', 'depreciation']);

const resolveShipmentActualRevenue = (shipment = {}) => {
    const actualPrice = Number(shipment.actual_price);
    if (Number.isFinite(actualPrice) && actualPrice > 0) {
        return actualPrice;
    }

    const actualKm = Number(shipment.actual_distance_km ?? shipment.estimated_distance_km ?? shipment.actual_km ?? 0);
    const pricePerKm = Number(shipment.price_per_km || 0);
    return actualKm > 0 && pricePerKm > 0 ? actualKm * pricePerKm : 0;
};

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

        const shipmentIdRaw = expense?.shipment_id ?? expense?.shipmentId ?? null;
        const shipmentId = shipmentIdRaw === null || shipmentIdRaw === undefined || shipmentIdRaw === ''
            ? null
            : Number(shipmentIdRaw);
        if (shipmentId !== null && (!Number.isInteger(shipmentId) || shipmentId <= 0)) {
            throw new Error(`Chuyến xe cho chi phí #${index + 1} không hợp lệ`);
        }

        return {
            expense_type: expenseType,
            amount: normalizeAmount(expense?.amount, `Số tiền chi phí #${index + 1}`),
            description: String(expense?.description ?? '').trim() || null,
            shipment_id: shipmentId,
        };
    });
};

const updateOrderReceiptTotals = async (client, orderId) => {
    await client.query(
        `UPDATE orders o
         SET total_actual_price = COALESCE(shipment_totals.total_actual_price, 0),
             final_price = COALESCE(shipment_totals.total_actual_price, 0) + COALESCE(expense_totals.total_pass_through_expenses, 0),
             updated_at = NOW()
         FROM (
            SELECT
                os.order_id,
                SUM(
                    COALESCE(
                        NULLIF(os.actual_price, 0),
                        COALESCE(os.actual_distance_km, os.estimated_distance_km, 0)
                        * COALESCE(vg_vehicle.price_per_km, vg_order.price_per_km, 0),
                        0
                    )
                ) AS total_actual_price
            FROM order_shipments os
            LEFT JOIN orders o_src ON o_src.id = os.order_id
            LEFT JOIN vehicles v ON v.id = os.vehicle_id
            LEFT JOIN vehicle_groups vg_vehicle ON vg_vehicle.id = v.vehicle_group_id
            LEFT JOIN vehicle_groups vg_order ON vg_order.id = o_src.vehicle_group_id
            WHERE os.order_id = $1
            GROUP BY os.order_id
         ) shipment_totals
         LEFT JOIN (
            SELECT os.order_id,
                   SUM(
                        CASE
                            WHEN e.expense_type IN ('parking', 'toll', 'depreciation') THEN COALESCE(e.amount, 0)
                            ELSE 0
                        END
                   ) AS total_pass_through_expenses
            FROM order_shipments os
            LEFT JOIN expenses e ON e.shipment_id = os.id
            WHERE os.order_id = $1
            GROUP BY os.order_id
         ) expense_totals ON expense_totals.order_id = shipment_totals.order_id
         WHERE o.id = $1`,
        [orderId],
    );
};

const getOrderShipmentsForReceipt = async (db, orderId) => {
    const shipmentResult = await db.query(
        `SELECT
            os.id,
            os.order_id,
            os.shipment_index,
            os.owner_driver_id,
            os.vehicle_id,
            os.status,
            os.cargo_name,
            os.cargo_weight_kg,
            os.estimated_distance_km,
            os.actual_distance_km,
            os.estimated_price,
            os.actual_price,
            os.notes,
            v.plate_number,
            p.full_name AS driver_name,
            COALESCE(vg_vehicle.id, vg_order.id) AS vehicle_group_id,
            COALESCE(vg_vehicle.name, vg_order.name) AS vehicle_group_name,
            COALESCE(vg_vehicle.price_per_km, vg_order.price_per_km, 0) AS price_per_km
         FROM order_shipments os
         LEFT JOIN vehicles v ON v.id = os.vehicle_id
         LEFT JOIN profiles p ON p.id = os.owner_driver_id
         LEFT JOIN orders o ON o.id = os.order_id
         LEFT JOIN vehicle_groups vg_vehicle ON vg_vehicle.id = v.vehicle_group_id
         LEFT JOIN vehicle_groups vg_order ON vg_order.id = o.vehicle_group_id
         WHERE os.order_id = $1
         ORDER BY os.shipment_index ASC`,
        [orderId],
    );

    const shipments = [];
    for (const shipment of shipmentResult.rows) {
        const stopsResult = await db.query(
            `SELECT stop_type, stop_index, address, contact_name, contact_phone
             FROM trip_stops
             WHERE shipment_id = $1
             ORDER BY stop_index ASC`,
            [shipment.id],
        );
        const expenses = await expenseRepository.getShipmentExpenses(shipment.id);
        const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
        const passThroughExpenses = expenses.reduce((sum, expense) => (
            PASS_THROUGH_EXPENSE_TYPES.has(String(expense.expense_type || '').trim())
                ? sum + Number(expense.amount || 0)
                : sum
        ), 0);
        const pickupStops = stopsResult.rows.filter((stop) => stop.stop_type === 'pickup');
        const deliveryStop = stopsResult.rows.find((stop) => stop.stop_type === 'delivery') ?? null;
        const actualKm = shipment.actual_distance_km ?? shipment.estimated_distance_km;
        const resolvedRevenue = resolveShipmentActualRevenue({
            ...shipment,
            actual_km: actualKm,
        });

        shipments.push({
            ...shipment,
            actual_km: actualKm,
            actual_revenue: resolvedRevenue,
            expenses,
            total_expenses: totalExpenses,
            total_pass_through_expenses: passThroughExpenses,
            stops: stopsResult.rows,
            pickup_address: pickupStops[0]?.address || null,
            pickup_addresses: pickupStops,
            delivery_address: deliveryStop?.address || null,
            delivery_contact_name: deliveryStop?.contact_name || null,
            delivery_contact_phone: deliveryStop?.contact_phone || null,
        });
    }

    return shipments;
};

const sumShipmentActualRevenue = (shipments = []) => shipments.reduce((sum, shipment) => (
    sum + Number(shipment.actual_revenue ?? shipment.actual_price ?? 0)
), 0);

const sumPassThroughExpenses = (shipments = []) => shipments.reduce((sum, shipment) => (
    sum + Number(shipment.total_pass_through_expenses || 0)
), 0);

const resolvePrimaryReceiptShipment = (shipments, driverId) => {
    if (!Array.isArray(shipments) || shipments.length === 0) return null;
    return shipments.find((shipment) => Number(shipment.owner_driver_id) === Number(driverId))
        || shipments[0];
};

const getShipmentPricingSnapshot = async (db, requestId) => {
    const result = await db.query(
        `SELECT
            rr.id,
            rr.order_id,
            rr.driver_id
         FROM shipment_receipt_requests rr
         WHERE rr.id = $1`,
        [requestId],
    );
    const request = result.rows[0] ?? null;
    if (!request) return null;

    const shipments = await getOrderShipmentsForReceipt(db, request.order_id);
    const primaryShipment = resolvePrimaryReceiptShipment(shipments, request.driver_id);

    return {
        ...request,
        shipments,
        primaryShipment,
    };
};

const computeReceiptAmount = (pricingSnapshot) => {
    const shipments = Array.isArray(pricingSnapshot?.shipments) ? pricingSnapshot.shipments : [];
    if (shipments.length === 0) throw new Error('Không thể lấy cấu hình giá cho đơn hàng');

    const shipmentBreakdown = shipments.map((shipment) => {
        const actualKm = shipment.actual_distance_km ?? shipment.estimated_distance_km;
        const pricePerKm = Number(shipment.price_per_km || 0);

        if (actualKm === null || actualKm === undefined || Number.isNaN(Number(actualKm)) || Number(actualKm) <= 0) {
            throw new Error(`Chuyến #${shipment.id} chưa có số km thực tế hợp lệ để tính thu nhập`);
        }
        if (!pricePerKm || Number.isNaN(pricePerKm) || pricePerKm <= 0) {
            throw new Error(`Chuyến #${shipment.id} chưa có đơn giá xe hợp lệ để tính thu nhập thực tế`);
        }

        return {
            shipment_id: shipment.id,
            actual_km: Number(actualKm),
            price_per_km: pricePerKm,
            actual_income: Number(actualKm) * pricePerKm,
        };
    });

    const totalActualKm = shipmentBreakdown.reduce((sum, item) => sum + item.actual_km, 0);
    const totalActualIncome = shipmentBreakdown.reduce((sum, item) => sum + item.actual_income, 0);
    const primaryShipment = pricingSnapshot?.primaryShipment ?? null;
    const primaryBreakdown = primaryShipment
        ? shipmentBreakdown.find((item) => Number(item.shipment_id) === Number(primaryShipment.id)) ?? shipmentBreakdown[0]
        : shipmentBreakdown[0];

    return {
        shipment_id: primaryBreakdown?.shipment_id ?? null,
        actual_km: totalActualKm,
        price_per_km: primaryBreakdown?.price_per_km ?? 0,
        actual_income: totalActualIncome,
        shipment_breakdown: shipmentBreakdown,
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
            rr.order_id,
            rr.driver_id,
            rr.status,
            rr.requested_at,
            rr.processed_at,
            rr.coordinator_notes,
            p.full_name          AS driver_name,
            o.cargo_name,
            o.id                 AS order_id,
            c.full_name          AS customer_name,
            c.phone              AS customer_phone,
            c.company_name       AS customer_company,
            COALESCE(shipments.shipment_count, 0) AS shipment_count,
            primary_shipment.id  AS shipment_id,
            primary_shipment.shipment_index,
            primary_shipment.status AS shipment_status,
            primary_shipment.actual_distance_km,
            COALESCE(distance_summary.total_actual_distance_km, 0) AS total_actual_distance_km,
            COALESCE(revenue_summary.total_actual_price, o.total_actual_price, 0) AS actual_price,
            COALESCE(revenue_summary.total_estimated_price, primary_shipment.estimated_price, 0) AS estimated_price,
            COALESCE(NULLIF(o.final_price, 0), revenue_summary.total_actual_price + COALESCE(exp.pass_through_expenses, 0), 0) AS final_price,
            primary_vehicle.plate_number,
            COALESCE(exp.total_expenses, 0) AS total_expenses
         FROM shipment_receipt_requests rr
         JOIN profiles p       ON p.id  = rr.driver_id
         JOIN orders o         ON o.id  = rr.order_id
         LEFT JOIN customers c  ON c.id  = o.customer_id
         LEFT JOIN LATERAL (
            SELECT COUNT(*) AS shipment_count
            FROM order_shipments os_count
            WHERE os_count.order_id = rr.order_id
         ) shipments ON TRUE
         LEFT JOIN LATERAL (
            SELECT SUM(COALESCE(os_distance.actual_distance_km, os_distance.estimated_distance_km, 0)) AS total_actual_distance_km
            FROM order_shipments os_distance
            WHERE os_distance.order_id = rr.order_id
         ) distance_summary ON TRUE
         LEFT JOIN LATERAL (
            SELECT
                SUM(
                    COALESCE(
                        NULLIF(os_revenue.actual_price, 0),
                        COALESCE(os_revenue.actual_distance_km, os_revenue.estimated_distance_km, 0)
                        * COALESCE(vg_vehicle_revenue.price_per_km, vg_order_revenue.price_per_km, 0)
                    )
                ) AS total_actual_price,
                SUM(COALESCE(os_revenue.estimated_price, 0)) AS total_estimated_price
            FROM order_shipments os_revenue
            LEFT JOIN vehicles v_revenue ON v_revenue.id = os_revenue.vehicle_id
            LEFT JOIN vehicle_groups vg_vehicle_revenue ON vg_vehicle_revenue.id = v_revenue.vehicle_group_id
            LEFT JOIN vehicle_groups vg_order_revenue ON vg_order_revenue.id = o.vehicle_group_id
            WHERE os_revenue.order_id = rr.order_id
         ) revenue_summary ON TRUE
         LEFT JOIN LATERAL (
            SELECT os_primary.*
            FROM order_shipments os_primary
            WHERE os_primary.order_id = rr.order_id
            ORDER BY CASE WHEN os_primary.owner_driver_id = rr.driver_id THEN 0 ELSE 1 END, os_primary.shipment_index ASC
            LIMIT 1
         ) primary_shipment ON TRUE
         LEFT JOIN vehicles primary_vehicle ON primary_vehicle.id = primary_shipment.vehicle_id
         LEFT JOIN LATERAL (
            SELECT
                SUM(e.amount) AS total_expenses,
                SUM(
                    CASE
                        WHEN e.expense_type IN ('parking', 'toll', 'depreciation') THEN e.amount
                        ELSE 0
                    END
                ) AS pass_through_expenses
            FROM expenses e
            JOIN order_shipments os_exp ON os_exp.id = e.shipment_id
            WHERE os_exp.order_id = rr.order_id
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
            rr.order_id,
            rr.driver_id,
            rr.status,
            rr.requested_at,
            rr.processed_at,
            rr.coordinator_notes,
            rr.processed_by,
            o.cargo_name,
            o.cargo_weight_kg,
            o.notes                    AS order_notes,
            o.total_actual_price       AS order_total_actual_price,
            o.final_price              AS order_final_price,
            c.id                       AS customer_id,
            c.full_name                AS customer_name,
            c.phone                    AS customer_phone,
            c.company_name             AS customer_company,
            c.address                  AS customer_address,
            d.full_name                AS driver_name
         FROM shipment_receipt_requests rr
         JOIN orders o ON o.id = rr.order_id
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN profiles d ON d.id = rr.driver_id
         WHERE rr.id = $1`,
        [requestId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Yêu cầu phiếu thu không tồn tại');

    const shipments = await getOrderShipmentsForReceipt(pool, row.order_id);
    const primaryShipment = resolvePrimaryReceiptShipment(shipments, row.driver_id);
    const computed = computeReceiptAmount({ shipments, primaryShipment });

    const expenses = shipments.flatMap((shipment) => shipment.expenses || []);
    const totalExpenses = shipments.reduce((sum, shipment) => sum + Number(shipment.total_expenses || 0), 0);
    const totalActualPrice = sumShipmentActualRevenue(shipments);
    const totalPassThroughExpenses = sumPassThroughExpenses(shipments);
    const finalPrice = totalActualPrice + totalPassThroughExpenses;

    return {
        request: {
            id: row.id,
            order_id: row.order_id,
            shipment_id: primaryShipment?.id ?? null,
            driver_id: row.driver_id,
            driver_name: row.driver_name,
            status: row.status,
            requested_at: row.requested_at,
            processed_at: row.processed_at,
            coordinator_notes: row.coordinator_notes,
            plate_number: primaryShipment?.plate_number || null,
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
            cargo_weight_kg: row.cargo_weight_kg,
            notes: row.order_notes,
            total_actual_price: totalActualPrice,
            final_price: finalPrice,
        },
        shipment: primaryShipment,
        shipments,
        expenses,
        summary: {
            total_actual_distance_km: computed.actual_km,
            total_actual_price: totalActualPrice,
            total_expenses: totalExpenses,
            total_pass_through_expenses: totalPassThroughExpenses,
            final_price: finalPrice,
            shipment_count: shipments.length,
            shipment_breakdown: computed.shipment_breakdown,
        },
    };
};

// POST approve — chốt actual income/expenses + cập nhật request status
const approveReceiptRequest = async (requestId, coordinatorId, { notes, expenses = [] } = {}) => {
    const normalizedExpenses = normalizeExpenses(expenses);

    const reqResult = await pool.query(
        `SELECT rr.*, o.customer_id
         FROM shipment_receipt_requests rr
         JOIN orders o ON o.id = rr.order_id
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
        const targetShipment = pricingSnapshot?.primaryShipment;
        if (!targetShipment) throw new Error('Không tìm thấy chuyến xe để tạo phiếu thu');
        const validShipmentIds = new Set((pricingSnapshot?.shipments || []).map((shipment) => Number(shipment.id)));

        for (const expense of normalizedExpenses) {
            const expenseShipmentId = expense.shipment_id ?? targetShipment.id;
            if (!validShipmentIds.has(Number(expenseShipmentId))) {
                throw new Error('Chi phí có chuyến xe không thuộc đơn hàng này');
            }
            const expenseVehicleId = pricingSnapshot.shipments.find((shipment) => Number(shipment.id) === Number(expenseShipmentId))?.vehicle_id ?? null;
            await client.query(
                `INSERT INTO expenses
                    (shipment_id, vehicle_id, created_by, updated_by, expense_type, amount, description, expense_date, created_at, updated_at)
                 VALUES ($1, $2, $3, $3, $4, $5, $6, CURRENT_DATE, NOW(), NOW())`,
                [
                    expenseShipmentId,
                    expenseVehicleId,
                    coordinatorId,
                    expense.expense_type,
                    expense.amount,
                    expense.description,
                ],
            );
        }

        for (const shipmentSummary of computed.shipment_breakdown) {
            await client.query(
                `UPDATE order_shipments
                 SET actual_price = $1,
                     updated_at = NOW()
                 WHERE id = $2`,
                [shipmentSummary.actual_income, shipmentSummary.shipment_id],
            );
        }

        await updateOrderReceiptTotals(client, req.order_id);

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
            message: `Coordinator đã tạo phiếu thu cho đơn #${req.order_id}.`,
            type: 'RECEIPT_APPROVED',
            entityType: 'orders',
            entityId: req.order_id,
        }, { displayMode: 'alert' }).catch(() => {});

        const detail = await getReceiptRequestDetail(requestId);
        return {
            total_actual_price: detail.summary.total_actual_price,
            total_expenses: detail.summary.total_expenses,
            final_price: detail.summary.final_price,
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
        message: `Yêu cầu phiếu thu cho đơn #${req.order_id} bị từ chối${notes ? `: ${notes}` : ''}.`,
        type: 'RECEIPT_REJECTED',
        entityType: 'orders',
        entityId: req.order_id,
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
