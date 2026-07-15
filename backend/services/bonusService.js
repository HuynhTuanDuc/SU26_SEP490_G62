const bonusRepository  = require('../repositories/bonusRepository');
const roleRepository   = require('../repositories/roleRepository');
const driverRepository = require('../repositories/driverRepository');
const notificationService = require('./notificationService');

const TYPE_LABEL = {
    tet_annual:       'Thưởng Tết âm lịch',
    welfare_wedding:  'Hỗ trợ kết hôn',
    welfare_funeral:  'Hỗ trợ tang gia',
    welfare_birthday: 'Thưởng sinh nhật',
    holiday_overtime: 'Thưởng ngày lễ',
    special:          'Thưởng đặc biệt',
};

// Amount mặc định theo quan hệ thân nhân (welfare_funeral)
const FUNERAL_AMOUNTS = {
    self:          1_000_000,
    spouse:        500_000,
    parent:        500_000,
    parent_in_law: 500_000,
    child:         500_000,
};

const _getUserIdsByRole = async (role) => roleRepository.getUserIdsByRole(role);

const _assertDriverExists = async (driverId) => {
    const exists = await driverRepository.driverExists(driverId);
    if (!exists) throw new Error(`Tài xế #${driverId} không tồn tại`);
};

// ─── Tet ─────────────────────────────────────────────────────────────────────

const previewTet = async (year) => {
    if (!year || year < 2020 || year > 2100) throw new Error('Năm không hợp lệ (2020–2100)');
    return bonusRepository.previewTetBonuses(year);
};

const generateTet = async (year, createdBy) => {
    if (!year || year < 2020 || year > 2100) throw new Error('Năm không hợp lệ (2020–2100)');
    const result = await bonusRepository.generateTetBonuses(year, createdBy);

    if (result.inserted > 0) {
        // Notify managers to review
        const managerIds = await _getUserIdsByRole('manager');
        if (managerIds.length) {
            notificationService.createForUsers(managerIds, {
                title:      'Thưởng Tết đã được tạo',
                message:    `${result.inserted} phiếu thưởng Tết ${year} đã tạo, chờ duyệt.`,
                type:       'BONUS_GENERATED',
                entityType: 'driver_bonuses',
                entityId:   null,
            }, { displayMode: 'alert' }).catch(() => {});
        }
    }

    return result;
};

// ─── Queries ──────────────────────────────────────────────────────────────────

const getAll   = async (filters) => bonusRepository.getAll(filters);
const getStats = async (year)    => bonusRepository.getStats(year);

const getById  = async (id) => {
    const bonus = await bonusRepository.getById(id);
    if (!bonus) throw new Error('Không tìm thấy khoản thưởng/phúc lợi');
    return bonus;
};

const getByDriver = async (driverId) => bonusRepository.getByDriver(driverId);

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Tạo khoản phúc lợi / thưởng đột xuất.
 * amount được tính tự động với welfare_birthday, welfare_wedding, welfare_funeral.
 */
