const paymentVoucherRepository = require('../repositories/paymentVoucherRepository');
const reversalService = require('./reversalService');
const expenseRepository = require('../repositories/expenseRepository');
const financialLedgerRepository = require('../repositories/financialLedgerRepository');
const notificationService = require('./notificationService');
const notificationGateway = require('./notificationGateway');
const { notifyRolesSafe } = require('./roleNotificationService');
const { money } = require('../utils/formatNumber');
const { requireMoney } = require('../utils/money');

// ─── Phiếu chi thủ công ───────────────────────────────────────────────────────
// Quy trình 2 cấp: Accountant tạo → Manager duyệt → Accountant xác nhận đã chi
// (ghi sổ tài chính khi chi, không phải khi duyệt).

// `client` tùy chọn — xem ghi chú ở paymentVoucherRepository.create.
const createVoucher = async (data, createdBy, client = null) => {
    const { voucher_type, amount, payee, reason, payment_method, proof_url, incident_id } = data;

    if (!paymentVoucherRepository.VOUCHER_TYPES.includes(voucher_type)) {
        throw new Error('Loại phiếu chi không hợp lệ');
    }
    // requireMoney thay cho `Number(amount)`: phép cũ nhận "500.000" thành 500 —
    // kế toán lập phiếu chi năm trăm nghìn, quỹ ghi ra năm trăm đồng, không ai thấy sai.
    const soTien = requireMoney(amount, { field: 'Số tiền' });
    if (!payee || !String(payee).trim()) throw new Error('Cần ghi rõ người/đơn vị nhận tiền');
    if (!reason || !String(reason).trim()) throw new Error('Cần ghi rõ lý do chi');
    if (payment_method && !paymentVoucherRepository.PAYMENT_METHODS.includes(payment_method)) {
        throw new Error('Hình thức thanh toán không hợp lệ');
    }

    const voucher = await paymentVoucherRepository.create({
        voucher_type,
        amount: soTien,
        payee: String(payee).trim(),
        reason: String(reason).trim(),
        payment_method: payment_method || 'cash',
        proof_url: proof_url ?? null,
        incident_id: incident_id ?? null,
    }, createdBy, client);

    notifyRolesSafe(['manager'], {
        title: 'Có phiếu chi cần duyệt',
        message: `Phiếu chi #${voucher.id} trị giá ${money(Number(voucher.amount))} cho "${voucher.payee}" đang chờ duyệt.`,
        type: 'VOUCHER_CREATED',
        entityType: voucher.incident_id ? 'incidents' : 'payment_vouchers',
        entityId: voucher.incident_id ?? voucher.id,
    }, { excludeUserId: createdBy, displayMode: 'alert' });

    return voucher;
};

// ─── Hoàn ứng tài xế ──────────────────────────────────────────────────────────
// Tài xế ứng tiền túi (chi hộ khách, xăng, sửa xe, bảo dưỡng) mà muốn nhận lại ngay,
// không đợi kỳ lương. Đi qua đúng luồng phiếu chi 2 cấp như mọi khoản tiền ra khỏi quỹ.

const listPendingReimbursements = () => paymentVoucherRepository.listPendingReimbursements();

const EXPENSE_LABEL = {
    toll: 'phí cầu đường', parking: 'phí đỗ xe', etc: 'phí ETC',
    fuel: 'xăng dầu', repair: 'sửa xe', maintenance: 'bảo dưỡng xe',
};

// Ném lỗi kèm mã HTTP: sendError của controller chỉ đoán mã theo từ khoá trong câu chữ,
// câu nào không khớp từ khoá nào sẽ rơi về 500 — lỗi nghiệp vụ bình thường mà báo "lỗi máy chủ".
const businessError = (message, statusCode) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
};

