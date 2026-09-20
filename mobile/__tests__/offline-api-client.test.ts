import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';

// ─────────────────────────────────────────────────────────────────────────────
// MỨC 1 — Chịu lỗi mạng ở tầng gọi API
//
// Ba thứ được kiểm ở đây: có hạn giờ (không treo vô hạn), tự thử lại request ĐỌC,
// và KHÔNG tự thử lại request GHI (thử lại request ghi = nguy cơ trùng dữ liệu).
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('@/services/token-storage', () => ({
    tokenStorage: {
        getToken:       jest.fn(() => Promise.resolve('token-gia')),
        getRefreshToken: jest.fn(() => Promise.resolve(null)),
        getCsrfToken:   jest.fn(() => Promise.resolve('csrf-gia')),
        setCsrfToken:   jest.fn(() => Promise.resolve()),
        clearAll:       jest.fn(() => Promise.resolve()),
    },
}));

jest.mock('@/constants/api', () => ({ getApiBaseUrl: () => 'http://test' }));

const dapUng = (status: number, body: unknown = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
}) as unknown as Response;

describe('MỨC 1 — api-client chịu lỗi mạng', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
    });

    it('G62-NET-01: GET hỏng vì mạng → tự thử lại tổng cộng 3 lần rồi mới báo lỗi', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

        await expect(apiClient.get('/api/trips/active')).rejects.toBeInstanceOf(ApiError);
        expect(global.fetch).toHaveBeenCalledTimes(3);   // 1 lần đầu + 2 lần thử lại
    });

    it('G62-NET-02: GET hỏng lần đầu rồi thành công → trả dữ liệu, không ném lỗi', async () => {
        (global.fetch as jest.Mock)
            .mockRejectedValueOnce(new Error('Network request failed'))
            .mockResolvedValueOnce(dapUng(200, { trip: { id: 9 } }));

        const kq = await apiClient.get<{ trip: { id: number } }>('/api/trips/active');

        expect(kq.trip.id).toBe(9);
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('G62-NET-03: POST (ghi) hỏng vì mạng → CHỈ gọi 1 lần, không tự gửi lại', async () => {
        // Tự gửi lại request ghi có thể tạo dữ liệu trùng — phải để hàng đợi lo,
        // vì hàng đợi có khoá chống trùng còn chỗ này thì không.
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

        await expect(apiClient.post('/api/expenses', { a: 1 })).rejects.toBeInstanceOf(ApiError);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('G62-NET-04: lỗi mạng trả về ApiError với status = 0 để phân biệt với lỗi server', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

        await expect(apiClient.post('/api/expenses', {})).rejects.toMatchObject({ status: 0 });
    });

    it('G62-NET-05: quá hạn giờ → báo đúng "phản hồi quá lâu", không nói mất mạng', async () => {
        const loiHuy = new Error('Aborted');
        loiHuy.name = 'AbortError';
        (global.fetch as jest.Mock).mockRejectedValue(loiHuy);

        await expect(apiClient.post('/api/trips/1/complete', {}))
            .rejects.toMatchObject({ message: expect.stringContaining('quá lâu') });
    });

    it('G62-NET-06: mọi lần gọi đều kèm AbortSignal — có hạn giờ, không treo vô hạn', async () => {
        (global.fetch as jest.Mock).mockResolvedValue(dapUng(200, {}));

        await apiClient.get('/api/trips/active');

        const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
        expect(init.signal).toBeDefined();
    });

    // Máy chủ vừa NHẬN ảnh vừa ĐỌC ảnh trong cùng một request (hóa đơn bảo dưỡng), nên nó
    // trả lời chậm hơn hẳn mọi request khác — cố ý. Cắt theo hạn chung thì tài xế nhận
    // "hết thời gian chờ" đúng vào lúc máy chủ sắp nói cho họ biết ảnh sai ở đâu, và trong
    // log máy chủ không có lỗi nào cả vì nó vẫn trả lời bình thường vài giây sau đó.
    it('G62-NET-08: request có hạn riêng thì không bị cắt theo hạn tải ảnh mặc định', async () => {
        jest.useFakeTimers();
        try {
            (global.fetch as jest.Mock).mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
                init.signal?.addEventListener('abort', () => {
                    const loiHuy = new Error('Aborted');
                    loiHuy.name = 'AbortError';
                    reject(loiHuy);
                });
            }));

            const daBaoLoi = jest.fn();
            const dangGui = apiClient
                .postForm('/api/drivers/maintenance/3/bills', new FormData(), { timeoutMs: 120_000 })
                .catch(daBaoLoi);

            await jest.advanceTimersByTimeAsync(95_000);
            expect(daBaoLoi).not.toHaveBeenCalled();   // hạn mặc định 90 giây đã qua mà vẫn chờ

            await jest.advanceTimersByTimeAsync(30_000);
            await dangGui;
            expect(daBaoLoi).toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it('G62-NET-07: lỗi 4xx từ server KHÔNG bị thử lại (server đã trả lời, gửi lại vô ích)', async () => {
        (global.fetch as jest.Mock).mockResolvedValue(dapUng(422, { error: 'Dữ liệu không hợp lệ' }));

        await expect(apiClient.get('/api/leave/summary?month=13')).rejects.toBeInstanceOf(ApiError);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