const createWelfare = async (data, createdBy) => {
    const { driver_id, type, beneficiary_name, beneficiary_relation, notes, proof_url, year } = data;

    if (type === 'tet_annual') throw new Error('Thưởng Tết phải dùng chức năng tạo hàng loạt');

    await _assertDriverExists(driver_id);

    let { amount } = data;

    switch (type) {
        case 'welfare_birthday':
            amount = 200_000;
            break;
        case 'welfare_wedding':
            amount = 1_000_000;
            break;
        case 'welfare_funeral':
            if (!beneficiary_relation) throw new Error('Cần ghi rõ quan hệ người thân (beneficiary_relation)');
            amount = FUNERAL_AMOUNTS[beneficiary_relation] ?? 500_000;
            break;
        default:
            if (!amount || Number(amount) <= 0) throw new Error('Số tiền phải lớn hơn 0');
            amount = Number(amount);
    }

    const bonus = await bonusRepository.create({
        driver_id,
        type,
        year:                 year ?? new Date().getFullYear(),
        amount,
        notes:                notes ?? null,
        beneficiary_name:     beneficiary_name ?? null,
        beneficiary_relation: beneficiary_relation ?? null,
        proof_url:            proof_url ?? null,
    }, createdBy);

    // Notify managers to approve (nếu người tạo không phải manager)
    const managerIds = await _getUserIdsByRole('manager');
    const notifyIds  = managerIds.filter((id) => id !== createdBy);
    if (notifyIds.length) {
        notificationService.createForUsers(notifyIds, {
            title:      'Yêu cầu phúc lợi mới',
            message:    `Có phiếu "${TYPE_LABEL[type] ?? type}" mới chờ duyệt.`,
            type:       'BONUS_REQUEST',
            entityType: 'driver_bonuses',
            entityId:   bonus.id,
        }, { displayMode: 'alert' }).catch(() => {});
    }

    return bonus;
};

// ─── Workflow ─────────────────────────────────────────────────────────────────

const approve = async (id, approvedBy, adjustedAmount) => {
    if (adjustedAmount != null && Number(adjustedAmount) <= 0)
        throw new Error('Số tiền điều chỉnh phải lớn hơn 0');

    const bonus = await bonusRepository.approve(id, approvedBy, adjustedAmount ?? null);

    // Notify accountant
    const accountantIds = await _getUserIdsByRole('accountant');
    if (accountantIds.length) {
        notificationService.createForUsers(accountantIds, {
            title:      'Khoản thưởng chờ chi trả',
            message:    `"${TYPE_LABEL[bonus.type] ?? bonus.type}" đã được duyệt, chờ kế toán chi trả.`,
            type:       'BONUS_APPROVED',
            entityType: 'driver_bonuses',
            entityId:   id,
        }, { displayMode: 'alert' }).catch(() => {});
    }

    // Notify driver
    notificationService.createForUser(bonus.driver_id, {
        title:      'Khoản thưởng được duyệt',
        message:    `"${TYPE_LABEL[bonus.type] ?? bonus.type}" của bạn đã được duyệt — ${Number(bonus.amount).toLocaleString('vi-VN')}đ.`,
        type:       'BONUS_APPROVED',
        entityType: 'driver_bonuses',
        entityId:   id,
    }, { displayMode: 'alert' }).catch(() => {});

    return bonus;
};

const reject = async (id, rejectedBy, reason) => {
    if (!reason?.trim()) throw new Error('Cần ghi lý do từ chối');
    const bonus = await bonusRepository.reject(id, rejectedBy, reason.trim());

    notificationService.createForUser(bonus.driver_id, {
        title:      'Khoản thưởng bị từ chối',
        message:    `"${TYPE_LABEL[bonus.type] ?? bonus.type}" bị từ chối: ${reason.trim()}`,
        type:       'BONUS_REJECTED',
        entityType: 'driver_bonuses',
        entityId:   id,
    }, { displayMode: 'alert' }).catch(() => {});

    return bonus;
};

const pay = async (id, paidBy) => {
    const bonus = await bonusRepository.pay(id, paidBy);

    notificationService.createForUser(bonus.driver_id, {
        title:      'Khoản thưởng đã được chi trả',
        message:    `"${TYPE_LABEL[bonus.type] ?? bonus.type}" — ${Number(bonus.amount).toLocaleString('vi-VN')}đ đã được chi trả.`,
        type:       'BONUS_PAID',
        entityType: 'driver_bonuses',
        entityId:   id,
    }, { displayMode: 'silent' }).catch(() => {});

    return bonus;
};

module.exports = {
    TYPE_LABEL,
    previewTet,
    generateTet,
    getAll,
    getStats,
    getById,
    getByDriver,
    createWelfare,
    approve,
    reject,
    pay,
};
