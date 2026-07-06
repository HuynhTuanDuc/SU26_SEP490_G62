const { Pool } = require('pg');

const poolConfig = {
    host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 10,
    idleTimeoutMillis: 30000,
};

const dbSsl = process.env.DB_SSL && String(process.env.DB_SSL).toLowerCase() !== 'false';
if (dbSsl) poolConfig.ssl = { rejectUnauthorized: false };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

module.exports = pool;
