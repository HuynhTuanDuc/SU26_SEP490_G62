import { useState, useEffect, useCallback, useRef } from "react";
import { apiRequest, refreshAuthSession } from "../../../services/apiClient";
import { connectRealtime } from "../../../services/realtime";

const RECONNECT_DELAY_MS = 3000;

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [loading, setLoading]             = useState(false);

  const fetchRef = useRef(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/api/notifications?limit=15&page=1");
      setNotifications(data.notifications ?? []);
      setUnreadCount(Number(data.unreadCount ?? 0));
    } catch {

    } finally {
      setLoading(false);
    }
  }, []);

  fetchRef.current = fetch;

  const markAllRead = useCallback(async () => {
    try {
      await apiRequest("/api/notifications/read-all", { method: "PATCH" });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {

    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    let socket = null;
    let reconnectTimer = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      socket = connectRealtime({
        onMessage: (payload) => {
          if (!payload?.type) return;
          if (payload.type === "notification.created") {
            setUnreadCount((c) => c + 1);
            fetchRef.current?.();
          }
          if (payload.type === "notification.read" || payload.type === "notification.read_all") {
            fetchRef.current?.();
          }
        },
        onClose: () => {
          if (disposed) return;
          reconnectTimer = window.setTimeout(() => {
            // Access-token cookie có thể đã hết hạn trong lúc socket mở/idle;
            // refresh trước để lần reconnect không bị 401 lặp vô hạn.
            refreshAuthSession()
              .catch(() => {})
              .finally(connect);
          }, RECONNECT_DELAY_MS);
        },
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, []);

  return { notifications, unreadCount, loading, markAllRead, refetch: fetch };
}
