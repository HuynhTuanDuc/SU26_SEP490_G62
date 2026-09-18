const accountantOrderService = require('../services/accountantOrderService');
const { posInt, posAmount, nonNegAmount, nonNegNumber, enumVal, pageParams, phoneVN, validDate, sendError, err400 } = require('../utils/accountantValidate');
const { ALLOWED_EXPENSE_TYPES: EXPENSE_TYPES } = require('../constants/expenseConstants');
const { buildImportFingerprint } = require('../utils/importFingerprint');
const { money } = require('../utils/formatNumber');

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
            customer:    req.query.customer?.trim()    || null,
            dateFrom:    validDate(req.query.dateFrom, 'Ngày bắt đầu'),
            dateTo:      validDate(req.query.dateTo, 'Ngày kết thúc'),
            sort:        req.query.sort?.trim()         || null,
        };

        const result = await accountantOrderService.getOrders(filters, page, limit);
        res.json(result);
    } catch (err) {
        sendError(res, err);
    }
};

// GET /accountant/orders/export — báo cáo chi tiết từng chuyến khớp bộ lọc hiện tại của
// màn Quản lý doanh thu (cùng filter với getOrders), kèm chi phí + trạng thái thanh toán.
const exportOrdersReport = async (req, res) => {
    try {
        const filters = {
            search:      req.query.search?.trim()      || null,
            debt_status: req.query.debt_status?.trim() || null,
            customer:    req.query.customer?.trim()    || null,
            dateFrom:    validDate(req.query.dateFrom, 'Ngày bắt đầu'),
            dateTo:      validDate(req.query.dateTo, 'Ngày kết thúc'),
        };
        const rows = await accountantOrderService.exportOrdersReport(filters);
        res.json({ rows });
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

const getPartners = async (_req, res) => {
    try {
        const partners = await accountantOrderService.listPartners();
        res.json({ partners });
    } catch (err) {
        sendError(res, err);
    }
};

// Gợi ý "khách cũ" theo phần đầu SĐT (gõ nửa chừng) ở màn Nhập đơn ngoài.
const findCustomerByPhone = async (req, res) => {
    try {
        const phone = req.query.phone?.trim();
        if (!phone) return res.json({ customers: [] });
        const customers = await accountantOrderService.searchCustomersByPhone(phone);
        res.json({ customers });
    } catch (err) {
        sendError(res, err);
    }
};

// Validate 1 payload đơn ngoài (dùng chung cho tạo tay + import Excel)
// requireName = false chỉ dùng cho import: dòng Excel được phép chỉ có SĐT mà không có
// tên (và ngược lại) — đủ một trong hai là định danh được khách.
const validateOrderBody = (body, { requirePhone = true, requireName = true } = {}) => {
    const {
        customer_name, customer_phone, customer_company,
        customer_id, order_date, notes, prepaid_amount,
        partner_id, partner_name,
        shipments,
    } = body;

    if (!customer_id) {
        if (requireName && !customer_name?.trim())
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
            const deliveries = (Array.isArray(s.delivery_addresses) ? s.delivery_addresses : [s.delivery_address])
                .filter((d) => String(d || '').trim());
            if (deliveries.length === 0)
                throw err400(`${idx}: cần ít nhất 1 điểm giao hàng.`);

            if (s.vehicle_group_id != null) posInt(s.vehicle_group_id, `${idx}: Nhóm xe`);
            if (s.vehicle_id != null)       posInt(s.vehicle_id,       `${idx}: Xe`);
            if (s.driver_id != null)        posInt(s.driver_id,        `${idx}: Tài xế`);

            nonNegAmount(s.cargo_fee   ?? 0, `${idx}: Cước xe`);
            if (s.settled_fee != null) nonNegAmount(s.settled_fee, `${idx}: Giá chốt`);
            nonNegAmount(s.ticket_fee  ?? 0, `${idx}: Vé/phí`);
            nonNegNumber(s.cargo_weight ?? 0, `${idx}: Khối lượng hàng`);

            enumVal(s.payment_type, PAYMENT_TYPES, `${idx}: Hình thức thanh toán`);

            const driverState = s.driver_payment_state ?? 'company_received';
            enumVal(driverState, CREATE_DRIVER_STATES, `${idx}: Trạng thái tài xế`);

            if (s.payment_type === 'client_credit' && ['driver_holding', 'driver_paid'].includes(driverState))
                throw err400(`${idx}: Ghi nợ khách không thể kết hợp với trạng thái tài xế giữ/nộp tiền.`);

            if (s.driver_holding_amount != null) nonNegAmount(s.driver_holding_amount, `${idx}: Tiền tài đang giữ`);
            if (s.distance_km != null)           nonNegNumber(s.distance_km,           `${idx}: Quãng đường`);
            // Thu hộ (COD): tiền của khách công ty đang giữ — không phải doanh thu, không
            // cấn vào công nợ cước; ở đây chỉ chặn số âm như mọi cột tiền khác.
            if (s.collect_on_behalf != null)     nonNegAmount(s.collect_on_behalf,     `${idx}: Thu hộ`);

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
            for (const addr of deliveries) {
                if (String(addr || '').length > 500)
                    throw err400(`${idx}: Địa chỉ giao hàng không quá 500 ký tự.`);
            }
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
        prepaid_amount:   nonNegAmount(prepaid_amount, 'Số tiền khách ứng trước'),
        partner_id:       partner_id ? Number(partner_id) : null,
        partner_name:     partner_name?.trim() || null,
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
        const { autoResolvedDrivers, ...order } = newOrder;

        res.status(201).json({
            message: 'Tạo đơn hàng thành công.',
            order,
            new_drivers: (autoResolvedDrivers || []).map((d) => ({ driver_name: d.driverName, driver_id: d.driverId })),
        });
    } catch (err) {
        sendError(res, err);
    }
};

/**
 * Chuẩn hoá một dòng Excel về payload chuẩn, dùng CHUNG cho xem trước và import thật.
 *
 * Bắt buộc dùng chung: vân tay chống trùng được tính TRÊN payload đã chuẩn hoá. Nếu xem
 * trước tính trên dữ liệu thô còn import tính trên dữ liệu đã chuẩn hoá thì hai vân tay
 * khác nhau — màn xem trước sẽ báo "dòng mới" rồi import lại bỏ qua vì trùng, hoặc
 * ngược lại. Sai kiểu đó rất khó lần ra vì trông như hệ thống lúc nhớ lúc quên.
 */
const normalizeImportOrder = (order) => {
    // Phải đọc tên GỐC trước khi gán mặc định "Khách lẻ", nếu không thì kiểm tra
    // "có tên hay không" bên dưới lúc nào cũng đúng.
    const hasName = Boolean(order.customer_name?.trim());
    const hasPhone = Boolean(order.customer_phone?.trim());
    const out = { ...order };

    // Chỉ gán nhãn "Khách lẻ" khi KHÔNG có cả tên lẫn SĐT. Có SĐT mà gán "Khách lẻ" thì
    // hồ sơ trông như khách vãng lai trong khi thực ra định danh được.
    if (!out.customer_id && !hasName && !hasPhone) out.customer_name = 'Khách lẻ';
    // customers.phone NOT NULL — khách không SĐT gom chung 1 hồ sơ phone rỗng
    if (!out.customer_id && !hasPhone) out.customer_phone = '';

    return { order: out, hasName, hasPhone };
};

// POST /accountant/orders/import/preview — mỗi dòng sẽ khớp khách nào, tạo khách mới,
// trùng tên, và ĐÃ TỪNG IMPORT hay chưa. Chỉ ĐỌC, không tạo gì.
const previewImport = async (req, res) => {
    try {
        const { orders } = req.body;
        if (!Array.isArray(orders)) throw err400('Thiếu danh sách dòng cần đối chiếu.');
        if (orders.length > 1000) throw err400('Tối đa 1000 dòng mỗi lần.');

        const prepared = orders.map((raw) => {
            const { order } = normalizeImportOrder(raw);
            let fingerprint = null;
            try {
                // Dòng sai định dạng thì bỏ qua phần vân tay — trình đọc file đã chặn
                // trước rồi, ở đây chỉ cần không làm hỏng cả lượt xem trước.
                fingerprint = buildImportFingerprint(validateOrderBody(order, { requirePhone: false, requireName: false }));
            } catch { /* để null */ }
            return {
                row_index: raw.row_index ?? null,
                name: order.customer_name,
                phone: order.customer_phone,
                company_name: order.customer_company,
                fingerprint,
            };
        });

        const results = await accountantOrderService.previewImport(prepared);
        res.json({ results });
    } catch (err) {
        sendError(res, err);
    }
};

// POST /accountant/orders/import — import hàng loạt từ template Excel
// Body: {
//   orders: [payload như createOrder, kèm row_index để báo lỗi theo dòng],
//   allow_duplicates?: boolean   — bỏ qua kiểm tra trùng (kế toán xác nhận cố ý nhập lại)
// }
const importOrders = async (req, res) => {
    try {
        const { orders, allow_duplicates: allowDuplicates } = req.body;
        if (!Array.isArray(orders) || orders.length === 0)
            throw err400('Không có đơn nào để import.');
        if (orders.length > 1000)
            throw err400('Tối đa 1000 dòng mỗi lần import.');

        const imported = [];
        const errors = [];
        const duplicates = [];
        const newDrivers = [];
        // Hoãn việc tính KPI tới cuối lượt rồi gộp theo (tài xế, tháng): mỗi lần tính là
        // một lần quét lại TOÀN BỘ chuyến của tài trong cả tháng, nên chạy từng dòng một
        // là mẻ import lớn đụng trần thời gian trước khi cộng xong doanh thu.
        const kpiTriggers = [];

        for (const order of orders) {
            const rowLabel = order.row_index != null
                ? `Dòng ${order.row_index}`
                : `Đơn thứ ${imported.length + errors.length + duplicates.length + 1}`;
            try {
                const { order: chuan, hasName, hasPhone } = normalizeImportOrder(order);

                // Khách nợ chỉ cần MỘT trong hai (tên hoặc SĐT) để định danh — không có
                // cả hai thì không biết ghi nợ cho ai. Khớp khách theo SĐT trước, không
                // có SĐT thì theo tên (xem findCustomerByIdentity).
                const hasClientCredit = (order.shipments || []).some((s) => s.payment_type === 'client_credit');
                if (hasClientCredit && !order.customer_id && !hasName && !hasPhone) {
                    throw err400('Chuyến "Khách nợ" phải có tên khách hoặc SĐT để theo dõi công nợ.');
                }

                const payload = validateOrderBody(chuan, { requirePhone: false, requireName: false });
                const created = await accountantOrderService.createOrder({
                    ...payload,
                    // Vân tay tính SAU khi chuẩn hoá payload để cùng một dòng luôn ra cùng
                    // kết quả. allow_duplicates → để NULL, tức kế toán chấp nhận nhập trùng.
                    import_fingerprint: allowDuplicates ? null : buildImportFingerprint(payload),
                    created_by: req.user.userId,
                    suppress_notifications: true,
                }, { collectKpiInto: kpiTriggers });
                imported.push({ row_index: order.row_index ?? null, order_id: created.id });
                (created.autoResolvedDrivers || []).forEach((d) => {
                    newDrivers.push({ row_index: order.row_index ?? null, driver_name: d.driverName, driver_id: d.driverId });
                });
            } catch (err) {
                if (err.isDuplicateImport) {
                    duplicates.push({ row_index: order.row_index ?? null, error: `${rowLabel}: ${err.message}` });
                } else {
                    errors.push({ row_index: order.row_index ?? null, error: `${rowLabel}: ${err.message}` });
                }
            }
        }

        // Chốt KPI cho cả mẻ. Phải chạy TRƯỚC khi trả response: bỏ lại chạy nền là giao
        // cho một instance Cloud Run sắp bị bóp CPU, doanh thu sẽ không tới bảng lương.
        await accountantOrderService.flushKpiRecalc(kpiTriggers);

        accountantOrderService.notifyImportSummary({
            count: imported.length,
            actorId: req.user.userId,
        });

        const parts = [`${imported.length} đơn thành công`];
        if (duplicates.length) parts.push(`${duplicates.length} dòng đã import trước đó (bỏ qua)`);
        if (errors.length)     parts.push(`${errors.length} dòng lỗi`);

        // Chỉ coi là thất bại khi có lỗi THẬT mà không dòng nào vào được. Cả file toàn
        // dòng trùng không phải lỗi — nghĩa là dữ liệu đã nằm sẵn trong hệ thống rồi.
        const failed = errors.length > 0 && imported.length === 0;

        res.status(failed ? 400 : 201).json({
            message: `Import xong: ${parts.join(', ')}.`,
            imported_count: imported.length,
            error_count: errors.length,
            duplicate_count: duplicates.length,
            imported,
            errors,
            duplicates,
            new_drivers: newDrivers,
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
            updated_by:       req.user.userId,
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
            ? `Đã phân bổ ${money(Math.round(result.totalAllocated))} vào ${result.allocations.length} đơn hàng.`
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
    previewImport,
    getPayments,
    getCustomerDebt,
    createPayment,
    confirmDriverPayment,
    updateOrder,
    exportOrdersReport,
    findCustomerByPhone,
    getPartners,
};
