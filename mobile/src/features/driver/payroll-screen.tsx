import { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
    Platform, Pressable, RefreshControl, ScrollView,
    StyleSheet, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
    AlertTriangle, Banknote, CheckCircle2, ChevronLeft, ChevronRight,
    Clock, CreditCard, DollarSign, Info, TrendingUp,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }     from '@/components/app-text';
import { ScreenHeader } from '@/components/screen-header';
import { PayrollSkeleton, SimpleListSkeleton } from '@/components/skeleton';
import { appTheme }    from '@/theme/app-theme';
import { usePayroll, usePayrollEstimate, useSalaryAdvance } from '@/hooks/use-payroll';
import { useMoneyInput } from '@/hooks/use-money-input';
import type { Payroll, PayrollEstimate, SalaryAdvance } from '@/services/payroll-service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    '', 'T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12',
];

const fmtMoney = (val: string | number) => {
    const n = Number(val);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M₫`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K₫`;
    return `${n}₫`;
};

const fmtMoneyFull = (val: string | number) =>
    Number(val).toLocaleString('vi-VN') + '₫';

const PAYROLL_STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
    pending:  { label: 'Chờ xử lý',   color: appTheme.colors.warningText,  bg: appTheme.colors.warningSoft,  border: appTheme.colors.warningBorder },
    reviewed: { label: 'Đã duyệt sơ', color: appTheme.colors.warningText,  bg: appTheme.colors.warningSoft,  border: appTheme.colors.warningBorder },
    approved: { label: 'Đã duyệt',    color: appTheme.colors.successText,  bg: appTheme.colors.successSoft,  border: appTheme.colors.successBorder },
    paid:     { label: 'Đã thanh toán', color: appTheme.colors.successText, bg: appTheme.colors.successSoft,  border: appTheme.colors.successBorder },
};

const ADVANCE_STATUS: Record<string, { label: string; color: string }> = {
    pending:  { label: 'Chờ duyệt',    color: appTheme.colors.warningText },
    approved: { label: 'Đã duyệt',     color: appTheme.colors.successText },
    rejected: { label: 'Bị từ chối',   color: appTheme.colors.dangerText },
    paid:     { label: 'Đã giải ngân', color: appTheme.colors.successText },
};

// ─── Salary row (estimate breakdown) ─────────────────────────────────────────

function SalaryRow({ label, value, sub, tone = 'normal', bold = false }: {
    label: string; value: string; sub?: string;
    tone?: 'normal' | 'positive' | 'negative' | 'muted';
    bold?: boolean;
}) {
    const color = tone === 'positive' ? appTheme.colors.successText
        : tone === 'negative' ? appTheme.colors.dangerText
        : tone === 'muted'    ? appTheme.colors.textMuted
        : appTheme.colors.text;

    return (
        <XStack justifyContent="space-between" alignItems="center" paddingVertical={5}>
            <YStack flex={1}>
                <Text fontSize={13} color={appTheme.colors.textMuted}>{label}</Text>
                {sub ? <Text fontSize={11} color={appTheme.colors.textMuted}>{sub}</Text> : null}
            </YStack>
            <Text fontSize={13} fontWeight={bold ? '900' : '700'} color={color}>
                {value}
            </Text>
        </XStack>
    );
}

// ─── Estimate card ────────────────────────────────────────────────────────────

