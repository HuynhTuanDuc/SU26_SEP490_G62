/**
 * Nhánh lỗi của kênh OCR.
 *
 * Tách khỏi receiptOcrScanner.test.js vì mỗi ca ở đây cần nạp lại module với env riêng
 * (ngôn ngữ, thư mục traineddata, trần thời gian đều đọc lúc nạp module), và một phần
 * chạy Tesseract THẬT: lỗi đáng sợ nhất ở lớp này — sập cả tiến trình — chỉ tái hiện
 * được bằng thư viện thật, không giả lập được.
 */
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCANNER = '../../services/receiptOcrScanner';

/**
 * Nạp một bản module mới tinh với env và mock cho trước.
 *
 * Dùng resetModules chứ không dùng isolateModules: scanner nạp `tesseract.js` LƯỜI, bên
 * trong hàm, tức là sau khi khối isolateModules đã đóng — lần require đó sẽ rơi về sổ
 * module chung và không thấy mock nào cả.
 */
const loadScanner = (env = {}, mocks = {}) => {
    const saved = {};
    for (const [key, value] of Object.entries(env)) {
        saved[key] = process.env[key];
        process.env[key] = value;
    }
    let scanner;
    try {
        jest.resetModules();
        jest.dontMock('tesseract.js');
        for (const [name, factory] of Object.entries(mocks)) jest.doMock(name, factory);
        scanner = require(SCANNER);
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
    return scanner;
};

describe('receiptOcrScanner — ảnh không đọc được KHÔNG làm sập tiến trình (Tesseract thật)', () => {
    let scanner;
    beforeAll(() => { scanner = loadScanner(); });
    afterAll(async () => { await scanner.shutdown(); });

    it('bytes rác trả OCR_FAILED thay vì ném uncaughtException', async () => {
        // Lỗi thật, đã tái hiện: tesseract.js reject promise RỒI còn `throw` thêm một lần
        // trong event listener nếu không có errorHandler. Lần throw đó không try/catch nào
        // bắt được, và app.js xử lý uncaughtException bằng process.exit(1) — tức một ảnh
        // hỏng là tắt cả backend. Nếu hồi quy, test này không fail bằng assert mà làm sập
        // luôn tiến trình Jest đang chạy nó.
        const result = await scanner.scanImage(Buffer.from('khong phai anh '.repeat(200)));

        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.code, 'OCR_FAILED');
    });

    it('worker vẫn dùng tiếp được sau một ảnh hỏng', async () => {
        // Ảnh hỏng là lỗi của TẤM ẢNH, không phải của worker: không được để nó kéo cả kênh
        // OCR vào trạng thái tạm tắt.
        await scanner.scanImage(Buffer.from('rac'.repeat(1000)));
        const second = await scanner.scanImage(Buffer.from('rac khac'.repeat(1000)));

        assert.strictEqual(second.code, 'OCR_FAILED', 'phải thử quét thật, không bị đánh dấu không khả dụng');
    });
});

describe('receiptOcrScanner — lỗi dựng worker (Tesseract thật)', () => {
    it('thiếu tệp ngôn ngữ thì báo ngay và tạm tắt, không đẻ worker', async () => {
        const scanner = loadScanner({ RECEIPT_OCR_LANGS: 'khongtontai' });

        const first = await scanner.scanImage(Buffer.from('x'.repeat(100)));
        const second = await scanner.scanImage(Buffer.from('x'.repeat(100)));

        assert.strictEqual(first.code, 'OCR_INIT_FAILED');
        // Lỗi cấu hình thì hóa đơn kế tiếp cũng hỏng y vậy — không thử lại mỗi hóa đơn.
        assert.strictEqual(second.code, 'OCR_UNAVAILABLE');
        await scanner.shutdown();
    });

    it('tệp traineddata hỏng: báo lỗi chứ không treo, và KHÔNG xoá tệp', async () => {
        // Hai lỗi thật của tesseract.js cùng lúc:
        //   * pha nạp ngôn ngữ hỏng thì lời hứa dựng worker treo vĩnh viễn (thư viện nuốt
        //     lỗi bằng `.catch(() => {})`);
        //   * mặc định nó XOÁ tệp traineddata trong cachePath khi khởi tạo hỏng — mà
        //     cachePath của ta là thư mục backend chứa hai tệp thật được git theo dõi.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-lang-hong-'));
        for (const lang of ['vie', 'eng']) fs.writeFileSync(path.join(dir, `${lang}.traineddata`), 'rac'.repeat(5000));

        const scanner = loadScanner({ RECEIPT_OCR_LANG_DIR: dir, RECEIPT_OCR_TIMEOUT_MS: '20000' });
        const startedAt = Date.now();
        const result = await scanner.scanImage(Buffer.from('x'.repeat(100)));

        assert.strictEqual(result.code, 'OCR_INIT_FAILED');
        assert.ok(Date.now() - startedAt < 10_000, 'phải báo lỗi ngay, không chờ tới hết trần thời gian');
        // Trải ra mảng mới: mảng do `fs` trả về trong sandbox Jest thuộc realm khác, và
        // deepStrictEqual so cả prototype nên báo lệch dù nội dung y hệt.
        assert.deepStrictEqual([...fs.readdirSync(dir)].sort(), ['eng.traineddata', 'vie.traineddata'],
            'tesseract.js không được xoá tệp ngôn ngữ');

        await scanner.shutdown();
        fs.rmSync(dir, { recursive: true, force: true });
    });
});

