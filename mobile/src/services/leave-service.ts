import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeaveType = 'paid' | 'unpaid';

export type LeaveRequest = {
    id: number;
    leave_date: string;        // YYYY-MM-DD
    leave_type: LeaveType;
    reason: string | null;
    status: 'approved' | 'rejected';
    created_at: string;
};

// working_days = min(28, số ngày làm việc − nghỉ không lương − vắng không phép − nửa công×0.5)
// — cùng công thức với bảng lương; "số ngày làm việc" tính từ ngày vào làm (employed_days).
// Ba nguồn trừ công phải hiện đủ trên màn hình, nếu không tài xế thấy số công tụt mà
// không biết vì sao (kế toán chấm vắng/nửa công thì tài không hề được báo).
// Ngày lễ được loại khỏi mọi phép trừ (Điều V.1) và đi làm ngày lễ thì tính 200%.
export type AttendanceSummary = {
    total_leaves: string;
    unpaid_days: string;
    paid_days: string;
    unexcused_days: number;
    half_days: number;
    working_days: number | string;
    holiday_days: number;
    holiday_days_worked: number;
    employed_days?: number;
    days_in_month?: number;
    hire_date?: string | null;
};

// Chấm công từng ngày trong tháng của chính tài xế. status trùng bộ nhãn của kế toán:
// present | holiday | holiday_worked | leave_paid | leave_unpaid | absent_unexcused | half_day
// | not_employed / terminated (trước ngày vào làm / sau ngày nghỉ việc — không tính công)
export type AttendanceDay = {
    work_date: string;
    status: string;
    status_label: string;
    holiday_name: string | null;
    has_completed_trip: boolean;
    override_notes: string | null;
};

export type MyAttendance = {
    month: number;
    year: number;
    days: AttendanceDay[];
    summary: Record<string, number>;
    status_labels: Record<string, string>;
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const leaveService = {
    getMyLeaves: (params?: { month?: number; year?: number }): Promise<{ leaves: LeaveRequest[] }> => {
        const q = new URLSearchParams();
        if (params?.month) q.set('month', String(params.month));
        if (params?.year)  q.set('year',  String(params.year));
        return apiClient.get(`/api/leave/me${q.toString() ? `?${q}` : ''}`);
    },

    getSummary: (month: number, year: number): Promise<AttendanceSummary> =>
        apiClient.get(`/api/leave/summary?month=${month}&year=${year}`),

    getMyAttendance: (month: number, year: number): Promise<MyAttendance> =>
        apiClient.get(`/api/leave/attendance?month=${month}&year=${year}`),

    create: (payload: {
        leaveDate: string;
        leaveType: LeaveType;
        reason?: string;
    }): Promise<{ message: string; leave: LeaveRequest }> =>
        apiClient.post('/api/leave', payload),

    delete: (id: number): Promise<{ message: string }> =>
        apiClient.delete(`/api/leave/${id}`),
};
