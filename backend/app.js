// ENV_FILE cho phép chạy backend NGOÀI Docker với một bộ cấu hình khác .env mặc định —
// dùng để cắm vào DB dev riêng trên Cloud SQL mà không đụng tới .env của docker-compose.
// Không set thì hành vi y hệt trước giờ (nạp .env).
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const routes = require('./routes');
const { trackRequestTiming } = require('./middleware/requestTiming');
const pool = require('./config/database');
const logger = require('./config/logger');
const authService = require('./services/authService');
const { initNotificationGateway } = require('./services/notificationGateway');
const { initCronJobs }           = require('./cron/debtCron');
const { initPushCron }           = require('./cron/pushCron');
const { API_TITLE }              = require('./constants/brandConstants');

const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const port = process.env.PORT || 9999;
const server = http.createServer(app);
initNotificationGateway(server);
initCronJobs();
initPushCron();

const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];

const parseOriginList = (value) => String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const allowedOrigins = new Set([
    ...(isProduction ? [] : DEFAULT_ALLOWED_ORIGINS),
    ...parseOriginList(process.env.CORS_ORIGINS),
    ...parseOriginList(process.env.FRONTEND_URL),
    ...parseOriginList(process.env.FRONTEND_ORIGIN),
]);

const corsOptions = {
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        return callback(null, false);
    },
    credentials: true,
};

