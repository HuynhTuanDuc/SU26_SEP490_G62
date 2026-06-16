import { Tabs } from 'expo-router';
import { BottomTabBar } from '@/components/bottom-tab-bar';

export default function TabLayout() {
    return (
        <Tabs
            tabBar={(props) => <BottomTabBar {...props} />}
            screenOptions={{ headerShown: false }}
        >
            <Tabs.Screen name="index" />
            <Tabs.Screen name="kpi" />
            <Tabs.Screen name="history" />
            <Tabs.Screen name="receipts" />
            <Tabs.Screen name="payroll" />
            <Tabs.Screen name="profile" />
        </Tabs>
    );
}
