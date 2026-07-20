import { useState, useEffect, useCallback, useRef } from "react";
import { apiRequest, refreshAuthSession } from "../../../services/apiClient";
import { connectRealtime } from "../../../services/realtime";

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 60000;

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
    let reconnectDelay = RECONNECT_DELAY_MS;
    let hadOpened = false;

    const connect = () => {
      if (disposed) return;
      hadOpened = false;
      socket = connectRealtime({
        onOpen: () => {
          // Kết nối thành công — access token lúc bắt tay vẫn hợp lệ, không cần refresh.
          hadOpened = true;
          reconnectDelay = RECONNECT_DELAY_MS;
        },
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
            // Chỉ refresh khi socket vừa rồi CHƯA BAO GIỜ open được (bắt tay thất bại do
            // access token cookie đã hết hạn) — đã open thành công thì đóng là chuyện
            // bình thường, không cần refresh mù quáng mỗi lần reconnect.
            if (hadOpened) {
              connect();
              return;
            }
            refreshAuthSession()
              .catch(() => {
                reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
              })
              .finally(connect);
          }, reconnectDelay);
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
