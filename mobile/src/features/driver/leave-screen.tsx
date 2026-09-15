import { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView,
    Platform, Pressable, RefreshControl, ScrollView,
    StyleSheet, TextInput, View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
    AlertTriangle, CalendarDays, CalendarOff, CheckCircle2,
    ChevronLeft, ChevronRight, PartyPopper, Trash2,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }     from '@/components/app-text';
import { AppButton }   from '@/components/app-button';
import { ScreenHeader } from '@/components/screen-header';
import { SimpleListSkeleton } from '@/components/skeleton';
import { appTheme }    from '@/theme/app-theme';
import { useConfirm }  from '@/providers/ui-provider';
import { useLeave, useCreateLeave, useDeleteLeave } from '@/hooks/use-leave';
import type { LeaveRequest, LeaveType, AttendanceDay } from '@/services/leave-service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    '', 'Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
    'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12',
];

const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

const isoToDate = (iso: string) => new Date(iso + 'T00:00:00');

// ─── Lịch chấm công từng ngày ────────────────────────────────────────────────
// Tài xế phải xem được mình bị chấm vắng/nửa công vào NGÀY NÀO để còn khiếu nại
// đúng chỗ — trước đây chỉ thấy con số tổng, không biết ngày nào.

const DAY_STYLE: Record<string, { bg: string; fg: string; ky: string }> = {
    present:          { bg: appTheme.colors.successSoft, fg: appTheme.colors.successText, ky: '' },
    holiday:          { bg: appTheme.colors.statusReturningSoft, fg: appTheme.colors.statusReturningText, ky: 'LỄ' },
    holiday_worked:   { bg: appTheme.colors.statusReturning, fg: '#FFFFFF', ky: 'LỄ×2' },
    leave_paid:       { bg: appTheme.colors.primarySoft, fg: appTheme.colors.primary,     ky: 'P' },
    leave_unpaid:     { bg: appTheme.colors.warningSoft, fg: appTheme.colors.warningText, ky: 'KL' },
    half_day:         { bg: appTheme.colors.warningSoft, fg: appTheme.colors.warningText, ky: '½' },
    absent_unexcused: { bg: appTheme.colors.dangerSoft,  fg: appTheme.colors.dangerText,  ky: 'V' },
    // Ngoài thời gian làm việc (trước ngày vào làm / sau ngày nghỉ việc) — không tính công
    not_employed:     { bg: appTheme.colors.surfaceSoft, fg: appTheme.colors.textMuted,   ky: '–' },
    terminated:       { bg: appTheme.colors.surfaceSoft, fg: appTheme.colors.textMuted,   ky: 'NV' },
};
const dayStyle = (s: string) => DAY_STYLE[s] ?? { bg: appTheme.colors.surfaceSoft, fg: appTheme.colors.textMuted, ky: '' };

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function AttendanceCalendar({ days, labels }: { days: AttendanceDay[]; labels: Record<string, string> }) {
    const [picked, setPicked] = useState<AttendanceDay | null>(null);
    if (days.length === 0) return null;

    // Chèn ô trống đầu tháng để ngày 1 rơi đúng cột thứ trong tuần (T2 = cột 0)
    const firstDow = (isoToDate(String(days[0].work_date).slice(0, 10)).getDay() + 6) % 7;
    const cells: (AttendanceDay | null)[] = [...Array(firstDow).fill(null), ...days];

    // Chỉ liệt kê những trạng thái THỰC SỰ có trong tháng, tránh chú thích thừa
    const present = [...new Set(days.map((d) => d.status))].filter((s) => s !== 'present');

    return (
        <YStack gap={10}>
            <Text fontSize={13} fontWeight="900" color={appTheme.colors.textMuted}>
                CHẤM CÔNG TỪNG NGÀY
            </Text>

            <XStack>
                {WEEKDAYS.map((w) => (
                    <View key={w} style={{ flex: 1, alignItems: 'center' }}>
                        <Text fontSize={10} color={appTheme.colors.textMuted}>{w}</Text>
                    </View>
                ))}
            </XStack>

            <XStack flexWrap="wrap">
                {cells.map((d, i) => {
                    if (!d) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 42 }} />;
                    const st = dayStyle(d.status);
                    return (
                        <Pressable
                            key={d.work_date}
                            onPress={() => setPicked(d)}
                            style={{ width: `${100 / 7}%`, height: 42, padding: 2 }}
                        >
                            <View style={{
                                flex: 1, borderRadius: 8, backgroundColor: st.bg,
                                alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Text fontSize={12} fontWeight="700" color={st.fg}>
                                    {isoToDate(String(d.work_date).slice(0, 10)).getDate()}
                                </Text>
                                {st.ky ? (
                                    <Text fontSize={8} fontWeight="900" color={st.fg}>{st.ky}</Text>
                                ) : null}
                            </View>
                        </Pressable>
                    );
                })}
            </XStack>

            {present.length > 0 ? (
                <XStack gap={12} flexWrap="wrap">
                    {present.map((s) => (
                        <XStack key={s} gap={4} alignItems="center">
                            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: dayStyle(s).bg }} />
                            <Text fontSize={11} color={appTheme.colors.textMuted}>{labels[s] ?? s}</Text>
                        </XStack>
                    ))}
                </XStack>
            ) : null}

            {picked ? (
                <YStack
                    padding={12} borderRadius={appTheme.radius.lg}
                    backgroundColor={dayStyle(picked.status).bg} gap={4}
                >
                    <Text fontSize={13} fontWeight="900" color={dayStyle(picked.status).fg}>
                        Ngày {isoToDate(String(picked.work_date).slice(0, 10)).toLocaleDateString('vi-VN')} — {picked.status_label}
                    </Text>
                    {picked.holiday_name ? (
                        <Text fontSize={11} color={appTheme.colors.textMuted}>
                            Ngày lễ: {picked.holiday_name}. Nghỉ vẫn hưởng nguyên lương
                            {picked.status === 'holiday_worked' ? ', đi làm được tính 200%.' : '.'}
                        </Text>
                    ) : null}
                    {picked.override_notes ? (
                        <Text fontSize={11} color={appTheme.colors.textMuted}>
                            Ghi chú của kế toán: {picked.override_notes}
                        </Text>
                    ) : null}
                    {picked.status === 'absent_unexcused' || picked.status === 'half_day' ? (
                        <Text fontSize={11} color={appTheme.colors.dangerText}>
                            Ngày này bị trừ công. Nếu không đúng, liên hệ kế toán để chỉnh lại.
                        </Text>
                    ) : null}
                </YStack>
            ) : null}
        </YStack>
    );
}

