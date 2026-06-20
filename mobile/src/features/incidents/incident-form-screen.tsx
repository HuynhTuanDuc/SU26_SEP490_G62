import { useRef, useState } from 'react';
import {
    Alert, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
    Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import {
    AlertTriangle, Camera, CheckCircle, History, MapPin, Navigation,
    Package, Truck, X, Zap,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppButton } from '@/components/app-button';
import { AppText }   from '@/components/app-text';
import { ScreenHeader } from '@/components/screen-header';
import { appTheme } from '@/theme/app-theme';
import { useSubmitIncident } from '@/hooks/use-submit-incident';
import { useToast } from '@/providers/ui-provider';
import { incidentService } from '@/services/incident-service';
import { ApiError } from '@/lib/api-error';
import {
    INCIDENT_SEVERITY_LABEL,
    INCIDENT_SUBTYPES,
    INCIDENT_TYPE_LABEL,
} from '@/types/incident';
import type { IncidentSeverity, IncidentType } from '@/types/incident';

// ─── Constants ────────────────────────────────────────────────────────────────

const INCIDENT_TYPES: IncidentType[] = [
    'vehicle_breakdown', 'cargo_damage', 'road_incident',
    'customer_refusal', 'traffic_jam', 'other',
];
const SEVERITIES: IncidentSeverity[] = ['low', 'medium', 'high', 'critical'];
const MAX_IMAGES = 3;

const TYPE_ICON: Record<IncidentType, React.ReactNode> = {
    vehicle_breakdown: <Truck        size={22} color={appTheme.colors.danger}       />,
    cargo_damage:      <Package      size={22} color={appTheme.colors.warning}      />,
    road_incident:     <AlertTriangle size={22} color={appTheme.colors.warningText} />,
    customer_refusal:  <X            size={22} color='#7C3AED'                      />,
    traffic_jam:       <Navigation   size={22} color={appTheme.colors.primary}      />,
    other:             <Zap          size={22} color={appTheme.colors.textMuted}    />,
};

const TYPE_BG: Record<IncidentType, string> = {
    vehicle_breakdown: '#FEF2F2',
    cargo_damage:      '#FFFBEB',
    road_incident:     '#FFF7ED',
    customer_refusal:  '#F5F3FF',
    traffic_jam:       appTheme.colors.primarySoft,
    other:             appTheme.colors.surfaceSoft,
};

const TYPE_BORDER: Record<IncidentType, string> = {
    vehicle_breakdown: appTheme.colors.dangerBorder,
    cargo_damage:      appTheme.colors.warningBorder,
    road_incident:     '#FED7AA',
    customer_refusal:  '#DDD6FE',
    traffic_jam:       appTheme.colors.primaryMuted,
    other:             appTheme.colors.border,
};

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
    low:      appTheme.colors.success,
    medium:   appTheme.colors.warning,
    high:     appTheme.colors.danger,
    critical: '#7C3AED',
};

// ─── Camera fullscreen ────────────────────────────────────────────────────────

function CameraCapture({
    onCapture,
    onClose,
}: {
    onCapture: (uri: string) => void;
    onClose: () => void;
}) {
    const cameraRef = useRef<CameraView>(null);

    const handleShutter = async () => {
        if (!cameraRef.current) return;
        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
            if (photo?.uri) onCapture(photo.uri);
        } catch {
            Alert.alert('Lỗi', 'Không thể chụp ảnh. Vui lòng thử lại.');
        }
    };

    return (
        <View style={StyleSheet.absoluteFill}>
            <StatusBar style="light" />
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

            <View style={cam.frame} pointerEvents="none">
                <View style={[cam.corner, cam.TL]} /><View style={[cam.corner, cam.TR]} />
                <View style={[cam.corner, cam.BL]} /><View style={[cam.corner, cam.BR]} />
            </View>

            <View style={cam.topBar}>
                <XStack paddingHorizontal={20} paddingTop={56} paddingBottom={14} alignItems="center" gap={12}>
                    <Pressable onPress={onClose} hitSlop={12} style={cam.closeBtn}>
                        <X size={20} color="#fff" />
                    </Pressable>
                    <Text fontSize={15} fontWeight="900" color="#fff">Chụp ảnh minh chứng</Text>
                </XStack>
            </View>

            <View style={cam.shutterBar}>
                <Text style={cam.guide}>Đảm bảo ảnh rõ nét trước khi chụp</Text>
                <Pressable onPress={handleShutter} style={cam.shutter}>
                    <View style={cam.shutterInner}>
                        <Camera size={28} color={appTheme.colors.primary} />
                    </View>
                </Pressable>
            </View>
        </View>
    );
}

