const { mock } = require('./helpers/nodeTestMock');
const assert = require('node:assert');

const managerRepository = require('../repositories/managerRepository');
const debtService = require('../services/debtService');
const companyService = require('../services/companyService');
const coordinatorService = require('../services/coordinatorService');
const accountantFinanceService = require('../services/accountantFinanceService');
const notificationGateway = require('../services/notificationGateway');
const notificationService = require('../services/notificationService');
const managerService = require('../services/managerService');

describe('Manager Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    it('getDashboard() aggregates overview, finance, queues, and company info in parallel', async () => {
        mock.method(managerRepository, 'getOverviewMetrics', async () => ({ workforce: {} }));
        mock.method(accountantFinanceService, 'getFinanceStats', async () => ({ revenue: 100 }));
        mock.method(managerRepository, 'getSalaryAdvances', async () => ([{ id: 1 }]));
        mock.method(debtService, 'getPendingRepayments', async () => (Array.from({ length: 10 }, (_, i) => ({ id: i }))));
        mock.method(coordinatorService, 'getReceiptRequests', async () => ({ requests: [{ id: 5 }] }));
        mock.method(companyService, 'getCompanyInfo', async () => ({ name: 'ACME' }));

        const dashboard = await managerService.getDashboard();

        assert.deepStrictEqual(dashboard.overview, { workforce: {} });
        assert.deepStrictEqual(dashboard.finance, { revenue: 100 });
        assert.deepStrictEqual(dashboard.queues.salary_advances, [{ id: 1 }]);
        assert.strictEqual(dashboard.queues.debt_repayments.length, 6);
        assert.deepStrictEqual(dashboard.queues.receipt_requests, [{ id: 5 }]);
        assert.deepStrictEqual(dashboard.company, { name: 'ACME' });
    });

    it('getDashboard() defaults company to {} when getCompanyInfo resolves nullish', async () => {
        mock.method(managerRepository, 'getOverviewMetrics', async () => ({}));
        mock.method(accountantFinanceService, 'getFinanceStats', async () => ({}));
        mock.method(managerRepository, 'getSalaryAdvances', async () => ([]));
        mock.method(debtService, 'getPendingRepayments', async () => ([]));
        mock.method(coordinatorService, 'getReceiptRequests', async () => ({ requests: [] }));
        mock.method(companyService, 'getCompanyInfo', async () => null);

        const dashboard = await managerService.getDashboard();
        assert.deepStrictEqual(dashboard.company, {});
    });

    it('listSalaryAdvances() passes through status/limit filters to the repository', async () => {
        mock.method(managerRepository, 'getSalaryAdvances', async (filters) => filters);

        const result = await managerService.listSalaryAdvances({ status: 'pending', limit: 5 });
        assert.deepStrictEqual(result, { status: 'pending', limit: 5 });
    });

    it('approveSalaryAdvance() rejects when the request does not exist', async () => {
        mock.method(managerRepository, 'getSalaryAdvanceById', async () => null);

        await assert.rejects(
            () => managerService.approveSalaryAdvance(1, 2),
            { message: 'Yêu cầu ứng lương không tồn tại' },
        );
    });

    it('approveSalaryAdvance() rejects when the request is not pending', async () => {
        mock.method(managerRepository, 'getSalaryAdvanceById', async () => ({ id: 1, status: 'approved' }));

        await assert.rejects(
            () => managerService.approveSalaryAdvance(1, 2),
            { message: 'Yêu cầu ứng lương này đã được xử lý' },
        );
    });

    it('approveSalaryAdvance() broadcasts and notifies the driver + accountants on success', async () => {
        mock.method(managerRepository, 'getSalaryAdvanceById', async () => ({ id: 1, status: 'pending' }));
        mock.method(managerRepository, 'approveSalaryAdvance', async () => ({ id: 1, driver_id: 7, request_month: 5, request_year: 2025 }));
        mock.method(notificationGateway, 'broadcastToRole', () => {});
        mock.method(notificationService, 'createForUser', async () => ({}));
        mock.method(notificationService, 'getUserIdsByRole', async () => ([3, 4]));
        mock.method(notificationService, 'createForUsers', async () => ([]));

        const result = await managerService.approveSalaryAdvance(1, 2);

        assert.strictEqual(result.id, 1);
        assert.deepStrictEqual(notificationGateway.broadcastToRole.mock.calls[0].arguments[0], 'manager');
        assert.strictEqual(notificationService.createForUser.mock.calls[0].arguments[0], 7);
        assert.strictEqual(notificationService.getUserIdsByRole.mock.calls[0].arguments[0], 'accountant');
    });

    it('approveSalaryAdvance() rejects when the repository update fails to return a row', async () => {
        mock.method(managerRepository, 'getSalaryAdvanceById', async () => ({ id: 1, status: 'pending' }));
        mock.method(managerRepository, 'approveSalaryAdvance', async () => null);

        await assert.rejects(
            () => managerService.approveSalaryAdvance(1, 2),
            { message: 'Không thể cập nhật yêu cầu ứng lương' },
        );
    });

    it('rejectSalaryAdvance() rejects when the request does not exist', async () => {
        mock.method(managerRepository, 'getSalaryAdvanceById', async () => null);

        await assert.rejects(
            () => managerService.rejectSalaryAdvance(1, 2, 'reason'),
            { message: 'Yêu cầu ứng lương không tồn tại' },
        );
    });

    it('rejectSalaryAdvance() broadcasts and notifies the driver on success', async () => {
        mock.method(managerRepository, 'getSalaryAdvanceById', async () => ({ id: 1, status: 'pending' }));
        mock.method(managerRepository, 'rejectSalaryAdvance', async () => ({ id: 1, driver_id: 7, reject_reason: 'no budget' }));
        mock.method(notificationGateway, 'broadcastToRole', () => {});
        mock.method(notificationService, 'createForUser', async () => ({}));

        const result = await managerService.rejectSalaryAdvance(1, 2, '  no budget  ');

        assert.strictEqual(result.id, 1);
        assert.strictEqual(managerRepository.rejectSalaryAdvance.mock.calls[0].arguments[2], 'no budget');
        assert.match(notificationService.createForUser.mock.calls[0].arguments[1].message, /no budget/);
    });

    it('getPendingDebtRepayments() delegates to debtService', async () => {
        mock.method(debtService, 'getPendingRepayments', async () => ([{ id: 1 }]));

        const result = await managerService.getPendingDebtRepayments();
        assert.deepStrictEqual(result, [{ id: 1 }]);
    });

    it('confirmDebtRepayment() confirms via debtService and broadcasts the workflow change', async () => {
        mock.method(debtService, 'confirmRepayment', async () => ({ driverId: 7, debtId: 3 }));
        mock.method(notificationGateway, 'broadcastToRole', () => {});

        const result = await managerService.confirmDebtRepayment(1, 2);

        assert.deepStrictEqual(result, { driverId: 7, debtId: 3 });
        const [role, payload] = notificationGateway.broadcastToRole.mock.calls[0].arguments;
        assert.strictEqual(role, 'manager');
        assert.strictEqual(payload.section, 'debt_repayments');
        assert.strictEqual(payload.action, 'confirmed');
    });

    it('rejectDebtRepayment() rejects via debtService and broadcasts the workflow change', async () => {
        mock.method(debtService, 'rejectRepayment', async () => ({ driverId: 7, debtId: 3 }));
        mock.method(notificationGateway, 'broadcastToRole', () => {});

        await managerService.rejectDebtRepayment(1, 2, 'invalid proof');

        const [, payload] = notificationGateway.broadcastToRole.mock.calls[0].arguments;
        assert.strictEqual(payload.action, 'rejected');
    });

    it('getReceiptRequests() defaults kind to "requests" when not specified', async () => {
        mock.method(coordinatorService, 'getReceiptRequests', async (query) => query);

        const result = await managerService.getReceiptRequests({ status: 'pending' });
        assert.strictEqual(result.kind, 'requests');
        assert.strictEqual(result.status, 'pending');
    });

    it('getReceiptRequests() honors an explicit kind', async () => {
        mock.method(coordinatorService, 'getReceiptRequests', async (query) => query);

        const result = await managerService.getReceiptRequests({ kind: 'receipts' });
        assert.strictEqual(result.kind, 'receipts');
    });

    it('listPartners() combines partner list and summary', async () => {
        mock.method(managerRepository, 'listPartners', async () => ([{ id: 1 }]));
        mock.method(managerRepository, 'getPartnerSummary', async () => ({ total_partners: 1 }));

        const result = await managerService.listPartners({ search: 'acme' });
        assert.deepStrictEqual(result, { partners: [{ id: 1 }], summary: { total_partners: 1 } });
    });

    it('createPartner() rejects when company_name is missing', async () => {
        await assert.rejects(
            () => managerService.createPartner({}),
            { message: 'Tên đối tác là bắt buộc' },
        );
    });

    it('createPartner() rejects an out-of-range payment_term_days', async () => {
        await assert.rejects(
            () => managerService.createPartner({ company_name: 'ACME', payment_term_days: 400 }),
            { message: 'Hạn thanh toán không hợp lệ' },
        );
    });

    it('createPartner() normalizes payload and broadcasts a partner-created event', async () => {
        mock.method(managerRepository, 'createPartner', async (payload) => ({ id: 1, ...payload }));
        mock.method(notificationGateway, 'broadcastToRole', () => {});

        const partner = await managerService.createPartner({ company_name: '  ACME Corp  ', payment_term_days: '30' });

        assert.strictEqual(partner.companyName, 'ACME Corp');
        assert.strictEqual(partner.paymentTermDays, 30);
        const [role, payload] = notificationGateway.broadcastToRole.mock.calls[0].arguments;
        assert.strictEqual(role, 'manager');
        assert.strictEqual(payload.action, 'created');
    });

    it('updatePartner() rejects when the partner does not exist', async () => {
        mock.method(managerRepository, 'getPartnerById', async () => null);

        await assert.rejects(
            () => managerService.updatePartner(999, { company_name: 'ACME' }),
            { message: 'Đối tác không tồn tại' },
        );
    });

    it('updatePartner() updates and broadcasts on success', async () => {
        mock.method(managerRepository, 'getPartnerById', async () => ({ id: 1 }));
        mock.method(managerRepository, 'updatePartner', async (id, payload) => ({ id, ...payload }));
        mock.method(notificationGateway, 'broadcastToRole', () => {});

        const partner = await managerService.updatePartner(1, { company_name: 'ACME Updated' });

        assert.strictEqual(partner.companyName, 'ACME Updated');
        assert.strictEqual(notificationGateway.broadcastToRole.mock.calls[0].arguments[1].action, 'updated');
    });

    it('getPartnerDebtDetails() rejects when the partner does not exist', async () => {
        mock.method(managerRepository, 'getPartnerById', async () => null);

        await assert.rejects(
            () => managerService.getPartnerDebtDetails(999),
            { message: 'Đối tác không tồn tại' },
        );
    });

    it('getPartnerDebtDetails() returns partner info alongside its debts', async () => {
        mock.method(managerRepository, 'getPartnerById', async () => ({ id: 1, company_name: 'ACME' }));
        mock.method(managerRepository, 'getPartnerDebtDetails', async () => ([{ id: 10, remaining: '500000' }]));

        const result = await managerService.getPartnerDebtDetails(1);
        assert.strictEqual(result.partner.company_name, 'ACME');
        assert.strictEqual(result.debts.length, 1);
    });
});
