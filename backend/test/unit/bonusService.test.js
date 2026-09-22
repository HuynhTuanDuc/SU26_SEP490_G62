/**
 * L1 Unit Test — bonusService
 *
 * Trọng tâm: số tiền phúc lợi do HỆ THỐNG quyết định theo loại (người dùng gửi lên bao
 * nhiêu cũng bị ghi đè), quan hệ thân nhân quyết định mức hỗ trợ tang gia, và luật
 * "manager tự tạo thì tự duyệt luôn".
 */
jest.mock('../../repositories/bonusRepository');
jest.mock('../../repositories/roleRepository');
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
}));

const bonusRepository = require('../../repositories/bonusRepository');
const roleRepository = require('../../repositories/roleRepository');
const notificationService = require('../../services/notificationService');
const bonusService = require('../../services/bonusService');

beforeEach(() => {
    jest.clearAllMocks();
    bonusRepository.staffExists.mockResolvedValue(true);
    bonusRepository.create.mockResolvedValue({ id: 50, type: 'welfare_wedding', driver_id: 5, amount: 1_000_000 });
    bonusRepository.approve.mockResolvedValue({ id: 50, type: 'welfare_wedding', driver_id: 5, amount: 1_000_000 });
    roleRepository.getUserIdsByRole.mockResolvedValue([10]);
});

describe('bonusService.createWelfare — số tiền do hệ thống quyết định', () => {
    it('TC-UNIT-BonusService-001 — a birthday bonus is always 200.000đ, whatever amount the user sends', async () => {
        await bonusService.createWelfare(
            { driver_id: 5, type: 'welfare_birthday', amount: 99_000_000 }, 20, 'accountant',
        );

        expect(bonusRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 200_000 }), 20,
        );
    });

    it('TC-UNIT-BonusService-002 — a wedding grant is always 1.000.000đ', async () => {
        await bonusService.createWelfare(
            { driver_id: 5, type: 'welfare_wedding', amount: 1 }, 20, 'accountant',
        );

        expect(bonusRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 1_000_000 }), 20,
        );
    });

    it.each([
        ['self', 1_000_000],
        ['spouse', 500_000],
        ['parent', 500_000],
        ['parent_in_law', 500_000],
        ['child', 500_000],
    ])('TC-UNIT-BonusService-003 — a funeral grant for relation %s is %iđ', async (relation, expected) => {
        await bonusService.createWelfare(
            { driver_id: 5, type: 'welfare_funeral', beneficiary_relation: relation }, 20, 'accountant',
        );

        expect(bonusRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ amount: expected }), 20,
        );
    });

    it('TC-UNIT-BonusService-004 — an unknown relation falls back to the 500.000đ default', async () => {
        await bonusService.createWelfare(
            { driver_id: 5, type: 'welfare_funeral', beneficiary_relation: 'ban_than' }, 20, 'accountant',
        );

        expect(bonusRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 500_000 }), 20,
        );
    });

    it('TC-UNIT-BonusService-005 — a funeral grant without a stated relation is rejected', async () => {
        await expect(bonusService.createWelfare(
            { driver_id: 5, type: 'welfare_funeral' }, 20, 'accountant',
        )).rejects.toThrow('Cần ghi rõ quan hệ người thân (beneficiary_relation)');

        expect(bonusRepository.create).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusService-006 — a special bonus requires an amount above 0 to be entered', async () => {
        await expect(bonusService.createWelfare(
            { driver_id: 5, type: 'special', amount: 0 }, 20, 'accountant',
        )).rejects.toThrow('Số tiền phải lớn hơn 0');

        expect(bonusRepository.create).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusService-007 — a special bonus with a valid amount keeps the entered figure', async () => {
        await bonusService.createWelfare(
            { driver_id: 5, type: 'special', amount: '2500000' }, 20, 'accountant',
        );

        expect(bonusRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 2_500_000 }), 20,
        );
    });

    it('TC-UNIT-BonusService-008 — a Tet bonus cannot be created one by one, the batch function must be used', async () => {
        await expect(bonusService.createWelfare(
            { driver_id: 5, type: 'tet_annual', amount: 1_000_000 }, 20, 'accountant',
        )).rejects.toThrow('Thưởng Tết phải dùng chức năng tạo hàng loạt');

        expect(bonusRepository.staffExists).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusService-009 — rejects a staff member that does not exist or is locked', async () => {
        bonusRepository.staffExists.mockResolvedValue(false);

        await expect(bonusService.createWelfare(
            { driver_id: 99, type: 'welfare_wedding' }, 20, 'accountant',
        )).rejects.toThrow('Nhân viên #99 không tồn tại hoặc đã bị khóa');

        expect(bonusRepository.create).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusService-010 — a blank relation must be stored as NULL, an empty string breaks the CHECK constraint', async () => {
        await bonusService.createWelfare(
            { driver_id: 5, type: 'special', amount: 100, beneficiary_relation: '', proof_url: '' }, 20, 'accountant',
        );

        expect(bonusRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({ beneficiary_relation: null, proof_url: null }), 20,
        );
    });

    it('TC-UNIT-BonusService-011 — a manager creating it approves it outright, no redundant waiting step', async () => {
        await bonusService.createWelfare(
            { driver_id: 5, type: 'welfare_wedding' }, 20, 'manager',
        );

        expect(bonusRepository.approve).toHaveBeenCalledWith(50, 20, null);
    });

    it('TC-UNIT-BonusService-012 — an accountant creating it leaves it pending and notifies managers', async () => {
        await bonusService.createWelfare(
            { driver_id: 5, type: 'welfare_wedding' }, 20, 'accountant',
        );

        expect(bonusRepository.approve).not.toHaveBeenCalled();
        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [10], expect.objectContaining({ type: 'BONUS_REQUEST', entityId: 50 }), { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-BonusService-013 — the creator receives no notification about their own request', async () => {
        roleRepository.getUserIdsByRole.mockResolvedValue([10, 20]);

        await bonusService.createWelfare({ driver_id: 5, type: 'welfare_wedding' }, 20, 'accountant');

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [10], expect.anything(), expect.anything(),
        );
    });
});

