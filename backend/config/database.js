const { Pool } = require('pg');
const logger = require('./logger');
const { buildDbConfig } = require('./dbConfig');

const poolConfig = {
    ...buildDbConfig(),
    // Số kết nối tối đa. KHÔNG tự lớn lên khi nâng cấu hình máy chủ: máy khoẻ gấp mười lần
    // vẫn chỉ có ngần này đường xuống DB, và request thứ 11 phải xếp hàng — chờ quá
    // connectionTimeoutMillis là lỗi 500 dù DB hoàn toàn khoẻ. Nâng theo hạn mức kết nối
    // của chính DB (Supabase/Neon có trần riêng cho mỗi gói), đừng nâng bừa.
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
    query_timeout: 15000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    logger.error('Unexpected error on idle client', { message: err.message, stack: err.stack });
});

module.exports = pool;
