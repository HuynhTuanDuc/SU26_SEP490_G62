const accountantBankTransferRepository = require('../repositories/accountantBankTransferRepository');
const notificationService = require('./notificationService');

const getPendingBankTransfers = async ({ page = 1, limit = 20, search = '' } = {}) => {
    const offset = (Number(page) - 1) * Number(limit);
    const like   = `%${search}%`;

    const [receipts, total] = await Promise.all([
        accountantBankTransferRepository.getPendingBankTransfers({ limit: Number(limit), offset, like }),
        accountantBankTransferRepository.countPendingBankTransfers(like),
    ]);

    return {
        receipts,
        pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
        },
    };
};

const fmtVND = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';

const confirmBankTransfer = async (receiptId, accountantId, { notes, actual_amount }) => {
    if (!receiptId) throw new Error('Receipt ID không hợp lệ');
    if (actual_amount === undefined || actual_amount === null || Number(actual_amount) < 0) {
        throw new Error('Vui lòng nhập số tiền thực nhận (>= 0)');
    }
    const actualReceived = Number(actual_amount);

    const result = await accountantBankTransferRepository.confirmBankTransfer(
        receiptId, accountantId, { notes, actualReceived },
    );

    if (result.driverId) {
        let notiMsg = `Kế toán đã xác nhận nhận ${fmtVND(actualReceived)} chuyển khoản cho phiếu thu #${result.receiptId}.`;
        if (result.action === 'short') {
            notiMsg += ` Còn thiếu ${fmtVND(result.shortfall)} — đã ghi công nợ khách.`;
        } else if (result.action === 'excess') {
            notiMsg += ` Thừa ${fmtVND(result.excess)} — đã phân bổ vào nợ cũ.`;
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
