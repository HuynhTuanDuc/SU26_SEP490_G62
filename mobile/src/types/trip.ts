export type VehicleGroup = {
    id: number;
    name: string;
};

export type TripStatus =
    | 'available'
    | 'claimed'
    | 'picking'
    | 'transit'
    | 'arrived'
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'returning';

// Pool hiển thị từng SHIPMENT riêng lẻ.
// Mỗi shipment trong 1 order có thể được nhận bởi driver khác nhau.
export type TripPoolItem = {
    shipment_id: number;             // ID dùng để claim
    order_id: number;
    shipment_index: number;          // chuyến thứ mấy trong order
    total_order_legs: number;        // tổng số chuyến của order
    cargo_name: string | null;
    order_notes: string | null;
    payment_type: string | null;
    pickup_address: string;
    delivery_address: string;
    cargo_weight_kg: string | null;
    estimated_price: string | null;
    notes: string | null;
    created_at: string;
    vehicle_group_id: number;
    vehicle_group_name: string;
    max_load_weight_kg: string | null;
};

export type TripStop = {
    id: number;
    stop_index: number;
    stop_type: 'pickup' | 'delivery';
    address: string;
    contact_name: string | null;
    contact_phone: string | null;
    arrived_at: string | null;
    completed_at: string | null;
    proof_url: string | null;
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
    transit_at: string | null;
    arrived_at: string | null;
    completed_at: string | null;
    cargo_name: string | null;
    order_notes: string | null;
    order_payment_type: string | null;
    is_final_shipment: boolean;
    max_shipment_index: number;
    stops: TripStop[];
};

export type TripPoolPagination = {
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
};

export type TripPoolResponse = {
    trips:         TripPoolItem[];
    vehicleGroups: VehicleGroup[];
    total?:        number;
    page?:         number;
    limit?:        number;
    totalPages?:   number;
    pagination?:   TripPoolPagination;
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

export type PaymentSummary = {
    trip_value: number;
    order_payment_type: string | null;
    cash_collected: number;
    customer_debt_total: number;
    remaining: number | null;
};

export type ShipmentPayment = {
    id: number;
    shipment_id: number;
    payment_type: string;
    amount: string;
    notes: string | null;
    collected_at: string;
    receipt_urls: string[];
};

export type ExpenseType =
    | 'fuel'
    | 'toll'
    | 'parking'
    | 'repair'
    | 'maintenance'
    | 'depreciation'
    | 'other';

export const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
    fuel:         'Nhiên liệu',
    toll:         'Phí cầu đường',
    parking:      'Đỗ xe',
    repair:       'Sửa chữa',
    maintenance:  'Bảo dưỡng',
    depreciation: 'Khấu hao',
    other:        'Khác',
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

export type ReceiptRequestStatus = 'pending' | 'processing' | 'approved' | 'rejected';

export type ReceiptRequest = {
    id: number;
    shipment_id: number;
    actual_km: string | null;
    status: ReceiptRequestStatus;
    requested_at: string;
    coordinator_notes: string | null;
};

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
    available: 'Chờ nhận',
    claimed: 'Đã nhận',
    picking: 'Đang lấy hàng',
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
    claimed:   { label: 'Bắt đầu lấy hàng',  nextStatus: 'picking',   tone: 'primary'   },
    transit:   { label: 'Xác nhận đã đến',    nextStatus: 'arrived',   tone: 'primary'   },
    failed:    { label: 'Bắt đầu hoàn hàng',  nextStatus: 'returning', tone: 'secondary' },
    // picking → transit: requires loading proof photo (use-loading-proof hook → POST /start-transit)
    // arrived → completed: requires delivery proof + receipt (use-completion-proof → POST /complete)
    // returning → completed: use return-complete with optional photo
};
