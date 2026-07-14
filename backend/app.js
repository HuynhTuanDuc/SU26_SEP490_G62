require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const routes = require('./routes');
const swaggerDocument = require('./config/swagger');
const { initNotificationGateway } = require('./services/notificationGateway');
const { initCronJobs }           = require('./cron/debtCron');

const app = express();
const port = process.env.PORT || 9999;
const isProduction = process.env.NODE_ENV === 'production';
const server = http.createServer(app);
initNotificationGateway(server);
initCronJobs();

// ─── Security middleware ──────────────────────────────────────────────────────

// Chạy sau reverse proxy (nginx/docker) → tin header X-Forwarded-For khi rate-limit theo IP
app.set('trust proxy', 1);

// Security headers (ẩn X-Powered-By, chặn sniff MIME, clickjacking...).
// API thuần JSON — tắt CSP để không ảnh hưởng swagger-ui.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS: chỉ cho origin trong danh sách (CORS_ORIGINS="https://a.com,https://b.com").
// Mặc định dev: FE docker (5173) + vite dev (3000). Request không có Origin (mobile app,
// curl, server-to-server) không bị CORS chặn — bảo vệ thêm bằng JWT ở tầng route.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin không được phép truy cập'));
    },
    credentials: true,
}));

// Giới hạn kích thước body — chống payload bomb (upload ảnh đi qua multer/cloudinary riêng)
app.use(express.json({ limit: '1mb' }));

// Rate limit toàn cục: 600 request / phút / IP
app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' },
}));

// Rate limit chặt cho auth (chống brute-force mật khẩu / spam mã reset):
// 20 request / 15 phút / IP cho login, refresh, quên mật khẩu
app.use('/auth', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau 15 phút.' },
}));

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Backend up and running' });
});

// API documentation — tắt ở production trừ khi bật rõ ENABLE_API_DOCS=true
if (!isProduction || process.env.ENABLE_API_DOCS === 'true') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
        swaggerOptions: {
            persistAuthorization: true,
            displayRequestDuration: true,
            filter: true,
            tryItOutEnabled: true,
        },
        customSiteTitle: 'G62 Logistics API',
    }));
}

// Routes
app.use('/', routes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Error handler — không lộ chi tiết lỗi nội bộ ra ngoài ở production
app.use((err, req, res, next) => {
    if (err.message === 'Origin không được phép truy cập') {
        return res.status(403).json({ error: err.message });
    }
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        ...(isProduction ? {} : { details: err.message }),
    });
});

// Start server
server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

module.exports = app;
