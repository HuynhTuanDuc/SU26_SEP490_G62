const cron = require('node-cron');
const leaveService = require('../services/leaveService');
const debtService = require('../services/debtService');
const logger = require('../config/logger');


// Trạng thái nợ (unpaid/partial/paid/overdue) được tính động từ debt_payments
// và due_date trong debtRepository — bảng debts không có cột status.

const rejectExpiredLeaveRequests = async () => {
    try {
        const rowCount = await leaveService.rejectExpiredLeaveRequests();
        if (rowCount > 0) {
            logger.info(`[debtCron] Tự động reject ${rowCount} leave request hết hạn`);
        }
    } catch (err) {
        logger.error('[debtCron] Lỗi khi reject leave request', { message: err.message });
    }
};

const notifyOverdueDebts = async () => {
    try {
        const result = await debtService.notifyOverdueDebts();
        if (result.notified) {
            logger.info('[debtCron] Đã gửi nhắc nhở công nợ quá hạn cho manager/accountant');
        }
    } catch (err) {
        logger.error('[debtCron] Lỗi khi gửi nhắc nhở công nợ quá hạn', { message: err.message });
    }
};

const initCronJobs = () => {
    // 00:05 mỗi ngày
    cron.schedule('5 0 * * *', async () => {
        await rejectExpiredLeaveRequests();
    }, {
        timezone: 'Asia/Ho_Chi_Minh',
    });

    // 08:00 mỗi ngày — nhắc nhở đầu giờ làm việc
    cron.schedule('0 8 * * *', async () => {
        await notifyOverdueDebts();
    }, {
        timezone: 'Asia/Ho_Chi_Minh',
    });

    logger.info('[cron] Đã đăng ký job: leave cleanup (00:05) + nhắc công nợ quá hạn (08:00) GMT+7');
};

module.exports = { initCronJobs };