describe('receiptOcrScanner — cấu hình bắt buộc truyền cho tesseract.js', () => {
    it('luôn truyền errorHandler và cacheMethod readOnly', async () => {
        // Hai tuỳ chọn này trông như chi tiết vặt và rất dễ bị xoá trong một lần dọn code.
        // Bỏ errorHandler: ảnh hỏng tắt cả backend. Bỏ readOnly: một lần khởi tạo hỏng xoá
        // tệp traineddata thật. Ghim chúng bằng test.
        let options;
        const scanner = loadScanner({}, {
            'tesseract.js': () => ({
                createWorker: async (_langs, _oem, opts) => {
                    options = opts;
                    return {
                        setParameters: async () => {},
                        recognize: async () => ({ data: { text: '', confidence: 0 } }),
                        terminate: async () => {},
                    };
                },
            }),
        });

        await scanner.scanImage(Buffer.from('anh'));

        assert.strictEqual(typeof options.errorHandler, 'function');
        assert.strictEqual(options.cacheMethod, 'readOnly');
        await scanner.shutdown();
    });
});

describe('receiptOcrScanner — hạn chót tính từ lúc gọi, gồm cả thời gian xếp hàng', () => {
    /** tesseract.js giả: worker dựng ngay, còn mỗi lượt quét kẹt tới khi bị giết. */
    const stuckTesseract = (stats) => () => ({
        createWorker: async () => {
            stats.created += 1;
            return {
                setParameters: async () => {},
                recognize: () => new Promise(() => {}),
                terminate: async () => { stats.terminated += 1; },
            };
        },
    });

    it('không nơi gọi nào phải chờ quá trần, dù đứng sau một lượt quét kẹt', async () => {
        // Trước đây trần chỉ bọc riêng `recognize`: ảnh xếp sau một lượt kẹt phải chờ lượt
        // đó hết trần rồi mới bắt đầu tính trần của mình, và runPipeline chờ OCR bằng
        // Promise.all — tức tài xế chờ theo.
        const stats = { created: 0, terminated: 0 };
        const scanner = loadScanner({ RECEIPT_OCR_TIMEOUT_MS: '300' }, { 'tesseract.js': stuckTesseract(stats) });

        const startedAt = Date.now();
        const results = await Promise.all([1, 2, 3, 4].map(() => scanner.scanImage(Buffer.from('anh'))));
        const elapsed = Date.now() - startedAt;

        assert.ok(elapsed < 1_000, `tất cả phải xong quanh mức 300ms, thực tế ${elapsed}ms`);
        assert.strictEqual(results[0].code, 'OCR_TIMEOUT', 'lượt đang chạy thì là quá thời gian');
        assert.ok(results.slice(1).every((r) => r.code === 'OCR_BUSY'), 'lượt còn xếp hàng thì là bận');
        await scanner.shutdown();
    });

    it('giết worker kẹt để lượt sau dựng worker mới', async () => {
        const stats = { created: 0, terminated: 0 };
        const scanner = loadScanner({ RECEIPT_OCR_TIMEOUT_MS: '150' }, { 'tesseract.js': stuckTesseract(stats) });

        await scanner.scanImage(Buffer.from('anh'));
        await new Promise((resolve) => setTimeout(resolve, 50));
        await scanner.scanImage(Buffer.from('anh'));

        assert.ok(stats.terminated >= 1, 'worker kẹt phải bị giết');
        assert.strictEqual(stats.created, 2, 'lượt sau phải dựng worker mới');
        await scanner.shutdown();
    });

    it('dựng worker treo được tính là dựng hỏng, không phải một lượt quét chậm', async () => {
        // Đo được dựng worker chỉ ~0,3 giây. Treo tới hết trần là dấu hiệu tệp ngôn ngữ
        // hỏng; phải tạm tắt thay vì dựng lại (và rò thêm một luồng) ở mỗi hóa đơn.
        const scanner = loadScanner({ RECEIPT_OCR_TIMEOUT_MS: '150' }, {
            'tesseract.js': () => ({ createWorker: () => new Promise(() => {}) }),
        });

        const first = await scanner.scanImage(Buffer.from('anh'));
        await new Promise((resolve) => setTimeout(resolve, 100));
        const second = await scanner.scanImage(Buffer.from('anh'));

        assert.strictEqual(first.code, 'OCR_INIT_FAILED');
        assert.strictEqual(second.code, 'OCR_UNAVAILABLE');
    });

    it('dựng hỏng liên tiếp 3 lần thì tắt hẳn, chặn rò rỉ luồng worker vô hạn', async () => {
        const scanner = loadScanner({ RECEIPT_OCR_RETRY_MS: '1' }, {
            'tesseract.js': () => ({
                createWorker: async (_l, _o, opts) => {
                    // Mô phỏng đúng cách thư viện báo lỗi pha khởi động: qua errorHandler,
                    // còn lời hứa của chính nó thì không bao giờ xong.
                    setImmediate(() => opts.errorHandler('Error: Failed loading language'));
                    return new Promise(() => {});
                },
            }),
        });

        const codes = [];
        for (let i = 0; i < 5; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 5));
            codes.push((await scanner.scanImage(Buffer.from('anh'))).code);
        }

        assert.deepStrictEqual([...codes], ['OCR_INIT_FAILED', 'OCR_INIT_FAILED', 'OCR_INIT_FAILED', 'OCR_UNAVAILABLE', 'OCR_UNAVAILABLE']);
    });
});

