const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:9999";

export const apiBaseUrl = DEFAULT_API_BASE_URL;

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

export async function apiRequest(path, options = {}) {
  const { method = "GET", body, token, headers = {}, signal } = options;
  const requestHeaders = new Headers(headers);

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
  });

  return parseResponse(response);
}
