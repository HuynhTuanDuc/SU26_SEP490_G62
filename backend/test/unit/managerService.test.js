/**
 * L1 Unit Test — managerService
 *
 * Điểm nghiệp vụ nặng nhất: KÝ DUYỆT KỲ BÁO CÁO là thao tác MỘT CHIỀU. Sau khi ký,
 * getBusinessReport phải trả nguyên bản snapshot đã đóng băng chứ không tính lại —
 * tính lại thì số báo cáo đã ký sẽ tự đổi theo dữ liệu phát sinh sau đó.
 *
 * coordinatorService (66KB) và accountantFinanceService được mock ở mức module để
 * không kéo nguyên cây phụ thuộc vào một unit test.
 */
jest.mock('../../repositories/managerRepository');
jest.mock('../../repositories/accountantReportRepository');
jest.mock('../../repositories/managerReportRepository');
jest.mock('../../repositories/activityLogRepository');
jest.mock('../../services/debtService', () => ({
    getPendingRepayments: jest.fn().mockResolvedValue([]),
    confirmRepayment: jest.fn(),
    rejectRepayment: jest.fn(),
}));
jest.mock('../../services/companyService', () => ({ getCompanyInfo: jest.fn() }));
jest.mock('../../services/coordinatorService', () => ({ getReceiptRequests: jest.fn() }));
jest.mock('../../services/accountantFinanceService', () => ({ getFinanceStats: jest.fn() }));
jest.mock('../../services/notificationGateway', () => ({
    broadcastToRole: jest.fn(), broadcastToUser: jest.fn(), notifyCreated: jest.fn(),
}));
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
    getUserIdsByRole: jest.fn().mockResolvedValue([]),
}));

const managerRepository = require('../../repositories/managerRepository');
const accountantReportRepository = require('../../repositories/accountantReportRepository');
const reportRepo = require('../../repositories/managerReportRepository');
const activityLogRepository = require('../../repositories/activityLogRepository');
const debtService = require('../../services/debtService');
const companyService = require('../../services/companyService');
const coordinatorService = require('../../services/coordinatorService');
const accountantFinanceService = require('../../services/accountantFinanceService');
const notificationGateway = require('../../services/notificationGateway');
const notificationService = require('../../services/notificationService');
const managerService = require('../../services/managerService');

const DOI_TAC_HOP_LE = { company_name: '  Công ty Vận tải ABC  ', payment_term_days: 30, phone: ' 02838 ' };

beforeEach(() => {
    jest.clearAllMocks();
    notificationService.getUserIdsByRole.mockResolvedValue([10, 11]);
    notificationService.createForUsers.mockResolvedValue([]);
    notificationService.createForUser.mockResolvedValue(undefined);
    activityLogRepository.logSafe.mockReturnValue(undefined);
});

describe('managerService.getDashboard', () => {
    beforeEach(() => {
        managerRepository.getOverviewMetrics.mockResolvedValue({ trips: 10 });
        accountantFinanceService.getFinanceStats.mockResolvedValue({ revenue: 100 });
        managerRepository.getSalaryAdvances.mockResolvedValue([{ id: 1 }]);
        debtService.getPendingRepayments.mockResolvedValue([]);
        coordinatorService.getReceiptRequests.mockResolvedValue({ requests: [] });
        companyService.getCompanyInfo.mockResolvedValue({ name: 'LogisCount' });
    });

    it('TC-UNIT-ManagerService-001 — gathers all 6 data sources into a single overview screen', async () => {
        const kq = await managerService.getDashboard();

        expect(managerRepository.getSalaryAdvances).toHaveBeenCalledWith({ status: 'pending', limit: 6 });
        expect(coordinatorService.getReceiptRequests).toHaveBeenCalledWith({ kind: 'requests', status: 'pending' });
        expect(kq).toMatchObject({
            overview: { trips: 10 },
            finance: { revenue: 100 },
            company: { name: 'LogisCount' },
        });
    });

    it('TC-UNIT-ManagerService-002 — each queue shows at most 6 entries', async () => {
        debtService.getPendingRepayments.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ id: i })));
        coordinatorService.getReceiptRequests.mockResolvedValue({
            requests: Array.from({ length: 20 }, (_, i) => ({ id: i })),
        });

        const kq = await managerService.getDashboard();

        expect(kq.queues.debt_repayments).toHaveLength(6);
        expect(kq.queues.receipt_requests).toHaveLength(6);
    });

    it('TC-UNIT-ManagerService-003 — returns an empty object rather than null when company info is missing', async () => {
        companyService.getCompanyInfo.mockResolvedValue(null);

        expect((await managerService.getDashboard()).company).toEqual({});
    });

    it('TC-UNIT-ManagerService-004 — an absent receipt-request payload yields an empty queue instead of a crash', async () => {
        coordinatorService.getReceiptRequests.mockResolvedValue({});

        expect((await managerService.getDashboard()).queues.receipt_requests).toEqual([]);
    });
});

