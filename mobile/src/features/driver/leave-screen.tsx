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
    ChevronLeft, ChevronRight, Trash2,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }     from '@/components/app-text';
import { AppButton }   from '@/components/app-button';
import { ScreenHeader } from '@/components/screen-header';
import { appTheme }    from '@/theme/app-theme';
import { useLeave, useCreateLeave, useDeleteLeave } from '@/hooks/use-leave';
import type { LeaveRequest, LeaveType } from '@/services/leave-service';

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

// ─── Attendance summary bar ───────────────────────────────────────────────────

function AttendanceSummary({ working, unpaid, paid }: {
    working: number; unpaid: number; paid: number;
}) {
    const pct = Math.max(0, Math.min(100, (working / 28) * 100));
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
                    {working} <Text fontSize={14} fontWeight="400" color={appTheme.colors.textMuted}>/ 28</Text>
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

            <XStack gap={16}>
                {unpaid > 0 ? (
                    <XStack gap={5} alignItems="center">
                        <CalendarOff size={13} color={appTheme.colors.danger} />
                        <Text fontSize={12} color={appTheme.colors.dangerText}>
                            {unpaid} ngày nghỉ không lương
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
                {unpaid === 0 && paid === 0 ? (
                    <Text fontSize={12} color={appTheme.colors.successText} fontWeight="700">
                        Không có ngày nghỉ — Chuyên cần xuất sắc!
                    </Text>
                ) : null}
            </XStack>
        </YStack>
    );
}

// ─── Leave card ───────────────────────────────────────────────────────────────

function LeaveCard({ leave, onDelete }: { leave: LeaveRequest; onDelete: (id: number) => void }) {
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
                    onPress={() => {
                        Alert.alert('Huỷ đăng ký nghỉ', `Huỷ ngày ${fmtDate(leave.leave_date)}?`, [
                            { text: 'Không', style: 'cancel' },
                            { text: 'Huỷ', style: 'destructive', onPress: () => onDelete(leave.id) },
                        ]);
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

    const { leaves, summary, isLoading, error, reload } = useLeave(month, year);
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
                        working={summary.working_days}
                        unpaid={Number(summary.unpaid_days)}
                        paid={Number(summary.paid_days)}
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
                {isLoading ? (
                    <YStack alignItems="center" paddingVertical={30}>
                        <ActivityIndicator color={appTheme.colors.primary} />
                    </YStack>
                ) : null}

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
