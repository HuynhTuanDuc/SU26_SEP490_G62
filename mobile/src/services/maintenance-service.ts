import * as ImageManipulator from 'expo-image-manipulator';
import { apiClient, TIMEOUT_SCAN_UPLOAD_MS } from '@/lib/api-client';
import type { MaintenanceRecord, MaintenanceType } from '@/types/maintenance';
import type { Vehicle } from '@/types/vehicle';

export type AssignmentHistoryItem = {
    id: number;
    action: 'assign' | 'unassign';
    note: string | null;
    created_at: string;
    vehicle_id: number;
    plate_number: string;
    brand: string | null;
    model: string | null;
    vehicle_group_name: string | null;
    created_by_name: string | null;
};

// Ảnh chụp từ camera điện thoại thường 4000px, vài MB. Máy chủ chỉ giữ tối đa 1200px (xem
// UPLOAD.IMAGE_MAX_WIDTH), nên đẩy nguyên ảnh lên chỉ làm request tải ảnh dài thêm hàng
// chục giây trên mạng di động — mà request đó còn phải chờ máy đọc hóa đơn. Thu nhỏ còn
// 1600px: đủ nét cho máy đọc, nhẹ hơn nhiều lần.
async function shrinkPhoto(uri: string): Promise<string> {
    try {
        const result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 1600 } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );
        return result.uri;
    } catch {
        return uri; // không thu nhỏ được thì gửi ảnh gốc, còn hơn là không gửi được
    }
}

export const maintenanceService = {
    getMyVehicle: (): Promise<{ vehicle: Vehicle }> =>
        apiClient.get('/api/drivers/me/vehicle'),

    getMyAssignmentHistory: (): Promise<{ history: AssignmentHistoryItem[] }> =>
        apiClient.get('/api/drivers/me/assignment-history'),

    requestMaintenance: async (payload: { maintenance_type: MaintenanceType; reason: string; billUris?: string[] }): Promise<{ message: string; maintenanceRecordId: number }> => {
        const uris = await Promise.all((payload.billUris ?? []).map(shrinkPhoto));
        const form = new FormData();
        form.append('maintenance_type', payload.maintenance_type);
        form.append('reason', payload.reason);
        uris.forEach((uri, i) => {
            form.append('bills', { uri, name: `bill_${i}.jpg`, type: 'image/jpeg' } as unknown as Blob);
        });
        return apiClient.postForm('/api/drivers/maintenance/request', form);
    },

    getMyMaintenance: (): Promise<{ records: MaintenanceRecord[] }> =>
        apiClient.get('/api/drivers/maintenance'),

    uploadBill: async (vehicleId: number, imageUri: string): Promise<{ maintenanceRecordId: number; bill_pics: string[]; request_pics: string[] }> => {
        const uri = await shrinkPhoto(imageUri);
        const form = new FormData();
        form.append('bill', { uri, name: 'bill.jpg', type: 'image/jpeg' } as unknown as Blob);
        // Request này CHỜ máy chủ đọc xong hóa đơn rồi mới trả lời — xem TIMEOUT_SCAN_UPLOAD_MS.
        return apiClient.postForm(`/api/drivers/maintenance/${vehicleId}/bills`, form, {
            timeoutMs: TIMEOUT_SCAN_UPLOAD_MS,
        });
    },

    // Gỡ một ảnh chụp nhầm (hóa đơn hoặc ảnh gửi kèm yêu cầu) khi đợt chưa gửi duyệt.
    removePhoto: (vehicleId: number, url: string): Promise<{ maintenanceRecordId: number; bill_pics: string[]; request_pics: string[] }> =>
        apiClient.delete(`/api/drivers/maintenance/${vehicleId}/bills?url=${encodeURIComponent(url)}`),

    // Lưu chi phí trước khi chụp hóa đơn — server cần số tiền để đối chiếu với ảnh
    // ngay lúc upload, nếu không thì ảnh nào cũng được nhận.
    saveCost: (vehicleId: number, cost: number): Promise<{ maintenanceRecordId: number; cost: number }> =>
        apiClient.patch(`/api/drivers/maintenance/${vehicleId}/cost`, { cost }),

    // Hoàn tất đọc lại MỌI ảnh hóa đơn của đợt; ảnh gửi kèm yêu cầu chưa từng được quét nên
    // chạy đủ dây chuyền (vài ảnh song song, mỗi ảnh tới vài chục giây). Hạn 30 giây mặc định
    // cắt ngang trong khi máy chủ vẫn hoàn tất — tài xế thấy lỗi mà đợt đã gửi duyệt.
    complete: (vehicleId: number, cost: number): Promise<{ maintenanceRecordId: number }> =>
        apiClient.post(`/api/drivers/maintenance/${vehicleId}/complete`, { cost }, {
            timeoutMs: TIMEOUT_SCAN_UPLOAD_MS,
        }),
};