describe('managerService.getBusinessReport — kỳ đã ký thì đóng băng số liệu', () => {
    it('TC-UNIT-ManagerService-005 — a SIGNED-OFF period returns the frozen snapshot and is NOT recomputed', async () => {
        reportRepo.getSignedOffPeriod.mockResolvedValue({
            status: 'signed_off',
            snapshot: { revenue: 500_000_000 },
            signed_off_by_name: 'Trần Quản Lý',
            signed_off_at: '2026-08-01',
            note: 'đã đối chiếu',
        });

        const kq = await managerService.getBusinessReport({ year: 2026, month: 7 });

        expect(reportRepo.getBusinessReport).not.toHaveBeenCalled();
        expect(kq).toMatchObject({
            revenue: 500_000_000,
            meta: { status: 'signed_off', signed_off_by_name: 'Trần Quản Lý' },
        });
    });

    it('TC-UNIT-ManagerService-006 — an unsigned period is computed live and marked open', async () => {
        reportRepo.getSignedOffPeriod.mockResolvedValue(null);
        reportRepo.getBusinessReport.mockResolvedValue({ revenue: 123 });

        const kq = await managerService.getBusinessReport({ year: 2026, month: 8 });

        expect(kq).toEqual({ revenue: 123, meta: { status: 'open' } });
    });
});

describe('managerService.getReportPeriodPreflight — cảnh báo trước khi ký', () => {
    it('TC-UNIT-ManagerService-007 — a signed-off period says so and skips counting unpriced trips', async () => {
        reportRepo.getSignedOffPeriod.mockResolvedValue({ status: 'signed_off', snapshot: {} });

        const kq = await managerService.getReportPeriodPreflight({ year: 2026, month: 7 });

        expect(kq).toEqual({ already_signed_off: true, unpriced_trips: 0, unpriced_estimated_total: 0 });
        expect(reportRepo.getUnpricedShipmentsInPeriod).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ManagerService-008 — an open period counts the unpriced trips that would be left behind', async () => {
        reportRepo.getSignedOffPeriod.mockResolvedValue(null);
        reportRepo.getUnpricedShipmentsInPeriod.mockResolvedValue({ trip_count: '4', estimated_total: '12000000' });

        const kq = await managerService.getReportPeriodPreflight({ year: 2026, month: 8 });

        expect(kq).toEqual({ already_signed_off: false, unpriced_trips: 4, unpriced_estimated_total: 12_000_000 });
    });

    it('TC-UNIT-ManagerService-009 — returns 0 rather than NaN when there is no unpriced trip', async () => {
        reportRepo.getSignedOffPeriod.mockResolvedValue(null);
        reportRepo.getUnpricedShipmentsInPeriod.mockResolvedValue(null);

        expect(await managerService.getReportPeriodPreflight({ year: 2026, month: 8 }))
            .toEqual({ already_signed_off: false, unpriced_trips: 0, unpriced_estimated_total: 0 });
    });
});

