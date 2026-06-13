import { useState } from 'react';
import {
    ActivityIndicator, Alert, Image, Pressable,
    RefreshControl, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { useConfirm } from '@/providers/ui-provider';
import { useMoneyInput } from '@/hooks/use-money-input';
import { StatusBar } from 'expo-status-bar';
import { CheckCircle2, Wrench, Clock, ImagePlus, Trash2 } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText }     from '@/components/app-text';
import { ScreenHeader } from '@/components/screen-header';
import { CameraModal }  from '@/features/trips/components/camera-modal';
import { MaintenanceCardSkeleton } from '@/components/skeleton';
import { appTheme }    from '@/theme/app-theme';
import { useMaintenance } from '@/hooks/use-maintenance';
import { maintenanceService } from '@/services/maintenance-service';
import type { MaintenanceRecord, MaintenanceStatus } from '@/types/maintenance';
import { MAINTENANCE_TYPE_LABEL, MAINTENANCE_STATUS_LABEL } from '@/types/maintenance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

const fmtMoney = (val: string | number | null) => {
    if (val === null || val === undefined || val === '') return '—';
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('vi-VN') + '₫';
};

const STATUS_STYLE: Record<MaintenanceStatus, { bg: string; text: string; border: string }> = {
    open:                 { bg: appTheme.colors.warningSoft,   text: appTheme.colors.warningText,  border: appTheme.colors.warningBorder  },
    pending_verification: { bg: appTheme.colors.primarySoft,   text: appTheme.colors.primary,      border: appTheme.colors.primaryMuted   },
    completed:            { bg: appTheme.colors.successSoft,   text: appTheme.colors.successText,  border: appTheme.colors.successBorder  },
};

// ─── Maintenance card ─────────────────────────────────────────────────────────

