/**
 * L1 Unit Test — bonusRuleService (cấu hình quy tắc thưởng)
 *
 * Ba luật khó nhất, đều có hậu quả tiền bạc thật:
 *   1. Chỉ 3 loại thưởng được bộ tính lương ĐỌC (kpi, top_revenue, holiday). Loại khác
 *      lưu được nhưng thưởng luôn bằng 0 → chặn ngay khi ĐƯA VÀO DÙNG.
 *   2. Nhưng KHÔNG chặn rule cũ vốn đã bật sẵn với loại không hỗ trợ — chặn thì quản lý
 *      không sửa nổi cả cái tiêu đề.
 *   3. Rule đang TẮT thì bỏ qua mọi kiểm tra nội dung, để luôn tắt được rule hỏng mà
 *      không phải xoá hẳn.
 *
 * bonusRuleRepository mock bằng factory để giữ nguyên 2 mảng hằng — automock biến chúng
 * thành mảng rỗng và mọi validate sẽ đo sai.
 */
jest.mock('../../repositories/bonusRuleRepository', () => ({
    BONUS_RULE_TYPES: ['kpi', 'top_revenue', 'top_trips', 'zero_incident', 'overtime', 'holiday', 'custom'],
    IMPLEMENTED_BONUS_TYPES: ['kpi', 'top_revenue', 'holiday'],
    listRules: jest.fn(),
    getRuleById: jest.fn(),
    createRule: jest.fn(),
    updateRule: jest.fn(),
    deleteRule: jest.fn(),
}));
jest.mock('../../services/notificationGateway', () => ({
    broadcastToRole: jest.fn(), broadcastToUser: jest.fn(), notifyCreated: jest.fn(),
}));
jest.mock('../../services/roleNotificationService', () => ({
    notifyRoles: jest.fn().mockResolvedValue([]),
    notifyRolesSafe: jest.fn(),
}));

const repo = require('../../repositories/bonusRuleRepository');
const notificationGateway = require('../../services/notificationGateway');
const { notifyRolesSafe } = require('../../services/roleNotificationService');
const service = require('../../services/bonusRuleService');

const RULE_KPI = {
    title: '  Thưởng vượt KPI  ', bonus_type: 'kpi', reward_amount: 1_000_000,
    conditions_json: { min_revenue: 50_000_000 },
};

beforeEach(() => {
    jest.clearAllMocks();
    repo.createRule.mockResolvedValue({ id: 40, title: 'Thưởng vượt KPI' });
    repo.updateRule.mockResolvedValue({ id: 40, title: 'Thưởng vượt KPI' });
});

