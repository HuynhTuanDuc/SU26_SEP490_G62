/**
 * Hạn chờ của hai request quét hóa đơn bảo dưỡng.
 *
 * Hai request này KHÔNG giống mọi request tải ảnh khác: máy chủ nhận ảnh xong còn phải
 * đọc hóa đơn rồi mới trả lời — cố ý chậm, tới hàng chục giây. Cắt theo hạn tải ảnh
 * chung (90 giây, gồm cả thời gian đẩy ảnh qua mạng di động) thì tài xế nhận "máy chủ
 * phản hồi quá lâu" đúng vào lúc máy chủ sắp nói cho họ biết ảnh sai ở đâu — mà trong
 * log máy chủ không có lỗi nào, vì nó vẫn trả lời bình thường ngay sau đó.
 */
import { apiClient, TIMEOUT_SCAN_UPLOAD_MS } from '@/lib/api-client';
import { maintenanceService } from '@/services/maintenance-service';

jest.mock('@/lib/api-client');
jest.mock('expo-image-manipulator', () => ({
    manipulateAsync: jest.fn(async (uri: string) => ({ uri })),
    SaveFormat: { JPEG: 'jpeg' },
}));

const mockApi = apiClient as jest.Mocked<typeof apiClient>;

describe('maintenanceService — hạn chờ cho request có quét hóa đơn', () => {
    beforeEach(() => jest.clearAllMocks());

    it('G62-FE-170: tải hóa đơn dùng hạn chờ riêng, rộng hơn hạn tải ảnh thường', async () => {
        mockApi.postForm = jest.fn().mockResolvedValue({ maintenanceRecordId: 1, bill_pics: [], request_pics: [] });

        await maintenanceService.uploadBill(3, 'file://bill.jpg');

        expect(mockApi.postForm).toHaveBeenCalledWith(
            '/api/drivers/maintenance/3/bills',
            expect.any(FormData),
            { timeoutMs: TIMEOUT_SCAN_UPLOAD_MS },
        );
        // Máy chủ tự chốt trả lời trong 55 giây tính từ lúc request tới; phần dư là để
        // đẩy ảnh qua mạng di động. Hai con số bò sát nhau là quay lại đúng lỗi cũ.
        expect(TIMEOUT_SCAN_UPLOAD_MS).toBeGreaterThanOrEqual(120_000);
    });

    it('G62-FE-171: bước hoàn tất cũng vậy — nó bắt máy chủ đọc lại MỌI ảnh của đợt', async () => {
        mockApi.post = jest.fn().mockResolvedValue({ maintenanceRecordId: 1 });

        await maintenanceService.complete(3, 450_000);

        expect(mockApi.post).toHaveBeenCalledWith(
            '/api/drivers/maintenance/3/complete',
            { cost: 450_000 },
            { timeoutMs: TIMEOUT_SCAN_UPLOAD_MS },
        );
    });
});