// ─── Attendance summary bar ───────────────────────────────────────────────────

function AttendanceSummary({ working, unpaid, paid, unexcused, halfDays, holidays, holidaysWorked }: {
    working: number; unpaid: number; paid: number;
    unexcused: number; halfDays: number; holidays: number; holidaysWorked: number;
}) {
    const pct = Math.max(0, Math.min(100, (working / 28) * 100));
    // Nửa công trừ 0.5 nên số công có thể lẻ — hiện "27,5" thay vì làm tròn sai
    const workingLabel = Number.isInteger(working) ? String(working) : working.toFixed(1).replace('.', ',');
    const unpaidLeave = unpaid > 0 || unexcused > 0 || halfDays > 0;
    return (
        <YStack
            padding={20} borderRadius={appTheme.radius.xl}
            backgroundColor={working >= 28 ? appTheme.colors.successSoft : appTheme.colors.warningSoft}
            borderWidth={1.5}
            borderColor={working >= 28 ? appTheme.colors.successBorder : appTheme.colors.warningBorder}
            gap={12}
        >
            <XStack justifyContent="space-between" alignItems="center">
                <Text fontSize={13} color={appTheme.colors.textMuted}>Số ngày đi làm</Text>
                <Text
                    fontSize={22} fontWeight="900"
                    color={working >= 28 ? appTheme.colors.successText : appTheme.colors.warningText}
                >
                    {workingLabel} <Text fontSize={14} fontWeight="400" color={appTheme.colors.textMuted}>/ 28</Text>
                </Text>
            </XStack>

            {/* Progress bar */}
            <View style={{ height: 8, borderRadius: 4, backgroundColor: appTheme.colors.border }}>
                <View style={{
                    height: 8, borderRadius: 4,
                    width: `${pct}%`,
                    backgroundColor: working >= 28 ? appTheme.colors.success : appTheme.colors.warning,
                }} />
            </View>

            {/* Liệt kê ĐỦ mọi khoản làm số công thay đổi. Vắng không phép và nửa công
                do kế toán chấm — tài xế không được thông báo, nên nếu không hiện ở đây
                thì tài chỉ thấy số công tụt mà không biết lý do. */}
            <XStack gap={16} flexWrap="wrap">
                {unpaid > 0 ? (
                    <XStack gap={5} alignItems="center">
                        <CalendarOff size={13} color={appTheme.colors.danger} />
                        <Text fontSize={12} color={appTheme.colors.dangerText}>
                            {unpaid} ngày nghỉ không lương
                        </Text>
                    </XStack>
                ) : null}
                {unexcused > 0 ? (
                    <XStack gap={5} alignItems="center">
                        <AlertTriangle size={13} color={appTheme.colors.danger} />
                        <Text fontSize={12} color={appTheme.colors.dangerText}>
                            {unexcused} ngày vắng không phép
                        </Text>
                    </XStack>
                ) : null}
                {halfDays > 0 ? (
                    <XStack gap={5} alignItems="center">
                        <AlertTriangle size={13} color={appTheme.colors.warning} />
                        <Text fontSize={12} color={appTheme.colors.warningText}>
                            {halfDays} buổi nửa công (−{(halfDays * 0.5).toFixed(1).replace('.', ',')} công)
                        </Text>
                    </XStack>
                ) : null}
                {paid > 0 ? (
                    <XStack gap={5} alignItems="center">
                        <CalendarDays size={13} color={appTheme.colors.success} />
                        <Text fontSize={12} color={appTheme.colors.successText}>
                            {paid} ngày nghỉ có lương
                        </Text>
                    </XStack>
                ) : null}
                {!unpaidLeave && paid === 0 ? (
                    <Text fontSize={12} color={appTheme.colors.successText} fontWeight="700">
                        Không có ngày nghỉ — Chuyên cần xuất sắc!
                    </Text>
                ) : null}
            </XStack>

            {/* Ngày lễ: nghỉ vẫn hưởng nguyên lương, đi làm được tính 200% (Điều V.1) */}
            {holidays > 0 ? (
                <XStack
                    gap={6} alignItems="center" flexWrap="wrap"
                    paddingTop={10} borderTopWidth={1} borderTopColor={appTheme.colors.border}
                >
                    <PartyPopper size={13} color={appTheme.colors.textMuted} />
                    <Text fontSize={12} color={appTheme.colors.textMuted}>
                        Tháng này có {holidays} ngày lễ — nghỉ vẫn hưởng nguyên lương.
                    </Text>
                    {holidaysWorked > 0 ? (
                        <Text fontSize={12} fontWeight="900" color={appTheme.colors.successText}>
                            Bạn đi làm {holidaysWorked} ngày, được tính 200% lương.
                        </Text>
                    ) : null}
                </XStack>
            ) : null}
        </YStack>
    );
}