function EstimateCard({ e }: { e: PayrollEstimate }) {
    const net = Number(e.estimated_net);
    return (
        <YStack gap={4}>
            {/* Hero */}
            <YStack
                padding={20} borderRadius={appTheme.radius.xl}
                backgroundColor={appTheme.colors.primary}
                gap={8}
            >
                <XStack
                    position="absolute" right={-20} top={-20}
                    width={120} height={120} borderRadius={60}
                    backgroundColor="rgba(255,255,255,0.10)"
                />
                <Text fontSize={12} color="rgba(255,255,255,0.75)" fontWeight="700">
                    LƯƠNG ƯỚC TÍNH THÁNG {e.month}/{e.year}
                </Text>
                <Text fontSize={32} fontWeight="900" color="#fff" lineHeight={38}>
                    {fmtMoneyFull(net < 0 ? 0 : net)}
                </Text>
                <Text fontSize={12} color="rgba(255,255,255,0.70)">
                    {e.actual_working_days}/28 ngày công
                    {e.unpaid_days > 0 ? ` (nghỉ ${e.unpaid_days} ngày không lương)` : ''}
                </Text>
            </YStack>

            {/* Breakdown */}
            <YStack
                padding={16} borderRadius={appTheme.radius.lg}
                backgroundColor={appTheme.colors.surface}
                borderWidth={1} borderColor={appTheme.colors.border}
                gap={0}
            >
                <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted} marginBottom={8}>
                    CHI TIẾT TÍNH LƯƠNG
                </Text>

                <SalaryRow
                    label={`Lương cứng (${e.months_of_service >= 12 ? '≥12 tháng' : '<12 tháng'})`}
                    value={fmtMoney(e.pro_rated_base)}
                    sub={`${fmtMoney(e.base_salary)}/28 × ${e.actual_working_days} ngày`}
                    tone="normal"
                />
                <View style={s.divider} />

                <SalaryRow
                    label="Thưởng doanh thu 15%"
                    value={`+ ${fmtMoney(e.revenue_bonus)}`}
                    sub={`Doanh thu: ${fmtMoney(e.total_revenue)}`}
                    tone="positive"
                />

                {Number(e.kpi_bonus) > 0 ? (
                    <SalaryRow
                        label="Thưởng vượt KPI"
                        value={`+ ${fmtMoney(e.kpi_bonus)}`}
                        tone="positive"
                    />
                ) : null}

                {Number(e.top_driver_bonus) > 0 ? (
                    <SalaryRow
                        label="Thưởng lái xe xuất sắc"
                        value={`+ ${fmtMoney(e.top_driver_bonus)}`}
                        tone="positive"
                    />
                ) : null}

                <SalaryRow
                    label="Phụ cấp điện thoại"
                    value={`+ ${fmtMoney(e.phone_allowance)}`}
                    tone="positive"
                />

                <View style={[s.divider, { marginVertical: 8 }]} />

                <SalaryRow
                    label="Tổng thu nhập"
                    value={fmtMoney(e.estimated_gross)}
                    bold
                />

                <View style={s.divider} />

                <SalaryRow
                    label="BHXH người lao động (10.5%)"
                    value={`- ${fmtMoney(e.insurance_employee)}`}
                    sub={`Mức lương đóng: ${fmtMoneyFull(e.insurance_salary_base)}`}
                    tone="negative"
                />

                {Number(e.driver_debt_deduction) > 0 ? (
                    <SalaryRow
                        label="Công nợ tài xế chưa nộp"
                        value={`- ${fmtMoney(e.driver_debt_deduction)}`}
                        tone="negative"
                    />
                ) : null}

                {Number(e.advance_deduction) > 0 ? (
                    <SalaryRow
                        label="Đã ứng lương"
                        value={`- ${fmtMoney(e.advance_deduction)}`}
                        tone="negative"
                    />
                ) : null}

                <View style={[s.divider, { marginVertical: 8 }]} />

                <SalaryRow
                    label="Lương thực nhận ước tính"
                    value={fmtMoneyFull(net < 0 ? 0 : net)}
                    tone={net >= 0 ? 'positive' : 'negative'}
                    bold
                />
            </YStack>

            {/* BHXH note */}
            <XStack
                padding={10} borderRadius={appTheme.radius.md}
                backgroundColor={appTheme.colors.surfaceSoft}
                borderWidth={1} borderColor={appTheme.colors.border}
                gap={6} alignItems="flex-start"
            >
                <Info size={12} color={appTheme.colors.textMuted} style={{ marginTop: 2 }} />
                <AppText variant="caption" tone="muted" flex={1}>
                    Lương trả ngày 10 hàng tháng. BHXH công ty đóng thêm 21.5% (1,141,650₫) — không trừ vào lương.
                    Đây là ước tính — chưa bao gồm các khoản điều chỉnh từ kế toán.
                </AppText>
            </XStack>
        </YStack>
    );
}

