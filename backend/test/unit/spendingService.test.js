/**
 * L1 Unit Test — spendingService (phiếu chi 2 cấp + hoàn ứng tài xế)
 *
 * paymentVoucherRepository phải mock bằng factory: automock biến VOUCHER_TYPES /
 * PAYMENT_METHODS thành mảng RỖNG, khiến mọi validate đều rớt và test sẽ "xanh giả"
 * ở các ca từ chối. Giữ nguyên giá trị thật của 2 hằng này mới đo đúng.
 */
jest.mock('../../repositories/paymentVoucherRepository', () => ({
    VOUCHER_TYPES: ['office', 'rent', 'utilities', 'equipment', 'entertainment', 'compensation', 'other'],
    PAYMENT_METHODS: ['cash', 'bank_transfer'],
    VOUCHER_STATUSES: ['pending', 'approved', 'rejected', 'cancelled', 'paid'],
    create: jest.fn(),
    list: jest.fn(),
    getById: jest.fn(),
    listPendingReimbursements: jest.fn(),
    getPendingReimbursement: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
    markPaid: jest.fn(),
    getStats: jest.fn(),
}));
jest.mock('../../repositories/expenseRepository');
jest.mock('../../repositories/financialLedgerRepository');
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
    getUserIdsByRole: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/notificationGateway', () => ({
    broadcastToRole: jest.fn(), broadcastToUser: jest.fn(), notifyCreated: jest.fn(),
}));
jest.mock('../../services/roleNotificationService', () => ({
    notifyRoles: jest.fn().mockResolvedValue([]),
    notifyRolesSafe: jest.fn(),
}));

const voucherRepo = require('../../repositories/paymentVoucherRepository');
const financialLedgerRepository = require('../../repositories/financialLedgerRepository');
const notificationService = require('../../services/notificationService');
const notificationGateway = require('../../services/notificationGateway');
const { notifyRolesSafe } = require('../../services/roleNotificationService');
const spendingService = require('../../services/spendingService');

const PHIEU_HOP_LE = {
    voucher_type: 'office', amount: 1_500_000, payee: '  Công ty Văn phòng phẩm  ',
    reason: '  Mua giấy in  ', payment_method: 'bank_transfer',
};

beforeEach(() => {
    jest.clearAllMocks();
    voucherRepo.create.mockResolvedValue({ id: 70, amount: 1_500_000, payee: 'Công ty Văn phòng phẩm', incident_id: null });
    notificationService.createForUser.mockResolvedValue(undefined);
    notificationService.createForUsers.mockResolvedValue([]);
});

