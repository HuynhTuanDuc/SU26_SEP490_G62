import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { appEvents } from '@/lib/app-events';
import { maintenanceService } from '@/services/maintenance-service';
import type { MaintenanceRecord } from '@/types/maintenance';

type State = {
    records: MaintenanceRecord[];
    isLoading: boolean;
    error: string | null;
};

export function useMaintenance() {
    const [state, setState] = useState<State>({ records: [], isLoading: true, error: null });

    const load = useCallback(async (showSpinner = true) => {
        setState((s) => ({ ...s, isLoading: showSpinner || s.records.length === 0, error: null }));
        try {
            const { records } = await maintenanceService.getMyMaintenance();
            setState({ records, isLoading: false, error: null });
        } catch (err) {
            setState((s) => ({
                ...s,
                isLoading: false,
                error: err instanceof Error ? err.message : 'Không thể tải dữ liệu bảo dưỡng',
            }));
        }
    }, []);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    // Refresh when manager assigns a new maintenance task
    useEffect(() => appEvents.on('maintenance.assigned', () => { void load(false); }), [load]);

    return { ...state, reload: load };
}