/**
 * Pha DỰNG worker có trần riêng, và được dựng sẵn lúc khởi động.
 *
 * Log máy chủ thật ngày 20/9 cho thấy pha này mất quá 25 giây rồi hỏng — cả 25 giây đó
 * nằm trong request "Hoàn thành bảo dưỡng" của tài xế, và app bỏ cuộc ở giây thứ 30 trong
 * khi máy chủ vẫn đang dựng worker. Quét OCR là lớp đối chiếu THÊM: nó không bao giờ được
 * phép là lý do tài xế phải chờ.
 */
describe('receiptOcrScanner — dựng worker không được ăn vào thời gian của tài xế', () => {
    /** createWorker treo mãi, mô phỏng máy chủ không đủ sức nạp WASM + traineddata. */
    const hangingTesseract = () => ({ createWorker: () => new Promise(() => {}) });

    it('trần dựng worker ngắn hơn hẳn trần quét — không chờ hết cả trần quét', async () => {
        const scanner = loadScanner(
            { RECEIPT_OCR_TIMEOUT_MS: '5000', RECEIPT_OCR_INIT_TIMEOUT_MS: '200' },
            { 'tesseract.js': hangingTesseract },
        );
        const startedAt = Date.now();

        const result = await scanner.scanImage(Buffer.from('anh'));
        const elapsed = Date.now() - startedAt;

        assert.strictEqual(result.code, 'OCR_INIT_FAILED');
        assert.ok(elapsed < 1_500, `phải bỏ cuộc quanh mức 200ms, thực tế ${elapsed}ms`);
    });

    it('dựng sẵn lúc khởi động thất bại → lượt quét sau bỏ qua OCR ngay, không chờ lần nữa', async () => {
        const scanner = loadScanner(
            { RECEIPT_OCR_INIT_TIMEOUT_MS: '200', RECEIPT_OCR_RETRY_MS: '300000' },
            { 'tesseract.js': hangingTesseract },
        );

        const warm = await scanner.warmUp();
        const startedAt = Date.now();
        const result = await scanner.scanImage(Buffer.from('anh'));

        assert.strictEqual(warm.ok, false);
        assert.strictEqual(warm.code, 'OCR_INIT_FAILED');
        // Tài xế đầu tiên KHÔNG trả tiền cho việc này lần nữa: câu trả lời đã có từ lúc
        // khởi động, lượt quét trả về tức thì.
        assert.strictEqual(result.code, 'OCR_UNAVAILABLE');
        assert.ok(Date.now() - startedAt < 100, `phải trả về tức thì, thực tế ${Date.now() - startedAt}ms`);
    });

    it('dựng sẵn thành công → worker đã sẵn sàng cho hóa đơn đầu tiên', async () => {
        let created = 0;
        const scanner = loadScanner({}, {
            'tesseract.js': () => ({
                createWorker: async () => {
                    created += 1;
                    return {
                        setParameters: async () => {},
                        recognize: async () => ({ data: { text: 'HOA DON', confidence: 90 } }),
                        terminate: async () => {},
                    };
                },
            }),
        });

        const warm = await scanner.warmUp();
        const result = await scanner.scanImage(Buffer.from('anh'));

        assert.strictEqual(warm.ok, true);
        assert.strictEqual(result.ok, true);
        assert.strictEqual(created, 1, 'hóa đơn đầu tiên dùng lại worker đã dựng sẵn');
        await scanner.shutdown();
    });

    it('OCR tắt bằng env thì không dựng gì cả', async () => {
        const scanner = loadScanner({}, { 'tesseract.js': hangingTesseract });
        const saved = process.env.RECEIPT_OCR_ENABLED;
        process.env.RECEIPT_OCR_ENABLED = 'false';

        try {
            assert.deepStrictEqual(await scanner.warmUp(), { ok: false, code: 'OCR_DISABLED' });
        } finally {
            if (saved === undefined) delete process.env.RECEIPT_OCR_ENABLED;
            else process.env.RECEIPT_OCR_ENABLED = saved;
        }
    });
});