describe('spendingService.createVoucher', () => {
    it('TC-UNIT-SpendingService-001 — a valid voucher is stored with the payee and reason trimmed', async () => {
        await spendingService.createVoucher(PHIEU_HOP_LE, 20);

        expect(voucherRepo.create).toHaveBeenCalledWith({
            voucher_type: 'office',
            amount: 1_500_000,
            payee: 'Công ty Văn phòng phẩm',
            reason: 'Mua giấy in',
            payment_method: 'bank_transfer',
            proof_url: null,
            incident_id: null,
        }, 20, null);
    });

    it('TC-UNIT-SpendingService-002 — defaults to cash when no payment method is chosen', async () => {
        await spendingService.createVoucher({ ...PHIEU_HOP_LE, payment_method: undefined }, 20);

        expect(voucherRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_method: 'cash' }), 20, null,
        );
    });

    it('TC-UNIT-SpendingService-003 — rejects a voucher type outside the catalogue', async () => {
        await expect(spendingService.createVoucher({ ...PHIEU_HOP_LE, voucher_type: 'du_lich' }, 20))
            .rejects.toThrow('Loại phiếu chi không hợp lệ');

        expect(voucherRepo.create).not.toHaveBeenCalled();
    });

    it('TC-UNIT-SpendingService-004 — rejects a zero amount', async () => {
        await expect(spendingService.createVoucher({ ...PHIEU_HOP_LE, amount: 0 }, 20))
            .rejects.toThrow('Số tiền phải lớn hơn 0');

        expect(voucherRepo.create).not.toHaveBeenCalled();
    });

    it('TC-UNIT-SpendingService-005 — rejects a non-finite amount', async () => {
        await expect(spendingService.createVoucher({ ...PHIEU_HOP_LE, amount: 'rất nhiều' }, 20))
            .rejects.toThrow('Số tiền phải lớn hơn 0');
    });

    it('TC-UNIT-SpendingService-006 — rejects a missing payee', async () => {
        await expect(spendingService.createVoucher({ ...PHIEU_HOP_LE, payee: '   ' }, 20))
            .rejects.toThrow('Cần ghi rõ người/đơn vị nhận tiền');
    });

    it('TC-UNIT-SpendingService-007 — rejects a missing reason', async () => {
        await expect(spendingService.createVoucher({ ...PHIEU_HOP_LE, reason: '' }, 20))
            .rejects.toThrow('Cần ghi rõ lý do chi');
    });

    it('TC-UNIT-SpendingService-008 — rejects an unknown payment method', async () => {
        await expect(spendingService.createVoucher({ ...PHIEU_HOP_LE, payment_method: 'momo' }, 20))
            .rejects.toThrow('Hình thức thanh toán không hợp lệ');
    });

    it('TC-UNIT-SpendingService-009 — creation asks managers to approve, excluding the creator', async () => {
        await spendingService.createVoucher(PHIEU_HOP_LE, 20);

        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['manager'],
            expect.objectContaining({ type: 'VOUCHER_CREATED', entityType: 'payment_vouchers', entityId: 70 }),
            { excludeUserId: 20, displayMode: 'alert' },
        );
    });

    it('TC-UNIT-SpendingService-010 — an incident compensation voucher links the notice to the incident, not to the voucher', async () => {
        voucherRepo.create.mockResolvedValue({ id: 70, amount: 500_000, payee: 'Khách A', incident_id: 300 });

        await spendingService.createVoucher({ ...PHIEU_HOP_LE, voucher_type: 'compensation', incident_id: 300 }, 20);

        expect(notifyRolesSafe).toHaveBeenCalledWith(
            ['manager'],
            expect.objectContaining({ entityType: 'incidents', entityId: 300 }),
            expect.anything(),
        );
    });
});

describe('spendingService.createReimbursementVoucher — hoàn ứng tài xế', () => {
    const KHOAN_CHO_HOAN = {
        amount: 350_000, expense_type: 'fuel', driver_id: 5, driver_name: 'Lê Văn Tài',
        plate_number: '51C-123.45', order_id: 900,
    };

    beforeEach(() => {
        voucherRepo.getPendingReimbursement.mockResolvedValue({ ...KHOAN_CHO_HOAN });
        voucherRepo.create.mockResolvedValue({ id: 71, amount: 350_000, payee: 'Lê Văn Tài' });
    });

    it('TC-UNIT-SpendingService-011 — the reimbursed amount is TAKEN FROM THE DATABASE, never from the client', async () => {
        await spendingService.createReimbursementVoucher(
            { expense_id: 61, payment_method: 'cash', amount: 99_000_000 }, 20,
        );

        expect(voucherRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ amount: 350_000, voucher_type: 'driver_reimbursement', expense_id: 61 }), 20,
        );
    });

    it('TC-UNIT-SpendingService-012 — the voucher reason states the expense type, the plate number and the order id', async () => {
        await spendingService.createReimbursementVoucher({ expense_id: 61, notes: '  gấp  ' }, 20);

        expect(voucherRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'Hoàn tiền tài xế đã ứng — xăng dầu (xe 51C-123.45), đơn #900. gấp',
            }), 20,
        );
    });

    it('TC-UNIT-SpendingService-013 — rejects a missing expense id (400)', async () => {
        await expect(spendingService.createReimbursementVoucher({ expense_id: null }, 20))
            .rejects.toMatchObject({ message: 'Thiếu khoản chi phí cần hoàn', statusCode: 400 });

        expect(voucherRepo.getPendingReimbursement).not.toHaveBeenCalled();
    });

    it('TC-UNIT-SpendingService-014 — an already reimbursed expense returns 409, not 500', async () => {
        voucherRepo.getPendingReimbursement.mockResolvedValue(null);

        await expect(spendingService.createReimbursementVoucher({ expense_id: 61 }, 20))
            .rejects.toMatchObject({ statusCode: 409 });

        expect(voucherRepo.create).not.toHaveBeenCalled();
    });

    it('TC-UNIT-SpendingService-015 — two accountants at once: the database unique violation becomes a business 409', async () => {
        voucherRepo.create.mockRejectedValue(Object.assign(new Error('dup key'), { code: '23505' }));

        await expect(spendingService.createReimbursementVoucher({ expense_id: 61 }, 20))
            .rejects.toMatchObject({
                message: 'Khoản này vừa được người khác lập phiếu hoàn ứng rồi', statusCode: 409,
            });
    });

    it('TC-UNIT-SpendingService-016 — any other database error is not swallowed into a 409', async () => {
        voucherRepo.create.mockRejectedValue(new Error('connection reset'));

        await expect(spendingService.createReimbursementVoucher({ expense_id: 61 }, 20))
            .rejects.toThrow('connection reset');
    });

    it('TC-UNIT-SpendingService-017 — rejects an unknown payment method before querying the database', async () => {
        await expect(spendingService.createReimbursementVoucher({ expense_id: 61, payment_method: 'momo' }, 20))
            .rejects.toMatchObject({ statusCode: 400 });

        expect(voucherRepo.getPendingReimbursement).not.toHaveBeenCalled();
    });

    it('TC-UNIT-SpendingService-018 — falls back to the driver id as payee when the driver has no name', async () => {
        voucherRepo.getPendingReimbursement.mockResolvedValue({ ...KHOAN_CHO_HOAN, driver_name: null });

        await spendingService.createReimbursementVoucher({ expense_id: 61 }, 20);

        expect(voucherRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ payee: 'Tài xế #5' }), 20,
        );
    });
});

