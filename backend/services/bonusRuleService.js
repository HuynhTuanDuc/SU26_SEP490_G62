const bonusRuleRepository = require('../repositories/bonusRuleRepository');
const notificationGateway = require('./notificationGateway');

const normalizePayload = (payload = {}) => {
    const title = String(payload.title || '').trim();
    if (!title) throw new Error('Tên quy tắc thưởng là bắt buộc');

    const bonusType = payload.bonus_type;
    if (!bonusType || !bonusRuleRepository.BONUS_RULE_TYPES.includes(bonusType)) {
        throw new Error(`Loại thưởng không hợp lệ (${bonusRuleRepository.BONUS_RULE_TYPES.join(', ')})`);
    }

    const vehicleGroupId = payload.vehicle_group_id ? Number(payload.vehicle_group_id) : null;

    const rewardAmount = payload.reward_amount != null && payload.reward_amount !== ''
        ? Number(payload.reward_amount) : null;
    if (rewardAmount != null && (!Number.isFinite(rewardAmount) || rewardAmount < 0)) {
        throw new Error('Số tiền thưởng không hợp lệ');
    }

    const rewardMultiplier = payload.reward_multiplier != null && payload.reward_multiplier !== ''
        ? Number(payload.reward_multiplier) : null;
    if (rewardMultiplier != null && (!Number.isFinite(rewardMultiplier) || rewardMultiplier < 0)) {
        throw new Error('Hệ số thưởng không hợp lệ');
    }

    if (rewardAmount == null && rewardMultiplier == null) {
        throw new Error('Cần nhập ít nhất Số tiền thưởng hoặc Hệ số thưởng');
    }

    let conditionsJson = payload.conditions_json ?? null;
    if (bonusType === 'kpi') {
        const minRevenue = conditionsJson?.min_revenue != null ? Number(conditionsJson.min_revenue) : null;
        if (!minRevenue || minRevenue <= 0) {
            throw new Error('Thưởng vượt KPI cần cấu hình ngưỡng doanh thu tối thiểu (min_revenue)');
        }
        conditionsJson = { min_revenue: minRevenue };
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

const listRules = async (query) => bonusRuleRepository.listRules({
    vehicleGroupId: query.vehicle_group_id ? Number(query.vehicle_group_id) : null,
    bonusType: query.bonus_type || null,
    isActive: query.is_active !== undefined ? query.is_active === 'true' : null,
});

const getRuleById = async (id) => {
    const rule = await bonusRuleRepository.getRuleById(id);
    if (!rule) throw new Error('Quy tắc thưởng không tồn tại');
    return rule;
};

const createRule = async (payload) => {
    const normalized = normalizePayload(payload);
    const rule = await bonusRuleRepository.createRule(normalized);
    broadcastRuleChange('created', rule.id);
    return rule;
};

const updateRule = async (id, payload) => {
    const existing = await bonusRuleRepository.getRuleById(id);
    if (!existing) throw new Error('Quy tắc thưởng không tồn tại');

    const normalized = normalizePayload({
        title: payload.title ?? existing.title,
        bonus_type: payload.bonus_type ?? existing.bonus_type,
        vehicle_group_id: payload.vehicle_group_id !== undefined ? payload.vehicle_group_id : existing.vehicle_group_id,
        reward_amount: payload.reward_amount !== undefined ? payload.reward_amount : existing.reward_amount,
        reward_multiplier: payload.reward_multiplier !== undefined ? payload.reward_multiplier : existing.reward_multiplier,
        conditions_json: payload.conditions_json !== undefined ? payload.conditions_json : existing.conditions_json,
        is_active: payload.is_active !== undefined ? payload.is_active : existing.is_active,
    });

    const updated = await bonusRuleRepository.updateRule(id, normalized);
    if (!updated) throw new Error('Không thể cập nhật quy tắc thưởng');
    broadcastRuleChange('updated', id);
    return updated;
};

const deleteRule = async (id) => {
    const existing = await bonusRuleRepository.getRuleById(id);
    if (!existing) throw new Error('Quy tắc thưởng không tồn tại');
    await bonusRuleRepository.deleteRule(id);
    broadcastRuleChange('deleted', id);
    return { success: true };
};

module.exports = { listRules, getRuleById, createRule, updateRule, deleteRule };
