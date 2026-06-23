const WebSocket = require('ws');
const authService = require('./authService');

const clientsByUserId = new Map();
const clientsByRole   = new Map();

const HEARTBEAT_INTERVAL_MS = 30_000;

const readCookieValue = (cookieHeader, cookieName) => {
    if (!cookieHeader) return null;

    const cookie = String(cookieHeader)
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${cookieName}=`));

    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(cookieName.length + 1));
};

const sendJson = (socket, payload) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    try { socket.send(JSON.stringify(payload)); } catch { /* ignore */ }
};

const addClient = (userId, role, socket) => {
    const userKey = String(userId);
    const userSet = clientsByUserId.get(userKey) ?? new Set();
    userSet.add(socket);
    clientsByUserId.set(userKey, userSet);

    if (role) {
        const roleSet = clientsByRole.get(role) ?? new Set();
        roleSet.add(socket);
        clientsByRole.set(role, roleSet);
    }

    socket.on('close', () => {
        userSet.delete(socket);
        if (userSet.size === 0) clientsByUserId.delete(userKey);

        if (role) {
            const roleSet = clientsByRole.get(role);
            if (roleSet) {
                roleSet.delete(socket);
                if (roleSet.size === 0) clientsByRole.delete(role);
            }
        }
    });
};


const broadcastToUser = (userId, payload) => {
    const clients = clientsByUserId.get(String(userId));
    if (!clients) return;
    for (const client of clients) sendJson(client, payload);
};

const broadcastToRole = (role, payload) => {
    const clients = clientsByRole.get(role);
    if (!clients) return;
    for (const client of clients) sendJson(client, payload);
};


const notifyCreated = (notification, options = {}) => {
    broadcastToUser(notification.user_id, {
        type: 'notification.created',
        notification: {
            ...notification,
            display_mode: options.displayMode ?? notification.display_mode ?? 'toast',
        },
    });
};

const notifyRead = (userId, notificationId) => {
    broadcastToUser(userId, {
        type: 'notification.read',
        notificationId,
    });
};

const notifyAllRead = (userId) => {
    broadcastToUser(userId, { type: 'notification.read_all' });
};

const initNotificationGateway = (server) => {
    const wss = new WebSocket.Server({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/ws/notifications') return;

        // Dual-mode auth:
        // - web clients authenticate with the HttpOnly access-token cookie
        // - mobile clients authenticate with an explicit bearer token in ?token=
        const token =
            url.searchParams.get('token')
            || readCookieValue(req.headers.cookie, authService.AUTH_COOKIE_NAME);
        if (!token) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        let decoded;
        try {
            decoded = authService.verifyToken(token);
        } catch {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            addClient(decoded.userId, decoded.role ?? null, ws);
            setupHeartbeat(ws);
            sendJson(ws, { type: 'notification.connected' });
        });
    });

    return wss;
};

const setupHeartbeat = (ws) => {
    ws.isAlive = true;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(String(raw));
            if (msg?.type === 'ping') sendJson(ws, { type: 'pong' });
        } catch { /* ignore malformed */ }
    });

    const timer = setInterval(() => {
        if (!ws.isAlive) {
            clearInterval(timer);
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, HEARTBEAT_INTERVAL_MS);

    ws.on('close', () => clearInterval(timer));
};


module.exports = {
    initNotificationGateway,
    sendJson,
    readCookieValue,
    broadcastToUser,
    broadcastToRole,
    notifyCreated,
    notifyRead,
    notifyAllRead,
};
