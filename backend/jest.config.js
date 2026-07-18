/**
 * Jest config — migrate từ node:test (node --test).
 *
 * - testTimeout cao vì integration/API tests dựng Postgres thật qua Testcontainers
 *   (mỗi file 1 container, khởi động ~10-30s).
 * - cloudinary được mock toàn cục qua moduleNameMapper (thay cho cơ chế patch
 *   Module._load cũ — Jest dùng module registry riêng nên patch đó không ăn).
 * - maxWorkers giới hạn để không dựng quá nhiều Postgres container song song.
 */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/test'],
    testMatch: ['**/*.test.js'],
    testTimeout: 120_000,
    maxWorkers: 4,
    moduleNameMapper: {
        '^cloudinary$': '<rootDir>/test/helpers/cloudinaryJestMock.js',
    },
    // Testcontainers giữ connection mở tới Docker daemon — không bắt lỗi open handles
    forceExit: true,
};
