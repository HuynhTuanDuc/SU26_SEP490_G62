import { useEffect, useRef, useState } from 'react';
import {
    Alert, Animated, Image, Modal, Platform,
    Pressable, ScrollView, StyleSheet, TextInput,
    useWindowDimensions, View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera, CheckCircle, ChevronDown, Trash2, X } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppButton }  from '@/components/app-button';
import { AppText }    from '@/components/app-text';
import { FormField }  from '@/components/form-field';
import { appTheme }   from '@/theme/app-theme';
import { useMoneyInput } from '@/hooks/use-money-input';
import { tripService } from '@/services/trip-service';
import type { ExpenseType } from '@/types/trip';
import { EXPENSE_TYPE_LABEL } from '@/types/trip';

const EXPENSE_TYPES: ExpenseType[] = ['fuel', 'toll', 'parking', 'repair', 'maintenance', 'other'];

const C  = 28;
const CT = 3;

type Props = {
    visible: boolean;
    shipmentId: number;
    onClose: () => void;
    onSuccess: () => void;
};

export function ExpenseFormModal({ visible, shipmentId, onClose, onSuccess }: Props) {
    const { height: windowHeight } = useWindowDimensions();

    // Animation — chạy trên native thread, không bị JS delay
    const slideAnim   = useRef(new Animated.Value(0)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            // Reset về 0 trước khi animate vào
            slideAnim.setValue(0);
            backdropAnim.setValue(0);
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 68,
                    friction: 12,
                    restDisplacementThreshold: 0.01,
                    restSpeedThreshold: 0.01,
                }),
                Animated.timing(backdropAnim, {
                    toValue: 1,
                    duration: 220,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    const closeWithAnimation = (cb: () => void) => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
            Animated.timing(backdropAnim, {
                toValue: 0,
                duration: 180,
                useNativeDriver: true,
            }),
        ]).start(cb);
    };

    const translateY = slideAnim.interpolate({
        inputRange:  [0, 1],
        outputRange: [windowHeight, 0],
    });

    // ── Form state ──
    const [expenseType,    setExpenseType]    = useState<ExpenseType>('fuel');
    const { displayValue: amount, rawValue: amountRaw, onChangeText: onAmountChange, clear: clearAmount } = useMoneyInput();
    const [description,    setDescription]    = useState('');
    const [receiptUri,     setReceiptUri]     = useState<string | null>(null);
    const [showCamera,     setShowCamera]     = useState(false);
    const [showTypePicker, setShowTypePicker] = useState(false);
    const [isSubmitting,   setSubmitting]     = useState(false);
    const [formError,      setFormError]      = useState<string | null>(null);

    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);

    const reset = () => {
        setExpenseType('fuel');
        clearAmount();
        setDescription('');
        setReceiptUri(null);
        setShowCamera(false);
        setShowTypePicker(false);
        setFormError(null);
    };

    const handleClose = () => closeWithAnimation(() => { reset(); onClose(); });

    const openCamera = async () => {
        if (!permission?.granted) {
            const res = await requestPermission();
            if (!res.granted) {
                Alert.alert('Cần quyền camera', 'Vui lòng cấp quyền camera trong cài đặt.');
                return;
            }
        }
        setShowCamera(true);
    };

    const handleCapture = async () => {
        if (!cameraRef.current) return;
        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
            if (photo?.uri) { setReceiptUri(photo.uri); setShowCamera(false); }
        } catch {
            Alert.alert('Lỗi', 'Không thể chụp ảnh, vui lòng thử lại.');
        }
    };

    const handleSubmit = async () => {
        if (!receiptUri) { setFormError('Vui lòng chụp ảnh biên lai'); return; }
        const amt = amountRaw;
        if (!amt || amt <= 0) { setFormError('Số tiền phải lớn hơn 0'); return; }

        setFormError(null);
        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('shipmentId', String(shipmentId));
            formData.append('expenseType', expenseType);
            formData.append('amount', String(amt));
            if (description.trim()) formData.append('description', description.trim());

            const filename = receiptUri.split('/').pop() ?? 'receipt.jpg';
            const ext      = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
            const mimeMap: Record<string, string> = {
                jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
            };
            formData.append('receipt', {
                uri: receiptUri, name: filename, type: mimeMap[ext] ?? 'image/jpeg',
            } as unknown as Blob);

            await tripService.createExpense(formData);
            closeWithAnimation(() => { reset(); onSuccess(); });
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Không thể thêm chi phí');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Inline camera fullscreen ──
    if (showCamera) {
        return (
            <Modal visible animationType="slide" statusBarTranslucent onRequestClose={() => setShowCamera(false)}>
                <View style={cam.container}>
                    <StatusBar style="light" />
                    <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
                    <View style={cam.frame} pointerEvents="none">
                        <View style={[cam.corner, cam.TL]} /><View style={[cam.corner, cam.TR]} />
                        <View style={[cam.corner, cam.BL]} /><View style={[cam.corner, cam.BR]} />
                    </View>
                    <View style={cam.topBar}>
                        <XStack paddingHorizontal={20} paddingTop={56} paddingBottom={14} alignItems="center" gap={12}>
                            <Pressable onPress={() => setShowCamera(false)} hitSlop={12} style={cam.iconBtn}>
                                <X size={20} color="#fff" />
                            </Pressable>
                            <Text fontSize={15} fontWeight="900" color="#fff">Chụp ảnh biên lai</Text>
                        </XStack>
                    </View>
                    <View style={cam.shutterBar}>
                        <Text style={cam.guide}>Đảm bảo ảnh rõ nét trước khi chụp</Text>
                        <Pressable onPress={handleCapture} style={cam.shutter}>
                            <View style={cam.shutterInner}>
                                <Camera size={28} color={appTheme.colors.primary} />
                            </View>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        );
    }

    return (
        // animationType="none" — tự handle animation để nội dung và nền cùng lên 1 lúc
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            {/* Backdrop fade */}
            <Animated.View
                style={[StyleSheet.absoluteFill, sheet.backdrop, { opacity: backdropAnim }]}
                pointerEvents="none"
            />
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

            {/* Sheet slide — toàn bộ nội dung + nền cùng 1 Animated.View */}
            <KeyboardAvoidingView
                style={sheet.kav}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
                pointerEvents="box-none"
            >
                <Animated.View style={[sheet.container, { transform: [{ translateY }] }]}>
                    <View style={sheet.handle} />

                    {/* Header */}
                    <XStack justifyContent="space-between" alignItems="center" marginBottom={18}>
                        <Text fontSize={16} fontWeight="900" color={appTheme.colors.text}>
                            Thêm chi phí phát sinh
                        </Text>
                        <Pressable onPress={handleClose} hitSlop={12}>
                            <X size={20} color={appTheme.colors.textMuted} />
                        </Pressable>
                    </XStack>

                    <ScrollView
                        style={{ maxHeight: windowHeight * 0.65 }}
                        contentContainerStyle={sheet.scrollContent}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                    >
                        {/* Type picker */}
                        <YStack gap={6} marginBottom={14}>
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                                LOẠI CHI PHÍ
                            </Text>
                            <Pressable onPress={() => setShowTypePicker(v => !v)} style={f.select}>
                                <Text fontSize={14} color={appTheme.colors.text} fontWeight="700">
                                    {EXPENSE_TYPE_LABEL[expenseType]}
                                </Text>
                                <ChevronDown size={16} color={appTheme.colors.textMuted} />
                            </Pressable>
                            {showTypePicker ? (
                                <YStack borderRadius={10} borderWidth={1} borderColor={appTheme.colors.border} overflow="hidden">
                                    {EXPENSE_TYPES.map((t) => (
                                        <Pressable
                                            key={t}
                                            onPress={() => { setExpenseType(t); setShowTypePicker(false); }}
                                            style={[f.typeOption, t === expenseType && f.typeOptionActive]}
                                        >
                                            <Text
                                                fontSize={14}
                                                fontWeight={t === expenseType ? '900' : '600'}
                                                color={t === expenseType ? appTheme.colors.primary : appTheme.colors.text}
                                            >
                                                {EXPENSE_TYPE_LABEL[t]}
                                            </Text>
                                            {t === expenseType
                                                ? <CheckCircle size={16} color={appTheme.colors.primary} />
                                                : null}
                                        </Pressable>
                                    ))}
                                </YStack>
                            ) : null}
                        </YStack>

                        {/* Amount */}
                        <YStack marginBottom={14}>
                            <FormField
                                label="SỐ TIỀN (VNĐ)"
                                value={amount}
                                onChangeText={onAmountChange}
                                placeholder="Ví dụ: 150.000"
                                keyboardType="numeric"
                            />
                        </YStack>

                        {/* Description */}
                        <YStack gap={6} marginBottom={14}>
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                                GHI CHÚ (tùy chọn)
                            </Text>
                            <TextInput
                                style={[f.input, { minHeight: 60, textAlignVertical: 'top' }]}
                                value={description}
                                onChangeText={setDescription}
                                placeholder="Mô tả chi phí..."
                                placeholderTextColor={appTheme.colors.textMuted}
                                multiline
                                numberOfLines={2}
                            />
                        </YStack>

                        {/* Receipt photo */}
                        <YStack gap={6} marginBottom={16}>
                            <XStack alignItems="center" gap={6}>
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                                    ẢNH BIÊN LAI
                                </Text>
                                <View style={f.requiredBadge}>
                                    <Text fontSize={9} fontWeight="900" color={appTheme.colors.danger}>BẮT BUỘC</Text>
                                </View>
                            </XStack>
                            {receiptUri ? (
                                <XStack
                                    borderRadius={10} borderWidth={1} borderColor={appTheme.colors.border}
                                    overflow="hidden" alignItems="center" backgroundColor={appTheme.colors.surface}
                                >
                                    <Image source={{ uri: receiptUri }} style={{ width: 80, height: 80 }} resizeMode="cover" />
                                    <YStack flex={1} paddingHorizontal={12} gap={4}>
                                        <XStack alignItems="center" gap={6}>
                                            <View style={f.doneDot} />
                                            <Text fontSize={13} fontWeight="700" color={appTheme.colors.success}>
                                                Đã chụp biên lai
                                            </Text>
                                        </XStack>
                                        <Pressable onPress={openCamera} style={f.retakeRow}>
                                            <Camera size={12} color={appTheme.colors.primary} />
                                            <Text fontSize={11} color={appTheme.colors.primary} fontWeight="700">Chụp lại</Text>
                                        </Pressable>
                                    </YStack>
                                    <Pressable onPress={() => setReceiptUri(null)} hitSlop={8} style={f.deleteBtn}>
                                        <Trash2 size={18} color={appTheme.colors.danger} />
                                    </Pressable>
                                </XStack>
                            ) : (
                                <Pressable onPress={openCamera} style={f.captureBtn}>
                                    <Camera size={20} color={appTheme.colors.primary} />
                                    <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary}>
                                        Chụp ảnh biên lai
                                    </Text>
                                </Pressable>
                            )}
                        </YStack>

                        {/* Error */}
                        {formError ? (
                            <YStack
                                padding={10} borderRadius={8} marginBottom={12}
                                backgroundColor={appTheme.colors.dangerSoft}
                                borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                            >
                                <AppText variant="caption" tone="danger">{formError}</AppText>
                            </YStack>
                        ) : null}
                    </ScrollView>

                    {/* Actions — ngoài ScrollView, luôn visible */}
                    <XStack gap={10} paddingTop={12}>
                        <Pressable style={[f.btn, f.cancelBtn]} onPress={handleClose}>
                            <Text fontSize={14} fontWeight="700" color={appTheme.colors.textMuted}>Hủy</Text>
                        </Pressable>
                        <AppButton
                            flex={1}
                            tone="primary"
                            isLoading={isSubmitting}
                            onPress={handleSubmit}
                            height={48}
                        >
                            Lưu chi phí
                        </AppButton>
                    </XStack>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sheet = StyleSheet.create({
    backdrop: {
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    kav: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    },
    handle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: appTheme.colors.border,
        alignSelf: 'center', marginBottom: 16,
    },
    scrollContent: {
        paddingBottom: 4,
    },
});

