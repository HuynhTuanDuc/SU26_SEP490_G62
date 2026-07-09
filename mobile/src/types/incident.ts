// ─── Incident types (match DB CHECK constraint) ───────────────────────────────

export type IncidentType =
    | 'vehicle_breakdown'
    | 'cargo_damage'
    | 'road_incident'
    | 'customer_refusal'
    | 'traffic_jam';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed';

// ─── Labels ───────────────────────────────────────────────────────────────────

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
    vehicle_breakdown: 'Sự cố xe',
    cargo_damage:      'Hàng hóa hư hỏng',
    road_incident:     'Đường sá / Giao thông',
    customer_refusal:  'Khách từ chối nhận',
    traffic_jam:       'Tắc đường',
};

export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
    low:      'Thấp',
    medium:   'Trung bình',
    high:     'Cao',
    critical: 'Khẩn cấp',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
    open:          'Đang chờ',
    investigating: 'Đang xử lý',
    resolved:      'Đã giải quyết',
    closed:        'Đã đóng',
};

// Sub-types per incident type (display only, appended to description)
export const INCIDENT_SUBTYPES: Record<IncidentType, string[]> = {
    vehicle_breakdown: [
        'Thủng lốp',
        'Hỏng động cơ',
        'Hỏng phanh',
        'Hết nhiên liệu',
        'Hỏng điện',
        'Tai nạn xe',
    ],
    cargo_damage: [
        'Hàng bị vỡ',
        'Hàng bị ướt',
        'Hàng bị mất',
        'Hàng bị biến dạng',
        'Mất kiện hàng',
    ],
    road_incident: [
        'Tắc đường',
        'Đường bị chặn',
        'Ngập nước',
        'Tai nạn giao thông',
        'Cầu hỏng',
        'Đường đang sửa',
    ],
    customer_refusal: [
        'Khách vắng mặt',
        'Từ chối vì chất lượng',
        'Từ chối vì sai hàng',
        'Từ chối vì trễ hạn',
        'Không liên lạc được',
    ],
    traffic_jam: [
        'Ùn tắc cao điểm',
        'Tai nạn gây kẹt xe',
        'Công trình xây dựng',
        'Sự kiện / lễ hội',
    ],
};

// ─── Data models ──────────────────────────────────────────────────────────────

export type Incident = {
    id: number;
    shipment_id: number;
    reported_by: number;
    incident_type: IncidentType;
    severity_level: IncidentSeverity;
    description: string;
    location: string | null;
    status: IncidentStatus;
    occurred_at: string;
    resolved_at: string | null;
    created_at: string;
    image_urls: string[];
};

export type IncidentPagination = {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

export type IncidentListResponse = {
    incidents: Incident[];
    pagination: IncidentPagination;
};

export type IncidentDetailResponse = {
    incident: Incident;
};

export type CreateIncidentResponse = {
    incident: Incident;
};
