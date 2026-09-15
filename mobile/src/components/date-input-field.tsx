import { type ReactNode, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { Input, Text, XStack, YStack } from 'tamagui';

import { appTheme } from '@/theme/app-theme';
import { AppText } from './app-text';

type Props = {
    label?: string;
    labelIcon?: ReactNode;
    /** Giá trị ngoài: YYYY-MM-DD (ISO) — để gửi lên API */
    value: string;
    onChange: (iso: string) => void;
    error?: string;
};

// DD-MM-YYYY → Date object (hoặc null nếu chưa đủ)
function parseDisplay(display: string): Date | null {
    const digits = display.replace(/\D/g, '');
    if (digits.length < 8) return null;
    const d = parseInt(digits.slice(0, 2), 10);
    const m = parseInt(digits.slice(2, 4), 10);
    const y = parseInt(digits.slice(4, 8), 10);
    if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900) return null;
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
}

// ISO YYYY-MM-DD (hoặc YYYY-MM-DDTHH:mm:ssZ) → hiển thị DD-MM-YYYY
function isoToDisplay(iso: string): string {
    if (!iso) return '';
    const datePart = iso.slice(0, 10); // lấy đúng phần YYYY-MM-DD
    const [y, m, d] = datePart.split('-');
    if (!y || !m || !d) return '';
    return `${d}-${m}-${y}`;
}

// Date → ISO YYYY-MM-DD
function dateToIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Auto-format số nhập → DD-MM-YYYY (tự thêm dấu -)
function formatInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

export function DateInputField({ label, labelIcon, value, onChange, error }: Props) {
    const [displayText, setDisplayText] = useState(() => isoToDisplay(value));
    const [inputError, setInputError] = useState<string | null>(null);
    const [showPicker, setShowPicker] = useState(false);

    // Giá trị Date để truyền vào picker — kẹp về hôm nay như maximumDate, để ngày spinner
    // đang hiện cũng chính là ngày được ghi khi bấm Xác nhận (gõ tay ngày tương lai không lọt)
    const typedDate = parseDisplay(displayText);
    const pickerDate = typedDate
        ? (typedDate > new Date() ? new Date() : typedDate)
        : new Date(2000, 0, 1);

    const handleTextChange = (raw: string) => {
        const formatted = formatInput(raw);
        setDisplayText(formatted);
        setInputError(null);

        if (formatted.length === 10) {
            const parsed = parseDisplay(formatted);
            if (parsed) {
                if (parsed > new Date()) {
                    setInputError('Ngày sinh không được ở tương lai');
                    onChange('');
                } else {
                    onChange(dateToIso(parsed));
                }
            } else {
                setInputError('Ngày không hợp lệ');
                onChange('');
            }
        } else {
            onChange('');
        }
    };

    const commitDate = (date: Date) => {
        const iso = dateToIso(date);
        setDisplayText(isoToDisplay(iso));
        setInputError(null);
        onChange(iso);
    };

    const handlePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
        setShowPicker(Platform.OS === 'ios');
        // Android gọi onChange cả khi bấm Huỷ (type 'dismissed') và truyền lại chính `value`
        // chứ không phải undefined — không lọc thì huỷ trên ô trống sẽ ghi luôn 01-01-2000.
        if (event.type !== 'set' || !selected) return;
        commitDate(selected);
    };

    const displayError = error ?? inputError;

    return (
        <YStack gap="$2">
            {label ? (
                <XStack alignItems="center" gap={6}>
                    {labelIcon}
                    <AppText variant="caption">{label}</AppText>
                </XStack>
            ) : null}

            <XStack position="relative" alignItems="center">
                <Input
                    flex={1}
                    height={54}
                    borderRadius={appTheme.radius.md}
                    borderColor={displayError ? appTheme.colors.danger : appTheme.colors.border}
                    backgroundColor={appTheme.colors.surface}
                    color={appTheme.colors.text}
                    fontFamily={appTheme.typography.fontFamily.regular}
                    placeholder="DD-MM-YYYY"
                    placeholderTextColor={appTheme.colors.textMuted}
                    value={displayText}
                    onChangeText={handleTextChange}
                    keyboardType="number-pad"
                    maxLength={10}
                    paddingRight={48}
                    focusStyle={{ borderColor: appTheme.colors.primary }}
                />

                {/* Nút mở picker */}
                <Pressable
                    onPress={() => setShowPicker(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Chọn ngày"
                    hitSlop={8}
                    style={{
                        position: 'absolute',
                        right: 14,
                        width: 32,
                        height: 32,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <CalendarDays size={20} color={appTheme.colors.primary} />
                </Pressable>
            </XStack>

            {displayError ? <AppText variant="caption" tone="danger">{displayError}</AppText> : null}

            {/* Picker modal */}
            {showPicker && (
                <>
                    {/* Backdrop Android */}
                    {Platform.OS === 'android' && (
                        <DateTimePicker
                            value={pickerDate}
                            mode="date"
                            display="default"
                            maximumDate={new Date()}
                            onChange={handlePickerChange}
                        />
                    )}

                    {/* iOS: inline picker với overlay */}
                    {Platform.OS === 'ios' && (
                        <View style={{
                            marginTop: 8,
                            borderRadius: appTheme.radius.lg,
                            borderWidth: 1,
                            borderColor: appTheme.colors.border,
                            overflow: 'hidden',
                            backgroundColor: appTheme.colors.surfaceSoft,
                        }}>
                            <DateTimePicker
                                value={pickerDate}
                                mode="date"
                                display="spinner"
                                maximumDate={new Date()}
                                onChange={handlePickerChange}
                                locale="vi"
                            />
                            {/* Spinner iOS chỉ bắn onChange khi người dùng cuộn — mở ra rồi bấm
                                Xác nhận ngay thì ngày đang hiện chưa được ghi, ô vẫn trống */}
                            <Pressable
                                onPress={() => { commitDate(pickerDate); setShowPicker(false); }}
                                style={{
                                    alignItems: 'center',
                                    paddingVertical: 12,
                                    borderTopWidth: 1,
                                    borderTopColor: appTheme.colors.border,
                                    backgroundColor: appTheme.colors.surface,
                                }}
                            >
                                <Text fontSize={14} fontWeight="900" color={appTheme.colors.primary}>
                                    Xác nhận
                                </Text>
                            </Pressable>
                        </View>
                    )}
                </>
            )}
        </YStack>
    );
}
