import { getApiBaseUrl } from '@/constants/api';
import { ERROR_MESSAGES } from '@/constants/error-messages';
import { ApiError } from '@/lib/api-error';
import { authEvents } from '@/lib/auth-events';
import { tokenStorage } from '@/services/token-storage';

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | object | null;
  // Ghi đè hạn giờ cho những request mà máy chủ CỐ Ý xử lý lâu (vd hoàn tất bảo dưỡng
  // đọc lại mọi ảnh hóa đơn). Cắt sớm hơn thời gian xử lý thật thì tài xế thấy lỗi trong
  // khi máy chủ vẫn làm xong — tệ hơn là chờ thêm.
  timeoutMs?: number;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await tokenStorage.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isUnsafeMethod(method?: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase());
}

// ─── Chịu lỗi mạng ───────────────────────────────────────────────────────────
// Tài xế làm việc ngoài đường, sóng 3G chập chờn là chuyện thường. Không có hai
// thứ dưới đây thì: (1) request treo vô hạn khi "có sóng nhưng không truyền được",
// nút xoay mãi không biết chờ hay bấm lại; (2) một lần rớt gói là hỏng cả thao tác.

const DEFAULT_TIMEOUT_MS = 30_000;   // request JSON bình thường
const TIMEOUT_UPLOAD_MS = 90_000;   // gửi kèm ảnh, mạng yếu cần lâu hơn
const MAX_RETRIES    = 2;        // số lần thử THÊM, ngoài lần đầu

// CHỈ tự thử lại request ĐỌC. Request ghi mà tự gửi lại thì có nguy cơ trùng dữ
// liệu — dù backend đã chặn trùng ở 7 luồng chính, vẫn không nên dựa vào đó ở đây.
function canRetry(method?: string): boolean {
  return !isUnsafeMethod(method);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Gọi fetch có hạn giờ. Hết giờ thì huỷ hẳn kết nối thay vì để treo.
async function fetchCoTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function canBootstrapCsrf(path: string): boolean {
  return ![
    '/auth/login',
    '/auth/google',
    '/auth/refresh',
    '/auth/forgot-password/request',
    '/auth/forgot-password/verify',
    '/auth/forgot-password/reset',
  ].includes(path);
}

async function persistCsrfToken(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== 'object') return;
  const csrfToken = (payload as { csrfToken?: unknown }).csrfToken;
  if (csrfToken) await tokenStorage.setCsrfToken(String(csrfToken));
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Decode base64 thuần JS — không phụ thuộc global atob()/Buffer (không đảm bảo có sẵn
// trên mọi engine Hermes/thiết bị), trả về chuỗi UTF-8 đã decode.
function base64Decode(input: string): string {
  const clean = input.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const value = BASE64_ALPHABET.indexOf(ch);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''));
}

// true nếu token đã hết hạn hoặc sắp hết hạn trong <= skewSeconds (JWT không cần verify
// chữ ký ở client, chỉ đọc phần payload để biết exp — server vẫn là nơi verify thật).
function isTokenExpiringSoon(token: string, skewSeconds = 10): boolean {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return true;
    const json = base64Decode(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const { exp } = JSON.parse(json) as { exp?: number };
    if (!exp) return true;
    return Date.now() >= (exp - skewSeconds) * 1000;
  } catch {
    return true;
  }
}