const readCookieValue = (cookieHeader, cookieName) => {
    if (!cookieHeader) return null;
    const cookie = String(cookieHeader)
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${cookieName}=`));
    return cookie ? decodeURIComponent(cookie.slice(cookieName.length + 1)) : null;
};

const CSRF_COOKIE_NAME = 'csrf_token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set([
    '/auth/login',
    '/auth/google',
    '/auth/refresh',
    '/auth/logout',
    '/auth/forgot-password/request',
    '/auth/forgot-password/verify',
    '/auth/forgot-password/reset',
]);

const csrfProtection = (req, res, next) => {
    if (SAFE_METHODS.has(req.method) || CSRF_EXEMPT_PATHS.has(req.path)) return next();

    const hasSessionCookie =
        readCookieValue(req.headers.cookie, authService.AUTH_COOKIE_NAME)
        || readCookieValue(req.headers.cookie, authService.REFRESH_COOKIE_NAME);
    if (!hasSessionCookie) return next();

    const csrfCookie = readCookieValue(req.headers.cookie, CSRF_COOKIE_NAME);
    const csrfHeader = req.get('x-csrf-token');
    if (csrfCookie && csrfHeader && csrfCookie === csrfHeader) return next();

    return res.status(403).json({ error: 'CSRF token không hợp lệ', code: 'CSRF_TOKEN_INVALID' });
};

// Chạy sau reverse proxy/load balancer (Cloud Run...) — cần để req.ip và rate-limit
// nhận đúng IP thật của client thay vì IP của proxy.
app.set('trust proxy', 1);

// Middleware
// Đặt TRƯỚC mọi middleware khác: mốc giờ phải tính từ lúc request vào, và request bị chặn
// ở tầng bảo mật cũng cần được ghi nhận nếu client bỏ cuộc giữa chừng.
app.use(trackRequestTiming);

// CSP mặc định của helmet sẽ chặn inline script của Swagger UI (chỉ bật ở non-production) —
// tắt CSP riêng ở non-production, các header bảo mật khác (HSTS, X-Frame-Options...) vẫn giữ.
app.use(helmet({ contentSecurityPolicy: isProduction }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(cors(corsOptions));
app.use(csrfProtection);
// :response-time LÀ PHẦN QUAN TRỌNG. Format 'combined' không có nó, nên khi tài xế báo
// "app hiện lỗi hết thời gian chờ" thì log máy chủ chỉ có một dòng 200 trông hoàn toàn
// bình thường — không thể biết request đó mất 8 giây hay 80 giây, tức là không thể biết
// lỗi nằm ở app hay ở máy chủ.
app.use(morgan(isProduction ? ':remote-addr :method :url :status :res[content-length] :response-time ms ":user-agent"' : 'dev', {
    stream: { write: (message) => logger.info(message.trim()) },
}));

// Rate limit chung — chặn spam/DoS cấp API cơ bản
// Trần này tính theo ĐỊA CHỈ IP, và cũng không tự lớn lên khi nâng máy chủ. Cả một văn
// phòng sau một đường mạng, hay nhiều tài xế sau cùng một trạm 4G, dùng chung một trần.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX || 600),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.' },
});
app.use(apiLimiter);

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Backend up and running' });
});

// API documentation — chỉ bật ngoài production, tránh lộ toàn bộ API + "try it out" ra ngoài.
//
// require() nằm TRONG nhánh if: `config/swagger` chạy swagger-jsdoc ngay lúc nạp module,
// tức là quét + parse JSDoc của cả 22 file trong docs/ (~350ms trên máy dev, nhiều hơn
// hẳn trên vCPU của Cloud Run). Trước đây khoản đó bị trả ở MỌI cold start production
// dù /api-docs đã tắt và không ai dùng tới spec.
if (!isProduction) {
    const swaggerUi = require('swagger-ui-express');
    const swaggerDocument = require('./config/swagger');
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
        swaggerOptions: {
            persistAuthorization: true,
            displayRequestDuration: true,
            filter: true,
            tryItOutEnabled: true,
        },
        customSiteTitle: API_TITLE,
    }));
}

// Routes
app.use('/', routes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler — không lộ chi tiết lỗi nội bộ (message DB, stack trace...) cho client ở production
app.use((err, req, res, next) => {
    logger.error('Server error', { message: err.message, stack: err.stack, path: req.path });
    res.status(500).json({
        error: 'Internal server error',
        ...(isProduction ? {} : { details: err.message }),
    });
});

// Bắt lỗi không được catch để tránh crash process mà không log/không dọn dẹp được gì —
// log lại rồi thoát có kiểm soát (process manager/orchestrator sẽ tự khởi động lại tiến trình sạch).
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: reason?.stack || reason });
});
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { message: err.message, stack: err.stack });
    process.exit(1);
});

// Graceful shutdown — đóng HTTP server + pg pool sạch khi orchestrator gửi tín hiệu dừng,
// tránh drop request đang xử lý dở và tránh rò rỉ connection tới DB.
const shutdown = (signal) => {
    logger.info(`[shutdown] Nhận ${signal}, đang đóng server...`);
    server.close(() => {
        pool.end().finally(() => {
            logger.info('[shutdown] Đã đóng server và DB pool.');
            process.exit(0);
        });
    });
    setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Áp migration TRƯỚC khi nhận request. Lên request mà schema chưa đúng thì app gọi
// cột chưa tồn tại → lỗi 500 hàng loạt, khó lần ra nguyên nhân hơn nhiều so với việc
// container chết ngay ở đây kèm log rõ ràng.
const { runMigrations } = require('./migrate');

// Node mặc định đóng kết nối keep-alive nhàn rỗi sau 5 GIÂY, trong khi proxy đứng trước
// container (Render, và mọi load balancer khác) giữ kết nối lại để dùng cho request sau.
// Hai bên lệch nhau: proxy gửi request vào đúng kết nối mà Node vừa quyết định đóng, và
// người dùng nhận 502 — do PROXY sinh ra, nên trong log của ứng dụng không hề có 500 hay
// stack nào. Đây là cấu hình Render tự khuyến nghị cho Node.
//
// headersTimeout PHẢI lớn hơn keepAliveTimeout, nếu không Node cắt kết nối ngay trước khi
// nó kịp đọc xong dòng đầu của request kế tiếp.
server.keepAliveTimeout = Number(process.env.SERVER_KEEPALIVE_TIMEOUT_MS || 120_000);
server.headersTimeout = server.keepAliveTimeout + 5_000;

runMigrations()
    .then(() => {
        server.listen(port, () => {
            logger.info(`Server listening on port ${port}`);
            // SAU listen, và KHÔNG await: dựng worker OCR tốn CPU, không được giữ cổng
            // đóng thêm giây nào. Thất bại chỉ làm mất lớp đối chiếu OCR (xem warmUp).
            if (String(process.env.RECEIPT_OCR_WARMUP ?? 'true').toLowerCase() !== 'false') {
                require('./services/receiptOcrScanner').warmUp().catch(() => {});
            }
        });
    })
    .catch((err) => {
        logger.error(`[migrate] Không khởi động được vì migration lỗi: ${err.message}`);
        process.exit(1);
    });

module.exports = app;
