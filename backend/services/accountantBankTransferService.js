const accountantBankTransferRepository = require('../repositories/accountantBankTransferRepository');
const notificationService = require('./notificationService');

const getPendingBankTransfers = async ({ page = 1, limit = 20, search = '' } = {}) => {
    const safePage  = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const offset = (safePage - 1) * safeLimit;
    const like   = `%${search}%`;

    const [receipts, total] = await Promise.all([
        accountantBankTransferRepository.getPendingBankTransfers({ limit: safeLimit, offset, like }),
        accountantBankTransferRepository.countPendingBankTransfers(like),
    ]);

    return {
        receipts,
        pagination: {
            total,
            page: safePage,
            limit: safeLimit,
            totalPages: Math.ceil(total / safeLimit),
        },
    };
};

const { money } = require('../utils/formatNumber');
const { requireMoney } = require('../utils/money');

const confirmBankTransfer = async (receiptId, accountantId, { notes, actual_amount }) => {
    if (!receiptId) throw new Error('Receipt ID không hợp lệ');
    // Đây là lỗ NaN cuối cùng còn sót: `Number("1.500.000") < 0` là FALSE (NaN so sánh
    // với gì cũng false), nên chuỗi hỏng lọt thẳng xuống cột NUMERIC thành 'NaN' —
    // từ đó mọi SUM() chạm tới phiếu thu này đều trả về NaN.
    // allowZero: kế toán ghi nhận "khách chưa chuyển đồng nào" là nghiệp vụ hợp lệ.
    const actualReceived = requireMoney(actual_amount, { field: 'Số tiền thực nhận', allowZero: true });

    const result = await accountantBankTransferRepository.confirmBankTransfer(
        receiptId, accountantId, { notes, actualReceived },
    );

    if (result.driverId) {
        let notiMsg = `Kế toán đã xác nhận nhận ${money(actualReceived)} chuyển khoản cho phiếu thu #${result.receiptId}.`;
        if (result.action === 'short') {
            notiMsg += ` Còn thiếu ${money(result.shortfall)} — đã ghi công nợ khách.`;
        } else if (result.action === 'excess') {
            notiMsg += ` Thừa ${money(result.excess)} — đã phân bổ vào nợ cũ.`;
        }
        notificationService.createForUser(result.driverId, {
            title: 'Chuyển khoản đã được xác nhận',
            message: notiMsg,
            type: 'BANK_TRANSFER_CONFIRMED',
            entityType: 'receipt',
            entityId: result.receiptId,
        }, { displayMode: 'alert' }).catch(() => {});
    }

    return result;
};

module.exports = { getPendingBankTransfers, confirmBankTransfer };
