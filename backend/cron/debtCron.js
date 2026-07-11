const cron = require('node-cron');
const pool = require('../config/database');


// Trạng thái nợ (unpaid/partial/paid/overdue) được tính động từ debt_payments
// và due_date trong debtRepository — bảng debts không có cột status.

const rejectExpiredLeaveRequests = async () => {
    try {
        const result = await pool.query(
            `UPDATE leave_requests
             SET status = 'rejected'
             WHERE status    = 'pending'
               AND leave_date < CURRENT_DATE
             RETURNING id`,
        );
        if (result.rowCount > 0) {
            console.info(`[debtCron] Tự động reject ${result.rowCount} leave request hết hạn`);
        }
    } catch (err) {
        console.error('[debtCron] Lỗi khi reject leave request:', err.message);
    }
};

const initCronJobs = () => {
    // 00:05 mỗi ngày
    cron.schedule('5 0 * * *', async () => {
        await rejectExpiredLeaveRequests();
    }, {
        timezone: 'Asia/Ho_Chi_Minh',
    });

    console.info('[cron] Đã đăng ký job: leave cleanup — chạy lúc 00:05 (GMT+7)');
};

module.exports = { initCronJobs };