// ─── Leave card ───────────────────────────────────────────────────────────────

function LeaveCard({ leave, onDelete }: { leave: LeaveRequest; onDelete: (id: number) => void }) {
    const { showConfirm } = useConfirm();
    const isPaid    = leave.leave_type === 'paid';
    const isFuture  = isoToDate(leave.leave_date) >= new Date();

    return (
        <XStack
            padding={14} borderRadius={appTheme.radius.lg}
            borderWidth={1}
            borderColor={isPaid ? appTheme.colors.successBorder : appTheme.colors.warningBorder}
            backgroundColor={isPaid ? appTheme.colors.successSoft : appTheme.colors.warningSoft}
            alignItems="center" gap={12}
        >
            <XStack
                width={40} height={40} borderRadius={14}
                backgroundColor={isPaid ? appTheme.colors.success + '22' : appTheme.colors.warning + '22'}
                alignItems="center" justifyContent="center"
            >
                <CalendarDays size={18} color={isPaid ? appTheme.colors.success : appTheme.colors.warning} />
            </XStack>

            <YStack flex={1} gap={2}>
                <Text fontSize={14} fontWeight="900" color={appTheme.colors.text}>
                    {fmtDate(leave.leave_date)}
                </Text>
                <Text fontSize={12} color={isPaid ? appTheme.colors.successText : appTheme.colors.warningText}>
                    {isPaid ? 'Nghỉ có lương' : 'Nghỉ không lương'}
                </Text>
                {leave.reason ? (
                    <Text fontSize={11} color={appTheme.colors.textMuted} numberOfLines={1}>
                        {leave.reason}
                    </Text>
                ) : null}
            </YStack>

            {isFuture ? (
                <Pressable
                    onPress={async () => {
                        const ok = await showConfirm({
                            title: 'Huỷ đăng ký nghỉ',
                            message: `Huỷ ngày ${fmtDate(leave.leave_date)}?`,
                            confirmLabel: 'Huỷ',
                            danger: true,
                        });
                        if (ok) onDelete(leave.id);
                    }}
                    hitSlop={8}
                >
                    <Trash2 size={17} color={appTheme.colors.danger} />
                </Pressable>
            ) : null}
        </XStack>
    );
}

