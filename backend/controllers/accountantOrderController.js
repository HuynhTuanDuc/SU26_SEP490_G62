const accountantOrderService = require('../services/accountantOrderService');
const { posInt, posAmount, nonNegAmount, enumVal, pageParams, phoneVN, sendError, err400 } = require('../utils/accountantValidate');

const PAYMENT_TYPES   = ['cash', 'bank_transfer', 'client_credit'];
const DRIVER_STATES   = ['driver_holding', 'settled', 'pending'];
const PAYMENT_METHODS = ['cash', 'bank_transfer'];

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

const createOrder = async (req, res) => {
    try {
        const {
            customer_name, customer_phone, customer_company,
            customer_id, order_date, notes, prepaid_amount,
            shipments,
        } = req.body;

        if (!customer_id) {
            if (!customer_name?.trim())
                throw err400('Tên khách hàng là bắt buộc.');
            if (!customer_phone?.trim())
                throw err400('Số điện thoại khách hàng là bắt buộc.');
            if (!phoneVN(customer_phone.trim()))
                throw err400('Số điện thoại không đúng định dạng (VD: 0901234567).');
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
        }

        const newOrder = await accountantOrderService.createOrder({
            customer_name:    customer_name?.trim() || null,
            customer_phone:   customer_phone?.trim() || null,
            customer_company: customer_company?.trim() || null,
            customer_id:      customer_id || null,
            order_date:       order_date  || null,
            notes:            notes?.trim() || null,
            prepaid_amount:   Number(prepaid_amount ?? 0),
            shipments,
            created_by: req.user.userId,
        });

        res.status(201).json({ message: 'Tạo đơn hàng thành công.', order: newOrder });
    } catch (err) {
        sendError(res, err);
    }
};

const importOrders = async (req, res) => {
    try {
        const { orders } = req.body;

        if (!Array.isArray(orders) || orders.length === 0)
            throw err400('Danh sách đơn nhập không được rỗng.');
        if (orders.length > 500)
            throw err400('Mỗi lần nhập tối đa 500 đơn.');

        for (let i = 0; i < orders.length; i++) {
            const o   = orders[i];
            const idx = `Đơn dòng ${i + 1}`;
            if (!o.customer_name?.trim() && !o.customer_id)
                throw err400(`${idx}: thiếu tên khách hàng.`);
            if (!Array.isArray(o.shipments) || o.shipments.length === 0)
                throw err400(`${idx}: cần ít nhất 1 chuyến.`);
        }

        const imported = await accountantOrderService.importOrders(orders, req.user.userId);
        res.status(201).json({
            message: `Nhập thành công ${imported.length} đơn hàng.`,
            count: imported.length,
            orders: imported,
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

const createPayment = async (req, res) => {
    try {
        const orderId = posInt(req.params.id, 'Mã đơn hàng');
        const { amount, paymentMethod, notes } = req.body;

        const amt = posAmount(amount, 'Số tiền thanh toán');
        enumVal(paymentMethod, PAYMENT_METHODS, 'Hình thức thanh toán');

        const result = await accountantOrderService.recordPayment(orderId, {
            amount: amt,
            paymentMethod: paymentMethod || 'cash',
            notes: notes?.trim() || null,
            createdBy: req.user.userId,
        });

        res.status(201).json({
            message: 'Ghi nhận thanh toán thành công.',
            payment:       result.payment,
            newPaidAmount: result.newPaidAmount,
            newStatus:     result.newStatus,
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
    createPayment,
    confirmDriverPayment,
    updateOrder,
};
