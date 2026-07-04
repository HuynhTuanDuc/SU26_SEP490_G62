import { API_BASE_URL } from '@/constants/api';
import { ERROR_MESSAGES } from '@/constants/error-messages';
import { ApiError } from '@/lib/api-error';
import { authEvents } from '@/lib/auth-events';
import { tokenStorage } from '@/services/token-storage';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | object | null;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await tokenStorage.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Chống gọi refresh nhiều lần cùng lúc khi có nhiều request 401 song song
let _refreshPromise: Promise<string | null> | null = null;

async function attemptTokenRefresh(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) return null;

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return null;

      const data = await response.json().catch(() => null);
      if (!data?.token) return null;

      await tokenStorage.setToken(data.token);
      if (data.refreshToken) await tokenStorage.setRefreshToken(data.refreshToken);

      return data.token as string;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

let isHandlingUnauthorized = false;

async function handleUnauthorized(): Promise<void> {
  if (isHandlingUnauthorized) return;
  isHandlingUnauthorized = true;
  try {
    await tokenStorage.clearAll();
    await authEvents.emitUnauthorized();
  } finally {
    setTimeout(() => { isHandlingUnauthorized = false; }, 5000);
  }
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const headers = new Headers({
    ...authHeaders,
    ...(options.headers as Record<string, string> | undefined),
  });

  const rawBody = options.body;
  let body: BodyInit | null | undefined;

  if (rawBody && typeof rawBody === 'object' && !(rawBody instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(rawBody);
  } else {
    body = rawBody as BodyInit | null | undefined;
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
      body,
    });
  } catch {
    throw new ApiError(ERROR_MESSAGES.network, 0);
  }

  const payload = await response.json().catch(() => null);

  if (response.status === 401) {
    // Endpoint auth/* = sai credentials, không phải token hết hạn
    if (path.startsWith('/auth/')) {
      throw new ApiError(payload?.error ?? payload?.message ?? 'Email hoặc mật khẩu không đúng', 401);
    }

    // Chỉ thử refresh 1 lần
    if (!isRetry) {
      const newToken = await attemptTokenRefresh();
      if (newToken) {
        // Retry request gốc với token mới
        return request<T>(path, options, true);
      }
    }

    // Refresh thất bại hoặc đã retry → logout
    await handleUnauthorized();
    throw new ApiError(ERROR_MESSAGES.sessionExpired, 401);
  }

  if (!response.ok) {
    throw new ApiError(payload?.error ?? payload?.message ?? ERROR_MESSAGES.network, response.status);
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: object) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: object) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
  patchForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'PATCH', body: formData }),
};
