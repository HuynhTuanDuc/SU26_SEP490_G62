const holidayRepository = require('../repositories/holidayRepository');

// Danh mục ngày lễ hưởng 200% lương — Manager quản lý (thêm lại mỗi năm vì ngày âm lịch thay đổi)

const listHolidays = async (year) => holidayRepository.listHolidays(year);

const createHoliday = async (holidayDate, name) => {
    if (!holidayDate || Number.isNaN(new Date(holidayDate).getTime())) {
        throw new Error('Ngày lễ không hợp lệ');
    }
    const trimmedName = String(name || '').trim();
    if (!trimmedName) throw new Error('Tên ngày lễ là bắt buộc');

    return holidayRepository.upsertHoliday(holidayDate, trimmedName);
};

const deleteHoliday = async (date) => {
    if (!date || Number.isNaN(new Date(date).getTime())) {
        throw new Error('Ngày lễ không hợp lệ');
    }
    const rowCount = await holidayRepository.deleteHoliday(date);
    if (rowCount === 0) throw new Error('Không tìm thấy ngày lễ');
};

module.exports = { listHolidays, createHoliday, deleteHoliday };