// ─── Image grid ───────────────────────────────────────────────────────────────

function ImageGrid({
    uris,
    onAdd,
    onRemove,
}: {
    uris: string[];
    onAdd: () => void;
    onRemove: (index: number) => void;
}) {
    const canAdd = uris.length < MAX_IMAGES;

    return (
        <YStack gap={8}>
            <XStack alignItems="center" justifyContent="space-between">
                <XStack alignItems="center" gap={6}>
                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                        ẢNH MINH CHỨNG
                    </Text>
                    <View style={s.optionalBadge}>
                        <Text fontSize={9} fontWeight="700" color={appTheme.colors.textMuted}>TUỲ CHỌN</Text>
                    </View>
                </XStack>
                <Text fontSize={11} color={appTheme.colors.textMuted}>{uris.length}/{MAX_IMAGES}</Text>
            </XStack>

            <XStack flexWrap="wrap" gap={8}>
                {uris.map((uri, i) => (
                    <View key={i} style={s.thumb}>
                        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        <Pressable onPress={() => onRemove(i)} style={s.thumbDelete} hitSlop={4}>
                            <X size={12} color="#fff" />
                        </Pressable>
                    </View>
                ))}

                {canAdd ? (
                    <Pressable onPress={onAdd} style={s.addThumb}>
                        <Camera size={20} color={appTheme.colors.primary} />
                        <Text fontSize={10} fontWeight="700" color={appTheme.colors.primary} marginTop={4}>
                            Thêm ảnh
                        </Text>
                    </Pressable>
                ) : null}
            </XStack>

            {uris.length === 0 ? (
                <Text fontSize={11} color={appTheme.colors.textMuted} fontStyle="italic">
                    Ảnh không bắt buộc nhưng giúp điều phối viên xử lý nhanh hơn
                </Text>
            ) : null}
        </YStack>
    );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function IncidentFormScreen() {
    const { shipmentId } = useLocalSearchParams<{ shipmentId: string }>();
    const { showToast }  = useToast();

    // Form state
    const [incidentType,       setIncidentType]       = useState<IncidentType>('vehicle_breakdown');
    const [selectedSub,        setSelectedSub]         = useState<string | null>(null);
    const [severity,           setSeverity]            = useState<IncidentSeverity>('medium');
    const [description,        setDescription]         = useState('');
    const [location,           setLocation]            = useState('');
    const [imageUris,          setImageUris]           = useState<string[]>([]);
    const [showCamera,         setShowCamera]          = useState(false);
    const [isGettingLocation,  setIsGettingLocation]   = useState(false);
    const [duplicateId,        setDuplicateId]         = useState<number | null>(null);

    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const parsedShipmentId = shipmentId ? Number(shipmentId) : null;

    const { isSubmitting, error, submit, clearError } = useSubmitIncident(
        (incident) => {
            showToast({ type: 'success', message: 'Đã gửi báo cáo sự cố. Điều phối viên sẽ phản hồi sớm.' });
            router.back();
        },
        async (err) => {
            if (err instanceof ApiError && err.status === 409 && parsedShipmentId) {
                try {
                    const { incidents } = await incidentService.getShipmentIncidents(parsedShipmentId);
                    const dup = incidents.find((i) => i.incident_type === incidentType);
                    if (dup) setDuplicateId(dup.id);
                } catch {}
            }
        },
    );

    // ── Type change resets sub-type + duplicate state ──
    const handleTypeChange = (t: IncidentType) => {
        setIncidentType(t);
        setSelectedSub(null);
        setDuplicateId(null);
        clearError();
        setFieldErrors({});
    };

    // ── GPS location ──
    const handleGetLocation = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Cần quyền vị trí', 'Vui lòng cấp quyền vị trí trong cài đặt.');
            return;
        }
        setIsGettingLocation(true);
        try {
            const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            const [geocode] = await Location.reverseGeocodeAsync(loc.coords).catch(() => [null]);
            if (geocode) {
                const parts = [geocode.street, geocode.district, geocode.city].filter(Boolean);
                setLocation(parts.join(', ') || `${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
            } else {
                setLocation(`${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
            }
        } catch {
            Alert.alert('Lỗi', 'Không thể lấy vị trí. Vui lòng nhập thủ công.');
        } finally {
            setIsGettingLocation(false);
        }
    };

    // ── Camera ──
    const openCamera = async () => {
        if (!cameraPermission?.granted) {
            const res = await requestCameraPermission();
            if (!res.granted) {
                Alert.alert('Cần quyền camera', 'Vui lòng cấp quyền camera trong cài đặt.');
                return;
            }
        }
        setShowCamera(true);
    };

    const handleCapture = (uri: string) => {
        setImageUris((prev) => [...prev, uri]);
        setShowCamera(false);
    };

    const removeImage = (index: number) => {
        setImageUris((prev) => prev.filter((_, i) => i !== index));
    };

    // ── Validation ──
    const validate = (): boolean => {
        const errors: Record<string, string> = {};
        if (!description.trim()) {
            errors.description = 'Mô tả sự cố là bắt buộc';
        } else if (description.trim().length < 10) {
            errors.description = 'Mô tả phải có ít nhất 10 ký tự';
        }
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // ── Submit ──
    const handleSubmit = async () => {
        if (!validate()) return;
        setDuplicateId(null);
        const fullDescription = selectedSub
            ? `[${selectedSub}] ${description.trim()}`
            : description.trim();
        await submit({
            shipmentId:    parsedShipmentId,
            incidentType,
            severityLevel: severity,
            description:   fullDescription,
            location:      location.trim() || undefined,
            imageUris,
        });
    };

    // ── Camera fullscreen overlay ──
    if (showCamera) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                <CameraCapture
                    onCapture={handleCapture}
                    onClose={() => setShowCamera(false)}
                />
            </View>
        );
    }

    const subtypes = INCIDENT_SUBTYPES[incidentType];

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <StatusBar style="dark" />
            <ScreenHeader
                title="Báo cáo sự cố"
                showBack
                right={
                    <Pressable
                        onPress={() => router.push('/incident-history')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        hitSlop={10}
                    >
                        <History size={15} color={appTheme.colors.primary} />
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.primary}>Lịch sử</Text>
                    </Pressable>
                }
            />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        paddingHorizontal: appTheme.spacing.screenX,
                        paddingTop: 20,
                        paddingBottom: appTheme.spacing.screenBottom + 60,
                        gap: 22,
                    }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Incident type ── */}
                    <YStack gap={10}>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                            LOẠI SỰ CỐ
                        </Text>
                        <YStack gap={8}>
                            {INCIDENT_TYPES.map((t) => {
                                const active = t === incidentType;
                                return (
                                    <Pressable
                                        key={t}
                                        onPress={() => handleTypeChange(t)}
                                        style={[
                                            s.typeCard,
                                            {
                                                borderColor: active ? TYPE_BORDER[t] : appTheme.colors.border,
                                                backgroundColor: active ? TYPE_BG[t] : appTheme.colors.surface,
                                            },
                                        ]}
                                    >
                                        <XStack
                                            width={40} height={40} borderRadius={14}
                                            backgroundColor={active ? TYPE_BG[t] : appTheme.colors.surfaceSoft}
                                            borderWidth={1}
                                            borderColor={active ? TYPE_BORDER[t] : appTheme.colors.border}
                                            alignItems="center" justifyContent="center"
                                        >
                                            {TYPE_ICON[t]}
                                        </XStack>
                                        <YStack flex={1} gap={2}>
                                            <Text fontSize={14} fontWeight="900" color={appTheme.colors.text}>
                                                {INCIDENT_TYPE_LABEL[t]}
                                            </Text>
                                            <Text fontSize={11} color={appTheme.colors.textMuted}>
                                                {INCIDENT_SUBTYPES[t].slice(0, 3).join(' · ') || 'Ghi chú thêm thông tin'}
                                            </Text>
                                        </YStack>
                                        {active ? (
                                            <CheckCircle size={18} color={appTheme.colors.primary} />
                                        ) : null}
                                    </Pressable>
                                );
                            })}
                        </YStack>
                    </YStack>

                    {/* ── Sub-types ── */}
                    {subtypes.length > 0 ? (
                        <YStack gap={8}>
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                                CHI TIẾT (TUỲ CHỌN)
                            </Text>
                            <XStack flexWrap="wrap" gap={6}>
                                {subtypes.map((sub) => {
                                    const active = sub === selectedSub;
                                    return (
                                        <Pressable
                                            key={sub}
                                            onPress={() => setSelectedSub(active ? null : sub)}
                                            style={[
                                                s.chip,
                                                {
                                                    backgroundColor: active ? appTheme.colors.primarySoft : appTheme.colors.surfaceSoft,
                                                    borderColor: active ? appTheme.colors.primaryMuted : appTheme.colors.border,
                                                },
                                            ]}
                                        >
                                            <Text
                                                fontSize={12}
                                                fontWeight={active ? '900' : '600'}
                                                color={active ? appTheme.colors.primary : appTheme.colors.textMuted}
                                            >
                                                {sub}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </XStack>
                        </YStack>
                    ) : null}

                    {/* ── Severity ── */}
                    <YStack gap={8}>
                        <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                            MỨC ĐỘ NGHIÊM TRỌNG
                        </Text>
                        <XStack gap={8}>
                            {SEVERITIES.map((sv) => {
                                const active = sv === severity;
                                const color  = SEVERITY_COLOR[sv];
                                return (
                                    <Pressable
                                        key={sv}
                                        onPress={() => setSeverity(sv)}
                                        style={[
                                            s.severityPill,
                                            {
                                                flex: 1,
                                                backgroundColor: active ? color : appTheme.colors.surfaceSoft,
                                                borderColor: active ? color : appTheme.colors.border,
                                            },
                                        ]}
                                    >
                                        <Text
                                            fontSize={11}
                                            fontWeight="900"
                                            color={active ? '#fff' : appTheme.colors.textMuted}
                                            textAlign="center"
                                        >
                                            {INCIDENT_SEVERITY_LABEL[sv]}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </XStack>
                    </YStack>

                    {/* ── Description ── */}
                    <YStack gap={6}>
                        <XStack alignItems="center" gap={6}>
                            <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                                MÔ TẢ SỰ CỐ
                            </Text>
                            <View style={s.requiredBadge}>
                                <Text fontSize={9} fontWeight="900" color={appTheme.colors.danger}>BẮT BUỘC</Text>
                            </View>
                        </XStack>
                        <TextInput
                            style={[
                                s.input,
                                s.multiline,
                                fieldErrors.description ? { borderColor: appTheme.colors.danger } : {},
                            ]}
                            value={description}
                            onChangeText={(t) => {
                                setDescription(t);
                                if (fieldErrors.description) {
                                    setFieldErrors((e) => ({ ...e, description: '' }));
                                }
                            }}
                            placeholder="Mô tả chi tiết sự cố đã xảy ra (tối thiểu 10 ký tự)..."
                            placeholderTextColor={appTheme.colors.textMuted}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                            maxLength={500}
                        />
                        {fieldErrors.description ? (
                            <Text fontSize={11} color={appTheme.colors.danger}>{fieldErrors.description}</Text>
                        ) : (
                            <Text fontSize={11} color={appTheme.colors.textMuted} textAlign="right">
                                {description.length}/500
                            </Text>
                        )}
                    </YStack>

                    {/* ── Location with GPS ── */}
                    <YStack gap={6}>
                        <XStack alignItems="center" justifyContent="space-between">
                            <XStack alignItems="center" gap={6}>
                                <Text fontSize={12} fontWeight="700" color={appTheme.colors.textMuted}>
                                    VỊ TRÍ
                                </Text>
                                <View style={s.optionalBadge}>
                                    <Text fontSize={9} fontWeight="700" color={appTheme.colors.textMuted}>TUỲ CHỌN</Text>
                                </View>
                            </XStack>
                            <Pressable
                                onPress={handleGetLocation}
                                disabled={isGettingLocation}
                                style={s.gpsBtn}
                                hitSlop={8}
                            >
                                {isGettingLocation ? (
                                    <ActivityIndicator size={13} color={appTheme.colors.primary} />
                                ) : (
                                    <MapPin size={13} color={appTheme.colors.primary} />
                                )}
                                <Text fontSize={11} fontWeight="700" color={appTheme.colors.primary}>
                                    {isGettingLocation ? 'Đang lấy...' : 'Lấy vị trí'}
                                </Text>
                            </Pressable>
                        </XStack>
                        <TextInput
                            style={s.input}
                            value={location}
                            onChangeText={setLocation}
                            placeholder="Ví dụ: Đường Nguyễn Văn Linh, Q.7, TP.HCM"
                            placeholderTextColor={appTheme.colors.textMuted}
                            maxLength={200}
                        />
                    </YStack>

                    {/* ── Images ── */}
                    <ImageGrid
                        uris={imageUris}
                        onAdd={openCamera}
                        onRemove={removeImage}
                    />

                    {/* ── Error / Duplicate banner ── */}
                    {error ? (
                        <YStack
                            padding={12} borderRadius={10}
                            backgroundColor={appTheme.colors.dangerSoft}
                            borderWidth={1} borderColor={appTheme.colors.dangerBorder}
                            gap={10}
                        >
                            <XStack gap={8} alignItems="flex-start">
                                <AlertTriangle size={14} color={appTheme.colors.danger} style={{ marginTop: 1 }} />
                                <AppText variant="caption" tone="danger" flex={1}>{error}</AppText>
                            </XStack>
                            {duplicateId ? (
                                <Pressable
                                    style={s.duplicateBtn}
                                    onPress={() => router.push({ pathname: '/incident-edit', params: { id: String(duplicateId) } })}
                                >
                                    <Text fontSize={12} fontWeight="900" color={appTheme.colors.primary}>
                                        Chỉnh sửa sự cố đã tạo →
                                    </Text>
                                </Pressable>
                            ) : null}
                        </YStack>
                    ) : null}

                    {/* ── Actions ── */}
                    <XStack gap={10}>
                        <Pressable style={[s.btn, s.cancelBtn]} onPress={() => router.back()}>
                            <Text fontSize={14} fontWeight="700" color={appTheme.colors.textMuted}>Hủy</Text>
                        </Pressable>
                        <AppButton
                            flex={1}
                            tone="primary"
                            isLoading={isSubmitting}
                            onPress={handleSubmit}
                            height={52}
                        >
                            Gửi báo cáo
                        </AppButton>
                    </XStack>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const C  = 28;
const CT = 3;

const s = StyleSheet.create({
    typeCard: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 14, borderRadius: 14, borderWidth: 1.5,
    },
    chip: {
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: appTheme.radius.pill, borderWidth: 1.5,
    },
    severityPill: {
        paddingVertical: 10, borderRadius: 10, borderWidth: 1.5,
        alignItems: 'center', justifyContent: 'center',
    },
    input: {
        borderWidth: 1.5, borderRadius: 12, borderColor: appTheme.colors.border,
        paddingHorizontal: 14, paddingVertical: 12,
        fontSize: 14, color: appTheme.colors.text,
        backgroundColor: appTheme.colors.surface,
    },
    multiline: {
        minHeight: 100, textAlignVertical: 'top',
    },
    thumb: {
        width: 88, height: 88, borderRadius: 12, overflow: 'hidden',
        backgroundColor: appTheme.colors.surfaceSoft,
    },
    thumbDelete: {
        position: 'absolute', top: 4, right: 4,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center', justifyContent: 'center',
    },
    addThumb: {
        width: 88, height: 88, borderRadius: 12,
        borderWidth: 1.5, borderStyle: 'dashed', borderColor: appTheme.colors.primaryMuted,
        backgroundColor: appTheme.colors.primarySoft,
        alignItems: 'center', justifyContent: 'center',
    },
    requiredBadge: {
        paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 6, backgroundColor: '#fee2e2',
    },
    optionalBadge: {
        paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 6, backgroundColor: appTheme.colors.surfaceSoft,
        borderWidth: 1, borderColor: appTheme.colors.border,
    },
    gpsBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: appTheme.radius.pill,
        borderWidth: 1, borderColor: appTheme.colors.primaryMuted,
        backgroundColor: appTheme.colors.primarySoft,
    },
    duplicateBtn: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12, paddingVertical: 7,
        borderRadius: 8,
        backgroundColor: appTheme.colors.primarySoft,
        borderWidth: 1, borderColor: appTheme.colors.primaryMuted,
    },
    btn: {
        flex: 1, paddingVertical: 14, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
    },
    cancelBtn: { backgroundColor: appTheme.colors.surfaceSoft },
});

const cam = StyleSheet.create({
    topBar: {
        position: 'absolute', top: 0, left: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    closeBtn: {
        width: 40, height: 40, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
    },
    frame: { position: 'absolute', top: '22%', left: '8%', right: '8%', bottom: '28%' },
    corner: { position: 'absolute', width: C, height: C, borderColor: 'rgba(255,255,255,0.9)' },
    TL: { top: 0, left: 0, borderTopWidth: CT, borderLeftWidth: CT, borderTopLeftRadius: 4 },
    TR: { top: 0, right: 0, borderTopWidth: CT, borderRightWidth: CT, borderTopRightRadius: 4 },
    BL: { bottom: 0, left: 0, borderBottomWidth: CT, borderLeftWidth: CT, borderBottomLeftRadius: 4 },
    BR: { bottom: 0, right: 0, borderBottomWidth: CT, borderRightWidth: CT, borderBottomRightRadius: 4 },
    shutterBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingBottom: 56, paddingTop: 24,
        alignItems: 'center', gap: 18,
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
