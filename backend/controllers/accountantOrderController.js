const accountantOrderService = require('../services/accountantOrderService');
const { posInt, posAmount, nonNegAmount, enumVal, pageParams, phoneVN, sendError, err400 } = require('../utils/accountantValidate');
const { ALLOWED_EXPENSE_TYPES: EXPENSE_TYPES } = require('../constants/expenseConstants');

const PAYMENT_TYPES        = ['cash', 'bank_transfer', 'client_credit'];
// driver_paid: tài xế đã thu tiền VÀ đã nộp về công ty (import đơn cũ) — nợ tạo + tất toán ngay
const CREATE_DRIVER_STATES = ['company_received', 'driver_holding', 'driver_paid'];
const DRIVER_STATES        = ['driver_holding', 'settled', 'pending'];
const PAYMENT_METHODS      = ['cash', 'bank_transfer'];

const getOrders = async (req, res) => {
    try {
        const { page, limit } = pageParams(req.query);
        const filters = {
            search:      req.query.search?.trim()      || null,
            debt_status: req.query.debt_status?.trim() || null,
        };

        const result = await accountantOrderService.getOrders(filters, page, limit);
        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
};

const getVehicleDriverLookup = async (_req, res) => {
    try {
        const lookup = await accountantOrderService.getVehicleDriverLookup();
        res.json(lookup);
    } catch (err) {
        sendError(res, err);
    }
};

// Validate 1 payload đơn ngoài (dùng chung cho tạo tay + import Excel)
const validateOrderBody = (body, { requirePhone = true } = {}) => {
    const {
        customer_name, customer_phone, customer_company,
        customer_id, order_date, notes, prepaid_amount,
        shipments,
    } = body;

    if (!customer_id) {
        if (!customer_name?.trim())
            throw err400('Tên khách hàng là bắt buộc.');
        if (requirePhone) {
            if (!customer_phone?.trim())
                throw err400('Số điện thoại khách hàng là bắt buộc.');
            if (!phoneVN(customer_phone.trim()))
                throw err400('Số điện thoại không đúng định dạng (VD: 0901234567).');
        } else if (customer_phone?.trim() && !phoneVN(customer_phone.trim())) {
            throw err400('Số điện thoại không đúng định dạng (VD: 0901234567).');
        }
    }

    nonNegAmount(prepaid_amount ?? 0, 'Số tiền đặt cọc');

        if (!Array.isArray(shipments) || shipments.length === 0)
            throw err400('Đơn hàng phải có ít nhất 1 chuyến xe.');
        if (shipments.length > 50)
            throw err400('Một đơn tối đa 50 chuyến.');

        for (let i = 0; i < shipments.length; i++) {
            const s   = shipments[i];
            const idx = `Chuyến ${i + 1}`;

            const pickups = (s.pickup_addresses || []).filter((p) => String(p || '').trim());
            if (pickups.length === 0)
                throw err400(`${idx}: cần ít nhất 1 điểm lấy hàng.`);
            if (!s.delivery_address?.trim())
                throw err400(`${idx}: thiếu địa chỉ giao hàng.`);

            if (s.vehicle_group_id != null) posInt(s.vehicle_group_id, `${idx}: Nhóm xe`);
            if (s.vehicle_id != null)       posInt(s.vehicle_id,       `${idx}: Xe`);
            if (s.driver_id != null)        posInt(s.driver_id,        `${idx}: Tài xế`);

            nonNegAmount(s.cargo_fee   ?? 0, `${idx}: Cước xe`);
            nonNegAmount(s.ticket_fee  ?? 0, `${idx}: Vé/phí`);
            nonNegAmount(s.cargo_weight ?? 0, `${idx}: Khối lượng hàng`);

            enumVal(s.payment_type, PAYMENT_TYPES, `${idx}: Hình thức thanh toán`);

            const driverState = s.driver_payment_state ?? 'company_received';
            enumVal(driverState, CREATE_DRIVER_STATES, `${idx}: Trạng thái tài xế`);

            if (s.payment_type === 'client_credit' && ['driver_holding', 'driver_paid'].includes(driverState))
                throw err400(`${idx}: Ghi nợ khách không thể kết hợp với trạng thái tài xế giữ/nộp tiền.`);

            if (s.driver_holding_amount != null) nonNegAmount(s.driver_holding_amount, `${idx}: Tiền tài đang giữ`);
            if (s.distance_km != null)           nonNegAmount(s.distance_km,           `${idx}: Quãng đường`);

            const expenses = Array.isArray(s.expenses) ? s.expenses : [];
            if (expenses.length > 20)
                throw err400(`${idx}: Tối đa 20 chi phí phát sinh.`);
            for (let j = 0; j < expenses.length; j++) {
                const e    = expenses[j];
                const eIdx = `${idx} - Chi phí ${j + 1}`;
                if (!e.expense_type)
                    throw err400(`${eIdx}: Loại chi phí là bắt buộc.`);
                enumVal(e.expense_type, EXPENSE_TYPES, `${eIdx}: Loại chi phí`);
                nonNegAmount(e.amount ?? 0, `${eIdx}: Số tiền`);
                if (e.description && String(e.description).length > 200)
                    throw err400(`${eIdx}: Ghi chú chi phí không quá 200 ký tự.`);
            }

            for (const addr of (s.pickup_addresses || [])) {
                if (String(addr || '').length > 500)
                    throw err400(`${idx}: Địa chỉ lấy hàng không quá 500 ký tự.`);
            }
            if (s.delivery_address && String(s.delivery_address).length > 500)
                throw err400(`${idx}: Địa chỉ giao hàng không quá 500 ký tự.`);
            if (s.cargo_name && String(s.cargo_name).length > 200)
                throw err400(`${idx}: Tên hàng không quá 200 ký tự.`);
            if (s.notes && String(s.notes).length > 500)
                throw err400(`${idx}: Ghi chú chuyến không quá 500 ký tự.`);
        }

    return {
        customer_name:    customer_name?.trim() || null,
        customer_phone:   customer_phone?.trim() || null,
        customer_company: customer_company?.trim() || null,
        customer_id:      customer_id || null,
        order_date:       order_date  || null,
        completed_at:     body.completed_at || null,
        notes:            notes?.trim() || null,
        prepaid_amount:   Number(prepaid_amount ?? 0),
        shipments,
    };
};

const createOrder = async (req, res) => {
    try {
        const payload = validateOrderBody(req.body);
        const newOrder = await accountantOrderService.createOrder({
            ...payload,
            created_by: req.user.userId,
        });

        res.status(201).json({ message: 'Tạo đơn hàng thành công.', order: newOrder });
    } catch (err) {
        sendError(res, err);
    }
};

// POST /accountant/orders/import — import hàng loạt từ template Excel
// Body: { orders: [payload như createOrder, kèm row_index để báo lỗi theo dòng] }
const importOrders = async (req, res) => {
    try {
        const { orders } = req.body;
        if (!Array.isArray(orders) || orders.length === 0)
            throw err400('Không có đơn nào để import.');
        if (orders.length > 1000)
            throw err400('Tối đa 1000 dòng mỗi lần import.');

        const imported = [];
        const errors = [];

        for (const order of orders) {
            const rowLabel = order.row_index != null ? `Dòng ${order.row_index}` : `Đơn thứ ${imported.length + errors.length + 1}`;
            try {
                // Import cho phép khách lẻ không SĐT/không tên (khác tạo tay)
                if (!order.customer_id && !order.customer_name?.trim()) {
                    order.customer_name = 'Khách lẻ';
                }
                // Khách nợ bắt buộc có SĐT — không định danh được thì không theo dõi nợ được
                const hasClientCredit = (order.shipments || []).some((s) => s.payment_type === 'client_credit');
                if (hasClientCredit && !order.customer_id && !order.customer_phone?.trim()) {
                    throw err400('Chuyến "Khách nợ" bắt buộc có SĐT khách hàng để theo dõi công nợ.');
                }
                // customers.phone NOT NULL — khách lẻ không SĐT gom chung 1 hồ sơ phone rỗng
                if (!order.customer_id && !order.customer_phone?.trim()) {
                    order.customer_phone = '';
                }
                const payload = validateOrderBody(order, { requirePhone: false });
                const created = await accountantOrderService.createOrder({
                    ...payload,
                    created_by: req.user.userId,
                });
                imported.push({ row_index: order.row_index ?? null, order_id: created.id });
            } catch (err) {
                errors.push({ row_index: order.row_index ?? null, error: `${rowLabel}: ${err.message}` });
            }
        }

        res.status(errors.length > 0 && imported.length === 0 ? 400 : 201).json({
            message: `Import xong: ${imported.length} đơn thành công${errors.length ? `, ${errors.length} dòng lỗi` : ''}.`,
            imported_count: imported.length,
            error_count: errors.length,
            imported,
            errors,
        });
    } catch (err) {
        sendError(res, err);
    }
};

const getShipments = async (req, res) => {
    try {
        const orderId = posInt(req.params.id, 'Mã đơn hàng');
        const shipments = await accountantOrderService.getOrderShipments(orderId);
        res.json(shipments);
    } catch (err) {
        sendError(res, err);
    }
};

const updateOrder = async (req, res) => {
    try {
        const orderId = posInt(req.params.id, 'Mã đơn hàng');

        const { customer_name, customer_phone, customer_company, cargo_name, notes } = req.body;

        if (customer_phone?.trim() && !phoneVN(customer_phone.trim()))
            throw err400('Số điện thoại không đúng định dạng (VD: 0901234567).');

        const updated = await accountantOrderService.updateOrder(orderId, {
            customer_name:    customer_name?.trim()    || undefined,
            customer_phone:   customer_phone?.trim()   || undefined,
            customer_company: customer_company?.trim() || undefined,
            cargo_name:       cargo_name?.trim()       || undefined,
            notes:            notes?.trim()            || undefined,
        });

        res.json({ message: 'Cập nhật đơn hàng thành công.', order: updated });
    } catch (err) {
        sendError(res, err);
    }
};

const getPayments = async (req, res) => {
    try {
        const orderId = posInt(req.params.id, 'Mã đơn hàng');
        const payments = await accountantOrderService.getPaymentsByOrderId(orderId);
        res.json(payments);
    } catch (err) {
        sendError(res, err);
    }
};

const getCustomerDebt = async (req, res) => {
    try {
        const orderId = posInt(req.params.id, 'Mã đơn hàng');
        const summary = await accountantOrderService.getCustomerDebtSummary(orderId);
        res.json(summary);
    } catch (err) {
        sendError(res, err);
    }
};

const createPayment = async (req, res) => {
    try {
        const orderId = posInt(req.params.id, 'Mã đơn hàng');
        const { amount, paymentMethod, notes } = req.body;

        const amt = posAmount(amount, 'Số tiền thanh toán');
        enumVal(paymentMethod, PAYMENT_METHODS, 'Hình thức thanh toán');
        if (notes && String(notes).length > 500)
            throw err400('Ghi chú không được vượt quá 500 ký tự.');

        const result = await accountantOrderService.recordPayment(orderId, {
            amount:        amt,
            paymentMethod: paymentMethod || 'cash',
            notes:         notes?.trim() || null,
            createdBy:     req.user.userId,
        });

        const message = result.spreadAcrossOrders
            ? `Đã phân bổ ${Math.round(result.totalAllocated).toLocaleString('vi-VN')}đ vào ${result.allocations.length} đơn hàng.`
            : 'Ghi nhận thanh toán thành công.';

        res.status(201).json({
            message,
            totalAllocated:      result.totalAllocated,
            totalRemainingAfter: result.totalRemainingAfter,
            allocations:         result.allocations,
            spreadAcrossOrders:  result.spreadAcrossOrders,
        });
    } catch (err) {
        sendError(res, err);
    }
};

const confirmDriverPayment = async (req, res) => {
    try {
        const orderId     = posInt(req.params.id,         'Mã đơn hàng');
        const shipmentId  = posInt(req.params.shipmentId, 'Mã chuyến');

        const { driver_payment_state, amount, payment_method } = req.body;

        if (!driver_payment_state)
            throw err400('Trạng thái xác nhận là bắt buộc.');
        enumVal(driver_payment_state, DRIVER_STATES, 'Trạng thái xác nhận tài xế');

        const amt = posAmount(amount, 'Số tiền tài xế thu');
        enumVal(payment_method, PAYMENT_METHODS, 'Hình thức thanh toán');

        void orderId;
        await accountantOrderService.confirmDriverPayment(
            shipmentId, driver_payment_state, amt, payment_method, req.user.userId,
        );

        res.json({ message: 'Xác nhận thu tiền tài xế thành công.' });
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = {
    getOrders,
    getShipments,
    getVehicleDriverLookup,
    createOrder,
    importOrders,
    getPayments,
    getCustomerDebt,
    createPayment,
    confirmDriverPayment,
    updateOrder,
};
