const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:9999";

export const apiBaseUrl = DEFAULT_API_BASE_URL;
let refreshPromise = null;

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${apiBaseUrl}${path}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && (payload.error || payload.message)) ||
      (typeof payload === "string" && payload.trim()) ||
      `Request failed with status ${response.status}`;
    const error = new Error(message);
    if (payload && typeof payload === "object") {
      Object.assign(error, payload);
    }
    throw error;
  }

  return payload;
}

// Access-token cookie có thể tự hết hạn/bị trình duyệt xoá trước khi request
// tới server, khi đó server trả 403 kèm code NO_TOKEN thay vì 401 (token có
// mặt nhưng không hợp lệ). Cả hai trường hợp đều nên thử refresh phiên;
// các 403 khác (tài khoản bị khoá, không đủ quyền) không có code này nên sẽ
// không bị thử refresh vô ích.
async function isRefreshableAuthFailure(response) {
  if (response.status === 401) return true;
  if (response.status !== 403) return false;

  try {
    const clone = response.clone();
    const contentType = clone.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return false;
    const payload = await clone.json();
    return payload?.code === "NO_TOKEN";
  } catch {
    return false;
  }
}

async function refreshAuthSession() {
  if (!refreshPromise) {
    refreshPromise = fetch(buildUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) {
          const contentType = response.headers.get("content-type") || "";
          const payload = contentType.includes("application/json")
            ? await response.json()
            : await response.text();
          const message =
            (payload && typeof payload === "object" && (payload.error || payload.message)) ||
            (typeof payload === "string" && payload.trim()) ||
            "Unable to refresh session";
          throw new Error(message);
        }
        return response;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", body, token, headers = {}, signal } = options;
  const requestHeaders = new Headers(headers);
  const retryOnAuthFailure = options.retryOnAuthFailure !== false;
  const skipAuthRefresh = options.skipAuthRefresh === true;

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let requestBody = body;
  if (body && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers: requestHeaders,
    body: requestBody,
    signal,
    credentials: "include",
  });

  const canAttemptRefresh =
    retryOnAuthFailure && !skipAuthRefresh && path !== "/auth/refresh" && path !== "/auth/login" && path !== "/auth/google";

  if (canAttemptRefresh && (await isRefreshableAuthFailure(response))) {
    await refreshAuthSession();
    return apiRequest(path, {
      ...options,
      retryOnAuthFailure: false,
    });
  }

  return parseResponse(response);
}
