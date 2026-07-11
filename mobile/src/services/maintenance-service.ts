import { apiClient } from '@/lib/api-client';
import type { MaintenanceRecord, MaintenanceType } from '@/types/maintenance';
import type { Vehicle } from '@/types/vehicle';

export const maintenanceService = {
    getMyVehicle: (): Promise<{ vehicle: Vehicle }> =>
        apiClient.get('/api/drivers/me/vehicle'),

    requestMaintenance: (payload: { maintenance_type: MaintenanceType; reason: string }): Promise<{ message: string; maintenanceRecordId: number }> =>
        apiClient.post('/api/drivers/maintenance/request', payload),

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
