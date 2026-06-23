import { useEffect, useRef } from "react";
import { connectRealtime } from "../services/realtime";

const ENABLED_ROLES = new Set(["manager", "coordinator"]);
const RECONNECT_DELAY_MS = 3000;

export function useRoleRealtime(user, handlers = {}) {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!user?.role || !ENABLED_ROLES.has(user.role)) {
      return undefined;
    }

    let socket = null;
    let reconnectTimer = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;

      socket = connectRealtime({
        onMessage: (payload) => {
          handlersRef.current.onMessage?.(payload);
        },
        onClose: () => {
          handlersRef.current.onClose?.();
          if (disposed) return;
          reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
        },
        onError: (event) => {
          handlersRef.current.onError?.(event);
        },
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      } else if (socket) {
        socket.close();
      }
    };
  }, [user?.id, user?.role]);
}