const f = StyleSheet.create({
    select: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        borderWidth: 1.5, borderColor: appTheme.colors.border, borderRadius: 10,
        paddingHorizontal: 14, paddingVertical: 12,
        backgroundColor: appTheme.colors.surface,
    },
    typeOption: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 14, paddingVertical: 12,
        backgroundColor: appTheme.colors.surface,
        borderBottomWidth: 1, borderBottomColor: appTheme.colors.border,
    },
    typeOptionActive: { backgroundColor: appTheme.colors.primarySoft },
    input: {
        borderWidth: 1.5, borderRadius: 10, borderColor: appTheme.colors.border,
        paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 14, color: appTheme.colors.text,
        backgroundColor: appTheme.colors.surface,
    },
    captureBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: 14, borderRadius: 10,
        borderWidth: 1.5, borderStyle: 'dashed', borderColor: appTheme.colors.primaryMuted,
        backgroundColor: appTheme.colors.primarySoft, justifyContent: 'center',
    },
    requiredBadge: {
        paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 6, backgroundColor: '#fee2e2',
    },
    doneDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: appTheme.colors.success },
    retakeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    deleteBtn: { paddingHorizontal: 14, paddingVertical: 12 },
    btn: {
        flex: 1, paddingVertical: 13, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    cancelBtn: { backgroundColor: '#f3f4f6' },
});

const cam = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    topBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
    iconBtn: {
        width: 40, height: 40, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
    },
    frame: { position: 'absolute', top: '24%', left: '10%', right: '10%', bottom: '26%' },
    corner: { position: 'absolute', width: C, height: C, borderColor: 'rgba(255,255,255,0.9)' },
    TL: { top: 0, left: 0, borderTopWidth: CT, borderLeftWidth: CT, borderTopLeftRadius: 4 },
    TR: { top: 0, right: 0, borderTopWidth: CT, borderRightWidth: CT, borderTopRightRadius: 4 },
    BL: { bottom: 0, left: 0, borderBottomWidth: CT, borderLeftWidth: CT, borderBottomLeftRadius: 4 },
    BR: { bottom: 0, right: 0, borderBottomWidth: CT, borderRightWidth: CT, borderBottomRightRadius: 4 },
    shutterBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingBottom: 52, paddingTop: 24, alignItems: 'center', gap: 18,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    guide: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
    shutter: {
        width: 76, height: 76, borderRadius: 38, backgroundColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
    },
    shutterInner: {
        width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: appTheme.colors.primaryMuted,
    },
});
