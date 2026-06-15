import { useCallback, useState } from 'react';
import { tripService } from '@/services/trip-service';
import type { PendingReceiptOrder } from '@/types/trip';

export function usePendingReceipt() {
    const [order, setOrder]       = useState<PendingReceiptOrder | null>(null);
    const [isLoading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { order: pending } = await tripService.getPendingReceiptOrder();
            setOrder(pending);
        } catch {
            setOrder(null);
        } finally {
            setLoading(false);
        }
    }, []);

    return { order, isLoading, load };
}