describe('bonusRuleService.createRule — chuẩn hoá và validate', () => {
    it('TC-UNIT-BonusRuleService-001 — a valid KPI rule is stored with the title trimmed', async () => {
        await service.createRule(RULE_KPI);

        expect(repo.createRule).toHaveBeenCalledWith({
            vehicleGroupId: null,
            title: 'Thưởng vượt KPI',
            bonusType: 'kpi',
            rewardAmount: 1_000_000,
            rewardMultiplier: null,
            conditionsJson: { min_revenue: 50_000_000 },
            isActive: true,
        });
    });

    it('TC-UNIT-BonusRuleService-002 — rejects a missing title (400)', async () => {
        await expect(service.createRule({ ...RULE_KPI, title: '   ' }))
            .rejects.toMatchObject({ status: 400, message: 'Tên quy tắc thưởng là bắt buộc' });

        expect(repo.createRule).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusRuleService-003 — rejects a bonus type outside the catalogue', async () => {
        await expect(service.createRule({ ...RULE_KPI, bonus_type: 'thuong_tet' }))
            .rejects.toMatchObject({ status: 400 });

        expect(repo.createRule).not.toHaveBeenCalled();
    });

    it.each([['top_trips'], ['zero_incident'], ['overtime'], ['custom']])(
        'TC-UNIT-BonusRuleService-004 — type %s is in the catalogue but the payroll engine never reads it, so it is blocked',
        async (loai) => {
            await expect(service.createRule({ ...RULE_KPI, bonus_type: loai, conditions_json: null }))
                .rejects.toThrow('chưa được bộ tính lương hỗ trợ');

            expect(repo.createRule).not.toHaveBeenCalled();
        },
    );

    it('TC-UNIT-BonusRuleService-005 — rejects a rule carrying neither an amount nor a multiplier', async () => {
        await expect(service.createRule({
            title: 'X', bonus_type: 'top_revenue', reward_amount: null, reward_multiplier: null,
        })).rejects.toThrow('Cần nhập ít nhất Số tiền thưởng hoặc Hệ số thưởng');
    });

    it('TC-UNIT-BonusRuleService-006 — rejects a negative bonus amount', async () => {
        await expect(service.createRule({ ...RULE_KPI, reward_amount: -1 }))
            .rejects.toMatchObject({ status: 400, message: 'Số tiền thưởng không hợp lệ' });
    });

    it('TC-UNIT-BonusRuleService-007 — a bonus amount of 0 is still valid (lower boundary)', async () => {
        await service.createRule({ ...RULE_KPI, reward_amount: 0 });

        expect(repo.createRule).toHaveBeenCalledWith(expect.objectContaining({ rewardAmount: 0 }));
    });

    it('TC-UNIT-BonusRuleService-008 — rejects a non-numeric multiplier', async () => {
        await expect(service.createRule({ ...RULE_KPI, reward_multiplier: 'gấp đôi' }))
            .rejects.toMatchObject({ status: 400, message: 'Hệ số thưởng không hợp lệ' });
    });

    it('TC-UNIT-BonusRuleService-009 — a KPI bonus without a revenue threshold is rejected', async () => {
        await expect(service.createRule({ ...RULE_KPI, conditions_json: null }))
            .rejects.toThrow('cần cấu hình ngưỡng doanh thu tối thiểu (min_revenue)');
    });

    it('TC-UNIT-BonusRuleService-010 — a KPI bonus with a revenue threshold of 0 is rejected', async () => {
        await expect(service.createRule({ ...RULE_KPI, conditions_json: { min_revenue: 0 } }))
            .rejects.toThrow('min_revenue');
    });

    it('TC-UNIT-BonusRuleService-011 — a KPI bonus keeps only the min_revenue field', async () => {
        await service.createRule({
            ...RULE_KPI, conditions_json: { min_revenue: '50000000', rac: 'bo di' },
        });

        expect(repo.createRule).toHaveBeenCalledWith(
            expect.objectContaining({ conditionsJson: { min_revenue: 50_000_000 } }),
        );
    });

    it('TC-UNIT-BonusRuleService-012 — a holiday bonus without a multiplier is rejected', async () => {
        await expect(service.createRule({
            title: 'Lễ', bonus_type: 'holiday', reward_amount: 100_000,
        })).rejects.toThrow('cần cấu hình Hệ số thưởng');
    });

    it('TC-UNIT-BonusRuleService-013 — a holiday multiplier below 1 is rejected, it would DEDUCT from the driver', async () => {
        await expect(service.createRule({
            title: 'Lễ', bonus_type: 'holiday', reward_multiplier: 0.8,
        })).rejects.toThrow('Hệ số thưởng ngày lễ phải từ 1 trở lên');
    });

    it('TC-UNIT-BonusRuleService-014 — a holiday multiplier of exactly 1 is accepted (lower boundary)', async () => {
        await service.createRule({ title: 'Lễ', bonus_type: 'holiday', reward_multiplier: 1 });

        expect(repo.createRule).toHaveBeenCalledWith(expect.objectContaining({ rewardMultiplier: 1 }));
    });

    it('TC-UNIT-BonusRuleService-015 — a holiday multiplier of 2, meaning 200%, is a valid configuration', async () => {
        await service.createRule({ title: 'Lễ', bonus_type: 'holiday', reward_multiplier: 2 });

        expect(repo.createRule).toHaveBeenCalledWith(expect.objectContaining({ rewardMultiplier: 2 }));
    });

    it('TC-UNIT-BonusRuleService-016 — a DISABLED rule skips the content checks and can still be saved', async () => {
        await service.createRule({
            title: 'Rule hỏng', bonus_type: 'custom', is_active: false,
            reward_amount: null, reward_multiplier: null,
        });

        expect(repo.createRule).toHaveBeenCalledWith(expect.objectContaining({
            bonusType: 'custom', isActive: false,
        }));
    });

    it('TC-UNIT-BonusRuleService-017 — a DISABLED rule is still blocked on a wrongly TYPED value, no junk reaches the database', async () => {
        await expect(service.createRule({
            title: 'X', bonus_type: 'custom', is_active: false, reward_amount: -5,
        })).rejects.toThrow('Số tiền thưởng không hợp lệ');
    });

    it('TC-UNIT-BonusRuleService-018 — creation pushes realtime and notifies managers and accountants', async () => {
        await service.createRule({ ...RULE_KPI, actor_id: 10 });

        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('manager',
            expect.objectContaining({ type: 'manager.bonus_rules.changed', action: 'created', ruleId: 40 }));
        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['manager', 'accountant'],
            expect.objectContaining({ type: 'BONUS_RULE_CREATED', entityId: 40 }),
            { excludeUserId: 10, displayMode: 'toast' },
        );
    });
});

