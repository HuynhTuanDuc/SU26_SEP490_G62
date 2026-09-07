const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '../../../DB script/DB script.sql');

/**
 * Dựng một Postgres dùng một lần, nạp schema thật (DB script/DB script.sql — nguồn duy
 * nhất cho tên bảng/cột), rồi trỏ các biến process.env DB_* vào đó.
 * Gọi `teardown()` trong hook `after()`.
 *
 * HAI ĐƯỜNG DỰNG DB:
 *
 *  1. Mặc định — testcontainers bật một container postgres:16-alpine. Sạch nhất, không
 *     phụ thuộc máy ai, nhưng đòi Docker.
 *
 *  2. Khi có biến TEST_DB_HOST — dùng một Postgres đã chạy sẵn, mỗi lần tạo một
 *     DATABASE riêng rồi xoá đi lúc teardown. Có đường này vì Docker không phải lúc nào
 *     cũng lên được (máy dev, CI không cấp Docker), mà không chạy được test tích hợp
 *     thì mất luôn thứ duy nhất kiểm được phần logic nằm trong SQL.
 *
 *     TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=5433 TEST_DB_USER=postgres \
 *     TEST_DB_PASSWORD=... npx jest
 */
async function setupTestDb() {
    const external = process.env.TEST_DB_HOST;
    if (external) return setupOnExistingServer();

    const container = await new PostgreSqlContainer('postgres:16-alpine').start();

    process.env.DB_HOST = container.getHost();
    process.env.DB_PORT = container.getPort();
    process.env.DB_NAME = container.getDatabase();
    process.env.DB_USER = container.getUsername();
    process.env.DB_PASSWORD = container.getPassword();

    const pool = require('../../config/database');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);

    const teardown = async () => {
        await pool.end();
        await container.stop();
    };

    return { container, pool, teardown };
}

/**
 * Mỗi bộ test một DATABASE riêng: các file test chạy song song sẽ giẫm lên nhau nếu
 * dùng chung. Tên có timestamp + số ngẫu nhiên để hai lần chạy chồng nhau cũng không
 * đụng, và teardown xoá hẳn nên máy không tích rác.
 */
async function setupOnExistingServer() {
    const cfg = {
        host: process.env.TEST_DB_HOST,
        port: Number(process.env.TEST_DB_PORT || 5432),
        user: process.env.TEST_DB_USER || 'postgres',
        password: process.env.TEST_DB_PASSWORD || '',
        database: process.env.TEST_DB_MAINTENANCE || 'postgres',
    };

    const dbName = `sep490_test_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    const admin = new Client(cfg);
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();

    process.env.DB_HOST = cfg.host;
    process.env.DB_PORT = String(cfg.port);
    process.env.DB_NAME = dbName;
    process.env.DB_USER = cfg.user;
    process.env.DB_PASSWORD = cfg.password;

    const pool = require('../../config/database');
    await pool.query(fs.readFileSync(schemaPath, 'utf8'));

    const teardown = async () => {
        await pool.end();
        const cleanup = new Client(cfg);
        await cleanup.connect();
        // FORCE: ngắt mọi kết nối còn sót lại, nếu không thì DROP treo và để lại rác
        await cleanup.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => {});
        await cleanup.end();
    };

    return { container: null, pool, teardown };
}

module.exports = { setupTestDb };
