import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardSafeScrollView } from '@/components/keyboard-safe-scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    CalendarDays, Globe, House, MapPin, Phone, User, UsersRound,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppButton } from '@/components/app-button';
import { DateInputField } from '@/components/date-input-field';
import { FormField } from '@/components/form-field';
import { ScreenHeader } from '@/components/screen-header';
import { appTheme } from '@/theme/app-theme';
import { useUpdateProfile } from '@/hooks/use-update-profile';
import { useToast } from '@/providers/ui-provider';
import type { Gender, UpdateProfilePayload } from '@/types/profile';

const NAME_REGEX  = /^[\p{L}\s]+$/u;
const PHONE_REGEX = /^\d{10}$/;

type FormErrors = {
    fullName?: string;
    phone?: string;
};

function validate(fullName: string, phone: string): FormErrors {
    const errors: FormErrors = {};
    if (!fullName.trim()) {
        errors.fullName = 'Họ tên không được để trống';
    } else if (!NAME_REGEX.test(fullName.trim())) {
        errors.fullName = 'Họ tên không được chứa số hoặc ký tự đặc biệt';
    }
    if (phone.trim() && !PHONE_REGEX.test(phone.trim())) {
        errors.phone = 'Số điện thoại phải đúng 10 chữ số';
    }
    return errors;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
    { value: 'male',   label: 'Nam' },
    { value: 'female', label: 'Nữ' },
    { value: 'other',  label: 'Khác' },
];

function GenderPicker({ value, onChange }: { value: Gender | null; onChange: (v: Gender) => void }) {
    return (
        <YStack gap={6}>
            <XStack alignItems="center" gap={6}>
                <UsersRound size={14} color={appTheme.colors.textMuted} />
                <Text fontSize={13} fontWeight="800" color={appTheme.colors.text}>Giới tính</Text>
            </XStack>
            <XStack gap={10}>
                {GENDER_OPTIONS.map((opt) => {
                    const active = value === opt.value;
                    return (
                        <XStack
                            key={opt.value}
                            flex={1} height={46} alignItems="center" justifyContent="center"
                            borderRadius={appTheme.radius.sm} borderWidth={1.5}
                            borderColor={active ? appTheme.colors.primary : appTheme.colors.border}
                            backgroundColor={active ? appTheme.colors.primarySoft : appTheme.colors.surface}
                            onPress={() => onChange(opt.value)}
                        >
                            <Text fontSize={13} fontWeight="800"
                                color={active ? appTheme.colors.primary : appTheme.colors.textMuted}>
                                {opt.label}
                            </Text>
                        </XStack>
                    );
                })}
            </XStack>
        </YStack>
    );
}

export function EditProfileScreen() {
    const params  = useLocalSearchParams<{ data: string }>();
    const initial = params.data ? JSON.parse(params.data) : {};

    const [fullName, setFullName] = useState<string>(initial.full_name ?? '');
    const [phone, setPhone]       = useState<string>(initial.phone ?? '');
    const [dob, setDob]           = useState<string>(initial.dob ?? '');
    const [gender, setGender]     = useState<Gender | null>(initial.gender ?? null);
    const [address, setAddress]   = useState<string>(initial.address ?? '');
    const [city, setCity]         = useState<string>(initial.city ?? '');
    const [country, setCountry]   = useState<string>(initial.country ?? 'VN');
    const [errors, setErrors]     = useState<FormErrors>({});

    const { showToast } = useToast();

    const { isLoading, update } = useUpdateProfile(() => {
        showToast({ type: 'success', message: 'Hồ sơ đã được cập nhật' });
        router.back();
    });

    const handleNameChange = (v: string) => {
        setFullName(v);
        if (errors.fullName) setErrors((e) => ({ ...e, fullName: undefined }));
    };

    const handlePhoneChange = (v: string) => {
        setPhone(v.replace(/\D/g, ''));
        if (errors.phone) setErrors((e) => ({ ...e, phone: undefined }));
    };

    const handleSave = async () => {
        const validation = validate(fullName, phone);
        if (Object.keys(validation).length > 0) {
            setErrors(validation);
            showToast({ type: 'error', message: 'Vui lòng kiểm tra lại thông tin' });
            return;
        }

        const payload: UpdateProfilePayload = {
            full_name: fullName.trim(),
            phone:     phone.trim() || null,
            dob:       dob || null,
            gender,
            address:   address.trim() || null,
            city:      city.trim()    || null,
            country:   country.trim() || 'VN',
        };
        const { error } = await update(payload);
        if (error) {
            showToast({ type: 'error', message: error });
        }
    };

    const I = 14;
    const IC = appTheme.colors.textMuted;

    return (
        <View style={{ flex: 1, backgroundColor: appTheme.colors.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Chỉnh sửa hồ sơ" showBack />
            <KeyboardSafeScrollView
                contentContainerStyle={{
                    paddingHorizontal: appTheme.spacing.screenX,
                    paddingTop: 20,
                    paddingBottom: appTheme.spacing.screenBottom,
                    gap: 16,
                }}
            >
                <FormField
                    label="Họ và tên"
                    labelIcon={<User size={I} color={IC} />}
                    value={fullName}
                    onChangeText={handleNameChange}
                    placeholder="Nhập họ và tên"
                    error={errors.fullName}
                />

                <FormField
                    label="Số điện thoại"
                    labelIcon={<Phone size={I} color={IC} />}
                    value={phone}
                    onChangeText={handlePhoneChange}
                    placeholder="10 chữ số"
                    keyboardType="number-pad"
                    maxLength={10}
                    error={errors.phone}
                />

                <DateInputField
                    label="Ngày sinh"
                    labelIcon={<CalendarDays size={I} color={IC} />}
                    value={dob}
                    onChange={setDob}
                />

                <GenderPicker value={gender} onChange={setGender} />

                <FormField
                    label="Địa chỉ"
                    labelIcon={<House size={I} color={IC} />}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Số nhà, tên đường..."
                />

                <FormField
                    label="Thành phố"
                    labelIcon={<MapPin size={I} color={IC} />}
                    value={city}
                    onChangeText={setCity}
                    placeholder="VD: TP. Hồ Chí Minh"
                />

                <FormField
                    label="Quốc gia"
                    labelIcon={<Globe size={I} color={IC} />}
                    value={country}
                    onChangeText={setCountry}
                    placeholder="VD: VN"
                    autoCapitalize="characters"
                    maxLength={2}
                />

                <AppButton tone="primary" isLoading={isLoading} onPress={handleSave} style={{ marginTop: 8 }}>
                    Lưu thay đổi
                </AppButton>
            </KeyboardSafeScrollView>
        </View>
    );
}