describe('bonusRuleService.updateRule', () => {
    const RULE_CU = {
        id: 40, title: 'Cũ', bonus_type: 'kpi', vehicle_group_id: null,
        reward_amount: 500_000, reward_multiplier: null,
        conditions_json: { min_revenue: 30_000_000 }, is_active: true,
    };

    beforeEach(() => {
        repo.getRuleById.mockResolvedValue({ ...RULE_CU });
    });

    it('TC-UNIT-BonusRuleService-019 — editing only the title leaves every other field at its previous value', async () => {
        await service.updateRule(40, { title: 'Tên mới' });

        expect(repo.updateRule).toHaveBeenCalledWith(40, expect.objectContaining({
            title: 'Tên mới',
            bonusType: 'kpi',
            rewardAmount: 500_000,
            conditionsJson: { min_revenue: 30_000_000 },
            isActive: true,
        }));
    });

    it('TC-UNIT-BonusRuleService-020 — an existing enabled rule of an UNSUPPORTED type can still have its title edited', async () => {
        repo.getRuleById.mockResolvedValue({
            ...RULE_CU, bonus_type: 'custom', is_active: true, conditions_json: null,
        });

        await service.updateRule(40, { title: 'Đổi tên thôi' });

        expect(repo.updateRule).toHaveBeenCalledWith(40, expect.objectContaining({
            title: 'Đổi tên thôi', bonusType: 'custom',
        }));
    });

    it('TC-UNIT-BonusRuleService-021 — RE-ENABLING a disabled rule of an unsupported type is blocked', async () => {
        repo.getRuleById.mockResolvedValue({
            ...RULE_CU, bonus_type: 'custom', is_active: false, conditions_json: null,
        });

        await expect(service.updateRule(40, { is_active: true }))
            .rejects.toThrow('chưa được bộ tính lương hỗ trợ');

        expect(repo.updateRule).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusRuleService-022 — SWITCHING to an unsupported type is blocked', async () => {
        await expect(service.updateRule(40, { bonus_type: 'overtime' }))
            .rejects.toThrow('chưa được bộ tính lương hỗ trợ');

        expect(repo.updateRule).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusRuleService-023 — DISABLING a rule of an unsupported type always works', async () => {
        repo.getRuleById.mockResolvedValue({
            ...RULE_CU, bonus_type: 'custom', is_active: true, conditions_json: null,
        });

        await service.updateRule(40, { is_active: false });

        expect(repo.updateRule).toHaveBeenCalledWith(40, expect.objectContaining({ isActive: false }));
    });

    it('TC-UNIT-BonusRuleService-024 — returns 404 when the rule does not exist', async () => {
        repo.getRuleById.mockResolvedValue(null);

        await expect(service.updateRule(40, { title: 'X' }))
            .rejects.toMatchObject({ status: 404, message: 'Quy tắc thưởng không tồn tại' });

        expect(repo.updateRule).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusRuleService-025 — reports an error and sends no notification when the repository updates nothing', async () => {
        repo.updateRule.mockResolvedValue(null);

        await expect(service.updateRule(40, { title: 'X' }))
            .rejects.toThrow('Không thể cập nhật quy tắc thưởng');

        expect(notifyRolesSafe).not.toHaveBeenCalled();
    });
});

describe('bonusRuleService.deleteRule / getRuleById / listRules', () => {
    it('TC-UNIT-BonusRuleService-026 — deleting an existing rule announces the change with the old title', async () => {
        repo.getRuleById.mockResolvedValue({ id: 40, title: 'Thưởng KPI' });

        const result = await service.deleteRule(40, 10);

        expect(repo.deleteRule).toHaveBeenCalledWith(40);
        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['manager', 'accountant'],
            expect.objectContaining({
                type: 'BONUS_RULE_DELETED',
                message: 'Quy tắc thưởng "Thưởng KPI" vừa bị xóa.',
            }),
            { excludeUserId: 10, displayMode: 'toast' },
        );
        expect(result).toEqual({ success: true });
    });

    it('TC-UNIT-BonusRuleService-027 — returns 404 and deletes nothing when the rule does not exist', async () => {
        repo.getRuleById.mockResolvedValue(null);

        await expect(service.deleteRule(40, 10)).rejects.toMatchObject({ status: 404 });

        expect(repo.deleteRule).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusRuleService-028 — returns 404 rather than null when reading a rule that does not exist', async () => {
        repo.getRuleById.mockResolvedValue(null);

        await expect(service.getRuleById(40)).rejects.toMatchObject({ status: 404 });
    });

    it('TC-UNIT-BonusRuleService-029 — the string is_active filter is coerced into a boolean', async () => {
        repo.listRules.mockResolvedValue([]);

        await service.listRules({ is_active: 'true', vehicle_group_id: '3', bonus_type: 'kpi' });

        expect(repo.listRules).toHaveBeenCalledWith({
            vehicleGroupId: 3, bonusType: 'kpi', isActive: true,
        });
    });

    it('TC-UNIT-BonusRuleService-030 — omitting every filter passes null for all of them, no filtering', async () => {
        repo.listRules.mockResolvedValue([]);

        await service.listRules({});

        expect(repo.listRules).toHaveBeenCalledWith({
            vehicleGroupId: null, bonusType: null, isActive: null,
        });
    });
});