describe('managerService.signOffReportPeriod', () => {
    beforeEach(() => {
        reportRepo.getBusinessReport.mockResolvedValue({ revenue: 999 });
        reportRepo.signOffPeriod.mockResolvedValue(true);
        reportRepo.getSignedOffPeriod.mockResolvedValue({
            status: 'signed_off', snapshot: { revenue: 999 }, signed_off_by_name: 'A', signed_off_at: 'x', note: null,
        });
    });

    it('TC-UNIT-ManagerService-010 — signing off freezes exactly the snapshot just computed', async () => {
        await managerService.signOffReportPeriod({ year: 2026, month: 7, actorId: 10, note: 'ok' });

        expect(reportRepo.signOffPeriod).toHaveBeenCalledWith({
            year: 2026, month: 7, snapshot: { revenue: 999 }, actorId: 10, note: 'ok',
        });
    });

    it('TC-UNIT-ManagerService-011 — returns 409 when signing off a period that is already signed', async () => {
        reportRepo.signOffPeriod.mockResolvedValue(false);

        await expect(managerService.signOffReportPeriod({ year: 2026, month: 7, actorId: 10 }))
            .rejects.toMatchObject({ message: 'Kỳ đã được ký duyệt trước đó, không thể ký lại', statusCode: 409 });

        expect(notificationGateway.broadcastToRole).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ManagerService-012 — signing off pushes realtime and notifies the other managers, excluding the signer', async () => {
        await managerService.signOffReportPeriod({ year: 2026, month: 7, actorId: 10 });
        await new Promise(process.nextTick);

        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('manager',
            expect.objectContaining({ section: 'reports', action: 'period_signed_off', year: 2026, month: 7 }));
        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [11],
            expect.objectContaining({ type: 'MANAGER_REPORTS_PERIOD_SIGNED_OFF' }),
            { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-ManagerService-013 — returns the report in signed-off state after signing', async () => {
        const kq = await managerService.signOffReportPeriod({ year: 2026, month: 7, actorId: 10 });

        expect(kq.meta.status).toBe('signed_off');
    });
});

describe('managerService.approveSalaryAdvance', () => {
    beforeEach(() => {
        managerRepository.getSalaryAdvanceById.mockResolvedValue({ id: 77, status: 'pending' });
        managerRepository.approveSalaryAdvance.mockResolvedValue({
            id: 77, driver_id: 5, request_month: 8, request_year: 2026,
        });
    });

    it('TC-UNIT-ManagerService-014 — approval notifies the driver and tells accounting to disburse', async () => {
        await managerService.approveSalaryAdvance(77, 10);
        await new Promise(process.nextTick);

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5, expect.objectContaining({ type: 'SALARY_ADVANCE_APPROVED', entityId: 77 }), { displayMode: 'alert' },
        );
        expect(notificationService.getUserIdsByRole).toHaveBeenCalledWith('accountant');
        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [10, 11],
            expect.objectContaining({ type: 'SALARY_ADVANCE_DISBURSE_NEEDED' }),
            { displayMode: 'toast' },
        );
    });

    it('TC-UNIT-ManagerService-015 — reports an error when the request does not exist', async () => {
        managerRepository.getSalaryAdvanceById.mockResolvedValue(null);

        await expect(managerService.approveSalaryAdvance(77, 10))
            .rejects.toThrow('Yêu cầu ứng lương không tồn tại');

        expect(managerRepository.approveSalaryAdvance).not.toHaveBeenCalled();
    });

    it.each([['approved'], ['rejected'], ['disbursed']])(
        'TC-UNIT-ManagerService-016 — a request already in state %s cannot be approved again',
        async (trangThai) => {
            managerRepository.getSalaryAdvanceById.mockResolvedValue({ id: 77, status: trangThai });

            await expect(managerService.approveSalaryAdvance(77, 10))
                .rejects.toThrow('Yêu cầu ứng lương này đã được xử lý');

            expect(managerRepository.approveSalaryAdvance).not.toHaveBeenCalled();
        },
    );

    it('TC-UNIT-ManagerService-017 — reports an error and sends no notification when the repository updates nothing', async () => {
        managerRepository.approveSalaryAdvance.mockResolvedValue(null);

        await expect(managerService.approveSalaryAdvance(77, 10))
            .rejects.toThrow('Không thể cập nhật yêu cầu ứng lương');

        expect(notificationService.createForUser).not.toHaveBeenCalled();
    });
});

