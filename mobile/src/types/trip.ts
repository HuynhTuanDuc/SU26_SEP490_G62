export type VehicleGroup = {
    id: number;
    name: string;
};

export type TripStatus =
    | 'available'
    | 'claimed'
    | 'picking'
    | 'loaded'
    | 'transit'
    | 'arrived'
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'returning';

// Pool hiển thị ORDER (không phải từng shipment riêng lẻ).
// Driver nhận cả order, hệ thống tự kích hoạt từng leg theo thứ tự.
export type TripPoolItem = {
    order_id: number;
    cargo_name: string | null;
    order_notes: string | null;
    payment_type: string | null;
    pickup_address: string;          // điểm lấy hàng của leg đầu tiên
    delivery_address: string;        // điểm giao của leg cuối cùng
    total_cargo_weight_kg: string | null;
    total_estimated_price: string | null;
    total_legs: number;              // tổng số chuyến trong order
    created_at: string;
    vehicle_group_id: number;
    vehicle_group_name: string;
    max_load_weight_kg: string | null;
};

export type ActiveTrip = {
    id: number;
    order_id: number;
    shipment_index: number;
    pickup_address: string;
    delivery_address: string;
    cargo_weight_kg: string | null;
    estimated_price: string | null;
    actual_price: string | null;
    status: TripStatus;
    notes: string | null;
    version: number;
    claimed_at: string | null;
    picking_at: string | null;
    loaded_at: string | null;
    transit_at: string | null;
    arrived_at: string | null;
    completed_at: string | null;
    cargo_name: string | null;
    order_notes: string | null;
    order_payment_type: string | null;
    is_final_shipment: boolean;
    max_shipment_index: number;
};

export type TripPoolResponse = {
    trips: TripPoolItem[];
    vehicleGroups: VehicleGroup[];
    pagination: OrderHistoryPagination;
};

export type ActiveTripResponse = {
    trip: ActiveTrip | null;
};

export type ClaimTripResponse = {
    message: string;
    trip: ActiveTrip;
};

export type UpdateStatusResponse = {
    message: string;
    trip: ActiveTrip;
};

export type CompleteTripResponse = {
    message: string;
    trip: ActiveTrip;
};

export type CancelDeliveryResponse = {
    message: string;
    trip: ActiveTrip;
};

export type ReleaseTripResponse = {
    message: string;
    order_id: number;
    released: boolean;
};

export type OrderHistoryItem = {
    order_id: number;
    cargo_name: string | null;
    order_notes: string | null;
    payment_type: string | null;
    order_status: string;
    created_at: string;
    pickup_address: string;
    delivery_address: string;
    total_legs: number;
    completed_legs: number;
    total_estimated_price: string | null;
    first_claimed_at: string | null;
    last_completed_at: string | null;
};

export type ShipmentWithPhotos = {
    id: number;
    order_id: number;
    shipment_index: number;
    pickup_address: string;
    delivery_address: string;
    cargo_weight_kg: string | null;
    estimated_price: string | null;
    actual_price: string | null;
    status: TripStatus;
    notes: string | null;
    cancel_reason: string | null;
    claimed_at: string | null;
    picking_at: string | null;
    loaded_at: string | null;
    transit_at: string | null;
    arrived_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    receipt_urls: string[];
    proof_url: string | null;
};

export type OrderDetailData = {
    order: {
        id: number;
        cargo_name: string | null;
        notes: string | null;
        payment_type: string | null;
        status: string;
        created_at: string;
    };
    shipments: ShipmentWithPhotos[];
};

export type OrderHistoryPagination = {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

export type OrderHistoryResponse = {
    orders: OrderHistoryItem[];
    pagination: OrderHistoryPagination;
};

export type PoolShipment = {
    id: number;
    shipment_index: number;
    pickup_address: string;
    delivery_address: string;
    cargo_weight_kg: string | null;
    estimated_price: string | null;
    notes: string | null;
    vehicle_group_name: string;
};

export type PoolOrderDetail = {
    order: {
        id: number;
        cargo_name: string | null;
        notes: string | null;
        payment_type: string | null;
        status: string;
        created_at: string;
        total_estimated_price: string | null;
        total_cargo_weight_kg: string | null;
        total_legs: number;
    };
    shipments: PoolShipment[];
};

export type OrderDetailResponse = OrderDetailData;

export type ExpenseType = 'fuel' | 'toll' | 'parking' | 'repair' | 'other';

export const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
    fuel:    'Nhiên liệu',
    toll:    'Phí cầu đường',
    parking: 'Đỗ xe',
    repair:  'Sửa chữa',
    other:   'Khác',
};

export type Expense = {
    id: number;
    shipment_id: number;
    expense_type: ExpenseType;
    amount: string;
    description: string | null;
    expense_date: string;
    created_at: string;
    receipt_urls: string[];
};

export type ExpenseListResponse = {
    expenses: Expense[];
};

export type CreateExpenseResponse = {
    expenses: Expense[];
};

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
    available: 'Chờ nhận',
    claimed: 'Đã nhận',
    picking: 'Đang lấy hàng',
    loaded: 'Đã lấy hàng',
    transit: 'Đang vận chuyển',
    arrived: 'Đã đến nơi',
    completed: 'Hoàn thành',
    cancelled: 'Đã hủy',
    failed: 'Giao thất bại',
    returning: 'Đang hoàn hàng',
};

export type NextAction = {
    label: string;
    nextStatus: TripStatus;
    tone: 'primary' | 'secondary' | 'danger';
};

export const NEXT_ACTIONS: Partial<Record<TripStatus, NextAction>> = {
    claimed:   { label: 'Bắt đầu lấy hàng',      nextStatus: 'picking',   tone: 'primary'   },
    picking:   { label: 'Xác nhận đã lấy hàng',  nextStatus: 'loaded',    tone: 'primary'   },
    loaded:    { label: 'Bắt đầu vận chuyển',     nextStatus: 'transit',   tone: 'primary'   },
    transit:   { label: 'Xác nhận đã đến',        nextStatus: 'arrived',   tone: 'primary'   },
    failed:    { label: 'Bắt đầu hoàn hàng',      nextStatus: 'returning', tone: 'secondary' },
    returning: { label: 'Hoàn thành hoàn hàng',   nextStatus: 'completed', tone: 'secondary' },
};
