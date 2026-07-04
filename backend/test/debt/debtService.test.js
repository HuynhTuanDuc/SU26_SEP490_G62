const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const debtRepository = require('../../repositories/debtRepository');
const pool = require('../../config/database');
const notificationGateway = require('../../services/notificationGateway');

const debtService = require('../../services/debtService');

describe('Debt Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    describe('getMyDebts() / getMyDebtSummary() / getDebtPayments()', () => {
        it('passes status filter through to the repository', async () => {
            mock.method(debtRepository, 'getDriverDebts', async (driverId, { status }) => {
                assert.strictEqual(driverId, 1);
                assert.strictEqual(status, 'outstanding');
                return [];
            });

            await debtService.getMyDebts(1, { status: 'outstanding' });
        });

        it('returns the dynamically-computed debt summary', async () => {
            mock.method(debtRepository, 'getDriverDebtSummary', async () => ({ total_outstanding: '5000000' }));

            const result = await debtService.getMyDebtSummary(1);

            assert.strictEqual(result.total_outstanding, '5000000');
        });

        it('scopes payment history to the requesting driver', async () => {
            mock.method(debtRepository, 'getDebtPayments', async (debtId, driverId) => {
                assert.strictEqual(debtId, 10);
                assert.strictEqual(driverId, 1);
                return [];
            });

            await debtService.getDebtPayments(1, 10);
        });
    });

    describe('submitRepayment() — BR-020 allows multiple partial payments', () => {
        it('rejects a non-positive amount', async () => {
            await assert.rejects(
                () => debtService.submitRepayment(1, 10, { amount: 0 }, 'url'),
                { message: 'Số tiền phải lớn hơn 0' },
            );
        });

        it('requires a receipt photo', async () => {
            await assert.rejects(
                () => debtService.submitRepayment(1, 10, { amount: 100000 }, null),
                { message: 'Ảnh chứng từ là bắt buộc' },
            );
        });

        it('rejects an invalid payment method', async () => {
            await assert.rejects(
                () => debtService.submitRepayment(1, 10, { amount: 100000, paymentMethod: 'crypto' }, 'url'),
                { message: 'Hình thức thanh toán không hợp lệ' },
            );
        });

        it('submits a valid partial repayment', async () => {
            mock.method(debtRepository, 'submitRepayment', async (driverId, debtId, opts) => {
                assert.strictEqual(opts.amount, 300000);
                assert.strictEqual(opts.paymentMethod, 'bank_transfer');
                return { id: 1, status: 'pending' };
            });

            const result = await debtService.submitRepayment(1, 10, { amount: 300000, paymentMethod: 'bank_transfer' }, 'url');

            assert.strictEqual(result.status, 'pending');
        });
    });

    describe('cancelRepayment()', () => {
        it('delegates to the repository scoped by driver', async () => {
            mock.method(debtRepository, 'cancelRepayment', async (driverId, paymentId) => {
                assert.strictEqual(driverId, 1);
                assert.strictEqual(paymentId, 5);
                return { id: 5, status: 'cancelled' };
            });

            const result = await debtService.cancelRepayment(1, 5);

            assert.strictEqual(result.status, 'cancelled');
        });
    });

    describe('confirmRepayment() / rejectRepayment() — accountant actions', () => {
        // Note: debtService destructures `{ broadcastToUser }` from notificationGateway at
        // require-time, so mock.method(notificationGateway, 'broadcastToUser', ...) cannot
        // intercept that already-bound reference. broadcastToUser() itself is a no-op when no
        // WebSocket client is connected for that user (see notificationGateway.js), so it is
        // safe to let the real implementation run here; we assert on the returned data instead.
        it('confirms a repayment and returns the repository result', async () => {
            mock.method(debtRepository, 'confirmRepayment', async (paymentId, confirmedBy) => {
                assert.strictEqual(paymentId, 5);
                assert.strictEqual(confirmedBy, 99);
                return { driverId: 1, debtId: 10 };
            });

            const result = await debtService.confirmRepayment(5, 99);

            assert.deepStrictEqual(result, { driverId: 1, debtId: 10 });
        });

        it('rejects a repayment with a reason and returns the repository result', async () => {
            mock.method(debtRepository, 'rejectRepayment', async (paymentId, rejectedBy, reason) => {
                assert.strictEqual(reason, 'Ảnh không rõ');
                return { driverId: 1, debtId: 10 };
            });

            const result = await debtService.rejectRepayment(5, 99, 'Ảnh không rõ');

            assert.deepStrictEqual(result, { driverId: 1, debtId: 10 });
        });

        it('handles a null rejectRepayment result without throwing', async () => {
            mock.method(debtRepository, 'rejectRepayment', async () => null);

            const result = await debtService.rejectRepayment(5, 99, 'reason');

            assert.strictEqual(result, null);
        });
    });

    describe('getPendingRepayments() — accountant queue', () => {
        it('returns pending driver-debt repayments awaiting confirmation', async () => {
            mock.method(pool, 'query', async (sql) => {
                assert.ok(sql.includes(`dp.status = 'pending'`));
                assert.ok(sql.includes(`d.debt_type = 'driver'`));
                return { rows: [{ id: 1, amount: '300000' }] };
            });

            const result = await debtService.getPendingRepayments();

            assert.strictEqual(result.length, 1);
        });
    });
});
