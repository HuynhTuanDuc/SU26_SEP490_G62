/**
 * Seed dữ liệu NGHIỆP VỤ của chính dự án này (đơn hàng → chuyến → quyền sở hữu),
 * tương ứng "Minimum Domain Data" mà Test Plan §3.2 yêu cầu.
 *
 * Điểm cần biết về mô hình: order_shipments KHÔNG có cột owner_driver_id. Quyền sở hữu
 * chuyến suy ra từ view v_shipment_current, lấy dòng MỚI NHẤT của bảng
 * shipment_assignment_history. Muốn seed một chuyến "đã có tài" thì phải ghi lịch sử
 * gán, không phải update cột — đây đúng là loại chi tiết mà L1 (mock repository) không
 * bao giờ chạm tới.
 */
const { getPool } = require('./testDb');

/** Tạo khách hàng tối thiểu để gắn vào đơn */
const createCustomerRow = async (ten = 'Khách Thử') => {
    const { rows } = await getPool().query(
        `INSERT INTO customers (full_name, phone, customer_type) VALUES ($1, $2, 'individual') RETURNING id`,
        [ten, `090${Math.floor(1000000 + Math.random() * 8999999)}`],
    );
    return rows[0].id;
};

/**
 * Tạo 1 đơn hàng kèm 1 chuyến.
 * @param {object} o
 * @param {number} o.createdBy       profile id người tạo đơn (coordinator/accountant)
 * @param {number} o.vehicleGroupId  nhóm xe của chuyến — quyết định tài nào nhìn thấy (BR-DRV-004)
 * @param {string} [o.status]        trạng thái chuyến, mặc định 'available'
 * @param {number} [o.ownerDriverId] gán chuyến cho tài này (ghi vào lịch sử gán)
 * @param {number} [o.vehicleId]     xe đi kèm khi gán
 * @param {string} [o.paymentType]   cash | bank_transfer | client_credit
 */
const createOrderWithShipment = async ({
    createdBy,
    vehicleGroupId,
    status = 'available',
    ownerDriverId = null,
    vehicleId = null,
    paymentType = 'cash',
    estimatedPrice = 2_000_000,
} = {}) => {
    const customerId = await createCustomerRow();

    const { rows: don } = await getPool().query(
        `INSERT INTO orders (customer_id, created_by, cargo_name, payment_type, total_estimated_price)
         VALUES ($1, $2, 'Hàng thử', $3, $4) RETURNING id`,
        [customerId, createdBy, paymentType, estimatedPrice],
    );
    const orderId = don[0].id;

    const { rows: chuyen } = await getPool().query(
        `INSERT INTO order_shipments
             (order_id, shipment_index, vehicle_group_id, estimated_price, estimated_distance_km, status)
         VALUES ($1, 1, $2, $3, 100, $4) RETURNING id`,
        [orderId, vehicleGroupId, estimatedPrice, status],
    );
    const shipmentId = chuyen[0].id;

    if (ownerDriverId) {
        await getPool().query(
            `INSERT INTO shipment_assignment_history
                 (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
             VALUES ($1, $2, $3, $2, 'self_claim')`,
            [shipmentId, ownerDriverId, vehicleId],
        );
    }

    return { orderId, shipmentId, customerId };
};

/** Đọc trạng thái + chủ sở hữu hiện tại của chuyến, đúng cách hệ thống tự đọc */
const readShipment = async (shipmentId) => {
    const { rows } = await getPool().query(
        `SELECT s.id, s.status, s.claimed_at, v.owner_driver_id, v.vehicle_id
           FROM order_shipments s
           LEFT JOIN v_shipment_current v ON v.shipment_id = s.id
          WHERE s.id = $1`,
        [shipmentId],
    );
    return rows[0];
};

/** Yêu cầu phiếu thu của một đơn — dùng để mở/khoá quyền khai chi phí sau khi chuyến kết thúc */
const createReceiptRequest = async ({ orderId, shipmentId, driverId, status = 'pending' }) => {
    const { rows } = await getPool().query(
        `INSERT INTO order_receipt_requests
             (order_id, requesting_shipment_id, driver_id, status)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [orderId, shipmentId, driverId, status],
    );
    return rows[0].id;
};

/** Đọc thẳng các khoản chi phí của chuyến từ DB, không qua API */
const readExpenses = async (shipmentId) => {
    const { rows } = await getPool().query(
        `SELECT id, expense_type, amount, status, created_by, client_request_id
           FROM expenses WHERE shipment_id = $1 ORDER BY id`,
        [shipmentId],
    );
    return rows;
};

/** Ghi thẳng một khoản chi phí đã tồn tại vào chuyến (bỏ qua đường API, dùng để dựng bối cảnh) */
const addExpense = async ({ shipmentId, driverId, vehicleId = null, expenseType = 'toll', amount = 200000, status = 'pending' }) => {
    const { rows } = await getPool().query(
        `INSERT INTO expenses (shipment_id, vehicle_id, created_by, expense_type, amount, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [shipmentId, vehicleId, driverId, expenseType, amount, status],
    );
    return rows[0].id;
};

/** Đặt số km thực tế của chuyến — đầu vào của công thức tiền cước */
const setActualDistanceKm = async (shipmentId, km) => {
    await getPool().query('UPDATE order_shipments SET actual_distance_km = $1 WHERE id = $2', [km, shipmentId]);
};

module.exports = {
    createOrderWithShipment, createCustomerRow, readShipment, createReceiptRequest, readExpenses,
    addExpense, setActualDistanceKm,
};
