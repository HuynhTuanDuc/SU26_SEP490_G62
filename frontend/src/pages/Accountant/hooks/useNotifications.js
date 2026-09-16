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

  // Đánh dấu ĐÚNG 1 thông báo đã đọc (bấm vào 1 thông báo cụ thể).
  const markAsRead = useCallback(async (id) => {
    setNotifications((prev) => {
      const target = prev.find((n) => String(n.id) === String(id));
      if (target && !target.is_read) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.map((n) => (String(n.id) === String(id) ? { ...n, is_read: true } : n));
    });
    if (id == null) return; // broadcast (id null) không lưu DB
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      fetchRef.current?.();
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
            // Bắt tay thất bại thì LUÔN giãn backoff, kể cả khi refresh thành công.
            // Giãn riêng trong .catch là sai: khi WS hỏng vì phía server (nền serverless
            // không nhận upgrade nên trả 404), refresh vẫn trả 200 nên delay kẹt vĩnh viễn
            // ở 3s — mỗi socket bắn ~20 lần thử + 20 lần /auth/refresh mỗi phút.
            reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
            refreshAuthSession()
              .catch(() => {})
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

  return { notifications, unreadCount, loading, markAllRead, markAsRead, refetch: fetch };
}
