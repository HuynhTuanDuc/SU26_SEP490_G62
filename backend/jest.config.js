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
    // Bằng chứng chạy test (evidence) — tự sinh report HTML liệt kê đầy đủ pass/fail theo
    // từng describe/it (Test ID), thay cho chụp màn hình thủ công. Đính kèm file này vào
    // cột Notes/Evidence của báo cáo Excel 5.2/5.3 thay vì ảnh rời rạc từng case.
    reporters: [
        'default',
        ['jest-html-reporters', {
            publicPath: './test-reports',
            filename: 'report.html',
            pageTitle: 'Backend Flow Test Evidence Report',
            includeConsoleLog: false,
            expand: true,
        }],
    ],
};
