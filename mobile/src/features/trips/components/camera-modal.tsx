import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { CameraView } from 'expo-camera';
import { launchImageLibraryAsync, MediaTypeOptions, requestMediaLibraryPermissionsAsync } from 'expo-image-picker';
import { Camera, Check, Images, RotateCcw, X } from 'lucide-react-native';
import { Text, XStack } from 'tamagui';

import { appTheme } from '@/theme/app-theme';

type Props = {
    visible: boolean;
    label: string;
    onCapture: (uri: string) => void;
    onClose: () => void;
    /**
     * Cho xem lại ảnh vừa chụp/chọn trước khi dùng. Với ảnh hóa đơn thì bắt buộc nên bật:
     * ảnh được gửi lên và máy kiểm tra ngay khi rời camera — không có bước xem lại thì một
     * lần chụp nhầm là một lần tải nhầm.
     */
    confirmBeforeUse?: boolean;
};

const C  = 28;
const CT = 3;

export function CameraModal({ visible, label, onCapture, onClose, confirmBeforeUse = false }: Props) {
    const cameraRef = useRef<CameraView>(null);
    const [preview, setPreview] = useState<string | null>(null);

    // Đóng camera thì bỏ ảnh đang xem dở — mở lại phải bắt đầu từ khung chụp.
    useEffect(() => { if (!visible) setPreview(null); }, [visible]);

    const deliver = (uri: string) => {
        if (confirmBeforeUse) setPreview(uri);
        else onCapture(uri);
    };

    const handleShutter = async () => {
        if (!cameraRef.current) return;
        try {
            const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
            if (photo?.uri) deliver(photo.uri);
        } catch {
            Alert.alert('Lỗi', 'Không thể chụp ảnh, vui lòng thử lại.');
        }
    };

    // Chọn ảnh có sẵn từ thư viện — cùng đi qua onCapture như ảnh chụp.
    const handlePickFromGallery = async () => {
        try {
            const perm = await requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền truy cập thư viện ảnh để chọn hóa đơn.');
                return;
            }
            const result = await launchImageLibraryAsync({ mediaTypes: MediaTypeOptions.Images, quality: 0.85 });
            if (!result.canceled && result.assets?.[0]?.uri) deliver(result.assets[0].uri);
        } catch {
            Alert.alert('Lỗi', 'Không thể mở thư viện ảnh, vui lòng thử lại.');
        }
    };

    if (preview) {
        return (
            <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={() => setPreview(null)}>
                <View style={s.container}>
                    <StatusBar style="light" />
                    <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} contentFit="contain" />
                    <View style={s.topBar}>
                        <XStack paddingHorizontal={20} paddingTop={56} paddingBottom={14} alignItems="center" gap={12}>
                            <Text fontSize={15} fontWeight="900" color="#fff">Kiểm tra lại ảnh trước khi gửi</Text>
                        </XStack>
                    </View>
                    <View style={s.shutterBar}>
                        <Text style={s.guide}>Ảnh phải rõ số tiền, tên cửa hàng và biển số xe (nếu có)</Text>
                        <XStack alignItems="center" justifyContent="center" gap={16}>
                            <Pressable onPress={() => setPreview(null)} style={s.previewBtn}>
                                <RotateCcw size={18} color="#fff" />
                                <Text fontSize={14} fontWeight="800" color="#fff">Chụp lại</Text>
                            </Pressable>
                            <Pressable
                                onPress={() => { const uri = preview; setPreview(null); onCapture(uri); }}
                                style={[s.previewBtn, s.previewBtnPrimary]}
                            >
                                <Check size={18} color="#fff" />
                                <Text fontSize={14} fontWeight="800" color="#fff">Dùng ảnh này</Text>
                            </Pressable>
                        </XStack>
                    </View>
                </View>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
            <View style={s.container}>
                <StatusBar style="light" />
                <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

                {/* Corner guides */}
                <View style={s.frame} pointerEvents="none">
                    <View style={[s.corner, s.TL]} /><View style={[s.corner, s.TR]} />
                    <View style={[s.corner, s.BL]} /><View style={[s.corner, s.BR]} />
                </View>

                {/* Top bar */}
                <View style={s.topBar}>
                    <XStack paddingHorizontal={20} paddingTop={56} paddingBottom={14} alignItems="center" gap={12}>
                        <Pressable onPress={onClose} hitSlop={12} style={s.iconBtn}>
                            <X size={20} color="#fff" />
                        </Pressable>
                        <Text fontSize={15} fontWeight="900" color="#fff">{label}</Text>
                    </XStack>
                </View>

                {/* Shutter + chọn từ thư viện */}
                <View style={s.shutterBar}>
                    <Text style={s.guide}>Chụp ảnh hoặc chọn từ thư viện</Text>
                    <XStack alignItems="center" justifyContent="center" gap={28}>
                        <Pressable onPress={handlePickFromGallery} style={s.galleryBtn} hitSlop={12}>
                            <Images size={24} color="#fff" />
                        </Pressable>
                        <Pressable onPress={handleShutter} style={s.shutter}>
                            <View style={s.shutterInner}>
                                <Camera size={28} color={appTheme.colors.primary} />
                            </View>
                        </Pressable>
                        {/* giữ nút chụp cân giữa */}
                        <View style={s.galleryBtn} />
                    </XStack>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    topBar: {
        position: 'absolute', top: 0, left: 0, right: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
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
        paddingBottom: 52, paddingTop: 24,
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
    previewBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 20, height: 48, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.18)',
    },
    previewBtnPrimary: { backgroundColor: appTheme.colors.primary },
    galleryBtn: {
        width: 52, height: 52, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
    },
});