describe('managerService.rejectSalaryAdvance', () => {
    beforeEach(() => {
        managerRepository.getSalaryAdvanceById.mockResolvedValue({ id: 77, status: 'pending' });
        managerRepository.rejectSalaryAdvance.mockResolvedValue({
            id: 77, driver_id: 5, reject_reason: 'Chưa đủ điều kiện',
        });
    });

    it('TC-UNIT-ManagerService-018 — trims the rejection reason before saving it', async () => {
        await managerService.rejectSalaryAdvance(77, 10, '  Chưa đủ điều kiện  ');

        expect(managerRepository.rejectSalaryAdvance).toHaveBeenCalledWith(77, 10, 'Chưa đủ điều kiện');
    });

    it('TC-UNIT-ManagerService-019 — stores null instead of an empty string when no reason is given', async () => {
        await managerService.rejectSalaryAdvance(77, 10, '   ');

        expect(managerRepository.rejectSalaryAdvance).toHaveBeenCalledWith(77, 10, null);
    });

    it('TC-UNIT-ManagerService-020 — a reason is carried into the notification sent to the driver', async () => {
        await managerService.rejectSalaryAdvance(77, 10, 'Chưa đủ điều kiện');

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5,
            expect.objectContaining({ message: 'Manager đã từ chối yêu cầu ứng lương: Chưa đủ điều kiện' }),
            { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-ManagerService-021 — falls back to the default wording when no reason is given', async () => {
        managerRepository.rejectSalaryAdvance.mockResolvedValue({ id: 77, driver_id: 5, reject_reason: null });

        await managerService.rejectSalaryAdvance(77, 10, null);

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5,
            expect.objectContaining({ message: 'Manager đã từ chối yêu cầu ứng lương của bạn.' }),
            { displayMode: 'alert' },
        );
    });
});