// Số tiền hoàn LẤY TỪ DB, không nhận từ client: cho client gửi lên là mở đường chi khác
// số đã duyệt trên chứng từ.
const createReimbursementVoucher = async ({ expense_id, payment_method, notes }, createdBy) => {
    const expenseId = Number(expense_id);
    if (!expenseId) throw businessError('Thiếu khoản chi phí cần hoàn', 400);
    if (payment_method && !paymentVoucherRepository.PAYMENT_METHODS.includes(payment_method)) {
        throw businessError('Hình thức thanh toán không hợp lệ', 400);
    }

    const target = await paymentVoucherRepository.getPendingReimbursement(expenseId);
    if (!target) {
        throw businessError(
            'Khoản này không còn chờ hoàn (đã có phiếu hoàn ứng, đã cấn trừ nợ, đã hoàn qua lương, '
            + 'hoặc người ứng không phải tài xế)',
            409,
        );
    }

    const label = EXPENSE_LABEL[target.expense_type] ?? target.expense_type;
    const reason = `Hoàn tiền tài xế đã ứng — ${label}`
        + (target.plate_number ? ` (xe ${target.plate_number})` : '')
        + (target.order_id ? `, đơn #${target.order_id}` : '')
        + (notes ? `. ${String(notes).trim()}` : '');

    // Kiểm tra ở trên chạy ngoài transaction nên vẫn là check-then-act: hai kế toán bấm cùng
    // lúc (hoặc double-click) thì cả hai đều đọc thấy "còn chờ hoàn". Unique index của DB là
    // chốt chặn thật — bắt lấy 23505 và trả về đúng lỗi nghiệp vụ, đừng để lộ lỗi pg thô
    // thành 500 làm kế toán tưởng hệ thống hỏng.
    let voucher;
    try {
        voucher = await paymentVoucherRepository.create({
            voucher_type: 'driver_reimbursement',
            amount: Number(target.amount),
            payee: target.driver_name || `Tài xế #${target.driver_id}`,
            reason,
            payment_method: payment_method || 'cash',
            expense_id: expenseId,
        }, createdBy);
    } catch (err) {
        if (err.code === '23505') {
            throw businessError('Khoản này vừa được người khác lập phiếu hoàn ứng rồi', 409);
        }
        throw err;
    }

    notifyRolesSafe(['manager'], {
        title: 'Có phiếu hoàn ứng tài xế cần duyệt',
        message: `Phiếu chi #${voucher.id} hoàn ${money(Number(voucher.amount))} `
            + `cho ${voucher.payee} (${label}) đang chờ duyệt.`,
        type: 'VOUCHER_CREATED',
        entityType: 'payment_vouchers',
        entityId: voucher.id,
    }, { excludeUserId: createdBy, displayMode: 'alert' });

    return voucher;
};

const listVouchers = (filters) => paymentVoucherRepository.list(filters);
const getVoucherStats = (filters) => paymentVoucherRepository.getStats(filters);

// Manager duyệt khoản đền bù → repository đã tự chuyển sự cố sang 'resolved'.
// Ở đây chỉ lo báo cho coordinator và đẩy realtime để danh sách sự cố cập nhật theo.
const approveVoucher = async (id, approvedBy) => {
    const voucher = await paymentVoucherRepository.approve(id, approvedBy);

    if (!voucher.incident_id) {
        notificationService.createForUser(voucher.created_by, {
            title: `Phiếu chi #${voucher.id} đã được duyệt`,
            message: `Số tiền ${money(Number(voucher.amount))} chi cho "${voucher.payee}" đã được duyệt, chờ Kế toán chi tiền.`,
            type: 'VOUCHER_APPROVED',
            entityType: 'payment_vouchers',
            entityId: voucher.id,
        }, { displayMode: 'toast' }).catch((err) => {
            console.error(`[Spending] Không gửi được thông báo duyệt phiếu chi #${id}:`, err.message);
        });
    }

    if (voucher.incident_id) {
        notificationService.createForUser(voucher.created_by, {
            title: `Khoản đền bù sự cố #${voucher.incident_id} đã được duyệt`,
            message: `Số tiền ${money(Number(voucher.amount))} chi cho "${voucher.payee}" đã được duyệt. Sự cố chuyển sang trạng thái đã giải quyết, chờ Kế toán chi tiền.`,
            type: 'VOUCHER_APPROVED',
            entityType: 'incidents',
            entityId: voucher.incident_id,
        }, { displayMode: 'toast' }).catch((err) => {
            console.error(`[Spending] Không gửi được thông báo duyệt phiếu chi #${id}:`, err.message);
        });

        notificationGateway.broadcastToRole('coordinator', {
            type: 'coordinator.incidents.changed',
            action: 'compensation_approved',
            incidentId: voucher.incident_id,
        });
    }

    return voucher;
};

