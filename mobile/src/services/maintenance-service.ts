import { apiClient } from '@/lib/api-client';
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

export const maintenanceService = {
    getMyVehicle: (): Promise<{ vehicle: Vehicle }> =>
        apiClient.get('/api/drivers/me/vehicle'),

    getMyAssignmentHistory: (): Promise<{ history: AssignmentHistoryItem[] }> =>
        apiClient.get('/api/drivers/me/assignment-history'),

    requestMaintenance: (payload: { maintenance_type: MaintenanceType; reason: string; billUris?: string[] }): Promise<{ message: string; maintenanceRecordId: number }> => {
        const form = new FormData();
        form.append('maintenance_type', payload.maintenance_type);
        form.append('reason', payload.reason);
        (payload.billUris ?? []).forEach((uri, i) => {
            form.append('bills', { uri, name: `bill_${i}.jpg`, type: 'image/jpeg' } as unknown as Blob);
        });
        return apiClient.postForm('/api/drivers/maintenance/request', form);
    },

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
