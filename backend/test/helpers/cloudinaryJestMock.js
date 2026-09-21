/**
 * Stub cho package `cloudinary` (map qua moduleNameMapper trong jest.config.js).
 *
 * config/cloudinary.js gọi `require('cloudinary').v2` rồi `.config({...})` ngay lúc
 * load module — nếu không stub thì mọi test import gián tiếp tới config sẽ chạm SDK
 * thật và đọc env production. Stub mirror đúng shape đang được dùng thật:
 * v2.config / v2.uploader.upload / v2.uploader.destroy / v2.url.
 */
const { Writable } = require('stream');

const uploader = {
    upload: jest.fn(async (file, options = {}) => ({
        public_id: options.public_id || 'test/public-id',
        secure_url: 'https://res.cloudinary.com/test/image/upload/test.jpg',
        url: 'http://res.cloudinary.com/test/image/upload/test.jpg',
        format: 'jpg',
        bytes: 1024,
        width: 800,
        height: 600,
        resource_type: 'image',
        created_at: '2026-01-01T00:00:00Z',
    })),
    destroy: jest.fn(async () => ({ result: 'ok' })),

    // multer-storage-cloudinary (dùng bởi middleware/uploadMiddleware.js) đẩy file qua
    // upload_stream chứ không gọi upload(). Không stub cái này thì mọi endpoint L2 nhận
    // ảnh (chi phí, ảnh bằng chứng, phiếu thu) sẽ treo cho tới khi hết timeout.
    upload_stream: jest.fn((options, callback) => {
        const cb = typeof options === 'function' ? options : callback;
        const opts = typeof options === 'function' ? {} : (options || {});
        let bytes = 0;
        const ghi = new Writable({
            write(chunk, _enc, next) { bytes += chunk.length; next(); },
        });
        ghi.on('finish', () => cb(null, {
            public_id: opts.public_id || `${opts.folder || 'test'}/anh-${Date.now()}`,
            secure_url: 'https://res.cloudinary.com/test/image/upload/receipt.jpg',
            url: 'http://res.cloudinary.com/test/image/upload/receipt.jpg',
            format: 'jpg', resource_type: 'image', bytes, width: 800, height: 600,
        }));
        return ghi;
    }),
};

const v2 = {
    config: jest.fn(() => ({})),
    uploader,
    url: jest.fn((publicId) => `https://res.cloudinary.com/test/image/upload/${publicId}`),
    api: { resource: jest.fn(async () => ({})) },
};

module.exports = { v2, config: v2.config, uploader, ...v2 };