// Manager từ chối phiếu chi → báo ngược cho người tạo phiếu kèm lý do, để họ sửa và gửi lại.
// Không có bước này thì phiếu bị từ chối là ngõ cụt: người tạo không hề biết.
const rejectVoucher = async (id, rejectedBy, reason) => {
    if (!reason || !String(reason).trim()) throw new Error('Cần ghi rõ lý do từ chối');
    const trimmedReason = String(reason).trim();
    const voucher = await paymentVoucherRepository.reject(id, rejectedBy, trimmedReason);

    // Phiếu đền bù trỏ thẳng về sự cố để bấm vào là mở đúng chỗ cần sửa;
    // phiếu chi thường thì trỏ về danh sách phiếu chi.
    const isCompensation = Boolean(voucher.incident_id);
    notificationService.createForUser(voucher.created_by, {
        title: isCompensation
            ? `Khoản đền bù sự cố #${voucher.incident_id} bị từ chối`
            : `Phiếu chi #${voucher.id} bị từ chối`,
        message: `Số tiền ${money(Number(voucher.amount))} chi cho "${voucher.payee}" không được duyệt. Lý do: ${trimmedReason}`,
        type: 'VOUCHER_REJECTED',
        entityType: isCompensation ? 'incidents' : 'payment_vouchers',
        entityId: isCompensation ? voucher.incident_id : voucher.id,
    }, { displayMode: 'alert' }).catch((err) => {
        console.error(`[Spending] Không gửi được thông báo từ chối phiếu chi #${id}:`, err.message);
    });

    if (isCompensation) {
        notificationGateway.broadcastToRole('coordinator', {
            type: 'coordinator.incidents.changed',
            action: 'compensation_rejected',
            incidentId: voucher.incident_id,
        });
    }

    return voucher;
};

// Kế toán huỷ phiếu đã duyệt nhưng chưa chi — không cần Manager duyệt lại vì chưa có
// đồng nào rời khỏi công ty và chưa phát sinh bút toán. Đổi lại, phiếu được giữ nguyên
// kèm người huỷ + lý do, và Manager đã duyệt được báo để biết quyết định của mình bị đảo.
const cancelVoucher = async (id, cancelledBy, reason) => {
    if (!reason || !String(reason).trim()) throw new Error('Cần ghi rõ lý do huỷ phiếu chi');
    const trimmedReason = String(reason).trim();
    const voucher = await paymentVoucherRepository.cancel(id, cancelledBy, trimmedReason);

    reversalService.recordReversal({
        kind: 'voucher.approve',
        entityId: voucher.id,
        actorId: cancelledBy,
        reason: trimmedReason,
        oldData: { status: 'approved', amount: voucher.amount, payee: voucher.payee },
        newData: { status: 'cancelled' },
    });

    const isCompensation = Boolean(voucher.incident_id);
    const amountText = Number(voucher.amount).toLocaleString('vi-VN');
    const payload = {
        title: isCompensation
            ? `Khoản đền bù sự cố #${voucher.incident_id} đã bị huỷ`
            : `Phiếu chi #${voucher.id} đã bị huỷ`,
        message: `Kế toán đã huỷ khoản chi ${amountText}đ cho "${voucher.payee}" trước khi chi tiền. Lý do: ${trimmedReason}`,
        type: 'VOUCHER_CANCELLED',
        entityType: isCompensation ? 'incidents' : 'payment_vouchers',
        entityId: isCompensation ? voucher.incident_id : voucher.id,
    };

    // Người tạo phiếu cần biết để làm lại; Manager đã duyệt cần biết vì quyết định
    // duyệt của họ vừa bị đảo — bỏ qua nếu trùng người để không gửi hai lần.
    const recipients = [voucher.created_by, voucher.approved_by].filter(Boolean);
    notificationService.createForUsers(recipients, payload, { displayMode: 'alert' })
        .catch((err) => {
            console.error(`[Spending] Không gửi được thông báo huỷ phiếu chi #${id}:`, err.message);
        });

    if (isCompensation) {
        notificationGateway.broadcastToRole('coordinator', {
            type: 'coordinator.incidents.changed',
            action: 'compensation_cancelled',
            incidentId: voucher.incident_id,
        });
    }

    return voucher;
};

