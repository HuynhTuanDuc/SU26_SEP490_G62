import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { API_BASE_URL } from '@/constants/api';
import { ERROR_MESSAGES } from '@/constants/error-messages';
import { appEvents } from '@/lib/app-events';
import { ApiError } from '@/lib/api-error';
import { notificationService } from '@/services/notification-service';
import { tokenStorage } from '@/services/token-storage';
import type { AppNotification, NotificationEvent } from '@/types/notification';
import { useAuthSession } from '@/providers/auth-provider';
import { useAppAlert, useToast } from '@/providers/ui-provider';

const PAGE_LIMIT = 20;

type NotificationsContextValue = {
    notifications:  AppNotification[];
    unreadCount:    number;
    total:          number;
    hasMore:        boolean;
    isLoading:      boolean;   // lần đầu, chưa có data
    isRefreshing:   boolean;   // user kéo pull-to-refresh
    isLoadingMore:  boolean;   // cuộn xuống load thêm
    error:          string | null;
    refresh:        (showSpinner?: boolean) => Promise<void>;
    loadMore:       () => Promise<void>;
    markAsRead:     (id: number | string) => Promise<void>;
    markAllAsRead:  () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const toWsUrl = () => {
    const url = new URL(API_BASE_URL);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/notifications';
    url.search   = '';
    return url;
};

const normalize = (n: AppNotification): AppNotification => ({
    ...n,
    message: n.message ?? '',
    is_read: Boolean(n.is_read),
});

const mergeOne = (items: AppNotification[], incoming: AppNotification) => {
    const idx = items.findIndex((i) => String(i.id) === String(incoming.id));
    if (idx < 0) return [incoming, ...items];
    const next = [...items];
    next[idx] = { ...next[idx], ...incoming };
    return next;
};

type FetchMode = 'initial' | 'refresh' | 'background' | 'append';

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const { status }    = useAuthSession();
    const { showToast } = useToast();
    const { showAlert } = useAppAlert();

    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount,   setUnreadCount]   = useState(0);
    const [total,         setTotal]         = useState(0);
    const [hasMore,       setHasMore]       = useState(false);
    const [isLoading,     setIsLoading]     = useState(false);   // initial only
    const [isRefreshing,  setIsRefreshing]  = useState(false);   // pull-to-refresh
    const [isLoadingMore, setIsLoadingMore] = useState(false);   // infinite scroll
    const [error,         setError]         = useState<string | null>(null);

    const currentPageRef      = useRef(1);
    const isFetchingRef       = useRef(false);
    const socketRef           = useRef<WebSocket | null>(null);
    const reconnectTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttemptRef = useRef(0);
    const shouldConnectRef    = useRef(false);

    const closeSocket = useCallback(() => {
        shouldConnectRef.current = false;
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
        socketRef.current?.close();
        socketRef.current = null;
    }, []);

    // ── Core fetch ──────────────────────────────────────────────────────────────
    const fetchPage = useCallback(async (page: number, mode: FetchMode) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        // Bật đúng spinner theo mode
        if      (mode === 'initial')  { setIsLoading(true);     setError(null); }
        else if (mode === 'refresh')  { setIsRefreshing(true);  setError(null); }
        else if (mode === 'append')   { setIsLoadingMore(true); }
        // 'background' → không bật spinner nào

        try {
            const res  = await notificationService.getMyNotifications(page, PAGE_LIMIT);
            const rows = (res.notifications ?? []).map(normalize);
            const serverTotal = res.total ?? 0;

            if (mode === 'append') {
                setNotifications((prev) => {
                    const existingIds = new Set(prev.map((n) => String(n.id)));
                    const fresh = rows.filter((n) => !existingIds.has(String(n.id)));
                    return [...prev, ...fresh];
                });
            } else {
                setNotifications(rows);
            }

            setUnreadCount(res.unreadCount ?? 0);
            setTotal(serverTotal);
            currentPageRef.current = page;
            setHasMore(page * PAGE_LIMIT < serverTotal);
            setError(null);
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                if (mode !== 'append') setNotifications([]);
                setError(null);
                setHasMore(false);
                return;
            }
            // Lỗi: chỉ hiện error khi không phải background/append
            if (mode === 'initial' || mode === 'refresh') {
                setError(err instanceof Error ? err.message : ERROR_MESSAGES.notificationLoadFailed);
            }
        } finally {
            isFetchingRef.current = false;
            if      (mode === 'initial')  setIsLoading(false);
            else if (mode === 'refresh')  setIsRefreshing(false);
            else if (mode === 'append')   setIsLoadingMore(false);
        }
    }, []);

    // refresh(true)  → kéo xuống tay, hiện RefreshControl spinner
    // refresh(false) → background silent (AppState, WS reconnect)
    const refresh = useCallback((showSpinner = true) => {
        currentPageRef.current = 1;
        return fetchPage(1, showSpinner ? 'refresh' : 'background');
    }, [fetchPage]);

    const loadMore = useCallback(() => {
        if (isFetchingRef.current || !hasMore) return Promise.resolve();
        return fetchPage(currentPageRef.current + 1, 'append');
    }, [fetchPage, hasMore]);

    // ── Incoming WS notification ────────────────────────────────────────────────
    const handleIncomingNotification = useCallback((notification: AppNotification) => {
        const n = normalize(notification);
        setNotifications((cur) => mergeOne(cur, n));
        if (!n.is_read) setUnreadCount((c) => c + 1);
        setTotal((t) => t + 1);

        if (n.display_mode === 'silent') return;
        if (n.display_mode === 'traffic_alert') {
            void showAlert({
                type: 'warning',
                title: n.title,
                message: n.message,
                okLabel: 'Đã hiểu, tránh đường này',
            });
            return;
        }
        if (n.display_mode === 'alert') {
            void showAlert({ type: 'info', title: n.title, message: n.message, okLabel: 'Đã hiểu' });
            return;
        }
        showToast({ type: 'info', message: `${n.title}${n.message ? `: ${n.message}` : ''}` });
    }, [showAlert, showToast]);

    // ── WebSocket ───────────────────────────────────────────────────────────────
    const connect = useCallback(async () => {
        if (status !== 'authenticated') return;
        if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;

        const token = await tokenStorage.getToken();
        if (!token) return;

        shouldConnectRef.current = true;
        const wsUrl = toWsUrl();
        wsUrl.searchParams.set('token', token);

        const socket = new WebSocket(wsUrl.toString());
        socketRef.current = socket;

        socket.onopen  = () => { reconnectAttemptRef.current = 0; };
        socket.onmessage = (event) => {
            try {
                const payload = JSON.parse(String(event.data)) as NotificationEvent;
                // Phát toàn bộ WS event ra app-events để các hook khác subscribe
                appEvents.emit(payload.type, payload);
                if (payload.type === 'notification.created') {
                    handleIncomingNotification(payload.notification);
                }
            } catch { /* ignore malformed */ }
        };
        socket.onclose = () => {
            socketRef.current = null;
            if (!shouldConnectRef.current) return;
            reconnectAttemptRef.current += 1;
            const delay = Math.min(30_000, 1000 * reconnectAttemptRef.current);
            reconnectTimerRef.current = setTimeout(() => { void connect(); }, delay);
        };
        socket.onerror = () => { socket.close(); };
    }, [handleIncomingNotification, status]);

    // ── Mark as read ────────────────────────────────────────────────────────────
    const markAsRead = useCallback(async (id: number | string) => {
        setNotifications((cur) =>
            cur.map((item) => String(item.id) === String(id) ? { ...item, is_read: true } : item),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        try {
            const { notification } = await notificationService.markAsRead(id);
            setNotifications((cur) => mergeOne(cur, notification));
        } catch {
            void refresh(false); // silent retry
        }
    }, [refresh]);

    const markAllAsRead = useCallback(async () => {
        setNotifications((cur) => cur.map((item) => ({ ...item, is_read: true })));
        setUnreadCount(0);
        try {
            await notificationService.markAllAsRead();
        } catch {
            void refresh(false);
        }
    }, [refresh]);

    // ── Auth lifecycle ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (status !== 'authenticated') {
            closeSocket();
            setNotifications([]);
            setUnreadCount(0);
            setTotal(0);
            setHasMore(false);
            setIsLoading(false);
            setIsRefreshing(false);
            setError(null);
            currentPageRef.current = 1;
            return;
        }
        void fetchPage(1, 'initial');
        void connect();
        return () => closeSocket();
    }, [closeSocket, connect, fetchPage, status]);

    // AppState: chỉ background refresh — không hiện spinner
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
            if (status !== 'authenticated') return;
            if (next === 'active') { void refresh(false); void connect(); }
            else closeSocket();
        });
        return () => sub.remove();
    }, [closeSocket, connect, refresh, status]);

    const value = useMemo<NotificationsContextValue>(() => ({
        notifications, unreadCount, total, hasMore,
        isLoading, isRefreshing, isLoadingMore, error,
        refresh, loadMore, markAsRead, markAllAsRead,
    }), [error, hasMore, isLoading, isLoadingMore, isRefreshing, loadMore,
        markAllAsRead, markAsRead, notifications, refresh, total, unreadCount]);

    return (
        <NotificationsContext.Provider value={value}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotificationsContext() {
    const context = useContext(NotificationsContext);
    if (!context) throw new Error('useNotificationsContext must be used inside NotificationsProvider');
    return context;
}
