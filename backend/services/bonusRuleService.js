const bonusRuleRepository = require('../repositories/bonusRuleRepository');
const notificationGateway = require('./notificationGateway');
const { notifyRolesSafe } = require('./roleNotificationService');
const { err400 } = require('../utils/accountantValidate');
const { optionalMoney } = require('../utils/money');

// Lỗi "không tìm thấy" tách riêng để controller không phải đoán ý qua nội dung câu chữ.
const err404 = (msg) => Object.assign(new Error(msg), { status: 404 });

// unchangedBonusType / wasActive: trạng thái RULE ĐANG CÓ (chỉ truyền khi sửa). Dùng để
// phân biệt "đưa một loại thưởng vào dùng" với "giữ nguyên hiện trạng" — xem chú thích ở
// chỗ kiểm tra IMPLEMENTED_BONUS_TYPES.
const normalizePayload = (payload = {}, { unchangedBonusType = null, wasActive = false } = {}) => {
    const title = String(payload.title || '').trim();
    if (!title) throw err400('Tên quy tắc thưởng là bắt buộc');

    const bonusType = payload.bonus_type;
    if (!bonusType || !bonusRuleRepository.BONUS_RULE_TYPES.includes(bonusType)) {
        throw err400(`Loại thưởng không hợp lệ (${bonusRuleRepository.BONUS_RULE_TYPES.join(', ')})`);
    }

    const vehicleGroupId = payload.vehicle_group_id ? Number(payload.vehicle_group_id) : null;

    // allowZero: quy tắc thưởng tính theo hệ số (reward_multiplier) để trống ô tiền,
    // nên 0 và bỏ trống đều hợp lệ ở đây.
    const rewardAmount = optionalMoney(payload.reward_amount, { field: 'Số tiền thưởng', allowZero: true });

    const rewardMultiplier = payload.reward_multiplier != null && payload.reward_multiplier !== ''
        ? Number(payload.reward_multiplier) : null;
    if (rewardMultiplier != null && (!Number.isFinite(rewardMultiplier) || rewardMultiplier < 0)) {
        throw err400('Hệ số thưởng không hợp lệ');
    }

    const isActive = payload.is_active !== undefined ? Boolean(payload.is_active) : true;

    // Rule đã tắt thì không tham gia tính lương, nên cấu hình của nó đúng hay sai cũng
    // không ảnh hưởng đồng nào. Bỏ qua mọi kiểm tra NỘI DUNG bên dưới để việc TẮT một
    // rule hỏng luôn thực hiện được — nếu chặn, cách duy nhất để vô hiệu hoá nó là xoá
    // hẳn, tức ép người dùng chọn hành động phá huỷ hơn. (Các kiểm tra phía TRÊN vẫn
    // chạy vì chúng chặn giá trị sai kiểu, thứ không được phép ghi xuống DB dù rule tắt.)
    if (!isActive) {
        return {
            vehicleGroupId, title, bonusType, rewardAmount, rewardMultiplier,
            conditionsJson: payload.conditions_json ?? null,
            isActive: false,
        };
    }

    if (rewardAmount == null && rewardMultiplier == null) {
        throw err400('Cần nhập ít nhất Số tiền thưởng hoặc Hệ số thưởng');
    }

    // Chỉ những loại dưới đây được bộ tính lương đọc. Các loại còn lại (top_trips,
    // zero_incident, overtime, custom) trước đây vẫn lưu được nhưng không công thức nào
    // tiêu thụ — quản lý cấu hình xong tưởng đã có hiệu lực, thực tế thưởng luôn bằng 0.
    // Chặn ngay từ đây thay vì để rule chết nằm im trong DB.
    //
    // Chỉ chặn khi thao tác này ĐƯA loại thưởng đó vào dùng — tức tạo mới, đổi sang loại
    // khác, hoặc bật lại một rule đang tắt. Nếu rule vốn đã bật sẵn với loại đó (dữ liệu
    // cũ trong DB) thì cho sửa bình thường: chặn cũng không làm nó bớt vô tác dụng, chỉ
    // khiến người quản lý không sửa nổi cả tiêu đề.
    const dangDuaVaoDung = bonusType !== unchangedBonusType || !wasActive;
    if (dangDuaVaoDung && !bonusRuleRepository.IMPLEMENTED_BONUS_TYPES.includes(bonusType)) {
        throw err400(
            `Loại thưởng "${bonusType}" chưa được bộ tính lương hỗ trợ nên sẽ không có hiệu lực. `
            + `Hiện hỗ trợ: ${bonusRuleRepository.IMPLEMENTED_BONUS_TYPES.join(', ')}.`,
        );
    }

    let conditionsJson = payload.conditions_json ?? null;
    if (bonusType === 'kpi') {
        const minRevenue = conditionsJson?.min_revenue != null ? Number(conditionsJson.min_revenue) : null;
        if (!minRevenue || minRevenue <= 0) {
            throw err400('Thưởng vượt KPI cần cấu hình ngưỡng doanh thu tối thiểu (min_revenue)');
        }
        conditionsJson = { min_revenue: minRevenue };
    }

    // Thưởng ngày lễ tính bằng HỆ SỐ nhân lương ngày, không phải số tiền cố định.
    // Hệ số < 1 nghĩa là đi làm lễ được trả ít hơn ngày thường — phần thưởng thêm
    // (hệ số - 1) sẽ âm, tức trừ tiền tài xế, nên chặn tại đây.
    if (bonusType === 'holiday') {
        if (rewardMultiplier == null) {
            throw err400('Thưởng ngày lễ cần cấu hình Hệ số thưởng (vd 2 = hưởng 200% lương ngày)');
        }
        if (rewardMultiplier < 1) {
            throw err400('Hệ số thưởng ngày lễ phải từ 1 trở lên');
        }
    }

    return {
        vehicleGroupId,
        title,
        bonusType,
        rewardAmount,
        rewardMultiplier,
        conditionsJson,
        isActive: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
    };
};

