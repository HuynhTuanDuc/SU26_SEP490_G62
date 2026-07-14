const { getReportOverview } = require('../repositories/accountantReportRepository');
const { sendError, err400 } = require('../utils/accountantValidate');

const getOverview = async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 6;
        if (isNaN(months) || months < 1 || months > 24)
            throw err400('Số tháng thống kê không hợp lệ (1–24).');

        const granularity = req.query.granularity || 'month';
        if (!['day', 'week', 'month'].includes(granularity))
            throw err400('Mức thời gian không hợp lệ (day/week/month).');

        const data = await getReportOverview({ months, granularity });
        res.json(data);
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = { getOverview };