describe('managerService — chuẩn hoá thông tin đối tác', () => {
    beforeEach(() => {
        managerRepository.createPartner.mockResolvedValue({ id: 50, company_name: 'Công ty Vận tải ABC' });
        managerRepository.getPartnerById.mockResolvedValue({ id: 50, company_name: 'Cũ' });
        managerRepository.updatePartner.mockResolvedValue({ id: 50, company_name: 'Công ty Vận tải ABC' });
    });

    it('TC-UNIT-ManagerService-022 — trims the partner name and turns blank fields into null', async () => {
        await managerService.createPartner({ ...DOI_TAC_HOP_LE, short_name: '   ', email: '' }, 10);

        expect(managerRepository.createPartner).toHaveBeenCalledWith(expect.objectContaining({
            companyName: 'Công ty Vận tải ABC',
            shortName: null,
            email: null,
            phone: '02838',
            paymentTermDays: 30,
        }));
    });

    it('TC-UNIT-ManagerService-023 — rejects a missing partner name', async () => {
        await expect(managerService.createPartner({ company_name: '   ' }, 10))
            .rejects.toThrow('Tên đối tác là bắt buộc');

        expect(managerRepository.createPartner).not.toHaveBeenCalled();
    });

    it.each([[0], [365]])('TC-UNIT-ManagerService-024 — a payment term of %i days is a valid boundary', async (ngay) => {
        await managerService.createPartner({ ...DOI_TAC_HOP_LE, payment_term_days: ngay }, 10);

        expect(managerRepository.createPartner).toHaveBeenCalledWith(
            expect.objectContaining({ paymentTermDays: ngay }),
        );
    });

    it.each([[-1], [366], [30.5]])('TC-UNIT-ManagerService-025 — a payment term of %s is rejected', async (ngay) => {
        await expect(managerService.createPartner({ ...DOI_TAC_HOP_LE, payment_term_days: ngay }, 10))
            .rejects.toThrow('Hạn thanh toán không hợp lệ');

        expect(managerRepository.createPartner).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ManagerService-026 — stores null when the payment term is left blank', async () => {
        await managerService.createPartner({ company_name: 'ABC', payment_term_days: '' }, 10);

        expect(managerRepository.createPartner).toHaveBeenCalledWith(
            expect.objectContaining({ paymentTermDays: null }),
        );
    });

    it('TC-UNIT-ManagerService-027 — creating a partner writes an activity log entry and pushes realtime', async () => {
        await managerService.createPartner(DOI_TAC_HOP_LE, 10);

        expect(activityLogRepository.logSafe).toHaveBeenCalledWith(expect.objectContaining({
            userId: 10, action: 'partner_create', entityType: 'partner', entityId: 50,
        }));
        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('manager',
            expect.objectContaining({ type: 'manager.partners.changed', action: 'created', partnerId: 50 }));
    });

    it('TC-UNIT-ManagerService-028 — updating a partner logs both the old and the new values', async () => {
        managerRepository.getPartnerById.mockResolvedValue({
            id: 50, company_name: 'Tên Cũ', phone: '0111', tax_code: 'T1', payment_term_days: 15,
        });

        await managerService.updatePartner(50, DOI_TAC_HOP_LE, 10);

        expect(activityLogRepository.logSafe).toHaveBeenCalledWith(expect.objectContaining({
            action: 'partner_update',
            oldData: expect.objectContaining({ company_name: 'Tên Cũ', payment_term_days: 15 }),
            newData: expect.objectContaining({ company_name: 'Công ty Vận tải ABC' }),
        }));
    });

    it('TC-UNIT-ManagerService-029 — reports an error and writes nothing when the partner does not exist', async () => {
        managerRepository.getPartnerById.mockResolvedValue(null);

        await expect(managerService.updatePartner(50, DOI_TAC_HOP_LE, 10))
            .rejects.toThrow('Đối tác không tồn tại');

        expect(managerRepository.updatePartner).not.toHaveBeenCalled();
        expect(activityLogRepository.logSafe).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ManagerService-030 — reports an error when the repository updates nothing', async () => {
        managerRepository.updatePartner.mockResolvedValue(null);

        await expect(managerService.updatePartner(50, DOI_TAC_HOP_LE, 10))
            .rejects.toThrow('Không thể cập nhật đối tác');
    });
});

describe('managerService.listPartners', () => {
    beforeEach(() => {
        managerRepository.getPartnerSummary.mockResolvedValue({ total_debt: 0 });
    });

    it('TC-UNIT-ManagerService-031 — the string hasDebt filter is coerced into a boolean', async () => {
        managerRepository.listPartners.mockResolvedValue({ rows: [], total: 0, page: 1, limit: 20, totalPages: 0 });

        await managerService.listPartners({ hasDebt: 'true' });
        expect(managerRepository.listPartners).toHaveBeenCalledWith(expect.objectContaining({ hasDebt: true }));

        await managerService.listPartners({ hasDebt: 'false' });
        expect(managerRepository.listPartners).toHaveBeenCalledWith(expect.objectContaining({ hasDebt: false }));
    });

    it('TC-UNIT-ManagerService-032 — omitting hasDebt applies no filter (null)', async () => {
        managerRepository.listPartners.mockResolvedValue({ rows: [], total: 0, page: 1, limit: 20, totalPages: 0 });

        await managerService.listPartners({});

        expect(managerRepository.listPartners).toHaveBeenCalledWith(expect.objectContaining({ hasDebt: null }));
    });

    it('TC-UNIT-ManagerService-033 — a plain array from the repository carries no pagination block', async () => {
        managerRepository.listPartners.mockResolvedValue([{ id: 50 }]);

        const kq = await managerService.listPartners({});

        expect(kq).toEqual({ partners: [{ id: 50 }], summary: { total_debt: 0 } });
        expect(kq).not.toHaveProperty('pagination');
    });

    it('TC-UNIT-ManagerService-034 — a paginated result from the repository carries the page information', async () => {
        managerRepository.listPartners.mockResolvedValue({
            rows: [{ id: 50 }], total: 45, page: 2, limit: 20, totalPages: 3,
        });

        const kq = await managerService.listPartners({ page: 2 });

        expect(kq.pagination).toEqual({ total: 45, page: 2, limit: 20, totalPages: 3 });
    });
});