const broadcastRuleChange = (action, ruleId) => {
    notificationGateway.broadcastToRole('manager', {
        type: 'manager.bonus_rules.changed',
        action,
        ruleId,
        occurredAt: new Date().toISOString(),
    });
};

const notifyRuleChange = (action, rule, actorId = null) => {
    const actionText = {
        created: 'được tạo',
        updated: 'được cập nhật',
        deleted: 'bị xóa',
    }[action] || 'có thay đổi';

    notifyRolesSafe(['manager', 'accountant'], {
        title: 'Quy tắc thưởng có thay đổi',
        message: `Quy tắc thưởng "${rule?.title || `#${rule?.id || ''}`}" vừa ${actionText}.`,
        type: `BONUS_RULE_${String(action || 'changed').toUpperCase()}`,
        entityType: 'bonus_rules',
        entityId: rule?.id ?? null,
    }, { excludeUserId: actorId, displayMode: 'toast' });
};

const listRules = async (query) => bonusRuleRepository.listRules({
    vehicleGroupId: query.vehicle_group_id ? Number(query.vehicle_group_id) : null,
    bonusType: query.bonus_type || null,
    isActive: query.is_active !== undefined ? query.is_active === 'true' : null,
});

const getRuleById = async (id) => {
    const rule = await bonusRuleRepository.getRuleById(id);
    if (!rule) throw err404('Quy tắc thưởng không tồn tại');
    return rule;
};

const createRule = async (payload) => {
    const normalized = normalizePayload(payload);
    const rule = await bonusRuleRepository.createRule(normalized);
    broadcastRuleChange('created', rule.id);
    notifyRuleChange('created', rule, payload.actor_id ?? null);
    return rule;
};

const updateRule = async (id, payload) => {
    const existing = await bonusRuleRepository.getRuleById(id);
    if (!existing) throw err404('Quy tắc thưởng không tồn tại');

    const normalized = normalizePayload({
        title: payload.title ?? existing.title,
        bonus_type: payload.bonus_type ?? existing.bonus_type,
        vehicle_group_id: payload.vehicle_group_id !== undefined ? payload.vehicle_group_id : existing.vehicle_group_id,
        reward_amount: payload.reward_amount !== undefined ? payload.reward_amount : existing.reward_amount,
        reward_multiplier: payload.reward_multiplier !== undefined ? payload.reward_multiplier : existing.reward_multiplier,
        conditions_json: payload.conditions_json !== undefined ? payload.conditions_json : existing.conditions_json,
        is_active: payload.is_active !== undefined ? payload.is_active : existing.is_active,
    }, { unchangedBonusType: existing.bonus_type, wasActive: Boolean(existing.is_active) });

    const updated = await bonusRuleRepository.updateRule(id, normalized);
    if (!updated) throw new Error('Không thể cập nhật quy tắc thưởng');
    broadcastRuleChange('updated', id);
    notifyRuleChange('updated', updated, payload.actor_id ?? null);
    return updated;
};

const deleteRule = async (id, actorId = null) => {
    const existing = await bonusRuleRepository.getRuleById(id);
    if (!existing) throw err404('Quy tắc thưởng không tồn tại');
    await bonusRuleRepository.deleteRule(id);
    broadcastRuleChange('deleted', id);
    notifyRuleChange('deleted', existing, actorId);
    return { success: true };
};

module.exports = { listRules, getRuleById, createRule, updateRule, deleteRule };
