const holidayService = require('../services/holidayService');

const sendError = (res, err) => {
    const code = err.message.includes('Không tìm thấy') ? 404
        : err.message.includes('không hợp lệ') || err.message.includes('bắt buộc') ? 400
        : 500;
    res.status(code).json({ error: err.message });
};

// GET /api/admin/holidays?year=2026
const listHolidays = async (req, res) => {
    try {
        const year = Number(req.query.year) || null;
        const holidays = await holidayService.listHolidays(year);
        res.json({ holidays });
    } catch (err) {
        sendError(res, err);
    }
};

// POST /api/admin/holidays  { holiday_date: 'YYYY-MM-DD', name }
const createHoliday = async (req, res) => {
    try {
        const { holiday_date, name } = req.body;
        const holiday = await holidayService.createHoliday(holiday_date, name);
        res.status(201).json({ message: 'Đã lưu ngày lễ', holiday });
    } catch (err) {
        sendError(res, err);
    }
};

// DELETE /api/admin/holidays/:date
const deleteHoliday = async (req, res) => {
    try {
        await holidayService.deleteHoliday(req.params.date);
        res.json({ message: 'Đã xóa ngày lễ' });
    } catch (err) {
        sendError(res, err);
    }
};

module.exports = { listHolidays, createHoliday, deleteHoliday };
