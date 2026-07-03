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

let isHandlingUnauthorized = false;

async function handleUnauthorized(): Promise<void> {
  if (isHandlingUnauthorized) return;
  isHandlingUnauthorized = true;
  try {
    // AuthProvider.signOut clears token + state → triggers navigation to /login
    await authEvents.emitUnauthorized();
  } finally {
    setTimeout(() => { isHandlingUnauthorized = false; }, 5000);
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
    // /auth/* endpoints = wrong credentials, không phải session hết hạn
    if (!path.startsWith('/auth/')) {
      await handleUnauthorized();
      throw new ApiError(ERROR_MESSAGES.sessionExpired, 401);
    }
    throw new ApiError(payload?.error ?? payload?.message ?? 'Email hoặc mật khẩu không đúng', 401);
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
