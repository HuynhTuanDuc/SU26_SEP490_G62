/**
 * Thu hộ (COD) — tiền HÀNG công ty thu giúp người bán khi giao, và phải trả lại.
 *
 * Đây là khoản công ty NỢ người bán, ngược chiều hoàn toàn với công nợ cước (khách nợ công
 * ty). Trên sổ nó là số dư Có của tài khoản 3388, mở ra bởi bút toán `collect_on_behalf_held`
 * và đóng lại bởi `collect_on_behalf_returned`.
 *
 * Module này lo nửa sau: cho kế toán nhìn thấy công ty đang nợ ai bao nhiêu, và lập phiếu
 * chi để trả. Việc trả tiền đi qua PHIẾU CHI như mọi đồng tiền ra khỏi quỹ — có người chi,
 * có chứng từ, có dấu vết — chứ không ghi thẳng vào sổ.
 */
const financialLedgerRepository = require('../repositories/financialLedgerRepository');
const paymentVoucherRepository = require('../repositories/paymentVoucherRepository');
const { notifyRolesSafe } = require('./roleNotificationService');
const { money } = require('../utils/formatNumber');
const { requireMoney } = require('../utils/money');
const pool = require('../config/database');

const VOUCHER_TYPE = 'collect_on_behalf_return';

const err400 = (msg) => Object.assign(new Error(msg), { status: 400, statusCode: 400 });
const err404 = (msg) => Object.assign(new Error(msg), { status: 404, statusCode: 404 });

/** Danh sách đơn công ty còn đang giữ tiền thu hộ, kèm tổng. */
const listOutstanding = ({ search } = {}) =>
    financialLedgerRepository.listCollectOnBehalfOutstanding({
        search: search?.trim() || null,
    });

/**
 * Số còn được phép lập phiếu chi cho một đơn.
 *
 * Trừ đi phần đã có phiếu đang chạy (pending/approved) chứ không chỉ nhìn số dư 3388: sổ
 * chỉ giảm khi tiền RA THẬT, nên giữa lúc lập phiếu và lúc chi, số dư vẫn nguyên. Không trừ
 * thì kế toán mở màn hình lần hai sẽ thấy y nguyên số cũ và lập phiếu chi lần hai cho cùng
 * một khoản — tiền ra khỏi quỹ hai lần.
 */
const getReturnableAmount = async (executor, orderId) => {
    const conGiu = await financialLedgerRepository.getCollectOnBehalfOutstanding(executor, orderId);
    const { rows: [v] } = await executor.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS dang_cho
         FROM payment_vouchers
         WHERE order_id = $1 AND voucher_type = $2 AND status IN ('pending', 'approved')`,
        [orderId, VOUCHER_TYPE],
    );
    const dangCho = Number(v.dang_cho || 0);
    return { conGiu, dangCho, coTheTra: Math.max(0, Math.round((conGiu - dangCho) * 100) / 100) };
};

const getOrderDetail = async (orderId) => {
    const { rows: [ord] } = await pool.query(
        `SELECT o.id, o.cargo_name,
                COALESCE(c.company_name, c.full_name) AS nguoi_ban,
                c.phone AS nguoi_ban_phone
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         WHERE o.id = $1`,
        [orderId],
    );
    if (!ord) throw err404('Không tìm thấy đơn hàng');

    const { conGiu, dangCho, coTheTra } = await getReturnableAmount(pool, orderId);
    return { ...ord, con_giu: conGiu, dang_cho_chi: dangCho, co_the_tra: coTheTra };
};

/**
 * Lập phiếu chi trả tiền thu hộ cho người bán.
 *
 * Phiếu tạo ra ở trạng thái 'approved' — cùng cách làm với phiếu hoàn tiền ứng trước
 * (prepaid_refund). Lý do: nghĩa vụ này KHÔNG phải quyết định chi tiêu để mà xét duyệt, nó
 * đã được sổ xác lập từ lúc công ty cầm tiền của người ta. Bắt Manager duyệt lại chỉ làm
 * chậm việc trả tiền cho người đang bị giữ tiền, mà không thêm thông tin gì để quyết.
 * Bước "Đã chi" của kế toán vẫn giữ nguyên: có chứng từ, có người chịu trách nhiệm.
 */
const createReturnVoucher = async (orderId, { amount, payee, notes, paymentMethod } = {}, actorId) => {
    const id = Number(orderId);
    if (!Number.isInteger(id) || id <= 0) throw err400('Mã đơn hàng không hợp lệ');

    const ord = await getOrderDetail(id);
    if (ord.co_the_tra <= 0) {
        throw err400(
            ord.con_giu > 0
                ? `Đơn #${id} đã có phiếu chi ${money(ord.dang_cho_chi)} đang chờ chi — không lập thêm.`
                : `Đơn #${id} không còn khoản thu hộ nào phải trả.`,
        );
    }

    // Bỏ trống = trả hết. Đây là thao tác thường gặp nhất nên không bắt gõ lại con số.
    const soTien = (amount === undefined || amount === null || String(amount).trim() === '')
        ? ord.co_the_tra
        : requireMoney(amount, { field: 'Số tiền trả người bán' });

    if (soTien > ord.co_the_tra) {
        throw err400(
            `Số tiền trả (${money(soTien)}) vượt quá khoản đang giữ của đơn #${id} `
            + `(${money(ord.co_the_tra)}) — trả quá là công ty tự bỏ tiền túi.`,
        );
    }

    const nguoiNhan = payee?.trim() || ord.nguoi_ban?.trim() || 'Người bán';
    const lyDo = notes?.trim()
        || `Trả tiền thu hộ (COD) đơn #${id}${ord.cargo_name ? ` — ${ord.cargo_name}` : ''}`;

    const voucher = await paymentVoucherRepository.create({
        voucher_type: VOUCHER_TYPE,
        amount: soTien,
        payee: nguoiNhan,
        reason: lyDo,
        payment_method: paymentMethod === 'cash' ? 'cash' : 'bank_transfer',
        order_id: id,
        status: 'approved',
    }, actorId, null);

    notifyRolesSafe(['accountant'], {
        title: 'Phiếu trả tiền thu hộ chờ chi',
        message: `Đơn #${id} — trả ${money(soTien)} tiền thu hộ cho "${nguoiNhan}". `
            + `Phiếu chi #${voucher.id} đã duyệt sẵn, chờ chi tiền.`,
        type: 'VOUCHER_CREATED',
        entityType: 'payment_vouchers',
        entityId: voucher.id,
    }, { excludeUserId: actorId, displayMode: 'toast' });

    return { voucher, conGiu: ord.con_giu, daLapPhieu: ord.dang_cho_chi + soTien };
};

module.exports = {
    VOUCHER_TYPE,
    listOutstanding,
    getOrderDetail,
    getReturnableAmount,
    createReturnVoucher,
};
