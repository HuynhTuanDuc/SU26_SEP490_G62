/**
 * Manual mock cho module 'cloudinary' — map qua jest.config.js (moduleNameMapper).
 *
 * multer-storage-cloudinary gọi cloudinary.uploader.upload_stream(opts, cb), pipe stream
 * file vào Writable trả về và chờ cb(err, { secure_url, bytes, public_id }) khi stream kết
 * thúc. Fake đúng contract đó để các route upload chạy được qua supertest .attach() mà
 * không gọi Cloudinary thật.
 */
const { Writable } = require('stream');

const fakeCloudinaryV2 = {
    config: () => {},
    uploader: {
        upload_stream: (opts, callback) => {
            const chunks = [];
            return new Writable({
                write(chunk, _enc, cb) {
                    chunks.push(chunk);
                    cb();
                },
                final(cb) {
                    callback(null, {
                        secure_url: `https://fake-cloudinary.test/${opts?.folder ?? 'misc'}/${Date.now()}.jpg`,
                        bytes: Buffer.concat(chunks).length,
                        public_id: `fake_${Date.now()}`,
                    });
                    cb();
                },
            });
        },
        destroy: (_publicId, _opts, cb) => cb && cb(null, { result: 'ok' }),
    },
};

module.exports = { v2: fakeCloudinaryV2 };
