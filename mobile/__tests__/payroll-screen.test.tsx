import React from 'react';
import { render, screen, fireEvent, waitFor } from './test-utils';
import { Alert } from 'react-native';

import { PayrollScreen } from '@/features/driver/payroll-screen';
import { usePayroll, usePayrollEstimate, useSalaryAdvance } from '@/hooks/use-payroll';
import type { Payroll, PayrollEstimate, SalaryAdvance } from '@/services/payroll-service';

jest.mock('@/hooks/use-payroll');

const mockUsePayrollEstimate = usePayrollEstimate as jest.Mock;
const mockUsePayroll         = usePayroll as jest.Mock;
const mockUseSalaryAdvance   = useSalaryAdvance as jest.Mock;

function makeEstimate(overrides: Partial<PayrollEstimate> = {}): PayrollEstimate {
    return {
        month: 10, year: 2024, months_of_service: 12,
        base_salary: '10000000', actual_working_days: 26, unpaid_days: 0,
        absence_penalty: '0', pro_rated_base: '9285714',
        total_revenue: '50000000', revenue_share_pct: '15', revenue_bonus: '7500000',
        phone_allowance: '200000', kpi_bonus: '0', top_driver_bonus: '0',
        insurance_employee: '1050000', insurance_salary_base: '10000000',
        advance_deduction: '0', driver_debt_deduction: '0',
        max_advance_amount: '5000000',
        estimated_gross: '16985714', estimated_net: '15935714',
        ...overrides,
    } as PayrollEstimate;
}

function makePayroll(overrides: Partial<Payroll> = {}): Payroll {
    return { id: 1, payroll_month: 9, payroll_year: 2024, net_salary: '15000000', status: 'paid' } as Payroll & typeof overrides;
}

function makeAdvance(overrides: Partial<SalaryAdvance> = {}): SalaryAdvance {
    return {
        id: 1, amount: '2000000', reason: null, request_month: 10, request_year: 2024,
        status: 'pending', reject_reason: null, created_at: new Date().toISOString(), paid_at: null,
        ...overrides,
    } as SalaryAdvance;
}

describe('PayrollScreen', () => {
    const reloadEst = jest.fn();
    const reloadHist = jest.fn();
    const loadAdv = jest.fn();
    const request = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        mockUsePayrollEstimate.mockReturnValue({ estimate: makeEstimate(), isLoading: false, error: null, reload: reloadEst });
        mockUsePayroll.mockReturnValue({ payrolls: [], isLoading: false, error: null, reload: reloadHist });
        mockUseSalaryAdvance.mockReturnValue({ advances: [], isLoading: false, isSubmitting: false, error: null, load: loadAdv, request });
    });

    it('G62-FE-110: hiển thị lương thực nhận ước tính đúng theo tháng hiện tại', async () => {
        await render(<PayrollScreen />);

        expect(screen.getAllByText('15.935.714₫').length).toBeGreaterThan(0);
    });

    it('G62-FE-111: hiển thị banner lỗi khi tải ước tính thất bại', async () => {
        mockUsePayrollEstimate.mockReturnValue({ estimate: null, isLoading: false, error: 'Không thể tải ước tính lương', reload: reloadEst });

        await render(<PayrollScreen />);

        expect(screen.getByText('Không thể tải ước tính lương')).toBeTruthy();
    });

    it('G62-FE-112: chuyển sang tab "Lịch sử lương" hiển thị "Chưa có bảng lương" khi rỗng', async () => {
        await render(<PayrollScreen />);
        await fireEvent.press(screen.getByText('Lịch sử lương'));

        expect(screen.getByText('Chưa có bảng lương')).toBeTruthy();
    });

    it('G62-FE-113: tab lịch sử hiển thị danh sách bảng lương đã có', async () => {
        mockUsePayroll.mockReturnValue({ payrolls: [makePayroll()], isLoading: false, error: null, reload: reloadHist });

        await render(<PayrollScreen />);
        await fireEvent.press(screen.getByText('Lịch sử lương'));

        expect(screen.getByText('T9/2024')).toBeTruthy();
        expect(screen.getByText('Đã thanh toán')).toBeTruthy();
    });

    it('G62-FE-114: hiển thị "Chưa có yêu cầu ứng lương" khi chưa từng ứng', async () => {
        await render(<PayrollScreen />);

        expect(screen.getByText('Chưa có yêu cầu ứng lương')).toBeTruthy();
    });

    it('G62-FE-115: hiển thị danh sách yêu cầu ứng lương đã gửi kèm trạng thái', async () => {
        mockUseSalaryAdvance.mockReturnValue({
            advances: [makeAdvance({ status: 'rejected', reject_reason: 'Không đủ điều kiện' })],
            isLoading: false, isSubmitting: false, error: null, load: loadAdv, request,
        });

        await render(<PayrollScreen />);

        expect(screen.getByText('Bị từ chối')).toBeTruthy();
        expect(screen.getByText('Không đủ điều kiện')).toBeTruthy();
    });

    it('G62-FE-116: bấm "+ Yêu cầu ứng" mở modal, không phải ngày 25 → hiển thị cảnh báo (BR-029)', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2024-10-10T00:00:00'));

        await render(<PayrollScreen />);
        await fireEvent.press(screen.getByText('+ Yêu cầu ứng'));

        expect(screen.getByText(/Ứng lương chỉ được thực hiện vào ngày 25 hàng tháng/)).toBeTruthy();

        jest.useRealTimers();
    });

    it('G62-FE-117: nhập số tiền vượt mức tối đa → Alert lỗi, KHÔNG gọi request()', async () => {
        await render(<PayrollScreen />);
        await fireEvent.press(screen.getByText('+ Yêu cầu ứng'));

        const input = screen.getByPlaceholderText(/Tối đa/);
        await fireEvent.changeText(input, '99999999');
        await fireEvent.press(screen.getByText('Gửi yêu cầu'));

        expect(Alert.alert).toHaveBeenCalledWith('Lỗi', expect.stringContaining('Tối đa'));
        expect(request).not.toHaveBeenCalled();
    });

    it('G62-FE-118: gửi yêu cầu ứng lương hợp lệ → gọi request() với đúng tham số', async () => {
        request.mockResolvedValue(true);

        await render(<PayrollScreen />);
        await fireEvent.press(screen.getByText('+ Yêu cầu ứng'));

        const input = screen.getByPlaceholderText(/Tối đa/);
        await fireEvent.changeText(input, '2000000');
        await fireEvent.press(screen.getByText('Gửi yêu cầu'));

        await waitFor(() => expect(request).toHaveBeenCalled());
        const now = new Date();
        expect(request).toHaveBeenCalledWith({
            amount: 2000000,
            reason: undefined,
            requestMonth: now.getMonth() + 1,
            requestYear: now.getFullYear(),
        });
    });

    it('G62-FE-119: gọi reloadEst/reloadHist/loadAdv khi mount', async () => {
        await render(<PayrollScreen />);

        expect(reloadEst).toHaveBeenCalledTimes(1);
        expect(reloadHist).toHaveBeenCalledTimes(1);
        expect(loadAdv).toHaveBeenCalledTimes(1);
    });
});
