import { useEffect, useRef } from "react";
import { connectRealtime } from "../services/realtime";
import { refreshAuthSession } from "../services/apiClient";

const ENABLED_ROLES = new Set(["manager", "coordinator"]);
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 60000;

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
    let reconnectDelay = RECONNECT_DELAY_MS;
    let hadOpened = false;

    const connect = () => {
      if (disposed) return;
      hadOpened = false;

      socket = connectRealtime({
        onOpen: () => {
          // A successful open proves the access token was valid at handshake time —
          // no need to refresh. Reset backoff for the next transient drop.
          hadOpened = true;
          reconnectDelay = RECONNECT_DELAY_MS;
        },
        onMessage: (payload) => {
          handlersRef.current.onMessage?.(payload);
        },
        onClose: () => {
          handlersRef.current.onClose?.();
          if (disposed) return;
          reconnectTimer = window.setTimeout(() => {
            // Only refresh if THIS attempt never opened (handshake auth failure). If it
            // had opened before closing, the close is benign (network blip, server
            // restart...) — refreshing blindly on every reconnect just spams /auth/refresh
            // even while the session is still perfectly valid.
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
