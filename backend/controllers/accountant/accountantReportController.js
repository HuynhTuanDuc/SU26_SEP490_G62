const { getReportOverview } = require('../../repositories/accountant/accountantReportRepository');
const { sendError, err400 } = require('./_validate');

const getOverview = async (req, res) => {
    try {
        const months = parseInt(req.query.months) || 6;
        if (isNaN(months) || months < 1 || months > 24)
            throw err400('Số tháng thống kê không hợp lệ (1–24).');

        const data = await getReportOverview({ months });
        res.json(data);
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = { getOverview };
