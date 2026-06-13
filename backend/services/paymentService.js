const paymentRepository = require('../repositories/paymentRepository');
const tripRepository    = require('../repositories/tripRepository');

const PAYMENT_ALLOWED_STATUSES = ['arrived', 'transit', 'completed'];

const fmtVND = (n) => Number(n).toLocaleString('vi-VN') + 'đ';

// TH2: Khách thanh toán tiền mặt cho Driver → ghi nhận shipment_receipts + tạo driver debt ngay (§15, BR-018)
const recordDriverCashPayment = async (driverId, shipmentId, { amount, notes }, receiptUrl) => {
    if (!receiptUrl) throw new Error('Ảnh biên lai thanh toán là bắt buộc (BR-018)');

    const amt = Number(amount);
    if (!amt || amt <= 0) throw new Error('Số tiền phải lớn hơn 0');

    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');
    if (Number(shipment.owner_driver_id) !== Number(driverId)) {
        throw new Error('Bạn không có quyền ghi nhận thanh toán cho chuyến này');
    }
    if (!PAYMENT_ALLOWED_STATUSES.includes(shipment.status)) {
        throw new Error('Chỉ có thể ghi nhận thanh toán khi chuyến đang thực hiện hoặc đã giao');
    }

    const summary = await paymentRepository.getShipmentFinancialSummary(shipmentId);
    if (!summary) throw new Error('Không thể lấy thông tin tài chính chuyến');

    if (summary.order_payment_type === 'bank_transfer') {
        throw new Error(
            'Đơn hàng này khách thanh toán chuyển khoản trực tiếp cho công ty — driver không thu tiền mặt. ' +
            'Nếu có ngoại lệ, liên hệ điều phối viên.'
        );
    }

    if (summary.remaining !== null && amt > summary.remaining) {
        const msg = summary.remaining <= 0
            ? `Chuyến này đã được ghi nhận đủ số tiền (${fmtVND(summary.trip_value)}). Không thể ghi thêm.`
            : `Số tiền ${fmtVND(amt)} vượt quá phần còn lại ${fmtVND(summary.remaining)} ` +
              `(giá trị chuyến ${fmtVND(summary.trip_value)}, đã thu ${fmtVND(summary.cash_collected)}, đã báo nợ ${fmtVND(summary.customer_debt_total)}).`;
        throw new Error(msg);
    }

    const { payment } = await paymentRepository.recordCashPayment({
        shipmentId,
        amount: amt,
        collectedBy: driverId,
        notes: notes?.trim() ?? null,
    });

    await paymentRepository.addPaymentReceipt(payment.id, receiptUrl);

    // Driver cầm tiền mặt → tạo driver debt ngay để theo dõi
    await paymentRepository.createDriverDebt({
        driverId,
        shipmentId,
        orderId: shipment.order_id,
        amount: amt,
        notes: notes?.trim() ?? null,
    });

    return { payment };
};

// GET payments + summary cho driver xem trạng thái tài chính chuyến
const getShipmentPayments = async (shipmentId, driverId) => {
    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');
    if (Number(shipment.owner_driver_id) !== Number(driverId)) {
        throw new Error('Bạn không có quyền xem thanh toán của chuyến này');
    }
    return paymentRepository.getShipmentPayments(shipmentId);
};

// GET financial summary — dùng cho mobile hiển thị trạng thái thanh toán
const getShipmentPaymentSummary = async (shipmentId, driverId) => {
    const shipment = await tripRepository.getTripById(shipmentId);
    if (!shipment) throw new Error('Chuyến không tồn tại');
    if (Number(shipment.owner_driver_id) !== Number(driverId)) {
        throw new Error('Bạn không có quyền xem thông tin tài chính chuyến này');
    }
    return paymentRepository.getShipmentFinancialSummary(shipmentId);
};

// Sửa ghi nhận tiền mặt — driver chỉ sửa được payment do chính mình tạo
const updateCashPayment = async (driverId, shipmentId, paymentId, { newAmount, newReceiptUrl }) => {
    const payment = await paymentRepository.getPaymentById(paymentId);
    if (!payment) throw new Error('Bản ghi thanh toán không tồn tại');
    if (Number(payment.shipment_id) !== Number(shipmentId)) throw new Error('Thanh toán không thuộc chuyến này');
    if (Number(payment.collected_by) !== Number(driverId)) throw new Error('Bạn không có quyền sửa ghi nhận này');

    const amt = Number(newAmount);
    if (!amt || amt <= 0) throw new Error('Số tiền phải lớn hơn 0');

    await paymentRepository.updateShipmentPayment(paymentId, amt);
    if (newReceiptUrl) {
        await paymentRepository.replacePaymentReceipts(paymentId, newReceiptUrl);
    }

    return { payment: await paymentRepository.getPaymentById(paymentId) };
};

module.exports = { recordDriverCashPayment, getShipmentPayments, getShipmentPaymentSummary, updateCashPayment };