describe('spendingService.approveVoucher', () => {
    it('TC-UNIT-SpendingService-019 — approving an ordinary voucher notifies the creator and pushes no incident event', async () => {
        voucherRepo.approve.mockResolvedValue({ id: 70, created_by: 20, amount: 1_000_000, payee: 'A', incident_id: null });

        await spendingService.approveVoucher(70, 10);

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            20, expect.objectContaining({ type: 'VOUCHER_APPROVED', entityType: 'payment_vouchers' }), { displayMode: 'toast' },
        );
        expect(notificationGateway.broadcastToRole).not.toHaveBeenCalled();
    });

    it('TC-UNIT-SpendingService-020 — approving a compensation voucher pushes realtime to the coordinator', async () => {
        voucherRepo.approve.mockResolvedValue({ id: 70, created_by: 20, amount: 1_000_000, payee: 'A', incident_id: 300 });

        await spendingService.approveVoucher(70, 10);

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            20, expect.objectContaining({ entityType: 'incidents', entityId: 300 }), { displayMode: 'toast' },
        );
        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('coordinator', {
            type: 'coordinator.incidents.changed', action: 'compensation_approved', incidentId: 300,
        });
    });
});

describe('spendingService.rejectVoucher', () => {
    beforeEach(() => {
        voucherRepo.reject.mockResolvedValue({ id: 70, created_by: 20, amount: 1_000_000, payee: 'A', incident_id: null });
    });

    it('TC-UNIT-SpendingService-021 — a rejection must carry a reason', async () => {
        await expect(spendingService.rejectVoucher(70, 10, '  ')).rejects.toThrow('Cần ghi rõ lý do từ chối');

        expect(voucherRepo.reject).not.toHaveBeenCalled();
    });

    it('TC-UNIT-SpendingService-022 — the reason is trimmed and reported back to the voucher creator', async () => {
        await spendingService.rejectVoucher(70, 10, '  Sai định khoản  ');

        expect(voucherRepo.reject).toHaveBeenCalledWith(70, 10, 'Sai định khoản');
        expect(notificationService.createForUser).toHaveBeenCalledWith(
            20,
            expect.objectContaining({ message: expect.stringContaining('Lý do: Sai định khoản') }),
            { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-SpendingService-023 — rejecting a compensation voucher pushes realtime to the coordinator', async () => {
        voucherRepo.reject.mockResolvedValue({ id: 70, created_by: 20, amount: 1_000, payee: 'A', incident_id: 300 });

        await spendingService.rejectVoucher(70, 10, 'không hợp lệ');

        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('coordinator',
            expect.objectContaining({ action: 'compensation_rejected', incidentId: 300 }));
    });
});

describe('spendingService.cancelVoucher', () => {
    it('TC-UNIT-SpendingService-024 — cancelling a voucher must carry a reason', async () => {
        await expect(spendingService.cancelVoucher(70, 20, '')).rejects.toThrow('Cần ghi rõ lý do huỷ phiếu chi');

        expect(voucherRepo.cancel).not.toHaveBeenCalled();
    });

    it('TC-UNIT-SpendingService-025 — cancelling notifies both the creator and the manager who approved it', async () => {
        voucherRepo.cancel.mockResolvedValue({
            id: 70, created_by: 20, approved_by: 10, amount: 1_000_000, payee: 'A', incident_id: null,
        });

        await spendingService.cancelVoucher(70, 20, 'Ghi nhầm');

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [20, 10], expect.objectContaining({ type: 'VOUCHER_CANCELLED' }), { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-SpendingService-026 — a voucher nobody approved yet notifies only the creator', async () => {
        voucherRepo.cancel.mockResolvedValue({
            id: 70, created_by: 20, approved_by: null, amount: 1_000_000, payee: 'A', incident_id: null,
        });

        await spendingService.cancelVoucher(70, 20, 'Ghi nhầm');

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [20], expect.anything(), expect.anything(),
        );
    });
});

describe('spendingService.payVoucher', () => {
    it('TC-UNIT-SpendingService-027 — paying out notifies the creator and the approver', async () => {
        voucherRepo.markPaid.mockResolvedValue({
            id: 70, created_by: 20, approved_by: 10, amount: 1_000_000, payee: 'A',
            incident_id: null, voucher_type: 'office',
        });

        await spendingService.payVoucher(70, 20, { proofUrl: 'https://cdn/uy-nhiem-chi.jpg' });

        expect(voucherRepo.markPaid).toHaveBeenCalledWith(70, 20, {
            proofUrl: 'https://cdn/uy-nhiem-chi.jpg', paymentMethod: null,
        });
        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [20, 10], expect.objectContaining({ type: 'VOUCHER_PAID' }), { displayMode: 'toast' },
        );
    });

    it('TC-UNIT-SpendingService-028 — a paid reimbursement notifies the reimbursed driver separately', async () => {
        voucherRepo.markPaid.mockResolvedValue({
            id: 71, created_by: 20, approved_by: 10, amount: 350_000, payee: 'Lê Văn Tài',
            incident_id: null, voucher_type: 'driver_reimbursement', expense_driver_id: 5,
        });

        await spendingService.payVoucher(71, 20, {});

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5, expect.objectContaining({ title: 'Đã hoàn tiền bạn ứng' }), { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-SpendingService-029 — an ordinary voucher sends no reimbursement notice to any driver', async () => {
        voucherRepo.markPaid.mockResolvedValue({
            id: 70, created_by: 20, approved_by: 10, amount: 1_000_000, payee: 'A',
            incident_id: null, voucher_type: 'office', expense_driver_id: null,
        });

        await spendingService.payVoucher(70, 20, {});

        expect(notificationService.createForUser).not.toHaveBeenCalled();
    });
});

describe('spendingService.getSpendingSummary', () => {
    it('TC-UNIT-SpendingService-030 — a valid month and year query the financial ledger', async () => {
        financialLedgerRepository.getSpendingSummary.mockResolvedValue({ total: 0 });

        await spendingService.getSpendingSummary({ month: '8', year: '2026' });

        expect(financialLedgerRepository.getSpendingSummary).toHaveBeenCalledWith({ month: 8, year: 2026 });
    });

    // getSpendingSummary KHÔNG khai báo async — nó ném đồng bộ, khác với hầu hết service
    // khác trong dự án (vốn trả promise bị reject). Controller vì thế phải bắt bằng
    // try/catch đồng bộ chứ không .catch() được. Pin lại đúng hành vi hiện tại.
    it.each([[0], [13]])('TC-UNIT-SpendingService-031 — month %i is outside the 1-12 boundary and is rejected (thrown synchronously)', (m) => {
        expect(() => spendingService.getSpendingSummary({ month: m, year: 2026 }))
            .toThrow('Tháng không hợp lệ (1-12)');

        expect(financialLedgerRepository.getSpendingSummary).not.toHaveBeenCalled();
    });

    it('TC-UNIT-SpendingService-032 — a year below the 2020 floor is rejected (thrown synchronously)', () => {
        expect(() => spendingService.getSpendingSummary({ month: 8, year: 2019 }))
            .toThrow('Năm không hợp lệ');

        expect(financialLedgerRepository.getSpendingSummary).not.toHaveBeenCalled();
    });
});
