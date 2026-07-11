import { useState } from 'react';
import {
    ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal,
    Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View,
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
import type { MaintenanceRecord, MaintenanceStatus, MaintenanceType } from '@/types/maintenance';
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
    requested:            { bg: appTheme.colors.surfaceSoft,   text: appTheme.colors.textMuted,    border: appTheme.colors.border         },
    open:                 { bg: appTheme.colors.warningSoft,   text: appTheme.colors.warningText,  border: appTheme.colors.warningBorder  },
    pending_verification: { bg: appTheme.colors.primarySoft,   text: appTheme.colors.primary,      border: appTheme.colors.primaryMuted   },
    completed:            { bg: appTheme.colors.successSoft,   text: appTheme.colors.successText,  border: appTheme.colors.successBorder  },
    rejected:             { bg: appTheme.colors.dangerSoft,    text: appTheme.colors.dangerText,   border: appTheme.colors.dangerBorder   },
};

// ─── Maintenance card ─────────────────────────────────────────────────────────

function MaintenanceCard({
    record,
    onBillUploaded,
    onCompleted,
}: {
    record: MaintenanceRecord;
    onBillUploaded: (vehicleId: number, uri: string) => Promise<void>;
    onCompleted:    (vehicleId: number, cost: number) => Promise<void>;
}) {
    const [expanded,    setExpanded]    = useState(record.status === 'open' || record.status === 'requested' || record.status === 'rejected');
    const [showCamera,  setShowCamera]  = useState(false);
    const [uploading,   setUploading]   = useState(false);
    const [completing,  setCompleting]  = useState(false);

    const { displayValue: cost, rawValue: costRaw, onChangeText: onCostChange } = useMoneyInput(record.cost ?? '');
    const { showConfirm } = useConfirm();

    const style = STATUS_STYLE[record.status];
    const isOpen = record.status === 'open';
    const isPending = record.status === 'pending_verification';
    const isRequested = record.status === 'requested';
    const isRejected = record.status === 'rejected';

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

                        {/* Requested / rejected banners */}
                        {isRequested && (
                            <XStack
                                padding={12} borderRadius={appTheme.radius.sm}
                                backgroundColor={appTheme.colors.surfaceSoft}
                                alignItems="center" gap={10}
                            >
                                <Clock size={16} color={appTheme.colors.textMuted} />
                                <Text flex={1} fontSize={13} color={appTheme.colors.textMuted}>
                                    Đã gửi yêu cầu bảo dưỡng. Đang chờ quản lý duyệt.
                                </Text>
                            </XStack>
                        )}

                        {isRejected && (
                            <XStack
                                padding={12} borderRadius={appTheme.radius.sm}
                                backgroundColor={appTheme.colors.dangerSoft}
                                alignItems="flex-start" gap={10}
                            >
                                <Text flex={1} fontSize={13} color={appTheme.colors.dangerText}>
                                    Yêu cầu bị từ chối{record.reject_reason ? `: ${record.reject_reason}` : '.'}
                                </Text>
                            </XStack>
                        )}

                        {/* Cost row */}
                        {!isRequested && !isRejected && (
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
                        )}

                        {/* Bill images — cho phép thêm ảnh cả khi đang chờ duyệt */}
                        {!isRejected && (
                        <YStack gap={8}>
                            <XStack justifyContent="space-between" alignItems="center">
                                <Text fontSize={12} color={appTheme.colors.textMuted}>
                                    {isRequested ? 'Chứng từ' : 'Hóa đơn'} ({record.bill_pics.length} ảnh)
                                </Text>
                                {(isOpen || isRequested) && (
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

                            {(isOpen || isRequested) && record.bill_pics.length === 0 && (
                                <Text fontSize={12} color={appTheme.colors.textMuted} style={{ fontStyle: 'italic' }}>
                                    Chưa có ảnh chứng từ
                                </Text>
                            )}
                        </YStack>
                        )}

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

// ─── Request modal ────────────────────────────────────────────────────────────

const REQUEST_TYPES: MaintenanceType[] = ['scheduled', 'repair', 'inspection', 'emergency'];

function RequestMaintenanceModal({ onClose, onSuccess }: {
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [type,   setType]   = useState<MaintenanceType>('scheduled');
    const [reason, setReason] = useState('');
    const [billUris, setBillUris] = useState<string[]>([]);
    const [showCamera, setShowCamera] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!reason.trim()) {
            setError('Vui lòng nhập lý do yêu cầu bảo dưỡng');
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            await maintenanceService.requestMaintenance({ maintenance_type: type, reason: reason.trim(), billUris });
            Alert.alert('Đã gửi yêu cầu', 'Quản lý sẽ xem xét và duyệt yêu cầu bảo dưỡng của bạn.', [
                { text: 'Đóng', onPress: onSuccess },
            ]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Không thể gửi yêu cầu');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (showCamera) {
        return (
            <CameraModal
                visible
                label="Chụp chứng từ / báo giá"
                onCapture={(uri) => { setBillUris((prev) => [...prev, uri]); setShowCamera(false); }}
                onClose={() => setShowCamera(false)}
            />
        );
    }

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={s2.modalOverlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Pressable style={s2.modalBackdrop} onPress={onClose} />
                <View style={s2.modalSheet}>
                    <View style={s2.handle} />
                    <Text fontSize={17} fontWeight="900" color={appTheme.colors.text} marginBottom={6}>
                        Yêu cầu bảo dưỡng xe
                    </Text>
                    <Text fontSize={13} color={appTheme.colors.textMuted} marginBottom={16}>
                        Gửi yêu cầu để quản lý duyệt trước khi đưa xe đi bảo dưỡng
                    </Text>

                    <Text fontSize={13} fontWeight="700" color={appTheme.colors.text} marginBottom={8}>
                        Loại bảo dưỡng
                    </Text>
                    <XStack flexWrap="wrap" gap={8} marginBottom={14}>
                        {REQUEST_TYPES.map((t) => (
                            <Pressable
                                key={t}
                                style={[s2.typeChip, type === t && s2.typeChipActive]}
                                onPress={() => setType(t)}
                            >
                                <Text
                                    fontSize={13} fontWeight="700"
                                    color={type === t ? appTheme.colors.primary : appTheme.colors.textMuted}
                                >
                                    {MAINTENANCE_TYPE_LABEL[t]}
                                </Text>
                            </Pressable>
                        ))}
                    </XStack>

                    <Text fontSize={13} fontWeight="700" color={appTheme.colors.text} marginBottom={8}>
                        Lý do
                    </Text>
                    <TextInput
                        style={[s2.input, { height: 80, textAlignVertical: 'top' }]}
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Mô tả tình trạng xe, lý do cần bảo dưỡng..."
                        placeholderTextColor={appTheme.colors.textMuted}
                        multiline
                    />

                    <XStack justifyContent="space-between" alignItems="center" marginTop={14} marginBottom={8}>
                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.text}>
                            Ảnh chứng từ ({billUris.length}) — không bắt buộc
                        </Text>
                        <Pressable style={s2.typeChip} onPress={() => setShowCamera(true)} disabled={billUris.length >= 5}>
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.primary}>
                                {billUris.length >= 5 ? 'Tối đa 5 ảnh' : '+ Chụp ảnh'}
                            </Text>
                        </Pressable>
                    </XStack>
                    {billUris.length > 0 ? (
                        <XStack flexWrap="wrap" gap={8}>
                            {billUris.map((uri, i) => (
                                <Pressable
                                    key={i}
                                    onLongPress={() => setBillUris((prev) => prev.filter((_, j) => j !== i))}
                                >
                                    <Image source={{ uri }} style={s2.billThumb} />
                                </Pressable>
                            ))}
                        </XStack>
                    ) : null}

                    {error ? (
                        <Text fontSize={12} color={appTheme.colors.dangerText} marginTop={8}>{error}</Text>
                    ) : null}

                    <XStack gap={10} marginTop={20}>
                        <Pressable style={[s2.actionBtn, s2.cancelBtn]} onPress={onClose}>
                            <Text fontSize={14} fontWeight="700" color={appTheme.colors.textMuted}>Huỷ</Text>
                        </Pressable>
                        <Pressable
                            style={[s2.actionBtn, s2.confirmBtn, isSubmitting && { opacity: 0.6 }]}
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

export function MaintenanceScreen() {
    const { records, isLoading, error, reload } = useMaintenance();
    const [refreshing, setRefreshing] = useState(false);
    const [showRequestModal, setShowRequestModal] = useState(false);

    // Đang có yêu cầu / đợt bảo dưỡng chưa xong → không cho gửi thêm
    const hasActive = records.some((r) => ['requested', 'open', 'pending_verification'].includes(r.status));

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
            <ScreenHeader title="Bảo dưỡng xe" showBack />

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: appTheme.spacing.screenX, paddingTop: 16, paddingBottom: appTheme.spacing.screenBottom }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={appTheme.colors.primary} />}
                showsVerticalScrollIndicator={false}
            >
                {/* Request button */}
                {!isLoading && !hasActive ? (
                    <Pressable
                        style={s2.requestBtn}
                        onPress={() => setShowRequestModal(true)}
                    >
                        <Wrench size={16} color="#fff" />
                        <Text fontSize={14} fontWeight="900" color="#fff">Yêu cầu bảo dưỡng xe</Text>
                    </Pressable>
                ) : null}
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

            {showRequestModal ? (
                <RequestMaintenanceModal
                    onClose={() => setShowRequestModal(false)}
                    onSuccess={() => { setShowRequestModal(false); void reload(false); }}
                />
            ) : null}
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

const s2 = StyleSheet.create({
    requestBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 48,
        borderRadius: appTheme.radius.md,
        backgroundColor: appTheme.colors.primary,
        marginBottom: 16,
    },
    typeChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: appTheme.colors.border,
        backgroundColor: appTheme.colors.surfaceSoft,
    },
    typeChipActive: {
        borderColor: appTheme.colors.primaryMuted,
        backgroundColor: appTheme.colors.primarySoft,
    },
    input: {
        borderWidth: 1.5,
        borderColor: appTheme.colors.border,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: appTheme.colors.text,
        backgroundColor: appTheme.colors.surfaceSoft,
    },
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet: {
        backgroundColor: appTheme.colors.background,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        padding: 24,
        paddingTop: 12,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: appTheme.colors.border,
        alignSelf: 'center',
        marginBottom: 20,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelBtn: {
        backgroundColor: appTheme.colors.surfaceSoft,
        borderWidth: 1,
        borderColor: appTheme.colors.border,
    },
    confirmBtn: { backgroundColor: appTheme.colors.primary },
    billThumb: {
        width: 64,
        height: 64,
        borderRadius: 10,
        backgroundColor: appTheme.colors.border,
    },
});
