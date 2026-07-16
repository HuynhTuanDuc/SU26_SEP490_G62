const XLSX = require('xlsx');
const pool = require('../config/database');
const orderRepository = require('../repositories/orderRepository');
const expenseRepository = require('../repositories/expenseRepository');
const incidentRepository = require('../repositories/incidentRepository');
const coordinatorRepository = require('../repositories/coordinatorRepository');
const notificationGateway = require('./notificationGateway');
const { SHIPMENT_STATUS } = require('../constants/tripConstants');
const { ALLOWED_EXPENSE_TYPES: VALID_EXPENSE_TYPES, PASS_THROUGH_EXPENSE_TYPES } = require('../constants/expenseConstants');
const financialLedgerRepository = require('../repositories/financialLedgerRepository');

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

const listPartners = async () => orderRepository.listCoordinatorPartners();

const getIncidents = async ({ status = null, severityLevel = null, search = '', sort = 'newest', page = 1, limit = 10 } = {}) => {
  return incidentRepository.getCoordinatorIncidents({ status, severityLevel, search, sort, page, limit });
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
        customer = await orderRepository.findCustomerByName(dbClient, customerName);
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
          customer_name: customerName,
          customer_phone: customerPhone,
          notes,
        },
        shipmentData: {
          owner_driver_id: finalDriverId,
          vehicle_id: finalVehicleId,
          vehicle_group_id: finalVehicleGroupId,
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

// toll, parking, etc: khách chịu (pass-through). fuel/repair: công ty chịu.

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

const getOrderShipmentsForReceipt = async (db, orderId) => {
    const rawShipments = await coordinatorRepository.getOrderShipments(db, orderId);

    const shipments = [];
    for (const shipment of rawShipments) {
        const expenses = await expenseRepository.getShipmentExpenses(shipment.id);
        // Chi phí bị từ chối không được tính vào bất kỳ tổng tiền nào
        const countableExpenses = expenses.filter((expense) => expense.status !== 'rejected');
        const totalExpenses = countableExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
        const passThroughExpenses = countableExpenses.reduce((sum, expense) => (
            PASS_THROUGH_EXPENSE_TYPES.has(String(expense.expense_type || '').trim())
                ? sum + Number(expense.amount || 0)
                : sum
        ), 0);
        const pickupStops = shipment.stops.filter((stop) => stop.stop_type === 'pickup');
        const deliveryStop = shipment.stops.find((stop) => stop.stop_type === 'delivery') ?? null;
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
    const request = await coordinatorRepository.getReceiptRequestPricingHeader(db, requestId);
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
    const prepaidAmount = Math.max(Number(pricingSnapshot?.prepaid_amount || 0), 0);
    const primaryShipment = pricingSnapshot?.primaryShipment ?? null;
    const primaryBreakdown = primaryShipment
        ? shipmentBreakdown.find((item) => Number(item.shipment_id) === Number(primaryShipment.id)) ?? shipmentBreakdown[0]
        : shipmentBreakdown[0];
    const remainingAmount = Math.max(totalActualIncome - prepaidAmount, 0);

    return {
        shipment_id: primaryBreakdown?.shipment_id ?? null,
        actual_km: totalActualKm,
        price_per_km: primaryBreakdown?.price_per_km ?? 0,
        actual_income: totalActualIncome,
        gross_amount: totalActualIncome,
        prepaid_amount: prepaidAmount,
        remaining_amount: remainingAmount,
        shipment_breakdown: shipmentBreakdown,
    };
};

const broadcastCoordinatorReceiptRequestChange = (action, requestId, orderId) => {
    notificationGateway.broadcastToRole('coordinator', {
        type: 'coordinator.receipt_requests.changed',
        action,
        requestId,
        orderId,
    });
};

// GET danh sách yêu cầu phiếu thu (mặc định: pending + processing)
const getReceiptRequests = async ({
    status = null,
    kind = 'all',
    search = '',
    dateFrom = '',
    dateTo = '',
    sort = null,
    page = 1,
    limit = 10,
} = {}) => {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const normalizedPage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
    const normalizedLimit = isNaN(limitNum) || limitNum < 1 ? 10 : limitNum;
    const offset = (normalizedPage - 1) * normalizedLimit;

    const conditions = [];
    const params = [];

    const normalizedStatus = String(status || '').trim().toLowerCase();
    const normalizedKind = String(kind || 'all').trim().toLowerCase();
    const normalizedSearch = String(search || '').trim();

    if (normalizedStatus && normalizedStatus !== 'all') {
        params.push(normalizedStatus);
        conditions.push(`rr.status = $${params.length}`);
    } else if (normalizedKind === 'requests') {
        conditions.push(`rr.status IN ('pending', 'processing')`);
    } else if (normalizedKind === 'receipts') {
        conditions.push(`rr.status = 'approved'`);
    } else if (normalizedKind === 'rejected') {
        conditions.push(`rr.status = 'rejected'`);
    }

    if (normalizedSearch) {
        params.push(`%${normalizedSearch}%`);
        conditions.push(`(
            CAST(rr.id AS TEXT) ILIKE $${params.length}
            OR CAST(rr.order_id AS TEXT) ILIKE $${params.length}
            OR COALESCE(p.full_name, '') ILIKE $${params.length}
            OR COALESCE(c.full_name, '') ILIKE $${params.length}
            OR COALESCE(c.phone, '') ILIKE $${params.length}
            OR COALESCE(primary_vehicle.plate_number, '') ILIKE $${params.length}
            OR COALESCE(rr.status, '') ILIKE $${params.length}
        )`);
    }

    if (dateFrom) {
        params.push(dateFrom);
        conditions.push(`DATE(COALESCE(sr.collected_at, rr.processed_at, rr.requested_at)) >= $${params.length}`);
    }

    if (dateTo) {
        params.push(dateTo);
        conditions.push(`DATE(COALESCE(sr.collected_at, rr.processed_at, rr.requested_at)) <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows, total } = await coordinatorRepository.listReceiptRequests({
        where, params, limit: normalizedLimit, offset, sort,
    });

    return {
        requests: rows,
        pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total,
            totalPages: Math.max(1, Math.ceil(total / normalizedLimit)),
        }
    };
};

const getReceiptRequestDetail = async (requestId) => {
    const row = await coordinatorRepository.getReceiptRequestHeader(requestId);
    if (!row) throw new Error('Yêu cầu phiếu thu không tồn tại');

    const shipments = await getOrderShipmentsForReceipt(pool, row.order_id);
    const primaryShipment = resolvePrimaryReceiptShipment(shipments, row.driver_id);
    const computed = computeReceiptAmount({ shipments, primaryShipment });

    const expenses = shipments.flatMap((shipment) => shipment.expenses || []);
    const totalExpenses = shipments.reduce((sum, shipment) => sum + Number(shipment.total_expenses || 0), 0);
    const totalActualPrice = sumShipmentActualRevenue(shipments);
    const totalPassThroughExpenses = sumPassThroughExpenses(shipments);
    const finalPrice = totalActualPrice + totalPassThroughExpenses;
    const prepaidAmount = Math.max(Number(row.order_prepaid_amount || 0), 0);
    const remainingReceiptAmount = Math.max(finalPrice - prepaidAmount, 0);

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
            prepaid_amount: prepaidAmount,
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
            prepaid_amount: prepaidAmount,
            remaining_receipt_amount: remainingReceiptAmount,
            shipment_count: shipments.length,
            shipment_breakdown: computed.shipment_breakdown,
        },
    };
};

// POST approve — chốt actual income/expenses + cập nhật request status
const approveReceiptRequest = async (requestId, coordinatorId, { notes, expenses = [] } = {}) => {
    const normalizedExpenses = normalizeExpenses(expenses);

    const req = await coordinatorRepository.getReceiptRequestForApproval(requestId);
    if (!req) throw new Error('Yêu cầu phiếu thu không tồn tại');
    if (req.status === 'approved') throw new Error('Yêu cầu này đã được duyệt rồi');
    if (req.status === 'rejected') throw new Error('Yêu cầu này đã bị từ chối');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const pricingSnapshot = await getShipmentPricingSnapshot(client, requestId);
        const targetShipment = pricingSnapshot?.primaryShipment;
        if (!targetShipment) throw new Error('Không tìm thấy chuyến xe để tạo phiếu thu');
        const requestActualKm = Number(req.actual_km);
        if (Number.isFinite(requestActualKm) && requestActualKm > 0) {
            await coordinatorRepository.updateShipmentActualDistance(client, targetShipment.id, requestActualKm);

            targetShipment.actual_distance_km = requestActualKm;
            const matchedShipment = pricingSnapshot?.shipments?.find(
                (shipment) => Number(shipment.id) === Number(targetShipment.id),
            );
            if (matchedShipment) {
                matchedShipment.actual_distance_km = requestActualKm;
            }
        }
        const computed = computeReceiptAmount(pricingSnapshot);
        const validShipmentIds = new Set((pricingSnapshot?.shipments || []).map((shipment) => Number(shipment.id)));

        for (const expense of normalizedExpenses) {
            const expenseShipmentId = expense.shipment_id ?? targetShipment.id;
            if (!validShipmentIds.has(Number(expenseShipmentId))) {
                throw new Error('Chi phí có chuyến xe không thuộc đơn hàng này');
            }
            const expenseVehicleId = pricingSnapshot.shipments.find((shipment) => Number(shipment.id) === Number(expenseShipmentId))?.vehicle_id ?? null;
            const insertedExpense = await coordinatorRepository.insertApprovedExpense(client, {
                shipmentId: expenseShipmentId,
                vehicleId: expenseVehicleId,
                coordinatorId,
                expenseType: expense.expense_type,
                amount: expense.amount,
                description: expense.description,
            });
            // Ghi sổ: pass-through (khách chịu) tách khỏi chi phí vận hành (công ty chịu)
            const isPassThrough = PASS_THROUGH_EXPENSE_TYPES.has(expense.expense_type);
            await financialLedgerRepository.insertTransaction(client, {
                eventType: isPassThrough ? 'pass_through_cost' : 'expense_recorded',
                debitAccount: isPassThrough ? '3388' : '642',
                creditAccount: '1111',
                amount: expense.amount,
                description: `${isPassThrough ? 'Chi hộ khách' : 'Chi phí vận hành'} (${expense.expense_type}) — chuyến #${expenseShipmentId}`,
                refType: 'expense', refId: insertedExpense.id, actorId: coordinatorId,
            });
        }

        for (const shipmentSummary of computed.shipment_breakdown) {
            await coordinatorRepository.updateShipmentActualPrice(client, shipmentSummary.shipment_id, shipmentSummary.actual_income);
            // Ghi sổ doanh thu chuyến khi actual_price được chốt chính thức
            await financialLedgerRepository.insertTransaction(client, {
                eventType: 'shipment_revenue',
                debitAccount: '131', creditAccount: '511',
                amount: shipmentSummary.actual_income,
                description: `Doanh thu chuyến #${shipmentSummary.shipment_id} — đơn #${req.order_id}`,
                refType: 'shipment', refId: shipmentSummary.shipment_id, actorId: coordinatorId,
            });
        }

        // Duyệt phiếu thu = duyệt luôn các chi phí pending mà driver đã khai trong đơn
        const autoApprovedExpenses = await coordinatorRepository.autoApproveOrderExpenses(client, coordinatorId, req.order_id);
        for (const exp of autoApprovedExpenses) {
            const expPassThrough = PASS_THROUGH_EXPENSE_TYPES.has(exp.expense_type);
            await financialLedgerRepository.insertTransaction(client, {
                eventType: expPassThrough ? 'pass_through_cost' : 'expense_recorded',
                debitAccount: expPassThrough ? '3388' : '642',
                creditAccount: '1111',
                amount: exp.amount,
                description: `${expPassThrough ? 'Chi hộ khách' : 'Chi phí vận hành'} (${exp.expense_type}) — chuyến #${exp.shipment_id}, duyệt cùng phiếu thu`,
                refType: 'expense', refId: exp.id, actorId: coordinatorId,
            });
        }

        // Cập nhật trạng thái request → approved
        await coordinatorRepository.markReceiptRequestApproved(client, { coordinatorId, requestId, notes });

        // Tạo phiếu thu để driver xem — payment_type = NULL cho đến khi driver xác nhận
        // Tổng khách phải trả = cước (km × đơn giá − trả trước) + chi hộ khách (toll/parking/etc)
        // Chi phí công ty chịu (fuel/repair) KHÔNG cộng vào tiền khách.
        const snapshotPassThrough = sumPassThroughExpenses(pricingSnapshot.shipments);
        const coordinatorPassThrough = normalizedExpenses.reduce((sum, expense) => (
            PASS_THROUGH_EXPENSE_TYPES.has(expense.expense_type) ? sum + Number(expense.amount) : sum
        ), 0);
        const totalAmount = computed.remaining_amount + snapshotPassThrough + coordinatorPassThrough;
        await coordinatorRepository.insertShipmentReceipt(client, {
            shipmentId: targetShipment.id, amount: totalAmount, driverId: req.driver_id,
            notes, requestId, coordinatorId,
        });

        await client.query('COMMIT');

        // Recalculate KPI cho tất cả driver trong đơn sau khi actual_price được chốt (BR-026)
        const shipmentIds = computed.shipment_breakdown.map((s) => s.shipment_id);
        if (shipmentIds.length > 0) {
            coordinatorRepository.getShipmentOwnersForKpi(shipmentIds).then((rows) => {
                const kpiService = require('./kpiService');
                rows.forEach(({ owner_driver_id, completed_at }) => {
                    kpiService.recalculateAfterCompletion(owner_driver_id, new Date(completed_at || Date.now()));
                });
            }).catch(() => {});
        }

        // Notify driver
        const notificationService = require('./notificationService');
        notificationService.createForUser(req.driver_id, {
            title: 'Phiếu thu đã được tạo',
            message: `Coordinator đã tạo phiếu thu cho đơn #${req.order_id}.`,
            type: 'RECEIPT_APPROVED',
            entityType: 'orders',
            entityId: req.order_id,
        }, { displayMode: 'alert' }).catch(() => {});

        broadcastCoordinatorReceiptRequestChange('approved', requestId, req.order_id);
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
    const req = await coordinatorRepository.getReceiptRequestById(requestId);
    if (!req) throw new Error('Yêu cầu phiếu thu không tồn tại');
    if (req.status === 'approved') throw new Error('Yêu cầu này đã được duyệt rồi');
    if (req.status === 'rejected') throw new Error('Yêu cầu này đã bị từ chối rồi');

    await coordinatorRepository.rejectReceiptRequestRow(coordinatorId, notes, requestId);

    const notificationService = require('./notificationService');
    notificationService.createForUser(req.driver_id, {
        title: 'Yêu cầu phiếu thu bị từ chối',
        message: `Yêu cầu phiếu thu cho đơn #${req.order_id} bị từ chối${notes ? `: ${notes}` : ''}.`,
        type: 'RECEIPT_REJECTED',
        entityType: 'orders',
        entityId: req.order_id,
    }, { displayMode: 'alert' }).catch(() => {});

    broadcastCoordinatorReceiptRequestChange('rejected', requestId, req.order_id);
    return { success: true };
};

// Chuyến chưa hoàn thành/hủy — cho phép Coordinator/Manager chủ động hủy
const CANCELLABLE_STATUSES = [
    SHIPMENT_STATUS.AVAILABLE,
    SHIPMENT_STATUS.CLAIMED,
    SHIPMENT_STATUS.PICKING,
    SHIPMENT_STATUS.TRANSIT,
    SHIPMENT_STATUS.ARRIVED,
    SHIPMENT_STATUS.RETURNING,
    SHIPMENT_STATUS.FAILED,
];

// Hủy 1 trip cụ thể (khác cancelOrder — chỉ hủy 1 shipment, giữ nguyên các shipment khác cùng order)
const cancelShipment = async (shipmentId, reason, actorId) => {
    const tripRepository = require('../repositories/tripRepository');
    const notificationService = require('./notificationService');

    if (!reason?.trim()) throw new Error('Lý do hủy chuyến là bắt buộc');

    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');
    if (!CANCELLABLE_STATUSES.includes(shipment.status)) {
        throw new Error('Chuyến đã hoàn thành hoặc đã hủy, không thể hủy thêm');
    }

    const updated = await tripRepository.updateTripStatus(shipmentId, SHIPMENT_STATUS.CANCELLED, reason.trim());
    if (!updated) throw new Error('Không thể hủy chuyến');

    if (shipment.owner_driver_id) {
        notificationService.createForUser(shipment.owner_driver_id, {
            title: 'Chuyến của bạn đã bị hủy',
            message: `Chuyến #${shipmentId} đã bị hủy. Lý do: ${reason.trim()}`,
            type: 'TRIP_CANCELLED',
            entityType: 'shipments',
            entityId: shipmentId,
        }, { displayMode: 'alert' }).catch(() => {});
    }

    return updated;
};

// Điều chuyển tài xế/xe thủ công cho 1 trip — KHÔNG qua Incident, KHÔNG chia doanh thu
// (chỉ áp dụng khi chưa lấy hàng; nếu đã lấy hàng cần dùng luồng Incident để chia doanh thu công bằng)
const reassignShipment = async (shipmentId, { toDriverId }, actorId) => {
    const tripRepository = require('../repositories/tripRepository');
    const driverRepository = require('../repositories/driverRepository');
    const notificationService = require('./notificationService');

    const parsedToDriverId = Number(toDriverId);
    if (!parsedToDriverId) throw new Error('Tài xế thay thế là bắt buộc');

    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');
    if (!shipment.owner_driver_id) {
        throw new Error('Chuyến chưa có tài xế nhận — không thể điều chuyển, chỉ có thể chờ tài xế claim');
    }
    if (Number(shipment.owner_driver_id) === parsedToDriverId) {
        throw new Error('Tài xế thay thế phải khác tài xế đang giữ chuyến');
    }
    if (shipment.pickup_completed_at) {
        throw new Error('Chuyến đã lấy hàng — vui lòng dùng luồng Sự cố (Incident) để điều chuyển kèm chia doanh thu công bằng');
    }

    const toDriver = (await driverRepository.getAllDrivers()).find((d) => Number(d.id) === parsedToDriverId);
    if (!toDriver) throw new Error('Tài xế thay thế không tồn tại');
    if (!toDriver.vehicle_id) throw new Error('Tài xế thay thế chưa được gán xe');

    const fromDriverId = Number(shipment.owner_driver_id);
    const reassigned = await tripRepository.reassignShipmentAfterIncident(shipmentId, {
        incidentId: null,
        fromDriverId,
        toDriverId: parsedToDriverId,
        toVehicleId: Number(toDriver.vehicle_id),
        changedBy: actorId,
        changeReason: 'manual_reassign',
        note: 'Điều phối viên/Quản lý chủ động điều chuyển (ngoài luồng sự cố)',
    });

    notificationService.createForUser(fromDriverId, {
        title: 'Chuyến của bạn đã được điều chuyển',
        message: `Chuyến #${shipmentId} đã được điều chuyển cho tài xế khác.`,
        type: 'TRIP_ASSIGNED',
        entityType: 'shipments',
        entityId: shipmentId,
    }, { displayMode: 'alert' }).catch(() => {});

    notificationService.createForUser(parsedToDriverId, {
        title: 'Bạn được điều chuyển 1 chuyến mới',
        message: `Bạn đã được phân công tiếp quản chuyến #${shipmentId}.`,
        type: 'TRIP_ASSIGNED',
        entityType: 'shipments',
        entityId: shipmentId,
    }, { displayMode: 'alert' }).catch(() => {});

    return reassigned;
};

// Tổng quan cho Coordinator — số đơn/trip đang xử lý, sự cố mở, phiếu thu/chi phí chờ duyệt
const getDashboard = async () => {
    const overview = await coordinatorRepository.getDashboardStats();
    const recentIncidents = await incidentRepository.getCoordinatorIncidents({ status: 'open', page: 1, limit: 5 });

    return {
        overview,
        recent_incidents: recentIncidents.incidents,
    };
};

module.exports = {
  importExcel,
  listVehicleGroups,
  listPartners,
  getIncidents,
  getReceiptRequests,
  getReceiptRequestDetail,
  approveReceiptRequest,
    rejectReceiptRequest,
    cancelShipment,
    reassignShipment,
    getDashboard,
};
