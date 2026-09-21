/**
 * Hạ tầng Level 2 — Postgres THẬT chạy trong Docker (Testcontainers).
 *
 * Vì sao không mock repository ở đây: L2 kiểm chứng đúng chỗ mà L1 cố tình bỏ trống —
 * câu SQL có chạy được không, ràng buộc/CHECK/khoá ngoại có bắt đúng không, transaction
 * có rollback không. Mock DB ở tầng này thì test chỉ còn kiểm tra chính cái mock.
 *
 * Vì sao KHÔNG require('app.js'): app.js gọi runMigrations() rồi server.listen(port)
 * ngay ở module scope. Với maxWorkers=4 là 4 worker cùng bind một cổng → EADDRINUSE.
 * Ta dựng lại đúng chuỗi middleware cần cho nghiệp vụ (json body + router thật + error
 * handler) trong testApp.js, không đụng một dòng nào của app.js.
 *
 * Biến môi trường DB PHẢI được set TRƯỚC khi bất kỳ module nào require config/database —
 * pool được tạo ngay lúc load module. Vì vậy mọi require nghiệp vụ trong file này đều
 * nằm bên trong hàm, không nằm ở đầu file.
 */
const fs = require('fs');
const path = require('path');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');

const GOC_DU_AN = path.join(__dirname, '..', '..', '..', '..');
const FILE_SCHEMA = path.join(GOC_DU_AN, 'DB script', 'DB script.sql');

let container = null;
let pool = null;

/**
 * Khởi động Postgres, nạp schema gốc rồi áp toàn bộ migration của dự án.
 * Trả về pool dùng chung với code nghiệp vụ (chính là config/database).
 */
const startTestDb = async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('logiscount_test')
        .withUsername('test')
        .withPassword('test')
        .start();

    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = String(container.getMappedPort(5432));
    process.env.DB_NAME = container.getDatabase();
    process.env.DB_USER = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();
    delete process.env.DB_SSL;
    delete process.env.K_SERVICE;
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'l2-integration-secret';
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'l2-integration-refresh';
    // SMTP để trống → emailService tự bỏ qua, không gửi thư thật trong test.
    delete process.env.SMTP_USER;

    const { Client } = require('pg');
    const client = new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });
    await client.connect();
    await client.query(fs.readFileSync(FILE_SCHEMA, 'utf8'));
    await client.end();

    // Áp migration đúng bằng bộ chạy thật của dự án — schema test khớp production.
    const { runMigrations } = require('../../../migrate');
    await runMigrations();

    pool = require('../../../config/database');
    return pool;
};

const stopTestDb = async () => {
    if (pool) await pool.end().catch(() => {});
    if (container) await container.stop().catch(() => {});
    pool = null;
    container = null;
};

const getPool = () => {
    if (!pool) throw new Error('Chưa gọi startTestDb()');
    return pool;
};

/**
 * Dọn sạch dữ liệu nghiệp vụ giữa các ca test, GIỮ LẠI bảng roles và schema_migrations.
 * TRUNCATE ... CASCADE nhanh hơn xoá từng bảng và không phải quan tâm thứ tự khoá ngoại.
 */
const resetData = async () => {
    const { rows } = await getPool().query(`
        SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename NOT IN ('roles', 'schema_migrations')
    `);
    if (rows.length === 0) return;
    const danhSach = rows.map((r) => `"${r.tablename}"`).join(', ');
    await getPool().query(`TRUNCATE ${danhSach} RESTART IDENTITY CASCADE`);
};

module.exports = { startTestDb, stopTestDb, getPool, resetData };
