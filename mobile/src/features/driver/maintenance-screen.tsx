import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
    Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useConfirm } from '@/providers/ui-provider';
import { useMoneyInput } from '@/hooks/use-money-input';
import { StatusBar } from 'expo-status-bar';
import { CheckCircle2, Wrench, Clock, ImagePlus, X } from 'lucide-react-native';
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
import { money } from '@/lib/format-number';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};


const STATUS_STYLE: Record<MaintenanceStatus, { bg: string; text: string; border: string }> = {
    requested:            { bg: appTheme.colors.surfaceSoft,   text: appTheme.colors.textMuted,    border: appTheme.colors.border         },
    open:                 { bg: appTheme.colors.warningSoft,   text: appTheme.colors.warningText,  border: appTheme.colors.warningBorder  },
    pending_verification: { bg: appTheme.colors.primarySoft,   text: appTheme.colors.primary,      border: appTheme.colors.primaryMuted   },
    completed:            { bg: appTheme.colors.successSoft,   text: appTheme.colors.successText,  border: appTheme.colors.successBorder  },
    rejected:             { bg: appTheme.colors.dangerSoft,    text: appTheme.colors.dangerText,   border: appTheme.colors.dangerBorder   },
};

// ─── Maintenance card ─────────────────────────────────────────────────────────

// Lỗi không có mã HTTP (mất kết nối, hết thời gian chờ) xảy ra SAU khi ảnh đã gửi đi: máy
// chủ có thể vẫn kiểm tra xong và lưu ảnh. Đã tái hiện: app báo lỗi, tài xế tưởng ảnh hỏng
// nên chụp lại, và cả hai ảnh cùng lên bàn duyệt. Nên sau lỗi kiểu này phải tải lại danh
// sách và nói rõ để tài xế nhìn trước khi chụp lại.
const isLostResponse = (err: unknown) => {
    const status = (err as { status?: number })?.status;
    return !status || status >= 500;
};

function PhotoGrid({
    photos, removable, busy, onRemove,
}: {
    photos: string[];
    removable: boolean;
    busy: boolean;
    onRemove: (url: string) => void;
}) {
    if (photos.length === 0) return null;
    return (
        <XStack flexWrap="wrap" gap={8}>
            {photos.map((uri) => (
                <View key={uri}>
                    <Image source={{ uri }} style={s.billThumb} />
                    {removable && (
                        <Pressable
                            style={[s.removeBtn, busy && { opacity: 0.4 }]}
                            onPress={() => onRemove(uri)}
                            disabled={busy}
                            hitSlop={8}
                            accessibilityLabel="Xoá ảnh này"
                        >
                            <X size={12} color="#fff" />
                        </Pressable>
                    )}
                </View>
            ))}
        </XStack>
    );
}

const photoCount = (n: number) => (n > 0 ? ` (${n} ảnh)` : '');

// Trạng thái còn việc cho tài xế (hoặc cần đọc lý do) → mở sẵn thẻ.
const EXPANDED_BY_DEFAULT: MaintenanceStatus[] = ['requested', 'open', 'rejected'];