describe('managerService — công nợ và phiếu thu uỷ quyền sang service khác', () => {
    it('TC-UNIT-ManagerService-035 — confirming a debt repayment pushes realtime with the driver and debt ids', async () => {
        debtService.confirmRepayment.mockResolvedValue({ driverId: 5, debtId: 30 });

        await managerService.confirmDebtRepayment(88, 10);

        expect(debtService.confirmRepayment).toHaveBeenCalledWith(88, 10);
        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('manager',
            expect.objectContaining({ section: 'debt_repayments', action: 'confirmed', paymentId: 88, driverId: 5 }));
    });

    it('TC-UNIT-ManagerService-036 — rejecting a debt repayment pushes realtime as well', async () => {
        debtService.rejectRepayment.mockResolvedValue({ driverId: 5, debtId: 30 });

        await managerService.rejectDebtRepayment(88, 10, 'ảnh mờ');

        expect(debtService.rejectRepayment).toHaveBeenCalledWith(88, 10, 'ảnh mờ');
        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('manager',
            expect.objectContaining({ action: 'rejected' }));
    });

    it('TC-UNIT-ManagerService-037 — reading receipt requests defaults to kind = requests', async () => {
        coordinatorService.getReceiptRequests.mockResolvedValue({ requests: [] });

        await managerService.getReceiptRequests({ status: 'pending' });

        expect(coordinatorService.getReceiptRequests).toHaveBeenCalledWith({ status: 'pending', kind: 'requests' });
    });

    it('TC-UNIT-ManagerService-038 — an explicit kind is honoured', async () => {
        coordinatorService.getReceiptRequests.mockResolvedValue({ requests: [] });

        await managerService.getReceiptRequests({ kind: 'receipts' });

        expect(coordinatorService.getReceiptRequests).toHaveBeenCalledWith({ kind: 'receipts' });
    });
});

describe('managerService.notifyPartnerPaymentRecorded', () => {
    it('TC-UNIT-ManagerService-039 — the partner payment notice carries the partner name and the amount', async () => {
        managerRepository.getPartnerById.mockResolvedValue({ id: 50, company_name: 'Công ty ABC' });

        await managerService.notifyPartnerPaymentRecorded(50, 5_000_000, 10);
        await new Promise(process.nextTick);

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [11],
            expect.objectContaining({ message: 'Kế toán đã ghi nhận thanh toán 5.000.000đ cho đối tác "Công ty ABC".' }),
            { displayMode: 'toast' },
        );
    });

    it('TC-UNIT-ManagerService-040 — falls back to the partner id instead of printing undefined when the partner is not found', async () => {
        managerRepository.getPartnerById.mockResolvedValue(null);

        await managerService.notifyPartnerPaymentRecorded(50, 1_000, 10);
        await new Promise(process.nextTick);

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [11],
            expect.objectContaining({ message: expect.stringContaining('"#50"') }),
            expect.anything(),
        );
    });
});
