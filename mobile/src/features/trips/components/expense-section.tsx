import { Image, Pressable, StyleSheet } from 'react-native';
import { PlusCircle } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { appTheme } from '@/theme/app-theme';
import type { Expense } from '@/types/trip';
import { EXPENSE_TYPE_LABEL } from '@/types/trip';

type Props = {
    expenses: Expense[];
    canAdd: boolean;
    onAdd: () => void;
};

const fmt = (v: string) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(v));

export function ExpenseSection({ expenses, canAdd, onAdd }: Props) {
    const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return (
        <YStack
            borderRadius={appTheme.radius.lg}
            borderWidth={1}
            borderColor={appTheme.colors.border}
            backgroundColor={appTheme.colors.surface}
            overflow="hidden"
        >
            {/* Header */}
            <XStack
                paddingHorizontal={16} paddingVertical={11}
                backgroundColor={appTheme.colors.surfaceSoft}
                justifyContent="space-between" alignItems="center"
            >
                <Text fontSize={12} fontWeight="900" color={appTheme.colors.textMuted}>CHI PHÍ PHÁT SINH</Text>
                {expenses.length > 0 ? (
                    <Text fontSize={12} fontWeight="700" color={appTheme.colors.text}>{fmt(String(total))}</Text>
                ) : null}
            </XStack>

            <YStack padding={14} gap={10}>
                {expenses.length === 0 ? (
                    <Text fontSize={13} color={appTheme.colors.textMuted} textAlign="center" paddingVertical={4}>
                        Chưa có chi phí nào
                    </Text>
                ) : (
                    expenses.map((e) => (
                        <XStack key={e.id} gap={10} alignItems="flex-start">
                            <YStack flex={1} gap={2}>
                                <XStack alignItems="center" gap={6} flexWrap="wrap">
                                    <Text fontSize={13} fontWeight="800" color={appTheme.colors.text}>
                                        {EXPENSE_TYPE_LABEL[e.expense_type]}
                                    </Text>
                                    <Text fontSize={13} fontWeight="900" color={appTheme.colors.primary}>
                                        {fmt(e.amount)}
                                    </Text>
                                    {e.status === 'pending' ? (
                                        <Text fontSize={10} fontWeight="800" color={appTheme.colors.warningText}>
                                            Chờ duyệt
                                        </Text>
                                    ) : e.status === 'rejected' ? (
                                        <Text fontSize={10} fontWeight="800" color={appTheme.colors.dangerText}>
                                            Bị từ chối
                                        </Text>
                                    ) : null}
                                </XStack>
                                {e.status === 'rejected' && e.reject_reason ? (
                                    <Text fontSize={11} color={appTheme.colors.dangerText}>
                                        Lý do: {e.reject_reason}
                                    </Text>
                                ) : null}
                                {e.description ? (
                                    <Text fontSize={11} color={appTheme.colors.textMuted}>{e.description}</Text>
                                ) : null}
                                {e.receipt_urls.length > 0 ? (
                                    <XStack gap={6} marginTop={4} flexWrap="wrap">
                                        {e.receipt_urls.map((url, i) => (
                                            <Image
                                                key={i}
                                                source={{ uri: url }}
                                                style={s.receiptThumb}
                                                resizeMode="cover"
                                            />
                                        ))}
                                    </XStack>
                                ) : null}
                            </YStack>
                        </XStack>
                    ))
                )}

                {canAdd ? (
                    <Pressable onPress={onAdd} style={s.addBtn}>
                        <PlusCircle size={16} color={appTheme.colors.primary} />
                        <Text fontSize={13} fontWeight="700" color={appTheme.colors.primary}>Thêm chi phí</Text>
                    </Pressable>
                ) : null}
            </YStack>
        </YStack>
    );
}

const s = StyleSheet.create({
    receiptThumb: { width: 56, height: 56, borderRadius: 8 },
    addBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 10,
        borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed',
        borderColor: appTheme.colors.primaryMuted, backgroundColor: appTheme.colors.primarySoft,
    },
});