// ─── Register leave overlay ───────────────────────────────────────────────────
// Dùng View + absoluteFill thay Modal — tránh Modal-in-Modal khi DateTimePicker mở

function RegisterLeaveOverlay({ onClose, onSuccess }: {
    onClose: () => void;
    onSuccess: (leaveDate: string) => void;
}) {
    const [date, setDate]             = useState<Date>(new Date());
    const [leaveType, setLeaveType]   = useState<LeaveType>('unpaid');
    const [reason, setReason]         = useState('');
    const { isSubmitting, error, submit } = useCreateLeave();

    const dateToIso = (d: Date) => {
        const y  = d.getFullYear();
        const m  = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
    };

    const handleSubmit = async () => {
        const isoDate = dateToIso(date);
        const ok = await submit({
            leaveDate: isoDate,
            leaveType,
            reason: reason.trim() || undefined,
        });
        if (ok) {
            Alert.alert('Thành công', 'Đã đăng ký nghỉ thành công.', [
                { text: 'Đóng', onPress: () => onSuccess(isoDate) },
            ]);
        }
    };

    return (
        // absoluteFill + zIndex — không phải native Modal, DateTimePicker hoạt động đúng
        <View style={[StyleSheet.absoluteFill, { zIndex: 200 }]}>
            {/* Backdrop */}
            <Pressable
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
                onPress={onClose}
            />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={s.modalSheet}>
                    <View style={s.handle} />

                    <Text fontSize={17} fontWeight="900" color={appTheme.colors.text} marginBottom={18}>
                        Đăng ký nghỉ
                    </Text>

                    {/* Date picker — spinner inline trên cả iOS lẫn Android */}
                    <Text fontSize={13} fontWeight="700" color={appTheme.colors.text} marginBottom={4}>
                        Ngày nghỉ
                    </Text>
                    <DateTimePicker
                        value={date}
                        mode="date"
                        display="spinner"
                        minimumDate={new Date()}
                        locale="vi"
                        onChange={(_, selected) => { if (selected) setDate(selected); }}
                        style={{ marginHorizontal: -8 }}
                    />

                    {/* Leave type */}
                    <Text fontSize={13} fontWeight="700" color={appTheme.colors.text} marginTop={8} marginBottom={8}>
                        Loại nghỉ
                    </Text>
                    <XStack gap={10}>
                        {([
                            { value: 'unpaid' as LeaveType, label: 'Không lương', sub: 'Trừ ngày công' },
                            { value: 'paid'   as LeaveType, label: 'Có lương',    sub: 'Nghỉ lễ / việc riêng' },
                        ] as const).map((opt) => (
                            <Pressable
                                key={opt.value}
                                style={[s.typeBtn, leaveType === opt.value && s.typeBtnActive]}
                                onPress={() => setLeaveType(opt.value)}
                            >
                                <Text
                                    fontSize={13} fontWeight="700"
                                    color={leaveType === opt.value ? appTheme.colors.primary : appTheme.colors.textMuted}
                                >
                                    {opt.label}
                                </Text>
                                <Text
                                    fontSize={10}
                                    color={leaveType === opt.value ? appTheme.colors.primary : appTheme.colors.textMuted}
                                >
                                    {opt.sub}
                                </Text>
                            </Pressable>
                        ))}
                    </XStack>

                    {/* Reason */}
                    <Text fontSize={13} fontWeight="700" color={appTheme.colors.text} marginTop={14} marginBottom={8}>
                        Lý do (không bắt buộc)
                    </Text>
                    <TextInput
                        style={[s.input, { height: 72, textAlignVertical: 'top' }]}
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Kết hôn, tang lễ, nghỉ lễ Quốc khánh..."
                        placeholderTextColor={appTheme.colors.textMuted}
                        multiline
                    />

                    {error ? (
                        <Text fontSize={12} color={appTheme.colors.danger} marginTop={8}>{error}</Text>
                    ) : null}

                    <XStack gap={10} marginTop={16}>
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
                                : <Text fontSize={14} fontWeight="900" color="#fff">Đăng ký nghỉ</Text>
                            }
                        </Pressable>
                    </XStack>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

// ─── Month navigator ──────────────────────────────────────────────────────────

function MonthNav({ month, year, onPrev, onNext }: {
    month: number; year: number; onPrev: () => void; onNext: () => void;
}) {
    const now = new Date();
    const isNow = month === now.getMonth() + 1 && year === now.getFullYear();
    return (
        <XStack alignItems="center" justifyContent="space-between">
            <Pressable onPress={onPrev} hitSlop={12} style={s.navBtn}>
                <ChevronLeft size={18} color={appTheme.colors.primary} />
            </Pressable>
            <Text fontSize={16} fontWeight="900" color={appTheme.colors.text}>
                {MONTH_NAMES[month]} / {year}
            </Text>
            <Pressable
                onPress={onNext} hitSlop={12}
                style={[s.navBtn, isNow && { opacity: 0.3 }]}
                disabled={isNow}
            >
                <ChevronRight size={18} color={appTheme.colors.primary} />
            </Pressable>
        </XStack>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function LeaveScreen() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year,  setYear]  = useState(now.getFullYear());
    const [showForm, setShowForm] = useState(false);

    const { leaves, summary, days, statusLabels, isLoading, error, reload } = useLeave(month, year);
    const { remove } = useDeleteLeave();

    useEffect(() => { reload(); }, [reload]);

    const goToPrev = () => {
        if (month === 1) { setMonth(12); setYear((y) => y - 1); }
        else setMonth((m) => m - 1);
    };
    const goToNext = () => {
        // Cho phép xem trước tối đa 12 tháng — tài xế có thể đăng ký nghỉ trước
        const limit      = new Date(now.getFullYear(), now.getMonth() + 12, 1);
        const limitYear  = limit.getFullYear();
        const limitMonth = limit.getMonth() + 1;
        if (year > limitYear || (year === limitYear && month >= limitMonth)) return;
        if (month === 12) { setMonth(1); setYear((y) => y + 1); }
        else setMonth((m) => m + 1);
    };

    const handleDelete = async (id: number) => {
        const ok = await remove(id);
        if (ok) reload();
        else Alert.alert('Lỗi', 'Không thể huỷ đăng ký nghỉ');
    };

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Đăng ký nghỉ" showBack />

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 16,
                    paddingBottom: appTheme.spacing.screenBottom + 20,
                    gap: 14,
                }}
                refreshControl={
                    <RefreshControl refreshing={isLoading} onRefresh={reload} tintColor={appTheme.colors.primary} />
                }
                showsVerticalScrollIndicator={false}
            >
                <MonthNav month={month} year={year} onPrev={goToPrev} onNext={goToNext} />

                {/* Attendance summary */}
                {summary ? (
                    <AttendanceSummary
                        working={Number(summary.working_days)}
                        unpaid={Number(summary.unpaid_days)}
                        paid={Number(summary.paid_days)}
                        unexcused={Number(summary.unexcused_days ?? 0)}
                        halfDays={Number(summary.half_days ?? 0)}
                        holidays={Number(summary.holiday_days ?? 0)}
                        holidaysWorked={Number(summary.holiday_days_worked ?? 0)}
                    />
                ) : null}

                {/* Register button */}
                <AppButton tone="primary" onPress={() => setShowForm(true)}>
                    + Đăng ký nghỉ
                </AppButton>

                {/* Paid leave note */}
                <XStack
                    padding={12} borderRadius={appTheme.radius.md}
                    backgroundColor={appTheme.colors.primarySoft}
                    borderWidth={1} borderColor={appTheme.colors.primaryMuted}
                    gap={8} alignItems="flex-start"
                >
                    <CalendarDays size={14} color={appTheme.colors.primary} style={{ marginTop: 2 }} />
                    <AppText variant="caption" flex={1}>
                        Nghỉ có lương: nghỉ lễ quốc gia (Tết, 30/4, 1/5, 2/9, Giỗ Tổ…), kết hôn (3 ngày), tang (3 ngày).
                        Nghỉ không lương sẽ bị trừ vào ngày công tháng đó.
                    </AppText>
                </XStack>

                {/* Error */}
                {error ? (
                    <XStack
                        padding={14} borderRadius={appTheme.radius.md}
                        backgroundColor={appTheme.colors.dangerSoft}
                        borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                        gap={8} alignItems="center"
                    >
                        <AlertTriangle size={15} color={appTheme.colors.danger} />
                        <AppText variant="caption" tone="danger" flex={1}>{error}</AppText>
                    </XStack>
                ) : null}

                {/* Loading */}
                {isLoading ? <SimpleListSkeleton count={3} /> : null}

                {/* Leave list */}
                {!isLoading ? (
                    leaves.length === 0 ? (
                        <YStack
                            padding={32} borderRadius={appTheme.radius.lg}
                            backgroundColor={appTheme.colors.successSoft}
                            borderWidth={1} borderColor={appTheme.colors.successBorder}
                            alignItems="center" gap={10}
                        >
                            <CheckCircle2 size={36} color={appTheme.colors.success} />
                            <AppText variant="bodyStrong" tone="muted">Không có ngày nghỉ</AppText>
                            <AppText variant="caption" tone="muted">{MONTH_NAMES[month]} {year} đi làm đủ</AppText>
                        </YStack>
                    ) : (
                        <YStack gap={8}>
                            <Text fontSize={15} fontWeight="900" color={appTheme.colors.text}>
                                Lịch nghỉ ({leaves.length} ngày)
                            </Text>
                            {leaves.map((leave) => (
                                <LeaveCard key={leave.id} leave={leave} onDelete={handleDelete} />
                            ))}
                        </YStack>
                    )
                ) : null}
            </ScrollView>

            {showForm ? (
                <RegisterLeaveOverlay
                    onClose={() => setShowForm(false)}
                    onSuccess={(leaveDate) => {
                        setShowForm(false);
                        // Navigate to the month of the registered leave so it's visible
                        const [y, m] = leaveDate.split('-').map(Number);
                        setYear(y);
                        setMonth(m);
                        // reload triggered automatically by useEffect([reload]) when month/year changes
                    }}
                />
            ) : null}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    navBtn: {
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: appTheme.colors.primarySoft,
        alignItems: 'center', justifyContent: 'center',
    },
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
    typeBtn: {
        flex: 1, padding: 12, borderRadius: 14, alignItems: 'center', gap: 2,
        borderWidth: 1.5, borderColor: appTheme.colors.border,
        backgroundColor: appTheme.colors.surfaceSoft,
    },
    typeBtnActive: {
        borderColor: appTheme.colors.primaryMuted,
        backgroundColor: appTheme.colors.primarySoft,
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
});
