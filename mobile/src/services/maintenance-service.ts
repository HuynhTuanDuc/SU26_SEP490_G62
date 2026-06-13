import { apiClient } from '@/lib/api-client';
import type { MaintenanceRecord } from '@/types/maintenance';

export const maintenanceService = {
    getMyMaintenance: (): Promise<{ records: MaintenanceRecord[] }> =>
        apiClient.get('/api/drivers/maintenance'),

    uploadBill: (vehicleId: number, imageUri: string): Promise<{ maintenanceRecordId: number; bill_pics: string[] }> => {
        const form = new FormData();
        form.append('bill', { uri: imageUri, name: 'bill.jpg', type: 'image/jpeg' } as unknown as Blob);
        return apiClient.postForm(`/api/drivers/maintenance/${vehicleId}/bills`, form);
    },

    complete: (vehicleId: number, cost: number): Promise<{ maintenanceRecordId: number }> =>
        apiClient.post(`/api/drivers/maintenance/${vehicleId}/complete`, { cost }),
};
