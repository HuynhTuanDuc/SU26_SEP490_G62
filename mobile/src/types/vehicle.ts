export type VehicleStatus = 'active' | 'maintenance' | 'broken' | 'retired';

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
    active:      'Hoạt động',
    maintenance: 'Bảo dưỡng',
    broken:      'Hỏng',
    retired:     'Ngừng hoạt động',
};

export type Vehicle = {
    id: number;
    plate_number: string;
    brand: string | null;
    model: string | null;
    load_capacity_kg: number | null;
    manufacture_year: number | null;
    purchase_date: string | null;
    status: VehicleStatus;
    vehicle_group_id: number | null;
    vehicle_group_name: string | null;
};