function formatRetryAfter(seconds: number): string {
  const totalSeconds = Math.ceil(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (minutes <= 0) return `${remainingSeconds} giây`;
  if (remainingSeconds === 0) return `${minutes} phút`;
  return `${minutes} phút ${remainingSeconds} giây`;
}

// Chống gọi refresh nhiều lần cùng lúc khi có nhiều request 401 song song
let _refreshPromise: Promise<string | null> | null = null;

// Refresh access token.
//   - Trả STRING  : thành công (đã lưu token mới).
//   - Trả NULL    : refresh token THỰC SỰ vô hiệu (401/403 hoặc không có) → phải đăng nhập lại.
//   - THROW       : lỗi TẠM THỜI (mạng chập chờn, 5xx, cold start Cloud Run...) → KHÔNG logout,
//                   để request gốc lỗi tạm rồi thử lại sau, giữ nguyên phiên đăng nhập.
async function attemptTokenRefresh(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const apiBaseUrl = getApiBaseUrl();
    const refreshToken = await tokenStorage.getRefreshToken();
    if (!refreshToken) return null; // không có refresh token → logout

    let response: Response;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const csrfToken = await tokenStorage.getCsrfToken();
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

      response = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Lỗi mạng — TẠM THỜI, không được logout.
      throw new ApiError(ERROR_MESSAGES.network, 0);
    }

    // Chỉ 401/403 mới là refresh token vô hiệu thật sự → cần đăng nhập lại.
    if (response.status === 401 || response.status === 403) return null;

    // 5xx / lỗi khác — TẠM THỜI (VD Cloud Run cold start), không được logout.
    if (!response.ok) throw new ApiError(ERROR_MESSAGES.network, response.status);

    const data = await response.json().catch(() => null);
    if (!data?.token) return null;

    await tokenStorage.setToken(data.token);
    if (data.refreshToken) await tokenStorage.setRefreshToken(data.refreshToken);
    await persistCsrfToken(data);

    return data.token as string;
  })();

  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
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
  const apiBaseUrl = getApiBaseUrl();
  const authHeaders = await getAuthHeaders();
  const headers = new Headers({
    ...authHeaders,
    ...(options.headers as Record<string, string> | undefined),
  });

  if (isUnsafeMethod(options.method) && !headers.has('X-CSRF-Token')) {
    let csrfToken = await tokenStorage.getCsrfToken();
    if (!csrfToken && canBootstrapCsrf(path)) {
      try {
        await attemptTokenRefresh();
        csrfToken = await tokenStorage.getCsrfToken();
      } catch {
        // Let the original request surface the real auth/CSRF/network error.
      }
    }
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  }

  const rawBody = options.body;
  let body: BodyInit | null | undefined;

  if (rawBody && typeof rawBody === 'object' && !(rawBody instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(rawBody);
  } else {
    body = rawBody as BodyInit | null | undefined;
  }

  let response: Response;

  const isUpload = body instanceof FormData;
  const timeoutMs = options.timeoutMs ?? (isUpload ? TIMEOUT_UPLOAD_MS : DEFAULT_TIMEOUT_MS);
  const attemptNo = canRetry(options.method) ? MAX_RETRIES : 0;

  let lastError: unknown = null;
  let sent = false;

  for (let attempt = 0; attempt <= attemptNo; attempt += 1) {
    try {
      response = await fetchCoTimeout(`${apiBaseUrl}${path}`, { ...options, headers, body }, timeoutMs);
      sent = true;
      break;
    } catch (err) {
      lastError = err;
      // Backoff tăng dần: 0.6s rồi 1.2s. Sóng chập chờn thường chỉ mất vài trăm ms.
      if (attempt < attemptNo) await sleep(600 * (attempt + 1));
    }
  }

  if (!sent) {
    const isTimeout = lastError instanceof Error && lastError.name === 'AbortError';
    console.error('[api-client] fetch failed', {
      url: `${apiBaseUrl}${path}`,
      method: options.method,
      isFormData: isUpload,
      timedOut: isTimeout,
      attempts: attemptNo + 1,
      error: lastError instanceof Error ? `${lastError.name}: ${lastError.message}` : String(lastError),
    });
    throw new ApiError(
      isTimeout
        ? 'Máy chủ phản hồi quá lâu. Kiểm tra lại sóng rồi thử lại.'
        : ERROR_MESSAGES.network,
      0,
    );
  }

  response = response!;

  const payload = await response.json().catch(() => null);
  await persistCsrfToken(payload);

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
    if (response.status === 403 && payload?.code === 'CSRF_TOKEN_INVALID' && !isRetry && canBootstrapCsrf(path)) {
      await tokenStorage.removeCsrfToken();
      const newToken = await attemptTokenRefresh();
      if (newToken) return request<T>(path, options, true);
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? payload?.retryAfter ?? payload?.retry_after);
      const waitText = Number.isFinite(retryAfter) && retryAfter > 0
        ? ` Vui lòng thử lại sau ${formatRetryAfter(retryAfter)}.`
        : ' Vui lòng thử lại sau ít phút.';
      throw new ApiError((payload?.error ?? payload?.message ?? 'Bạn thao tác quá nhanh.') + waitText, 429);
    }

    if (payload === null) {
       
      console.error('[api-client] non-JSON error response', {
        url: `${apiBaseUrl}${path}`, method: options.method, status: response.status,
      });
    }
    throw new ApiError(payload?.error ?? payload?.message ?? ERROR_MESSAGES.network, response.status);
  }

  if (path === '/auth/logout') await tokenStorage.removeCsrfToken();
  return payload as T;
}

// Trả về access token còn hạn dùng — refresh trước nếu đã hết/sắp hết hạn. Dùng cho
// những kết nối không tự retry-on-401 được như WebSocket (handshake bị từ chối thẳng,
// không có cơ hội refresh-rồi-thử-lại như fetch()).
export async function getValidAccessToken(): Promise<string | null> {
  const token = await tokenStorage.getToken();
  if (!token) return null;
  if (!isTokenExpiringSoon(token)) return token;
  try {
    return await attemptTokenRefresh();
  } catch {
    // Lỗi tạm thời khi refresh — trả token hiện tại (WS cứ thử, lát nữa refresh lại),
    // KHÔNG logout.
    return token;
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: object, opts: { timeoutMs?: number } = {}) =>
    request<T>(path, { method: 'POST', body, ...opts }),
  patch: <T>(path: string, body: object) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
  patchForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'PATCH', body: formData }),
};
