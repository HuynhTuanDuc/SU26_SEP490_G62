const pool = require('../config/database');

// Danh mục ngày lễ hưởng 200% lương — Manager quản lý (thêm lại mỗi năm vì ngày âm lịch thay đổi)

// GET /api/admin/holidays?year=2026
const listHolidays = async (req, res) => {
    try {
        const year = Number(req.query.year) || null;
        const { rows } = await pool.query(
            `SELECT holiday_date, name
             FROM company_holidays
             WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM holiday_date) = $1)
             ORDER BY holiday_date ASC`,
            [year],
        );
        res.json({ holidays: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/admin/holidays  { holiday_date: 'YYYY-MM-DD', name }
const createHoliday = async (req, res) => {
    try {
        const { holiday_date, name } = req.body;
        if (!holiday_date || Number.isNaN(new Date(holiday_date).getTime())) {
            return res.status(400).json({ error: 'Ngày lễ không hợp lệ' });
        }
        const trimmedName = String(name || '').trim();
        if (!trimmedName) return res.status(400).json({ error: 'Tên ngày lễ là bắt buộc' });

        const { rows: [row] } = await pool.query(
            `INSERT INTO company_holidays (holiday_date, name)
             VALUES ($1, $2)
             ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name
             RETURNING holiday_date, name`,
            [holiday_date, trimmedName],
        );
        res.status(201).json({ message: 'Đã lưu ngày lễ', holiday: row });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// DELETE /api/admin/holidays/:date
const deleteHoliday = async (req, res) => {
    try {
        const date = req.params.date;
        if (!date || Number.isNaN(new Date(date).getTime())) {
            return res.status(400).json({ error: 'Ngày lễ không hợp lệ' });
        }
        const { rowCount } = await pool.query(
            `DELETE FROM company_holidays WHERE holiday_date = $1`,
            [date],
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Không tìm thấy ngày lễ' });
        res.json({ message: 'Đã xóa ngày lễ' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { listHolidays, createHoliday, deleteHoliday };