describe('bonusService.approve', () => {
    it('TC-UNIT-BonusService-014 — approval tells accounting to pay out and informs the staff member', async () => {
        await bonusService.approve(50, 20, null);

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [10], expect.objectContaining({ type: 'BONUS_APPROVED' }), { displayMode: 'alert' },
        );
        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5, expect.objectContaining({ type: 'BONUS_APPROVED' }), { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-BonusService-015 — rejects an adjusted amount of 0 or less', async () => {
        await expect(bonusService.approve(50, 20, 0)).rejects.toThrow('Số tiền điều chỉnh phải lớn hơn 0');

        expect(bonusRepository.approve).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusService-016 — passes null to the repository when no adjustment is made', async () => {
        await bonusService.approve(50, 20, undefined);

        expect(bonusRepository.approve).toHaveBeenCalledWith(50, 20, null);
    });
});

describe('bonusService.reject', () => {
    it('TC-UNIT-BonusService-017 — a rejection must carry a reason', async () => {
        await expect(bonusService.reject(50, 20, '   ')).rejects.toThrow('Cần ghi lý do từ chối');

        expect(bonusRepository.reject).not.toHaveBeenCalled();
    });

    it('TC-UNIT-BonusService-018 — the reason is trimmed and carried into the notification', async () => {
        bonusRepository.reject.mockResolvedValue({ id: 50, type: 'special', driver_id: 5 });

        await bonusService.reject(50, 20, '  Không đủ chứng từ  ');

        expect(bonusRepository.reject).toHaveBeenCalledWith(50, 20, 'Không đủ chứng từ');
        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5,
            expect.objectContaining({ message: 'Thưởng đặc biệt bị từ chối: Không đủ chứng từ'.replace('Thưởng đặc biệt', '"Thưởng đặc biệt"') }),
            { displayMode: 'alert' },
        );
    });
});

describe('bonusService.previewTet / generateTet', () => {
    it.each([[2019], [2101], [null]])('TC-UNIT-BonusService-019 — year %s outside the 2020-2100 range is rejected', async (year) => {
        await expect(bonusService.previewTet(year)).rejects.toThrow('Năm không hợp lệ (2020–2100)');
        await expect(bonusService.generateTet(year, 20)).rejects.toThrow('Năm không hợp lệ (2020–2100)');
    });

    it.each([[2020], [2100]])('TC-UNIT-BonusService-020 — the boundary year %s is accepted', async (year) => {
        bonusRepository.previewTetBonuses.mockResolvedValue([]);

        await bonusService.previewTet(year);

        expect(bonusRepository.previewTetBonuses).toHaveBeenCalledWith(year);
    });

    it('TC-UNIT-BonusService-021 — generated vouchers ask managers to approve', async () => {
        bonusRepository.generateTetBonuses.mockResolvedValue({ inserted: 12 });

        await bonusService.generateTet(2026, 20);

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [10],
            expect.objectContaining({ type: 'BONUS_GENERATED', message: '12 phiếu thưởng Tết 2026 đã tạo, chờ duyệt.' }),
            { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-BonusService-022 — generating nothing does not disturb the managers', async () => {
        bonusRepository.generateTetBonuses.mockResolvedValue({ inserted: 0 });

        await bonusService.generateTet(2026, 20);

        expect(notificationService.createForUsers).not.toHaveBeenCalled();
    });
});

describe('bonusService.getById', () => {
    it('TC-UNIT-BonusService-023 — raises an error instead of returning null when nothing is found', async () => {
        bonusRepository.getById.mockResolvedValue(null);

        await expect(bonusService.getById(99)).rejects.toThrow('Không tìm thấy khoản thưởng/phúc lợi');
    });
});