function MaintenanceCard({
    record,
    onBillUploaded,
    onPhotoRemoved,
    onCompleted,
}: {
    record: MaintenanceRecord;
    onBillUploaded: (vehicleId: number, uri: string, cost: number | null) => Promise<void>;
    onPhotoRemoved: (vehicleId: number, url: string) => Promise<void>;
    onCompleted:    (vehicleId: number, cost: number) => Promise<void>;
}) {
    const [expanded,    setExpanded]    = useState(EXPANDED_BY_DEFAULT.includes(record.status));
    const [showCamera,  setShowCamera]  = useState(false);
    const [uploading,   setUploading]   = useState(false);
    const [completing,  setCompleting]  = useState(false);
    const [removing,    setRemoving]    = useState(false);
    const busy = uploading || completing || removing;
    const requestPics = record.request_pics ?? [];

    const {
        displayValue: cost, rawValue: costRaw, onChangeText: onCostChange, setValue: setCost,
    } = useMoneyInput(record.cost ?? '');
    const { showConfirm } = useConfirm();

    // Quản lý duyệt / trả về làm lại / huỷ trong lúc màn hình đang mở: danh sách tự tải lại
    // (maintenance.assigned) nhưng thẻ vẫn là thẻ cũ cùng key, giữ trạng thái từ lúc mới hiện.
    // Bị trả về làm lại thì máy chủ đã xoá chi phí và hóa đơn, mà ô nhập vẫn hiện số cũ ngay
    // dưới dòng "nhập lại chi phí"; thẻ đang thu gọn (lúc chờ xác nhận) thì tài xế không thấy
    // việc phải làm. Nên đổi trạng thái là đồng bộ lại theo máy chủ.
    const seenStatus = useRef(record.status);
    useEffect(() => {
        if (seenStatus.current === record.status) return;
        seenStatus.current = record.status;
        setCost(Math.floor(Number(record.cost)) || 0);
        if (EXPANDED_BY_DEFAULT.includes(record.status)) setExpanded(true);
    }, [record.status, record.cost, setCost]);

    // Trạng thái ngoài bảng màu (máy chủ khác phiên bản, dữ liệu cũ...) thì dùng màu trung
    // tính: tra thiếu khoá thì `style.border` văng lỗi và sập cả màn hình.
    const style = STATUS_STYLE[record.status] ?? STATUS_STYLE.requested;
    const isOpen = record.status === 'open';
    const isPending = record.status === 'pending_verification';
    const isRequested = record.status === 'requested';
    const isRejected = record.status === 'rejected';

    // Ở bước bảo dưỡng (open) phải nhập chi phí TRƯỚC khi chụp hóa đơn: server đối
    // chiếu ảnh với số tiền ngay lúc upload, chưa có số tiền thì ảnh nào cũng qua.
    // Ảnh chứng từ/báo giá lúc còn 'requested' thì chưa có chi phí nên không chặn.
    const needsCostBeforeBill = isOpen && (!costRaw || costRaw <= 0);

    const handleCapture = async (uri: string) => {
        setShowCamera(false);
        setUploading(true);
        try {
            await onBillUploaded(record.vehicle_id, uri, isOpen ? costRaw : null);
        } catch (err) {
            const status = (err as { status?: number })?.status;
            const msg = err instanceof Error ? err.message : 'Không thể tải hóa đơn';
            // Ảnh bị quét từ chối (422) → yêu cầu tài xế chụp/chọn ảnh khác ngay.
            if (status === 422) {
                Alert.alert('Ảnh hóa đơn không hợp lệ', `${msg}\n\nVui lòng chụp hoặc chọn ảnh khác.`, [
                    { text: 'Chụp/chọn lại', onPress: () => setShowCamera(true) },
                    { text: 'Để sau', style: 'cancel' },
                ]);
            } else if (isLostResponse(err)) {
                Alert.alert(
                    'Chưa nhận được kết quả',
                    // Không tự khẳng định ảnh đã lưu hay chưa: câu của máy chủ nói rõ điều
                    // đó rồi (vd hết thời gian đẩy ảnh lên = chưa lưu), nói ngược lại ngay bên
                    // dưới thì tài xế không biết tin câu nào.
                    `${msg}\n\nDanh sách ảnh vừa được tải lại — nếu ảnh vừa chụp đã có trong đó thì KHÔNG cần chụp lại.`,
                );
            } else {
                Alert.alert('Lỗi', msg);
            }
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = async (url: string) => {
        const ok = await showConfirm({
            title: 'Xoá ảnh này?',
            message: 'Ảnh sẽ bị gỡ khỏi đợt bảo dưỡng. Nếu chụp nhầm, bạn có thể chụp lại ảnh khác.',
            confirmLabel: 'Xoá ảnh',
        });
        if (!ok) return;
        setRemoving(true);
        try {
            await onPhotoRemoved(record.vehicle_id, url);
        } catch (err) {
            Alert.alert('Không xoá được ảnh', err instanceof Error ? err.message : 'Vui lòng thử lại');
        } finally {
            setRemoving(false);
        }
    };

    const handleComplete = async () => {
        if (!costRaw || costRaw <= 0) {
            Alert.alert('Thiếu chi phí', 'Vui lòng nhập số tiền bảo dưỡng');
            return;
        }
        if (record.bill_pics.length === 0) {
            Alert.alert('Thiếu hóa đơn', requestPics.length > 0
                ? 'Ảnh chứng từ gửi kèm yêu cầu không thay cho hóa đơn. Vui lòng chụp hóa đơn thanh toán.'
                : 'Vui lòng chụp ít nhất một ảnh hóa đơn');
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
                                {MAINTENANCE_STATUS_LABEL[record.status] ?? record.status}
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

                        {/* Bị quản lý trả về làm lại chứng từ: record quay lại 'open'
                            nhưng vẫn giữ reject_reason để tài xế biết phải sửa gì */}
                        {isOpen && record.reject_reason && (
                            <XStack
                                padding={12} borderRadius={appTheme.radius.sm}
                                backgroundColor={appTheme.colors.dangerSoft}
                                alignItems="flex-start" gap={10}
                            >
                                <Text flex={1} fontSize={13} color={appTheme.colors.dangerText}>
                                    Chứng từ bị từ chối: {record.reject_reason}. Hãy chụp lại hoá đơn và nhập lại chi phí.
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
                                    {money(record.cost)}
                                </Text>
                            )}
                        </YStack>
                        )}

                        {/* Ảnh chụp lúc gửi yêu cầu (báo giá...) và hóa đơn thanh toán là hai
                            thứ khác nhau — chỉ hóa đơn được đối chiếu với chi phí. Từ bước bảo
                            dưỡng trở đi, ảnh gửi kèm yêu cầu đứng thành mục riêng, không nằm dưới
                            tiêu đề "Hóa đơn thanh toán". Chạm dấu × để gỡ ảnh chụp nhầm khi đợt
                            chưa gửi duyệt. */}
                        {!isRequested && !isRejected && requestPics.length > 0 && (
                            <YStack gap={8}>
                                <Text fontSize={12} color={appTheme.colors.textMuted}>
                                    Chứng từ gửi kèm yêu cầu{photoCount(requestPics.length)} — không thay cho hóa đơn
                                </Text>
                                <PhotoGrid
                                    photos={requestPics}
                                    removable={isOpen}
                                    busy={busy}
                                    onRemove={handleRemove}
                                />
                            </YStack>
                        )}

                        {/* Lúc chờ duyệt: chứng từ / báo giá. Từ bước bảo dưỡng: hóa đơn. */}
                        {!isRejected && (
                        <YStack gap={8}>
                            <XStack justifyContent="space-between" alignItems="center">
                                <Text fontSize={12} color={appTheme.colors.textMuted}>
                                    {isRequested
                                        ? `Chứng từ / báo giá${photoCount(requestPics.length)}`
                                        : `Hóa đơn thanh toán${photoCount(record.bill_pics.length)}`}
                                </Text>
                                {(isOpen || isRequested) && (
                                    <Pressable
                                        style={[s.uploadBtn, (busy || needsCostBeforeBill) && { opacity: 0.5 }]}
                                        onPress={() => setShowCamera(true)}
                                        disabled={busy || needsCostBeforeBill}
                                    >
                                        {uploading
                                            ? <ActivityIndicator size="small" color={appTheme.colors.primary} />
                                            : <ImagePlus size={14} color={appTheme.colors.primary} />}
                                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.primary}>
                                            {uploading ? 'Đang kiểm tra...' : 'Thêm ảnh'}
                                        </Text>
                                    </Pressable>
                                )}
                            </XStack>

                            {needsCostBeforeBill && (
                                <Text fontSize={12} color={appTheme.colors.warningText}>
                                    Nhập chi phí bảo dưỡng trước, sau đó mới chụp được ảnh hóa đơn.
                                </Text>
                            )}

                            <PhotoGrid
                                photos={isRequested ? requestPics : record.bill_pics}
                                removable={isOpen || isRequested}
                                busy={busy}
                                onRemove={handleRemove}
                            />

                            {isOpen && record.bill_pics.length === 0 && (
                                <Text fontSize={12} color={appTheme.colors.textMuted} style={{ fontStyle: 'italic' }}>
                                    Chưa có ảnh hóa đơn thanh toán
                                </Text>
                            )}
                            {isRequested && requestPics.length === 0 && (
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

                        {/* Khoá trong lúc ảnh đang "Đang kiểm tra...": hoàn tất lúc đó thì ảnh
                            đang quét không nằm trong lần đối chiếu số tiền (máy chủ sẽ từ chối). */}
                        {isOpen && (
                            <Pressable
                                style={[s.completeBtn, busy && { opacity: 0.6 }]}
                                onPress={handleComplete}
                                disabled={busy}
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
                label={isRequested ? 'Chụp chứng từ / báo giá' : 'Chụp hóa đơn bảo dưỡng'}
                onCapture={handleCapture}
                onClose={() => setShowCamera(false)}
                confirmBeforeUse
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
                confirmBeforeUse
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
                                <View key={uri}>
                                    <Image source={{ uri }} style={s2.billThumb} />
                                    <Pressable
                                        style={s.removeBtn}
                                        onPress={() => setBillUris((prev) => prev.filter((_, j) => j !== i))}
                                        hitSlop={8}
                                        accessibilityLabel="Bỏ ảnh này"
                                    >
                                        <X size={12} color="#fff" />
                                    </Pressable>
                                </View>
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

    // 409 = trạng thái trên máy chủ đã khác màn hình (đợt vừa gửi duyệt, hoặc có ảnh mới
    // trong lúc kiểm tra). Tải lại để tài xế nhìn thấy đúng trạng thái trước khi thử lại.
    //
    // Mất phản hồi (không có mã / 5xx) cũng tải lại: máy chủ có thể đã xử lý xong.
    const reloadOnConflict = async (err: unknown) => {
        if ((err as { status?: number })?.status === 409 || isLostResponse(err)) await reload(false);
        throw err;
    };

    const handleBillUploaded = async (vehicleId: number, uri: string, cost: number | null) => {
        // Chốt chi phí lên server trước khi gửi ảnh để bước quét hóa đơn có số tiền
        // mà đối chiếu — thứ tự này là phần chống vượt rào, không chỉ để tiện tay.
        if (cost && cost > 0) await maintenanceService.saveCost(vehicleId, cost);
        await maintenanceService.uploadBill(vehicleId, uri).catch(reloadOnConflict);
        await reload(false);
    };

    const handlePhotoRemoved = async (vehicleId: number, url: string) => {
        await maintenanceService.removePhoto(vehicleId, url).catch(reloadOnConflict);
        await reload(false);
    };

    const handleCompleted = async (vehicleId: number, cost: number) => {
        await maintenanceService.complete(vehicleId, cost).catch(reloadOnConflict);
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
                        onPhotoRemoved={handlePhotoRemoved}
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
    removeBtn: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: appTheme.colors.danger,
        alignItems: 'center',
        justifyContent: 'center',
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
