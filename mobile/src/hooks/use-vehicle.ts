import { useCallback, useEffect, useState } from 'react';

import { maintenanceService } from '@/services/maintenance-service';
import type { MaintenanceRecord } from '@/types/maintenance';
import type { Vehicle } from '@/types/vehicle';

export function useVehicle() {
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [vehicleRes, maintenanceRes] = await Promise.all([
                maintenanceService.getMyVehicle(),
                maintenanceService.getMyMaintenance(),
            ]);
            setVehicle(vehicleRes.vehicle);
            setMaintenance(maintenanceRes.records);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Không thể tải thông tin xe');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    return { vehicle, maintenance, isLoading, error, refresh };
}