// ─── Historical payroll card ──────────────────────────────────────────────────

function PayrollCard({ p }: { p: Payroll }) {
    const badge = PAYROLL_STATUS[p.status] ?? PAYROLL_STATUS.pending;
    return (
        <XStack
            padding={16} borderRadius={appTheme.radius.lg}
            backgroundColor={appTheme.colors.surface}
            borderWidth={1} borderColor={badge.border}
            alignItems="center" gap={12}
        >
            <XStack
                width={44} height={44} borderRadius={16}
                backgroundColor={badge.bg}
                alignItems="center" justifyContent="center"
            >
                <Banknote size={20} color={badge.color} />
            </XStack>
            <YStack flex={1} gap={2}>
                <Text fontSize={14} fontWeight="900" color={appTheme.colors.text}>
                    {MONTH_NAMES[p.payroll_month]}/{p.payroll_year}
                </Text>
                <XStack gap={8} alignItems="center">
                    <XStack
                        paddingHorizontal={8} paddingVertical={2}
                        borderRadius={appTheme.radius.pill}
                        backgroundColor={badge.bg}
                        borderWidth={1} borderColor={badge.border}
                    >
                        <Text fontSize={10} fontWeight="700" color={badge.color}>{badge.label}</Text>
                    </XStack>
                    {p.paid_at ? (
                        <Text fontSize={11} color={appTheme.colors.textMuted}>
                            {new Date(p.paid_at).toLocaleDateString('vi-VN')}
                        </Text>
                    ) : null}
                </XStack>
            </YStack>
            <YStack alignItems="flex-end" gap={2}>
                <Text fontSize={14} fontWeight="900" color={appTheme.colors.text}>
                    {fmtMoney(p.net_salary)}
                </Text>
                <Text fontSize={10} color={appTheme.colors.textMuted}>thực nhận</Text>
            </YStack>
        </XStack>
    );
}

// ─── Advance card ─────────────────────────────────────────────────────────────

function AdvanceCard({ a }: { a: SalaryAdvance }) {
    const s2 = ADVANCE_STATUS[a.status];
    return (
        <XStack
            padding={14} borderRadius={appTheme.radius.lg}
            backgroundColor={appTheme.colors.surfaceSoft}
            borderWidth={1} borderColor={appTheme.colors.border}
            alignItems="center" gap={12}
        >
            <CreditCard size={18} color={appTheme.colors.primary} />
            <YStack flex={1} gap={2}>
                <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>
                    Ứng lương {MONTH_NAMES[a.request_month]}/{a.request_year}
                </Text>
                <Text fontSize={11} color={s2.color}>{s2.label}</Text>
                {a.reject_reason ? (
                    <Text fontSize={11} color={appTheme.colors.dangerText}>{a.reject_reason}</Text>
                ) : null}
            </YStack>
            <Text fontSize={14} fontWeight="900" color={appTheme.colors.text}>
                {fmtMoney(a.amount)}
            </Text>
        </XStack>
    );
}

// ─── Advance request modal ────────────────────────────────────────────────────

