import { useState, useCallback } from "react";
import { accountantService } from "../services/accountant.service";

export function useShipments() {
  const [cache, setCache] = useState({});
  const [loadingIds, setLoadingIds] = useState(new Set());

  const fetchShipments = useCallback(async (orderId) => {
    if (cache[orderId]) return cache[orderId];

    setLoadingIds((prev) => new Set([...prev, orderId]));
    try {
      const data = await accountantService.getOrderShipments(orderId);
      setCache((prev) => ({ ...prev, [orderId]: data }));
      return data;
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }, [cache]);

  const invalidate = useCallback((orderId) => {
    setCache((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  return {
    shipmentCache: cache,
    isLoadingShipments: (orderId) => loadingIds.has(orderId),
    fetchShipments,
    invalidate,
  };
}
