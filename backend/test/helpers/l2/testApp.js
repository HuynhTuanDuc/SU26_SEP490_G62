/**
 * Dựng express app cho test L2 — mount ROUTER THẬT của dự án.
 *
 * Chỉ tái tạo phần middleware mà nghiệp vụ phụ thuộc (parse JSON/urlencoded, router,
 * error handler). Cố ý BỎ helmet/cors/morgan/rate-limit: chúng không tham gia vào chuỗi
 * controller → service → repository → DB mà L2 cần đo, và rate-limit còn làm test nhiễu.
 *
 * require('../../../routes') nằm TRONG hàm: router kéo theo config/database, mà pool
 * được tạo ngay lúc load module — phải để sau khi startTestDb() set xong biến môi trường.
 */
const buildTestApp = () => {
    const express = require('express');
    const routes = require('../../../routes');

    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use('/', routes);

    // Khớp error handler của app.js: trả status của lỗi nghiệp vụ nếu có, mặc định 500.
    app.use((err, req, res, _next) => {
        res.status(err.status || err.statusCode || 500).json({ error: err.message });
    });

    return app;
};

module.exports = { buildTestApp };
