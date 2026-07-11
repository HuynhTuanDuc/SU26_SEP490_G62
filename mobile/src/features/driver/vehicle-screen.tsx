import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
    AlertCircle, ArrowLeftRight, Calendar, Car, CheckCircle2, Clock,
    Package, Truck, Wrench,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppText } from '@/components/app-text';
import { ScreenHeader } from '@/components/screen-header';
import { appTheme } from '@/theme/app-theme';
import { useVehicle } from '@/hooks/use-vehicle';
import { maintenanceService, type AssignmentHistoryItem } from '@/services/maintenance-service';
import type { MaintenanceRecord, MaintenanceStatus } from '@/types/maintenance';
import { MAINTENANCE_TYPE_LABEL, MAINTENANCE_STATUS_LABEL } from '@/types/maintenance';
import type { VehicleStatus } from '@/types/vehicle';
import { VEHICLE_STATUS_LABEL } from '@/types/vehicle';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

const fmtMoney = (val: string | number | null) => {
    if (val === null || val === undefined || val === '') return '—';
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('vi-VN') + '₫';
};

// ─── Status styles ────────────────────────────────────────────────────────────

const VEHICLE_STATUS_STYLE: Record<VehicleStatus, { bg: string; text: string; border: string }> = {
    active:      { bg: appTheme.colors.successSoft,  text: appTheme.colors.successText, border: appTheme.colors.successBorder },
    maintenance: { bg: appTheme.colors.warningSoft,  text: appTheme.colors.warningText, border: appTheme.colors.warningBorder },
    broken:      { bg: appTheme.colors.dangerSoft,   text: appTheme.colors.danger,      border: appTheme.colors.dangerBorder  },
    retired:     { bg: appTheme.colors.surfaceSoft,  text: appTheme.colors.textMuted,   border: appTheme.colors.border        },
};

const MAINTENANCE_STATUS_STYLE: Record<MaintenanceStatus, { bg: string; text: string; border: string }> = {
    requested:            { bg: appTheme.colors.surfaceSoft,  text: appTheme.colors.textMuted,   border: appTheme.colors.border        },
    open:                 { bg: appTheme.colors.warningSoft,  text: appTheme.colors.warningText, border: appTheme.colors.warningBorder },
    pending_verification: { bg: appTheme.colors.primarySoft,  text: appTheme.colors.primary,     border: appTheme.colors.primaryMuted  },
    completed:            { bg: appTheme.colors.successSoft,  text: appTheme.colors.successText, border: appTheme.colors.successBorder },
    rejected:             { bg: appTheme.colors.dangerSoft,   text: appTheme.colors.dangerText,  border: appTheme.colors.dangerBorder  },
};

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <XStack justifyContent="space-between" alignItems="center" paddingVertical={8}
            borderBottomWidth={1} borderBottomColor={appTheme.colors.border}>
            <Text fontSize={13} color={appTheme.colors.textMuted}>{label}</Text>
            <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>{value}</Text>
        </XStack>
    );
}

// ─── Maintenance row ──────────────────────────────────────────────────────────

