import { tripService } from '@/services/trip-service';
import { apiClient }   from '@/lib/api-client';
import { ApiError }    from '@/lib/api-error';

jest.mock('@/lib/api-client');

const mockApi = apiClient as jest.Mocked<typeof apiClient>;

describe('tripService', () => {
    beforeEach(() => jest.clearAllMocks());

    // ── Pool ──────────────────────────────────────────────────────────────────

    describe('getPool', () => {
        it('G62-FE-27: getPool(1,5) → GET /api/trips/pool?page=1&limit=5', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ trips: [{ id: 1 }], total: 1, page: 1 });

            const result = await tripService.getPool(1, 5);

            expect(mockApi.get).toHaveBeenCalledWith('/api/trips/pool?page=1&limit=5');
            expect(result.trips.length).toBe(1);
        });

        it('G62-FE-28: getPool với vehicleGroupId=3 → URL có vehicleGroupId=3', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ trips: [], total: 0 });

            await tripService.getPool(1, 5, 3);

            const url: string = (mockApi.get as jest.Mock).mock.calls[0][0];
            expect(url).toContain('vehicleGroupId=3');
        });

        it('G62-FE-29: getPool không có trip → trips=[], total=0, không crash', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ trips: [], total: 0, page: 1, totalPages: 0 });

            const result = await tripService.getPool();

            expect(result.trips).toEqual([]);
            expect(result.total).toBe(0);
        });

        it('G62-FE-30: getPoolShipmentDetail(7) → GET /api/trips/pool-shipment/7', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ id: 7 });

            await tripService.getPoolShipmentDetail(7);

            expect(mockApi.get).toHaveBeenCalledWith('/api/trips/pool-shipment/7');
        });
    });

    // ── Claim / Release ───────────────────────────────────────────────────────

    describe('claim', () => {
        it('G62-FE-31: claim(5) → POST /api/trips/5/claim thành công', async () => {
            mockApi.post = jest.fn().mockResolvedValue({ message: 'OK', shipment: { id: 5 } });

            const result = await tripService.claim(5);

            expect(mockApi.post).toHaveBeenCalledWith('/api/trips/5/claim', {});
            expect(result.message).toBe('OK');
        });

        it('G62-FE-32: claim 409 → driver đang có active trip → reject ApiError 409', async () => {
            mockApi.post = jest.fn().mockRejectedValue(new ApiError('Đã có chuyến đang thực hiện', 409));

            const err = await tripService.claim(5).catch(e => e);

            expect(err).toBeInstanceOf(ApiError);
            expect(err.status).toBe(409);
        });
    });

    describe('releaseTrip', () => {
        it('G62-FE-33: releaseTrip(5, reason) → POST /api/trips/5/release', async () => {
            mockApi.post = jest.fn().mockResolvedValue({ message: 'Released' });

            await tripService.releaseTrip(5, 'Xe hỏng');

            expect(mockApi.post).toHaveBeenCalledWith('/api/trips/5/release', { reason: 'Xe hỏng' });
        });
    });

    describe('cancelDelivery', () => {
        it('G62-FE-34: cancelDelivery(5, reason) → POST /api/trips/5/cancel-delivery', async () => {
            mockApi.post = jest.fn().mockResolvedValue({ message: 'Cancelled' });

            await tripService.cancelDelivery(5, 'Khách từ chối');

            expect(mockApi.post).toHaveBeenCalledWith('/api/trips/5/cancel-delivery', { reason: 'Khách từ chối' });
        });
    });

    // ── Status / Proof ────────────────────────────────────────────────────────

    describe('getActiveTrip', () => {
        it('G62-FE-35: getActiveTrip → GET /api/trips/active trả về trip', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ shipment: { id: 1, status: 'CLAIMED' } });

            const result = await tripService.getActiveTrip();

            expect(mockApi.get).toHaveBeenCalledWith('/api/trips/active');
            expect(result.shipment).toBeTruthy();
        });

        it('G62-FE-36: getActiveTrip không có trip → 404 reject', async () => {
            mockApi.get = jest.fn().mockRejectedValue(new ApiError('Not found', 404));

            const err = await tripService.getActiveTrip().catch(e => e);

            expect(err).toBeInstanceOf(ApiError);
            expect(err.status).toBe(404);
        });
    });

    describe('updateStatus', () => {
        it('G62-FE-37: updateStatus(5,"PICKING") → PATCH /api/trips/5/status body.status=PICKING', async () => {
            mockApi.patch = jest.fn().mockResolvedValue({ message: 'OK', status: 'PICKING' });

            await tripService.updateStatus(5, 'PICKING');

            expect(mockApi.patch).toHaveBeenCalledWith(
                '/api/trips/5/status',
                { status: 'PICKING', reason: undefined },
            );
        });
    });

    describe('submitLoadingProof', () => {
        it('G62-FE-38: submitLoadingProof(5, formData) → POST /api/trips/5/start-transit', async () => {
            mockApi.postForm = jest.fn().mockResolvedValue({ message: 'OK', status: 'transit' });

            await tripService.submitLoadingProof(5, new FormData());

            expect(mockApi.postForm).toHaveBeenCalledWith('/api/trips/5/start-transit', expect.any(FormData));
        });
    });

    describe('completeWithProof', () => {
        it('G62-FE-39: completeWithProof(5, formData) → POST /api/trips/5/complete', async () => {
            mockApi.postForm = jest.fn().mockResolvedValue({ message: 'OK', status: 'COMPLETED' });

            await tripService.completeWithProof(5, new FormData());

            expect(mockApi.postForm).toHaveBeenCalledWith('/api/trips/5/complete', expect.any(FormData));
        });
    });

    describe('markUnpaid', () => {
        it('G62-FE-40: markUnpaid(5, 500000, notes) → POST /api/trips/5/mark-unpaid', async () => {
            mockApi.post = jest.fn().mockResolvedValue({ message: 'OK', debt: {} });

            await tripService.markUnpaid(5, 500000, 'Ghi chú');

            expect(mockApi.post).toHaveBeenCalledWith(
                '/api/trips/5/mark-unpaid',
                { amount: 500000, notes: 'Ghi chú' },
            );
        });
    });

    // ── Expense / Payment ─────────────────────────────────────────────────────

    describe('expenses', () => {
        it('G62-FE-41: getShipmentExpenses(10) → GET /api/expenses/shipment/10', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ expenses: [{ id: 1 }] });

            const result = await tripService.getShipmentExpenses(10);

            expect(mockApi.get).toHaveBeenCalledWith('/api/expenses/shipment/10');
            expect(Array.isArray(result.expenses)).toBe(true);
        });

        it('G62-FE-42: createExpense(formData) → POST /api/expenses multipart', async () => {
            mockApi.postForm = jest.fn().mockResolvedValue({ message: 'OK', expense: {} });

            await tripService.createExpense(new FormData());

            expect(mockApi.postForm).toHaveBeenCalledWith('/api/expenses', expect.any(FormData));
        });
    });

    describe('payment', () => {
        it('G62-FE-43: recordPayment(5, formData) → POST /api/trips/5/payment', async () => {
            mockApi.postForm = jest.fn().mockResolvedValue({ message: 'OK', payment: {}, debt: {} });

            await tripService.recordPayment(5, new FormData());

            expect(mockApi.postForm).toHaveBeenCalledWith('/api/trips/5/payment', expect.any(FormData));
        });

        it('G62-FE-44: getPaymentSummary(5) → GET /api/trips/5/payment-summary', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ trip_value: '1000000', cash_collected: '500000' });

            const result = await tripService.getPaymentSummary(5);

            expect(mockApi.get).toHaveBeenCalledWith('/api/trips/5/payment-summary');
            expect(result.trip_value).toBe('1000000');
        });
    });
});
