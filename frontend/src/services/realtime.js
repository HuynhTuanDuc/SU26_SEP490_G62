import { apiBaseUrl } from "./apiClient";

function buildRealtimeUrl() {
  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/notifications";
  url.search = "";
  return url.toString();
}

export function connectRealtime({ onMessage, onOpen, onClose, onError } = {}) {
  // Web client uses cookie-authenticated websocket sessions.
  const socket = new WebSocket(buildRealtimeUrl());

  socket.addEventListener("open", () => {
    onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      onMessage?.(payload);
    } catch {
      // Ignore malformed messages from the socket.
    }
  });

  socket.addEventListener("close", () => {
    onClose?.();
  });

  socket.addEventListener("error", (event) => {
    onError?.(event);
  });

  return socket;
}
