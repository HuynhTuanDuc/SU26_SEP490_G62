const { Pool } = require('pg');
const logger = require('./logger');

// Cloud Run sets K_SERVICE automatically; only there do we have the
// /cloudsql Unix socket mounted. Everywhere else (local dev, whether
// against a local Postgres or the Cloud SQL proxy in TCP mode) use a
// normal host:port connection.
const runningOnCloudRun = Boolean(process.env.K_SERVICE);

const poolConfig = {
    host: runningOnCloudRun
        ? `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`
        : (process.env.DB_HOST || '127.0.0.1'),
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 10,
    idleTimeoutMillis: 30000,
    // Chờ tối đa 5s để lấy được 1 connection từ pool — tránh request bị treo vô thời hạn
    // khi pool đã full (mặc định của pg là chờ vô hạn).
    connectionTimeoutMillis: 5000,
    // Hủy query chạy quá 15s — 1 query chậm/vòng lặp sai không được phép chiếm connection mãi
    // và làm cạn kiệt pool (chỉ có 10 connection) kéo sập cả hệ thống theo dây chuyền.
    statement_timeout: 15000,
    query_timeout: 15000,
};

const dbSsl = process.env.DB_SSL && String(process.env.DB_SSL).toLowerCase() !== 'false';
if (dbSsl) poolConfig.ssl = { rejectUnauthorized: false };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', { message: err.message, stack: err.stack });
});

module.exports = pool;
