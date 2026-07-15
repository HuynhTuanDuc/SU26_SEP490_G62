const pool = require('../config/database');

const listHolidays = async (year = null) => {
    const { rows } = await pool.query(
        `SELECT holiday_date, name
         FROM company_holidays
         WHERE ($1::int IS NULL OR EXTRACT(YEAR FROM holiday_date) = $1)
         ORDER BY holiday_date ASC`,
        [year],
    );
    return rows;
};

const upsertHoliday = async (holidayDate, name) => {
    const { rows: [row] } = await pool.query(
        `INSERT INTO company_holidays (holiday_date, name)
         VALUES ($1, $2)
         ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name
         RETURNING holiday_date, name`,
        [holidayDate, name],
    );
    return row;
};

const deleteHoliday = async (date) => {
    const { rowCount } = await pool.query(
        `DELETE FROM company_holidays WHERE holiday_date = $1`,
        [date],
    );
    return rowCount;
};

module.exports = { listHolidays, upsertHoliday, deleteHoliday };