function MaintenanceRow({ record }: { record: MaintenanceRecord }) {
    const style = MAINTENANCE_STATUS_STYLE[record.status];
    const StatusIcon = record.status === 'completed' ? CheckCircle2
        : record.status === 'pending_verification' ? Clock : Wrench;

    return (
        <XStack
            paddingHorizontal={14} paddingVertical={12}
            borderBottomWidth={1} borderBottomColor={appTheme.colors.border}
            alignItems="center" gap={12}
        >
            <XStack width={36} height={36} borderRadius={10}
                backgroundColor={style.bg} borderWidth={1} borderColor={style.border}
                alignItems="center" justifyContent="center">
                <StatusIcon size={16} color={style.text} />
            </XStack>

            <YStack flex={1} gap={2}>
                <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>
                    {MAINTENANCE_TYPE_LABEL[record.maintenance_type]}
                </Text>
                <Text fontSize={12} color={appTheme.colors.textMuted}>
                    {fmtDate(record.maintenance_date)}
                    {record.cost ? ` · ${fmtMoney(record.cost)}` : ''}
                </Text>
                {record.description ? (
                    <Text fontSize={12} color={appTheme.colors.textMuted} numberOfLines={1}>
                        {record.description}
                    </Text>
                ) : null}
            </YStack>

            <XStack paddingHorizontal={8} paddingVertical={3} borderRadius={appTheme.radius.pill}
                backgroundColor={style.bg} borderWidth={1} borderColor={style.border}>
                <Text fontSize={11} fontWeight="700" color={style.text}>
                    {MAINTENANCE_STATUS_LABEL[record.status]}
                </Text>
            </XStack>
        </XStack>
    );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function VehicleSkeleton() {
    const bar = (w: number | `${number}%`, h = 14, mb = 0) => (
        <View style={{
            width: w, height: h, borderRadius: 6, marginBottom: mb,
            backgroundColor: appTheme.colors.border, opacity: 0.5,
        }} />
    );
    return (
        <YStack padding={appTheme.spacing.screenX} gap={12}>
            <YStack gap={8} padding={16} borderRadius={appTheme.radius.lg}
                backgroundColor={appTheme.colors.surface}
                borderWidth={1} borderColor={appTheme.colors.border}>
                {[1, 2, 3, 4, 5].map((k) => (
                    <XStack key={k} justifyContent="space-between">
                        {bar('40%')}
                        {bar('30%')}
                    </XStack>
                ))}
            </YStack>
        </YStack>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function VehicleScreen() {
    const { vehicle, maintenance, isLoading, error, refresh } = useVehicle();
    const [assignments, setAssignments] = useState<AssignmentHistoryItem[]>([]);

    const loadAssignments = () => {
        maintenanceService.getMyAssignmentHistory()
            .then(({ history }) => setAssignments(history))
            .catch(() => {});
    };
    useEffect(() => { loadAssignments(); }, []);

    const vehicleStyle = vehicle ? VEHICLE_STATUS_STYLE[vehicle.status] : null;

    const hasActiveMaintenance = maintenance.some((r) => r.status === 'open');

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <ScreenHeader title="Xe của tôi" showBack />

            <ScrollView
                contentContainerStyle={{ paddingBottom: appTheme.spacing.screenBottom }}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { refresh(); loadAssignments(); }} />}
            >
                {isLoading ? (
                    <VehicleSkeleton />
                ) : error ? (
                    <YStack alignItems="center" paddingTop={60} gap={10} paddingHorizontal={24}>
                        <AlertCircle size={40} color={appTheme.colors.danger} />
                        <AppText variant="bodyStrong" tone="muted">{error}</AppText>
                    </YStack>
                ) : !vehicle ? (
                    <YStack alignItems="center" paddingTop={60} gap={10} paddingHorizontal={24}>
                        <Truck size={48} color={appTheme.colors.textMuted} />
                        <AppText variant="bodyStrong" tone="muted">Chưa được phân công xe</AppText>
                        <AppText variant="caption" tone="muted">Liên hệ điều phối viên để được gán xe</AppText>
                    </YStack>
                ) : (
                    <>
                        {/* Thẻ xe */}
                        <YStack
                            marginHorizontal={appTheme.spacing.screenX}
                            marginTop={16}
                            borderRadius={appTheme.radius.lg}
                            borderWidth={1}
                            borderColor={appTheme.colors.border}
                            backgroundColor={appTheme.colors.surface}
                            overflow="hidden"
                        >
                            {/* Header */}
                            <XStack
                                paddingHorizontal={16} paddingVertical={14}
                                backgroundColor={appTheme.colors.primarySoft}
                                alignItems="center" gap={12}
                            >
                                <XStack width={44} height={44} borderRadius={14}
                                    backgroundColor={appTheme.colors.primary + '22'}
                                    alignItems="center" justifyContent="center">
                                    <Car size={22} color={appTheme.colors.primary} />
                                </XStack>
                                <YStack flex={1} gap={2}>
                                    <Text fontSize={18} fontWeight="900" color={appTheme.colors.primary}>
                                        {vehicle.plate_number}
                                    </Text>
                                    {(vehicle.brand || vehicle.model) && (
                                        <Text fontSize={13} color={appTheme.colors.primary} opacity={0.8}>
                                            {[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}
                                        </Text>
                                    )}
                                </YStack>
                                {vehicleStyle && (
                                    <XStack paddingHorizontal={10} paddingVertical={4}
                                        borderRadius={appTheme.radius.pill}
                                        backgroundColor={vehicleStyle.bg}
                                        borderWidth={1} borderColor={vehicleStyle.border}>
                                        <Text fontSize={12} fontWeight="800" color={vehicleStyle.text}>
                                            {VEHICLE_STATUS_LABEL[vehicle.status]}
                                        </Text>
                                    </XStack>
                                )}
                            </XStack>

                            {/* Info */}
                            <YStack paddingHorizontal={16} paddingVertical={4}>
                                {vehicle.vehicle_group_name && (
                                    <InfoRow label="Nhóm xe" value={vehicle.vehicle_group_name} />
                                )}
                                {vehicle.load_capacity_kg != null && (
                                    <InfoRow label="Tải trọng" value={`${vehicle.load_capacity_kg.toLocaleString('vi-VN')} kg`} />
                                )}
                                {vehicle.manufacture_year && (
                                    <InfoRow label="Năm sản xuất" value={String(vehicle.manufacture_year)} />
                                )}
                                {vehicle.purchase_date && (
                                    <InfoRow label="Ngày mua" value={fmtDate(vehicle.purchase_date)} />
                                )}
                            </YStack>
                        </YStack>

                        {/* Nút bảo dưỡng nếu có task đang mở */}
                        {hasActiveMaintenance && (
                            <XStack
                                marginHorizontal={appTheme.spacing.screenX}
                                marginTop={12}
                                padding={14}
                                borderRadius={appTheme.radius.lg}
                                backgroundColor={appTheme.colors.warningSoft}
                                borderWidth={1}
                                borderColor={appTheme.colors.warningBorder}
                                alignItems="center"
                                gap={10}
                                onPress={() => router.push('/maintenance')}
                            >
                                <Wrench size={18} color={appTheme.colors.warningText} />
                                <YStack flex={1}>
                                    <Text fontSize={13} fontWeight="800" color={appTheme.colors.warningText}>
                                        Đang có nhiệm vụ bảo dưỡng
                                    </Text>
                                    <Text fontSize={12} color={appTheme.colors.warningText} opacity={0.8}>
                                        Nhấn để xem và hoàn thành
                                    </Text>
                                </YStack>
                            </XStack>
                        )}

                        {/* Lịch sử bảo dưỡng */}
                        <YStack
                            marginHorizontal={appTheme.spacing.screenX}
                            marginTop={16}
                            borderRadius={appTheme.radius.lg}
                            borderWidth={1}
                            borderColor={appTheme.colors.border}
                            backgroundColor={appTheme.colors.surface}
                            overflow="hidden"
                        >
                            <XStack paddingHorizontal={16} paddingVertical={10}
                                backgroundColor={appTheme.colors.surfaceSoft}
                                alignItems="center" gap={8}>
                                <Calendar size={14} color={appTheme.colors.textMuted} />
                                <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>
                                    LỊCH SỬ BẢO DƯỠNG ({maintenance.length})
                                </Text>
                            </XStack>

                            {maintenance.length === 0 ? (
                                <YStack alignItems="center" paddingVertical={32} gap={8}>
                                    <Package size={32} color={appTheme.colors.border} />
                                    <Text fontSize={13} color={appTheme.colors.textMuted}>
                                        Chưa có lịch sử bảo dưỡng
                                    </Text>
                                </YStack>
                            ) : (
                                maintenance.map((record) => (
                                    <MaintenanceRow key={record.id} record={record} />
                                ))
                            )}
                        </YStack>

                        {/* Lịch sử gán xe */}
                        <YStack
                            marginHorizontal={appTheme.spacing.screenX}
                            marginTop={16}
                            borderRadius={appTheme.radius.lg}
                            borderWidth={1}
                            borderColor={appTheme.colors.border}
                            backgroundColor={appTheme.colors.surface}
                            overflow="hidden"
                        >
                            <XStack paddingHorizontal={16} paddingVertical={10}
                                backgroundColor={appTheme.colors.surfaceSoft}
                                alignItems="center" gap={8}>
                                <ArrowLeftRight size={14} color={appTheme.colors.textMuted} />
                                <Text fontSize={11} fontWeight="900" color={appTheme.colors.textMuted}>
                                    LỊCH SỬ GÁN XE ({assignments.length})
                                </Text>
                            </XStack>

                            {assignments.length === 0 ? (
                                <YStack alignItems="center" paddingVertical={24} gap={8}>
                                    <Text fontSize={13} color={appTheme.colors.textMuted}>
                                        Chưa có lịch sử gán xe
                                    </Text>
                                </YStack>
                            ) : (
                                assignments.map((item) => {
                                    const isAssign = item.action === 'assign';
                                    return (
                                        <XStack
                                            key={item.id}
                                            paddingHorizontal={14} paddingVertical={12}
                                            borderBottomWidth={1} borderBottomColor={appTheme.colors.border}
                                            alignItems="center" gap={12}
                                        >
                                            <XStack width={36} height={36} borderRadius={10}
                                                backgroundColor={isAssign ? appTheme.colors.successSoft : appTheme.colors.dangerSoft}
                                                borderWidth={1}
                                                borderColor={isAssign ? appTheme.colors.successBorder : appTheme.colors.dangerBorder}
                                                alignItems="center" justifyContent="center">
                                                <Car size={16} color={isAssign ? appTheme.colors.successText : appTheme.colors.dangerText} />
                                            </XStack>
                                            <YStack flex={1} gap={2}>
                                                <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>
                                                    {isAssign ? 'Được gán xe' : 'Bị gỡ khỏi xe'} {item.plate_number}
                                                </Text>
                                                <Text fontSize={12} color={appTheme.colors.textMuted}>
                                                    {fmtDate(item.created_at)}
                                                    {item.vehicle_group_name ? ` · ${item.vehicle_group_name}` : ''}
                                                    {item.created_by_name ? ` · bởi ${item.created_by_name}` : ''}
                                                </Text>
                                                {item.note ? (
                                                    <Text fontSize={12} color={appTheme.colors.textMuted} numberOfLines={1}>
                                                        {item.note}
                                                    </Text>
                                                ) : null}
                                            </YStack>
                                        </XStack>
                                    );
                                })
                            )}
                        </YStack>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

export default VehicleScreen;