function AdvanceModal({ month, year, maxAmount, onClose, onSuccess }: {
    month: number; year: number; maxAmount: number; onClose: () => void; onSuccess: () => void;
}) {
    const { displayValue: amount, rawValue: amountRaw, onChangeText: onAmountChange } = useMoneyInput();
    const [reason, setReason] = useState('');
    const { isSubmitting, error, request } = useSalaryAdvance();

    const today = new Date();
    const isToday25 = today.getDate() === 25;

    const handleSubmit = async () => {
        const n = amountRaw;
        if (!n || n <= 0) { Alert.alert('Lỗi', 'Nhập số tiền hợp lệ'); return; }
        if (n > maxAmount) {
            Alert.alert('Lỗi', `Tối đa ${maxAmount.toLocaleString('vi-VN')}₫`);
            return;
        }
        const ok = await request({ amount: n, reason: reason.trim() || undefined, requestMonth: month, requestYear: year });
        if (ok) {
            Alert.alert('Thành công', 'Yêu cầu ứng lương đã gửi. Chờ quản lý duyệt.', [
                { text: 'Đóng', onPress: onSuccess },
            ]);
        }
    };

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={s.modalOverlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Pressable style={s.modalBackdrop} onPress={onClose} />
                <View style={s.modalSheet}>
                    <View style={s.handle} />
                    <Text fontSize={17} fontWeight="900" color={appTheme.colors.text} marginBottom={6}>
                        Yêu cầu ứng lương
                    </Text>
                    <Text fontSize={13} color={appTheme.colors.textMuted} marginBottom={16}>
                        Tháng {month}/{year} · Tối đa {maxAmount.toLocaleString('vi-VN')}₫
                    </Text>

                    {!isToday25 ? (
                        <XStack
                            padding={12} borderRadius={appTheme.radius.md}
                            backgroundColor={appTheme.colors.warningSoft}
                            borderWidth={1} borderColor={appTheme.colors.warningBorder}
                            gap={8} alignItems="flex-start" marginBottom={14}
                        >
                            <Clock size={13} color={appTheme.colors.warning} style={{ marginTop: 2 }} />
                            <AppText variant="caption" tone="muted" flex={1}>
                                Ứng lương chỉ được thực hiện vào ngày 25 hàng tháng.
                                Hôm nay là ngày {today.getDate()} — yêu cầu sẽ bị từ chối.
                            </AppText>
                        </XStack>
                    ) : null}

                    <Text fontSize={13} fontWeight="700" color={appTheme.colors.text} marginBottom={8}>
                        Số tiền (₫)
                    </Text>
                    <TextInput
                        style={s.input}
                        value={amount}
                        onChangeText={onAmountChange}
                        keyboardType="numeric"
                        placeholder={`Tối đa ${maxAmount.toLocaleString('vi-VN')}`}
                        placeholderTextColor={appTheme.colors.textMuted}
                    />

                    <Text fontSize={13} fontWeight="700" color={appTheme.colors.text} marginTop={14} marginBottom={8}>
                        Lý do (không bắt buộc)
                    </Text>
                    <TextInput
                        style={[s.input, { height: 64, textAlignVertical: 'top' }]}
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Lý do ứng lương..."
                        placeholderTextColor={appTheme.colors.textMuted}
                        multiline
                    />

                    {error ? (
                        <Text fontSize={12} color={appTheme.colors.danger} marginTop={8}>{error}</Text>
                    ) : null}

                    <XStack gap={10} marginTop={20}>
                        <Pressable style={[s.actionBtn, s.cancelBtn]} onPress={onClose}>
                            <Text fontSize={14} fontWeight="700" color={appTheme.colors.textMuted}>Huỷ</Text>
                        </Pressable>
                        <Pressable
                            style={[s.actionBtn, s.confirmBtn, isSubmitting && { opacity: 0.6 }]}
                            onPress={handleSubmit}
                            disabled={isSubmitting}
                        >
                            {isSubmitting
                                ? <ActivityIndicator color="#fff" size="small" />
                                : <Text fontSize={14} fontWeight="900" color="#fff">Gửi yêu cầu</Text>
                            }
                        </Pressable>
                    </XStack>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type Tab = 'estimate' | 'history';

export function PayrollScreen() {
    const now = new Date();
    const [tab, setTab] = useState<Tab>('estimate');
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year,  setYear]  = useState(now.getFullYear());
    const [showAdvanceModal, setShowAdvanceModal] = useState(false);

    const { estimate, isLoading: estLoading, error: estError, reload: reloadEst }
        = usePayrollEstimate(month, year);
    const { payrolls, isLoading: histLoading, error: histError, reload: reloadHist }
        = usePayroll();
    const { advances, isLoading: advLoading, load: loadAdv } = useSalaryAdvance();

    useEffect(() => { reloadEst(); }, [reloadEst]);
    useEffect(() => { reloadHist(); }, [reloadHist]);
    useEffect(() => { loadAdv(); }, [loadAdv]);

    const goToPrev = () => {
        if (month === 1) { setMonth(12); setYear((y) => y - 1); }
        else setMonth((m) => m - 1);
    };
    const goToNext = () => {
        if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
        if (month === 12) { setMonth(1); setYear((y) => y + 1); }
        else setMonth((m) => m + 1);
    };

    const isNow = month === now.getMonth() + 1 && year === now.getFullYear();

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Lương & Ứng lương" showBack />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 16,
                    paddingBottom: appTheme.spacing.screenBottom + 20,
                    gap: 14,
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={estLoading || histLoading}
                        onRefresh={() => { reloadEst(); reloadHist(); loadAdv(); }}
                        tintColor={appTheme.colors.primary}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* Tab selector */}
                <XStack gap={8}>
                    {([
                        { key: 'estimate' as Tab, label: 'Ước tính tháng này', icon: <TrendingUp size={14} color={tab === 'estimate' ? appTheme.colors.primary : appTheme.colors.textMuted} /> },
                        { key: 'history'  as Tab, label: 'Lịch sử lương',      icon: <DollarSign  size={14} color={tab === 'history'  ? appTheme.colors.primary : appTheme.colors.textMuted} /> },
                    ] as const).map((t) => (
                        <Pressable key={t.key} style={[s.tabBtn, tab === t.key && s.tabBtnActive]} onPress={() => setTab(t.key)}>
                            {t.icon}
                            <Text fontSize={12} fontWeight="700" color={tab === t.key ? appTheme.colors.primary : appTheme.colors.textMuted}>
                                {t.label}
                            </Text>
                        </Pressable>
                    ))}
                </XStack>

                {/* ── Estimate tab ──────────────────────────── */}
                {tab === 'estimate' ? (
                    <>
                        {/* Month nav */}
                        <XStack alignItems="center" justifyContent="space-between">
                            <Pressable onPress={goToPrev} hitSlop={12} style={s.navBtn}>
                                <ChevronLeft size={18} color={appTheme.colors.primary} />
                            </Pressable>
                            <Text fontSize={16} fontWeight="900" color={appTheme.colors.text}>
                                Tháng {month} / {year}
                                {isNow ? '  (tháng hiện tại)' : ''}
                            </Text>
                            <Pressable
                                onPress={goToNext} hitSlop={12}
                                style={[s.navBtn, isNow && { opacity: 0.3 }]}
                                disabled={isNow}
                            >
                                <ChevronRight size={18} color={appTheme.colors.primary} />
                            </Pressable>
                        </XStack>

                        {estLoading ? (
                            <PayrollSkeleton />
                        ) : estError ? (
                            <XStack
                                padding={14} borderRadius={appTheme.radius.md}
                                backgroundColor={appTheme.colors.dangerSoft}
                                borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                                gap={8} alignItems="center"
                            >
                                <AlertTriangle size={15} color={appTheme.colors.danger} />
                                <AppText variant="caption" tone="danger" flex={1}>{estError}</AppText>
                            </XStack>
                        ) : estimate ? (
                            <EstimateCard e={estimate} />
                        ) : null}
                    </>
                ) : null}

                {/* ── History tab ────────────────────────────── */}
                {tab === 'history' ? (
                    <>
                        {histLoading ? (
                            <SimpleListSkeleton count={3} />
                        ) : histError ? (
                            <XStack
                                padding={14} borderRadius={appTheme.radius.md}
                                backgroundColor={appTheme.colors.dangerSoft}
                                borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                                gap={8} alignItems="center"
                            >
                                <AlertTriangle size={15} color={appTheme.colors.danger} />
                                <AppText variant="caption" tone="danger" flex={1}>{histError}</AppText>
                            </XStack>
                        ) : payrolls.length === 0 ? (
                            <YStack
                                padding={32} borderRadius={appTheme.radius.lg}
                                backgroundColor={appTheme.colors.surfaceSoft}
                                borderWidth={1} borderColor={appTheme.colors.border}
                                alignItems="center" gap={10}
                            >
                                <CheckCircle2 size={36} color={appTheme.colors.textMuted} />
                                <AppText variant="bodyStrong" tone="muted">Chưa có bảng lương</AppText>
                                <AppText variant="caption" tone="muted">Kế toán sẽ cập nhật vào đầu tháng</AppText>
                            </YStack>
                        ) : (
                            <YStack gap={8}>
                                {payrolls.map((p) => <PayrollCard key={p.id} p={p} />)}
                            </YStack>
                        )}
                    </>
                ) : null}

                {/* ── Advance section (always shown) ─────────── */}
                <YStack
                    padding={16} borderRadius={appTheme.radius.lg}
                    backgroundColor={appTheme.colors.surface}
                    borderWidth={1} borderColor={appTheme.colors.border}
                    gap={12}
                >
                    <XStack alignItems="center" justifyContent="space-between">
                        <Text fontSize={15} fontWeight="900" color={appTheme.colors.text}>
                            Ứng lương
                        </Text>
                        <Pressable
                            style={s.smallBtn}
                            onPress={() => setShowAdvanceModal(true)}
                        >
                            <Text fontSize={13} fontWeight="700" color="#fff">+ Yêu cầu ứng</Text>
                        </Pressable>
                    </XStack>

                    <XStack
                        padding={10} borderRadius={appTheme.radius.md}
                        backgroundColor={appTheme.colors.primarySoft}
                        borderWidth={1} borderColor={appTheme.colors.primaryMuted}
                        gap={6} alignItems="flex-start"
                    >
                        <Info size={12} color={appTheme.colors.primary} style={{ marginTop: 2 }} />
                        <AppText variant="caption" flex={1}>
                            Chỉ được ứng vào ngày 25 hàng tháng
                            {estimate ? ` · Tối đa ${Number(estimate.max_advance_amount).toLocaleString('vi-VN')}₫ / tháng` : ''}
                        </AppText>
                    </XStack>

                    {advLoading ? (
                        <SimpleListSkeleton count={2} />
                    ) : advances.length > 0 ? (
                        <YStack gap={8}>
                            {advances.slice(0, 5).map((a) => <AdvanceCard key={a.id} a={a} />)}
                        </YStack>
                    ) : (
                        <AppText variant="caption" tone="muted" textAlign="center">
                            Chưa có yêu cầu ứng lương
                        </AppText>
                    )}
                </YStack>
            </ScrollView>

            {showAdvanceModal ? (
                <AdvanceModal
                    month={now.getMonth() + 1}
                    year={now.getFullYear()}
                    maxAmount={estimate ? Number(estimate.max_advance_amount) : 5_000_000}
                    onClose={() => setShowAdvanceModal(false)}
                    onSuccess={() => { setShowAdvanceModal(false); loadAdv(); }}
                />
            ) : null}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    tabBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 5,
        paddingVertical: 10, borderRadius: appTheme.radius.md,
        backgroundColor: appTheme.colors.surfaceSoft,
        borderWidth: 1.5, borderColor: appTheme.colors.border,
    },
    tabBtnActive: {
        backgroundColor: appTheme.colors.primarySoft,
        borderColor: appTheme.colors.primaryMuted,
    },
    navBtn: {
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: appTheme.colors.primarySoft,
        alignItems: 'center', justifyContent: 'center',
    },
    divider: { height: 1, backgroundColor: appTheme.colors.border, marginVertical: 2 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet: {
        backgroundColor: appTheme.colors.background,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingTop: 12,
    },
    handle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: appTheme.colors.border,
        alignSelf: 'center', marginBottom: 20,
    },
    input: {
        borderWidth: 1.5, borderColor: appTheme.colors.border,
        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 15, color: appTheme.colors.text,
        backgroundColor: appTheme.colors.surfaceSoft,
    },
    actionBtn: {
        flex: 1, paddingVertical: 14, borderRadius: 16,
        alignItems: 'center', justifyContent: 'center',
    },
    cancelBtn: {
        backgroundColor: appTheme.colors.surfaceSoft,
        borderWidth: 1, borderColor: appTheme.colors.border,
    },
    confirmBtn: { backgroundColor: appTheme.colors.primary },
    smallBtn: {
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
        backgroundColor: appTheme.colors.primary,
    },
});