const payVoucher = async (id, paidBy, { proofUrl = null, paymentMethod = null } = {}) => {
    const voucher = await paymentVoucherRepository.markPaid(id, paidBy, { proofUrl, paymentMethod });
    const isCompensation = Boolean(voucher.incident_id);
    const payload = {
        title: isCompensation
            ? `Khoản đền bù sự cố #${voucher.incident_id} đã được chi`
            : `Phiếu chi #${voucher.id} đã được chi`,
        message: `Kế toán đã chi ${money(Number(voucher.amount))} cho "${voucher.payee}".`,
        type: 'VOUCHER_PAID',
        entityType: isCompensation ? 'incidents' : 'payment_vouchers',
        entityId: isCompensation ? voucher.incident_id : voucher.id,
    };

    notificationService.createForUsers([voucher.created_by, voucher.approved_by].filter(Boolean), payload, {
        displayMode: 'toast',
    }).catch((err) => {
        console.error(`[Spending] Không gửi được thông báo chi tiền phiếu chi #${id}:`, err.message);
    });

    // Tài xế phải biết tiền mình ứng đã được hoàn — nếu không họ vẫn tưởng khoản đó còn
    // treo và sẽ chờ nó xuất hiện trong bảng lương cuối tháng.
    if (voucher.voucher_type === 'driver_reimbursement' && voucher.expense_driver_id) {
        notificationService.createForUser(voucher.expense_driver_id, {
            title: 'Đã hoàn tiền bạn ứng',
            message: `Công ty đã chi ${money(Number(voucher.amount))} hoàn lại khoản bạn ứng trước.`,
            type: 'VOUCHER_PAID',
            entityType: 'payment_vouchers',
            entityId: voucher.id,
        }, { displayMode: 'alert' }).catch(() => {});
    }

    if (isCompensation) {
        notificationGateway.broadcastToRole('coordinator', {
            type: 'coordinator.incidents.changed',
            action: 'compensation_paid',
            incidentId: voucher.incident_id,
        });
    }

    return voucher;
};

// ─── Chi phí tài xế (danh sách toàn hệ thống cho web) ─────────────────────────
const listExpenses = (filters) => expenseRepository.listAllExpenses(filters);
const getExpenseStats = (filters) => expenseRepository.getExpenseStats(filters);

// ─── Tổng hợp chi từ sổ tài chính ─────────────────────────────────────────────
const getSpendingSummary = ({ month, year }) => {
    const m = Number(month);
    const y = Number(year);
    if (!m || m < 1 || m > 12) throw new Error('Tháng không hợp lệ (1-12)');
    if (!y || y < 2020) throw new Error('Năm không hợp lệ');
    return financialLedgerRepository.getSpendingSummary({ month: m, year: y });
};

module.exports = {
    createVoucher,
    listPendingReimbursements,
    createReimbursementVoucher,
    listVouchers,
    getVoucherStats,
    approveVoucher,
    rejectVoucher,
    cancelVoucher,
    payVoucher,
    listExpenses,
    getExpenseStats,
    getSpendingSummary,
};
