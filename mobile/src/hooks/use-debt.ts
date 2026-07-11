import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { appEvents } from '@/lib/app-events';
import { debtService } from '@/services/debt-service';
import type { DriverDebt, DebtSummary, DebtPayment, SubmitRepaymentPayload } from '@/services/debt-service';

type DebtState = {
    debts: DriverDebt[];
    summary: DebtSummary | null;
    isLoading: boolean;
    error: string | null;
};

export function useDebt() {
    const [state, setState] = useState<DebtState>({
        debts: [],
        summary: null,
        isLoading: true,
        error: null,
    });

    const load = useCallback(async () => {
        setState((s) => ({ ...s, isLoading: s.debts.length === 0, error: null }));
        try {
            const [{ debts }, summary] = await Promise.all([
                debtService.getMyDebts(),
                debtService.getSummary(),
            ]);
            setState({ debts, summary, isLoading: false, error: null });
        } catch (err) {
            setState((s) => ({
                ...s,
                isLoading: false,
                error: err instanceof Error ? err.message : 'Không thể tải dữ liệu công nợ',
            }));
        }
    }, []);

    // Reload mỗi khi màn hình được focus
    useFocusEffect(useCallback(() => { load(); }, [load]));

    // Reload tức thì khi backend push debt.updated qua WebSocket
    useEffect(() => appEvents.on('debt.updated', () => load()), [load]);

    return { ...state, reload: load };
}

type PaymentState = {
    payments: DebtPayment[];
    isLoading: boolean;
    error: string | null;
};

export function useDebtPayments(debtId: number) {
    const [state, setState] = useState<PaymentState>({
        payments: [],
        isLoading: false,
        error: null,
    });

    const load = useCallback(async () => {
        setState((s) => ({ ...s, isLoading: true, error: null }));
        try {
            const { payments } = await debtService.getPayments(debtId);
            setState({ payments, isLoading: false, error: null });
        } catch (err) {
            setState((s) => ({
                ...s,
                isLoading: false,
                error: err instanceof Error ? err.message : 'Không thể tải lịch sử thanh toán',
            }));
        }
    }, [debtId]);

    return { ...state, reload: load };
}

type SubmitState = { isSubmitting: boolean; error: string | null };

export function useSubmitRepayment() {
    const [state, setState] = useState<SubmitState>({ isSubmitting: false, error: null });

    const submit = useCallback(async (debtId: number, payload: SubmitRepaymentPayload): Promise<boolean> => {
        if (!payload.receiptUri) {
            setState({ isSubmitting: false, error: 'Chưa chụp ảnh chứng từ' });
            return false;
        }
        setState({ isSubmitting: true, error: null });
        try {
            await debtService.submitRepayment(debtId, payload);
            setState({ isSubmitting: false, error: null });
            return true;
        } catch (err) {
            setState({
                isSubmitting: false,
                error: err instanceof Error ? err.message : 'Gửi yêu cầu thất bại',
            });
            return false;
        }
    }, []);

    const cancel = useCallback(async (paymentId: number): Promise<boolean> => {
        try {
            await debtService.cancelRepayment(paymentId);
            return true;
        } catch {
            return false;
        }
    }, []);

    return { ...state, submit, cancel };
}