function MaintenanceCard({
    record,
    onBillUploaded,
    onCostUpdated,
    onCompleted,
}: {
    record: MaintenanceRecord;
    onBillUploaded: (vehicleId: number, uri: string) => Promise<void>;
    onCompleted:    (vehicleId: number, cost: number) => Promise<void>;
}) {
    const [expanded,    setExpanded]    = useState(record.status === 'open');
    const [showCamera,  setShowCamera]  = useState(false);
    const [uploading,   setUploading]   = useState(false);
    const [completing,  setCompleting]  = useState(false);

    const { displayValue: cost, rawValue: costRaw, onChangeText: onCostChange } = useMoneyInput(record.cost ?? '');
    const { showConfirm } = useConfirm();

    const style = STATUS_STYLE[record.status];
    const isOpen = record.status === 'open';
    const isPending = record.status === 'pending_verification';

    const handleCapture = async (uri: string) => {
        setShowCamera(false);
        setUploading(true);
        try {
            await onBillUploaded(record.vehicle_id, uri);
        } catch (err) {
            Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể tải hóa đơn');
        } finally {
            setUploading(false);
        }
    };

    const handleComplete = async () => {
        if (!costRaw || costRaw <= 0) {
            Alert.alert('Thiếu chi phí', 'Vui lòng nhập số tiền bảo dưỡng');
            return;
        }
        if (record.bill_pics.length === 0) {
            Alert.alert('Thiếu hóa đơn', 'Vui lòng chụp ít nhất một ảnh hóa đơn');
            return;
        }
        const ok = await showConfirm({
            title: 'Xác nhận hoàn thành',
            message: 'Bạn đã bảo dưỡng xong và tải lên đầy đủ hóa đơn?',
            confirmLabel: 'Xác nhận',
        });
        if (!ok) return;
        setCompleting(true);
        try {
            await onCompleted(record.vehicle_id, costRaw);
        } catch (err) {
            Alert.alert('Lỗi', err instanceof Error ? err.message : 'Không thể hoàn thành');
        } finally {
            setCompleting(false);
        }
    };

    return (
        <>
            <YStack
                borderRadius={appTheme.radius.lg}
                borderWidth={1}
                borderColor={style.border}
                backgroundColor={style.bg}
                overflow="hidden"
                marginBottom={12}
            >
                {/* Header row */}
                <Pressable onPress={() => setExpanded((v) => !v)}>
                    <XStack
                        paddingHorizontal={14} paddingVertical={12}
                        alignItems="center" gap={10}
                    >
                        <XStack
                            width={38} height={38} borderRadius={12}
                            backgroundColor={appTheme.colors.warning + '22'}
                            alignItems="center" justifyContent="center"
                        >
                            <Wrench size={18} color={appTheme.colors.warning} />
                        </XStack>

                        <YStack flex={1} gap={2}>
                            <Text fontSize={14} fontWeight="900" color={appTheme.colors.text}>
                                {record.plate_number}
                                {record.brand || record.model
                                    ? ` · ${[record.brand, record.model].filter(Boolean).join(' ')}`
                                    : ''}
                            </Text>
                            <Text fontSize={12} color={appTheme.colors.textMuted}>
                                {MAINTENANCE_TYPE_LABEL[record.maintenance_type]} · {fmtDate(record.maintenance_date)}
                            </Text>
                        </YStack>

                        <View style={[s.badge, { backgroundColor: style.bg, borderColor: style.border }]}>
                            <Text fontSize={11} fontWeight="700" color={style.text}>
                                {MAINTENANCE_STATUS_LABEL[record.status]}
                            </Text>
                        </View>
                    </XStack>
                </Pressable>

                {expanded && (
                    <YStack
                        paddingHorizontal={14} paddingBottom={16} paddingTop={4}
                        gap={12}
                        borderTopWidth={1} borderTopColor={style.border}
                    >
                        {/* Description */}
                        <YStack gap={4}>
                            <Text fontSize={12} color={appTheme.colors.textMuted}>Mô tả</Text>
                            <Text fontSize={14} color={appTheme.colors.text}>{record.description}</Text>
                        </YStack>

                        {/* Cost row */}
                        <YStack gap={6}>
                            <Text fontSize={12} color={appTheme.colors.textMuted}>Chi phí bảo dưỡng</Text>
                            {isOpen ? (
                                <TextInput
                                    style={s.costInput}
                                    placeholder="Nhập số tiền (VND)"
                                    placeholderTextColor={appTheme.colors.textMuted}
                                    keyboardType="numeric"
                                    value={cost}
                                    onChangeText={onCostChange}
                                />
                            ) : (
                                <Text fontSize={15} fontWeight="900" color={appTheme.colors.text}>
                                    {fmtMoney(record.cost)}
                                </Text>
                            )}
                        </YStack>

                        {/* Bill images */}
                        <YStack gap={8}>
                            <XStack justifyContent="space-between" alignItems="center">
                                <Text fontSize={12} color={appTheme.colors.textMuted}>
                                    Hóa đơn ({record.bill_pics.length} ảnh)
                                </Text>
                                {isOpen && (
                                    <Pressable
                                        style={[s.uploadBtn, uploading && { opacity: 0.6 }]}
                                        onPress={() => setShowCamera(true)}
                                        disabled={uploading}
                                    >
                                        {uploading
                                            ? <ActivityIndicator size="small" color={appTheme.colors.primary} />
                                            : <ImagePlus size={14} color={appTheme.colors.primary} />}
                                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.primary}>
                                            {uploading ? 'Đang tải...' : 'Thêm ảnh'}
                                        </Text>
                                    </Pressable>
                                )}
                            </XStack>

                            {record.bill_pics.length > 0 && (
                                <XStack flexWrap="wrap" gap={8}>
                                    {record.bill_pics.map((uri, i) => (
                                        <Image
                                            key={i}
                                            source={{ uri }}
                                            style={s.billThumb}
                                        />
                                    ))}
                                </XStack>
                            )}

                            {isOpen && record.bill_pics.length === 0 && (
                                <Text fontSize={12} color={appTheme.colors.textMuted} style={{ fontStyle: 'italic' }}>
                                    Chưa có ảnh hóa đơn
                                </Text>
                            )}
                        </YStack>

                        {/* Status messages / action buttons */}
                        {isPending && (
                            <XStack
                                padding={12} borderRadius={appTheme.radius.sm}
                                backgroundColor={appTheme.colors.primarySoft}
                                alignItems="center" gap={10}
                            >
                                <Clock size={16} color={appTheme.colors.primary} />
                                <Text flex={1} fontSize={13} color={appTheme.colors.primary}>
                                    Đã gửi hóa đơn. Đang chờ quản lý xác nhận.
                                </Text>
                            </XStack>
                        )}

                        {isOpen && (
                            <Pressable
                                style={[s.completeBtn, completing && { opacity: 0.6 }]}
                                onPress={handleComplete}
                                disabled={completing}
                            >
                                {completing
                                    ? <ActivityIndicator color="#fff" size="small" />
                                    : <CheckCircle2 size={16} color="#fff" />}
                                <Text fontSize={14} fontWeight="900" color="#fff">
                                    {completing ? 'Đang gửi...' : 'Hoàn thành bảo dưỡng'}
                                </Text>
                            </Pressable>
                        )}
                    </YStack>
                )}
            </YStack>

            <CameraModal
                visible={showCamera}
                label="Chụp hóa đơn bảo dưỡng"
                onCapture={handleCapture}
                onClose={() => setShowCamera(false)}
            />
        </>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function MaintenanceScreen() {
    const { records, isLoading, error, reload } = useMaintenance();
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        setRefreshing(true);
        await reload(false);
        setRefreshing(false);
    };

    const handleBillUploaded = async (vehicleId: number, uri: string) => {
        await maintenanceService.uploadBill(vehicleId, uri);
        await reload(false);
    };

    const handleCompleted = async (vehicleId: number, cost: number) => {
        await maintenanceService.complete(vehicleId, cost);
        await reload(false);
    };

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Bảo dưỡng xe" />

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: appTheme.spacing.screenX, paddingTop: 16, paddingBottom: appTheme.spacing.screenBottom }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={appTheme.colors.primary} />}
                showsVerticalScrollIndicator={false}
            >
                {isLoading && records.length === 0 ? (
                    <YStack gap={0}>
                        <MaintenanceCardSkeleton />
                        <MaintenanceCardSkeleton />
                    </YStack>
                ) : null}

                {!isLoading && error ? (
                    <YStack alignItems="center" paddingVertical={40} gap={8}>
                        <AppText variant="caption" tone="danger">{error}</AppText>
                    </YStack>
                ) : null}

                {!isLoading && !error && records.length === 0 ? (
                    <YStack
                        padding={32} borderRadius={appTheme.radius.lg}
                        backgroundColor={appTheme.colors.surfaceSoft}
                        borderWidth={1} borderColor={appTheme.colors.border}
                        alignItems="center" gap={10}
                    >
                        <Wrench size={32} color={appTheme.colors.textMuted} />
                        <AppText variant="caption" tone="muted" style={{ textAlign: 'center' }}>
                            Không có nhiệm vụ bảo dưỡng nào
                        </AppText>
                    </YStack>
                ) : null}

                {records.map((record) => (
                    <MaintenanceCard
                        key={record.id}
                        record={record}
                        onBillUploaded={handleBillUploaded}
                        onCompleted={handleCompleted}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        borderWidth: 1,
    },
    costInput: {
        flex: 1,
        height: 40,
        borderWidth: 1,
        borderColor: appTheme.colors.border,
        borderRadius: 10,
        paddingHorizontal: 12,
        fontSize: 14,
        color: appTheme.colors.text,
        backgroundColor: appTheme.colors.background,
    },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: appTheme.colors.primaryMuted,
        backgroundColor: appTheme.colors.primarySoft,
    },
    billThumb: {
        width: 72,
        height: 72,
        borderRadius: 10,
        backgroundColor: appTheme.colors.border,
    },
    completeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 48,
        borderRadius: appTheme.radius.md,
        backgroundColor: appTheme.colors.success,
        marginTop: 4,
    },
});
