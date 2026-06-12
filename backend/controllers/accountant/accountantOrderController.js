const accountantOrderService = require('../../services/accountant/accountantOrderService');

const getOrders = async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            search: req.query.search,
        };
        const page = req.query.page ? Number(req.query.page) : null;
        const limit = req.query.limit ? Number(req.query.limit) : null;

        const result = await accountantOrderService.getOrders(filters, page, limit);
        res.json(result);
    } catch (err) {
        console.error('Error fetching accountant orders:', err);
        res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
    }
};

const getVehicleDriverLookup = async (_req, res) => {
    try {
        const lookup = await accountantOrderService.getVehicleDriverLookup();
        res.json(lookup);
    } catch (err) {
        console.error('Error fetching accountant lookup:', err);
        res.status(500).json({ error: 'Failed to fetch lookup', details: err.message });
    }
};

const createOrder = async (req, res) => {
    try {
        const { shipments } = req.body;

        if (!Array.isArray(shipments) || shipments.length === 0) {
            return res.status(400).json({ error: 'Cần ít nhất 1 chuyến xe trong đơn.' });
        }

        const {
            customer_name, customer_phone, customer_company,
            customer_id,   // ← khi chọn đối tác từ danh sách
            order_date, notes
        } = req.body;

        if (!customer_name?.trim() && !customer_id) {
            return res.status(400).json({ error: 'Tên khách hàng là bắt buộc khi tạo mới.' });
        }
        if (!customer_phone?.trim() && !customer_id) {
            return res.status(400).json({ error: 'Số điện thoại là bắt buộc khi tạo mới.' });
        }

        for (let i = 0; i < shipments.length; i += 1) {
            const s = shipments[i];
            const pickups = (s.pickup_addresses || []).filter((p) => String(p || '').trim() !== '');
            if (pickups.length === 0) {
                return res.status(400).json({ error: `Chuyến ${i + 1}: cần ít nhất 1 điểm lấy hàng.` });
            }
            if (!s.delivery_address?.trim()) {
                return res.status(400).json({ error: `Chuyến ${i + 1}: cần nhập điểm giao hàng.` });
            }
            if (Number(s.cargo_fee || 0) < 0 || Number(s.ticket_fee || 0) < 0) {
                return res.status(400).json({ error: `Chuyến ${i + 1}: cước xe và vé phải là số không âm.` });
            }
        }

        const createdByUserId = req.user.userId;
        const orderData = {
            customer_name,
            customer_phone,
            customer_company,
            customer_id: customer_id || null,
            order_date,
            notes,
            shipments,
            created_by: createdByUserId,
        };

        const newOrder = await accountantOrderService.createOrder(orderData);
        res.status(201).json({ message: 'Order created successfully', order: newOrder });
    } catch (err) {
        console.error('Error creating accountant order:', err);
        res.status(500).json({ error: 'Failed to create order', details: err.message });
    }
};

const importOrders = async (req, res) => {
    try {
        const { orders } = req.body;
        if (!Array.isArray(orders) || orders.length === 0) {
            return res.status(400).json({ error: 'A non-empty array of orders is required for import' });
        }

        const createdByUserId = req.user.userId;
        const importedOrders = await accountantOrderService.importOrders(orders, createdByUserId);

        res.status(201).json({
            message: `Successfully imported ${importedOrders.length} orders`,
            count: importedOrders.length,
            orders: importedOrders,
        });
    } catch (err) {
        console.error('Error importing accountant orders:', err);
        res.status(500).json({ error: 'Failed to import orders', details: err.message });
    }
};

const getPayments = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (Number.isNaN(orderId)) {
            return res.status(400).json({ error: 'Invalid order id' });
        }
        const payments = await accountantOrderService.getPaymentsByOrderId(orderId);
        res.json(payments);
    } catch (err) {
        console.error('Error fetching payments:', err);
        res.status(500).json({ error: 'Failed to load payment history', details: err.message });
    }
};

const createPayment = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (Number.isNaN(orderId)) {
            return res.status(400).json({ error: 'Invalid order id' });
        }

        const { amount, paymentMethod, notes } = req.body;
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ error: 'Payment amount must be greater than 0' });
        }

        const createdBy = req.user.userId;
        const result = await accountantOrderService.recordPayment(orderId, {
            amount,
            paymentMethod,
            notes,
            createdBy,
        });

        res.status(201).json({
            message: 'Payment recorded successfully',
            payment: result.payment,
            newPaidAmount: result.newPaidAmount,
            newStatus: result.newStatus,
        });
    } catch (err) {
        console.error('Error recording payment:', err);
        res.status(500).json({ error: err.message || 'Internal error while recording payment' });
    }
};

const getShipments = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (Number.isNaN(orderId)) {
            return res.status(400).json({ error: "Invalid order id" });
        }
        const shipments = await accountantOrderService.getOrderShipments(orderId);
        res.json(shipments);
    } catch (err) {
        console.error("Error fetching shipments:", err);
        res.status(500).json({ error: "Failed to fetch shipments", details: err.message });
    }
};

const confirmDriverPayment = async (req, res) => {
    try {
        const shipmentId = Number(req.params.shipmentId);
        if (Number.isNaN(shipmentId)) {
            return res.status(400).json({ error: "Invalid shipment id" });
        }
        const { driver_payment_state, amount, payment_method } = req.body;
        const confirmedBy = req.user.userId;
        await accountantOrderService.confirmDriverPayment(shipmentId, driver_payment_state, amount, payment_method, confirmedBy);
        res.json({ ok: true });
    } catch (err) {
        console.error("Error confirming driver payment:", err);
        res.status(500).json({ error: err.message || "Failed to confirm driver payment" });
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
};
