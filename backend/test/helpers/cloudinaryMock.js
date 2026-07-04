const Module = require('module');
const { Writable } = require('stream');

/**
 * multer-storage-cloudinary calls cloudinary.uploader.upload_stream(opts, cb) and pipes the
 * incoming file stream into the returned Writable, expecting cb(err, { secure_url, bytes,
 * public_id }) once the stream ends. Faking that lets file-upload routes be exercised through
 * real HTTP (supertest .attach()) without making a live call to a real Cloudinary account.
 *
 * Must be installed BEFORE the route file that pulls in `../config/cloudinary` is first
 * required (config/cloudinary.js does `require('cloudinary').v2` at module-load time).
 */
function installCloudinaryMock() {
    const originalLoad = Module._load;

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

    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'cloudinary') return { v2: fakeCloudinaryV2 };
        return originalLoad.call(this, request, parent, isMain);
    };

    return function uninstallCloudinaryMock() {
        Module._load = originalLoad;
    };
}

module.exports = { installCloudinaryMock };
