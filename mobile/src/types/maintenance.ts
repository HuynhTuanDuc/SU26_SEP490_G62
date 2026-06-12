export type MaintenanceStatus = 'open' | 'pending_verification' | 'completed';

export type MaintenanceType = 'scheduled' | 'repair' | 'inspection' | 'emergency';

export const MAINTENANCE_TYPE_LABEL: Record<MaintenanceType, string> = {
    scheduled:   'Bảo dưỡng định kỳ',
    repair:      'Sửa chữa',
    inspection:  'Kiểm tra',
    emergency:   'Khẩn cấp',
};

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
    open:                 'Đang thực hiện',
    pending_verification: 'Chờ xác nhận',
    completed:            'Hoàn thành',
};

export type MaintenanceRecord = {
    id: number;
    vehicle_id: number;
    plate_number: string;
    brand: string | null;
    model: string | null;
    maintenance_type: MaintenanceType;
    description: string;
    cost: string | null;
    maintenance_date: string;
    next_due_date: string | null;
    status: MaintenanceStatus;
    bill_pics: string[];
    started_at: string;
    completed_at: string | null;
    created_by: number | null;
};
