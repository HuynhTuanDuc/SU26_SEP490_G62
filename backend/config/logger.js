const winston = require('winston');

const isProduction = process.env.NODE_ENV === 'production';

// Production: JSON có timestamp để log aggregator (Cloud Logging...) parse được.
// Dev: format ngắn gọn, dễ đọc trên terminal.
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: isProduction
        ? winston.format.combine(winston.format.timestamp(), winston.format.json())
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp({ format: 'HH:mm:ss' }),
            winston.format.printf(({ level, message, timestamp, ...meta }) => {
                const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                return `${timestamp} ${level}: ${message}${extra}`;
            }),
        ),
    transports: [new winston.transports.Console()],
});

module.exports = logger;
