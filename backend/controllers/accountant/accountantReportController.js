const { getReportOverview } = require('../../repositories/accountant/accountantReportRepository');

const getOverview = async (req, res) => {
    try {
        const months = Math.min(Math.max(parseInt(req.query.months) || 6, 1), 12);
        const data = await getReportOverview({ months });
        res.json(data);
    } catch (err) {
        console.error('[ReportController] getOverview:', err.message);
        res.status(500).json({ error: 'Không thể tải dữ liệu báo cáo' });
    }
};

module.exports = { getOverview };
