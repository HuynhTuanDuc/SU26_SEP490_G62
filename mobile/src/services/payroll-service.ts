import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PayrollStatus = 'pending' | 'reviewed' | 'approved' | 'paid';
export type AdvanceStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export type Payroll = {
    id: number;
    payroll_month: number;
    payroll_year: number;
    base_salary: string;
    months_of_service: number;
    total_revenue: string;
    revenue_share_pct: string;
    revenue_bonus: string;
    kpi_bonus: string;
    top_driver_bonus: string;
    overtime_bonus: string;
    holiday_bonus: string;
    other_bonus: string;
    insurance_employee: string;
    driver_debt_deduction: string;
    advance_deduction: string;
    absence_penalty: string;
    other_deduction: string;
    // BE trả trường này ở cả bảng lương lịch sử (payrollRepository) nhưng type
    // thiếu khai báo, khiến payroll-screen dùng tới nó bị lỗi TS2339
    expense_reimbursement: string;
    gross_salary: string;
    net_salary: string;
    status: PayrollStatus;
    paid_at: string | null;
    // Số ngày thuộc thời gian làm việc trong kỳ / số công tính lương. NULL ở phiếu tạo
    // trước khi BE lưu hai cột này — hiểu là đủ tháng.
    employed_days: number | null;
    working_days: string | null;
};

export type PayrollEstimate = {
    month: number;
    year: number;
    months_of_service: number;
    base_salary: string;
    actual_working_days: number;
    unpaid_days: number;
    absence_penalty: string;
    pro_rated_base: string;
    total_revenue: string;
    revenue_share_pct: string;
    revenue_bonus: string;
    phone_allowance: string;
    kpi_bonus: string;
    top_driver_bonus: string;
    holiday_bonus: string;
    holiday_days_worked: number;
    bonus_welfare_total: string;
    insurance_employee: string;
    insurance_salary_base: string;
    advance_deduction: string;
    // Tổng đã ứng kỳ này; phần lương không đủ trừ (advance_carried_over) chuyển thành công
    // nợ khi chi lương. Tuỳ chọn: server cũ không trả hai trường này.
    advance_total?: string;
    advance_carried_over?: string;
    driver_debt_deduction: string;
    max_advance_amount: string;
    expense_reimbursement: string;
    estimated_gross: string;
    estimated_net: string;
    // employed_days < days_in_month nghĩa là vào làm / nghỉ việc giữa tháng: chỉ tính công
    // trong [hire_date, termination_date], phụ cấp ĐT và BHXH chia theo tỉ lệ
    // employed_days / days_in_month
    days_in_month: number;
    employed_days: number;
    hire_date: string;
    termination_date: string | null; // ngày làm việc cuối cùng, null = đang làm
};

export type SalaryAdvance = {
    id: number;
    amount: string;
    reason: string | null;
    request_month: number;
    request_year: number;
    status: AdvanceStatus;
    reject_reason: string | null;
    created_at: string;
    paid_at: string | null;
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const payrollService = {
    getMyPayrolls: (params?: { month?: number; year?: number }): Promise<{ payrolls: Payroll[] }> => {
        const q = new URLSearchParams();
        if (params?.month) q.set('month', String(params.month));
        if (params?.year)  q.set('year',  String(params.year));
        return apiClient.get(`/api/payroll/me${q.toString() ? `?${q}` : ''}`);
    },

    getEstimate: (month: number, year: number): Promise<PayrollEstimate> =>
        apiClient.get(`/api/payroll/estimate?month=${month}&year=${year}`),

    getAdvances: (): Promise<{ advances: SalaryAdvance[] }> =>
        apiClient.get('/api/payroll/advance'),

    requestAdvance: (payload: {
        amount: number;
        reason?: string;
        requestMonth: number;
        requestYear: number;
    }): Promise<{ message: string; advance: SalaryAdvance }> =>
        apiClient.post('/api/payroll/advance', payload),
};
