/**
 * L1 Unit Test — accountantBankTransferService
 *
 * Kế toán xác nhận tiền khách chuyển khoản về công ty. Điểm nghiệp vụ: số tiền THỰC
 * NHẬN có thể lệch số trên phiếu — thiếu thì ghi công nợ khách, thừa thì phân bổ vào
 * nợ cũ — và tài xế phải được báo đúng nội dung tương ứng.
 */
jest.mock('../../repositories/accountantBankTransferRepository');
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
    getUserIdsByRole: jest.fn().mockResolvedValue([]),
}));

const repo = require('../../repositories/accountantBankTransferRepository');
const notificationService = require('../../services/notificationService');
const service = require('../../services/accountantBankTransferService');

beforeEach(() => {
    jest.clearAllMocks();
    repo.getPendingBankTransfers.mockResolvedValue([]);
    repo.countPendingBankTransfers.mockResolvedValue(0);
    repo.confirmBankTransfer.mockResolvedValue({
        receiptId: 800, driverId: 5, action: 'exact',
    });
});

describe('accountantBankTransferService.getPendingBankTransfers', () => {
    it('TC-UNIT-AccountantBankTransferService-001 — defaults to page 1 with 20 rows, an empty search matching everything', async () => {
        repo.countPendingBankTransfers.mockResolvedValue(45);

        const result = await service.getPendingBankTransfers();

        expect(repo.getPendingBankTransfers).toHaveBeenCalledWith({ limit: 20, offset: 0, like: '%%' });
        expect(result.pagination).toEqual({ total: 45, page: 1, limit: 20, totalPages: 3 });
    });

    it('TC-UNIT-AccountantBankTransferService-002 — a limit above 100 is clamped to 100 (upper boundary)', async () => {
        await service.getPendingBankTransfers({ limit: 500 });

        expect(repo.getPendingBankTransfers).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 100 }),
        );
    });

    it('TC-UNIT-AccountantBankTransferService-003 — a negative limit is clamped to 1 (lower boundary)', async () => {
        await service.getPendingBankTransfers({ limit: -5 });

        expect(repo.getPendingBankTransfers).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 1 }),
        );
    });

    it('TC-UNIT-AccountantBankTransferService-004 — page 0 is clamped to page 1', async () => {
        await service.getPendingBankTransfers({ page: 0 });

        expect(repo.getPendingBankTransfers).toHaveBeenCalledWith(
            expect.objectContaining({ offset: 0 }),
        );
    });

    it('TC-UNIT-AccountantBankTransferService-005 — the offset is computed from the page and the limit', async () => {
        await service.getPendingBankTransfers({ page: 3, limit: 10 });

        expect(repo.getPendingBankTransfers).toHaveBeenCalledWith(
            expect.objectContaining({ limit: 10, offset: 20 }),
        );
    });

    it('TC-UNIT-AccountantBankTransferService-006 — the search term is wrapped in wildcards', async () => {
        await service.getPendingBankTransfers({ search: 'ABC' });

        expect(repo.getPendingBankTransfers).toHaveBeenCalledWith(
            expect.objectContaining({ like: '%ABC%' }),
        );
        expect(repo.countPendingBankTransfers).toHaveBeenCalledWith('%ABC%');
    });
});

describe('accountantBankTransferService.confirmBankTransfer', () => {
    it('TC-UNIT-AccountantBankTransferService-007 — confirming the exact amount tells the driver it arrived', async () => {
        await service.confirmBankTransfer(800, 40, { notes: 'đã đối chiếu sao kê', actual_amount: 2_000_000 });

        expect(repo.confirmBankTransfer).toHaveBeenCalledWith(800, 40, {
            notes: 'đã đối chiếu sao kê', actualReceived: 2_000_000,
        });
        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5,
            expect.objectContaining({ type: 'BANK_TRANSFER_CONFIRMED', entityId: 800 }),
            { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-AccountantBankTransferService-008 — a short payment states the shortfall recorded as customer debt', async () => {
        repo.confirmBankTransfer.mockResolvedValue({
            receiptId: 800, driverId: 5, action: 'short', shortfall: 500_000,
        });

        await service.confirmBankTransfer(800, 40, { actual_amount: 1_500_000 });

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5,
            expect.objectContaining({ message: expect.stringContaining('Còn thiếu 500.000đ — đã ghi công nợ khách.') }),
            expect.anything(),
        );
    });

    it('TC-UNIT-AccountantBankTransferService-009 — an overpayment states the excess allocated against older debt', async () => {
        repo.confirmBankTransfer.mockResolvedValue({
            receiptId: 800, driverId: 5, action: 'excess', excess: 300_000,
        });

        await service.confirmBankTransfer(800, 40, { actual_amount: 2_300_000 });

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5,
            expect.objectContaining({ message: expect.stringContaining('Thừa 300.000đ — đã phân bổ vào nợ cũ.') }),
            expect.anything(),
        );
    });

    it('TC-UNIT-AccountantBankTransferService-010 — a receipt with no driver attached sends no notification', async () => {
        repo.confirmBankTransfer.mockResolvedValue({ receiptId: 800, driverId: null, action: 'exact' });

        await service.confirmBankTransfer(800, 40, { actual_amount: 2_000_000 });

        expect(notificationService.createForUser).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AccountantBankTransferService-011 — an actual amount of 0 is still valid (lower boundary)', async () => {
        await service.confirmBankTransfer(800, 40, { actual_amount: 0 });

        expect(repo.confirmBankTransfer).toHaveBeenCalledWith(800, 40,
            expect.objectContaining({ actualReceived: 0 }));
    });

    it('TC-UNIT-AccountantBankTransferService-012 — rejects a negative amount', async () => {
        await expect(service.confirmBankTransfer(800, 40, { actual_amount: -1 }))
            .rejects.toThrow('Vui lòng nhập số tiền thực nhận (>= 0)');

        expect(repo.confirmBankTransfer).not.toHaveBeenCalled();
    });

    it('TC-UNIT-AccountantBankTransferService-013 — rejects a missing actual amount', async () => {
        await expect(service.confirmBankTransfer(800, 40, { actual_amount: undefined }))
            .rejects.toThrow('Vui lòng nhập số tiền thực nhận (>= 0)');

        await expect(service.confirmBankTransfer(800, 40, { actual_amount: null }))
            .rejects.toThrow('Vui lòng nhập số tiền thực nhận (>= 0)');
    });

    it('TC-UNIT-AccountantBankTransferService-014 — rejects a missing receipt id', async () => {
        await expect(service.confirmBankTransfer(null, 40, { actual_amount: 100 }))
            .rejects.toThrow('Receipt ID không hợp lệ');

        expect(repo.confirmBankTransfer).not.toHaveBeenCalled();
    });
});
