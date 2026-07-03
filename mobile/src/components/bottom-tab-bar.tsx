import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { HouseLine, Clock, Receipt, Money, GearSix } from "phosphor-react-native";
import { appTheme } from "@/theme/app-theme";
import { AppText } from "./app-text";

type TabConfig = {
  key: string;
  label: string;
  Icon: React.ComponentType<{
    size?: number;
    color?: string;
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  }>;
};

const TABS: TabConfig[] = [
  { key: "index",    label: "Trang chủ", Icon: HouseLine },
  { key: "history",  label: "Lịch sử",   Icon: Clock     },
  { key: "receipts", label: "Phiếu thu", Icon: Receipt   },
  { key: "payroll",  label: "Lương",     Icon: Money     },
  { key: "profile",  label: "Cài đặt",   Icon: GearSix   },
];

const TAB_HEIGHT = 68;

function TabItem({
  config,
  isActive,
  onPress,
}: {
  config: TabConfig;
  isActive: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(isActive ? 1 : 0.94)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: isActive ? 1 : 0.94,
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
  }, [isActive, scale]);

  const { Icon } = config;
  const iconColor  = isActive ? appTheme.colors.primary : appTheme.colors.textMuted;
  const labelColor = isActive ? appTheme.colors.primary : appTheme.colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 8,
        gap: 5,
      }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon
          size={24}
          color={iconColor}
          weight={isActive ? "fill" : "regular"}
        />
      </Animated.View>

      <AppText
        style={{
          fontSize: 11,
          color: labelColor,
          fontWeight: isActive ? "700" : "400",
        }}
      >
        {config.label}
      </AppText>
    </Pressable>
  );
}

export function BottomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        height: TAB_HEIGHT + insets.bottom,
        paddingBottom: insets.bottom,
        backgroundColor: appTheme.colors.background,
        flexDirection: "row",
        borderTopWidth: 1,
        borderTopColor: appTheme.colors.border,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 10,
      }}
    >
      {TABS.map((tab, index) => (
        <TabItem
          key={tab.key}
          config={tab}
          isActive={state.index === index}
          onPress={() => {
            const event = navigation.emit({
              type: "tabPress",
              target: state.routes[index]?.key,
              canPreventDefault: true,
            });
            if (!event.defaultPrevented) {
              navigation.navigate(state.routes[index]?.name);
            }
          }}
        />
      ))}
    </View>
  );
}
