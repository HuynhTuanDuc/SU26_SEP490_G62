/**
 * GIAI ĐOẠN 2 của dây chuyền đọc hóa đơn: QUÉT OCR (Tesseract).
 *
 * ĐỌC KỸ VAI TRÒ CỦA FILE NÀY TRƯỚC KHI SỬA — nó KHÔNG phải bộ trích xuất.
 *
 * Tesseract trả về một chuỗi text PHẲNG, mất sạch cấu trúc bảng: từ
 * "Nhớt Castrol 1 450.000 450.000" không có cách nào biết đâu là số lượng, đâu là đơn
 * giá, đâu là thành tiền. Đó chính là lý do việc TRÍCH XUẤT có cấu trúc được giao cho
 * Gemini (receiptVisionExtractor) chứ không giao cho Tesseract.
 *
 * Nhưng cái Tesseract làm được mà model không làm được là: nó KHÔNG BAO GIỜ BỊA. Một
 * model sinh có thể trả về con số "1.320.000" hợp lý đến từng chữ số mà trên giấy
 * không hề có; Tesseract thì chỉ nói được những gì thật sự có hình dạng ký tự trên
 * ảnh. Nên ở đây nó đóng vai NHÂN CHỨNG ĐỘC LẬP:
 *
 *   - Con số tổng mà model khai có thật sự xuất hiện trên tờ giấy không?
 *   - Trên giấy có chữ "BÁO GIÁ" mà model bỏ sót không?
 *   - Trên giấy có mặt hàng ngoài phạm vi (xăng, cầu đường) mà model không liệt kê?
 *
 * Việc đối chiếu nằm ở receiptCrossCheck.js. File này chỉ trả về "quét được chữ gì",
 * y như extractor chỉ trả về "trên giấy viết gì".
 *
 * Toàn bộ phụ thuộc `tesseract.js` được nạp LƯỜI (require trong hàm) và mọi lỗi đều
 * nuốt lại thành `{ ok: false }`: thiếu gói, thiếu traineddata hay worker chết đều
 * chỉ làm mất lớp đối chiếu, không được phép làm hỏng luồng duyệt hóa đơn.
 */

const fs = require('fs');
const path = require('path');
const taxonomy = require('./receiptTaxonomy');

// ─── Cấu hình ────────────────────────────────────────────────────────────────

// Hai tệp vie.traineddata / eng.traineddata nằm sẵn ở thư mục backend. Trỏ cả
// `langPath` lẫn `cachePath` vào đó để Tesseract đọc thẳng từ đĩa: mặc định nó tải
// từ CDN mỗi lần khởi động worker, tức là container không có Internet ra ngoài là
// OCR chết, còn có Internet thì cũng tốn vài giây đầu tiên vô ích.
const LANG_DIR = process.env.RECEIPT_OCR_LANG_DIR || path.join(__dirname, '..');

const LANGS = process.env.RECEIPT_OCR_LANGS || 'vie+eng';

// Chế độ phân trang. '3' (AUTO) chạy phân tích bố cục đầy đủ — đúng cho hóa đơn GTGT
// khổ A4 có tiêu đề, bảng, chân trang. Hóa đơn nhiệt khổ hẹp đôi khi hợp với '4'
// (một cột) hoặc '6' (một khối) hơn, nên để chỉnh được qua env mà không phải deploy.
const PSM = process.env.RECEIPT_OCR_PSM || '3';

// Đo trên bản in sạch 2000×2800, 6 dòng hàng: 2,7 giây lần đầu (gồm cả dựng worker)
// và 2,0 giây các lần sau. Trần 25 giây rộng gấp nhiều lần mức đó là CỐ Ý: ảnh chụp
// bằng điện thoại — nghiêng, loá, nhiễu nén — tốn hơn hẳn bản in sạch, và trần này chỉ
// để cứu trường hợp worker kẹt hẳn chứ không phải để cắt những lần quét chậm nhưng
// vẫn đang chạy đúng.
const TIMEOUT_MS = Number(process.env.RECEIPT_OCR_TIMEOUT_MS || 25_000);

// Dựng worker tốn khoảng 0,3–0,8 giây (đo: 281ms khi nạp vie+eng từ đĩa) và giữ vài
// chục MB RAM. Giữ lại dùng cho ảnh sau — một đợt bảo dưỡng thường có nhiều hóa đơn —
// nhưng thả ra khi vắng khách để container idle không phải gánh phần bộ nhớ đó.
const IDLE_SHUTDOWN_MS = Number(process.env.RECEIPT_OCR_IDLE_MS || 120_000);

/**
 * OCR bật hay tắt.
 *
 * Tắt được bằng env vì đây là lớp TỐN CPU nhất của cả dây chuyền: trên môi trường
 * chạy sát hạn mức CPU, đánh đổi một lớp đối chiếu để lấy thời gian phản hồi là một
 * quyết định vận hành hợp lệ — và phải tắt được mà không cần sửa code.
 */
const isOcrEnabled = () => {
    if (String(process.env.RECEIPT_OCR_ENABLED ?? 'true').toLowerCase() === 'false') return false;
    try {
        require.resolve('tesseract.js');
        return true;
    } catch {
        return false;
    }
};

// ─── Vòng đời worker ─────────────────────────────────────────────────────────

let workerPromise = null;
let idleTimer = null;
// Tesseract chỉ nhận MỘT việc một lúc. Hai ảnh gọi song song (validateMaintenanceBills
// chạy Promise.all trên nhiều hóa đơn) mà cùng đẩy vào một worker thì kết quả trộn vào
// nhau. Xếp hàng bằng một dây promise là cách rẻ nhất để bảo đảm tuần tự.
let queue = Promise.resolve();

const clearIdleTimer = () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
};

const scheduleIdleShutdown = () => {
    clearIdleTimer();
    if (IDLE_SHUTDOWN_MS <= 0) return;
    idleTimer = setTimeout(() => { shutdown().catch(() => {}); }, IDLE_SHUTDOWN_MS);
    if (typeof idleTimer.unref === 'function') idleTimer.unref();
};

// Dựng worker hỏng (thiếu hoặc hỏng tệp traineddata, sai tên ngôn ngữ) là lỗi CẤU HÌNH:
// thử lại ở hóa đơn kế tiếp cũng hỏng y vậy, chỉ tốn thêm thời gian đọc 5MB từ đĩa và
// thêm một dòng log. Tạm tắt kênh OCR trong một khoảng rồi mới thử lại.
const INIT_RETRY_MS = Number(process.env.RECEIPT_OCR_RETRY_MS || 5 * 60_000);
// Hỏng liên tiếp chừng này lần thì tắt hẳn tới khi khởi động lại tiến trình. Lý do có
// trần cứng: một lần dựng hỏng có thể để lại một luồng worker mồ côi mà ta không có cách
// nào chạm tới để giết (xem getWorker). Thử lại vô hạn là rò rỉ vô hạn; tệp traineddata
// hỏng thì cũng không tự lành nếu không deploy lại — mà deploy lại là khởi động lại.
const MAX_INIT_FAILURES = 3;
let unavailableUntil = 0;
let initFailures = 0;

const recordInitFailure = (err) => {
    initFailures += 1;
    if (initFailures >= MAX_INIT_FAILURES) {
        unavailableUntil = Number.POSITIVE_INFINITY;
        console.error(`[receipt] Dựng worker OCR hỏng ${initFailures} lần liên tiếp — TẮT HẲN OCR tới khi khởi động lại. Lỗi cuối:`, err.message);
    } else {
        unavailableUntil = Date.now() + INIT_RETRY_MS;
        console.warn(`[receipt] Không dựng được worker OCR (lần ${initFailures}), tạm tắt OCR ${Math.round(INIT_RETRY_MS / 1000)} giây:`, err.message);
    }
};

/**
 * Tệp traineddata nào đang thiếu hoặc rỗng.
 *
 * Kiểm tra TRƯỚC khi dựng worker chứ không để tesseract.js tự phát hiện, vì cách nó
 * phát hiện là hỏng: thiếu tệp ở pha nạp ngôn ngữ thì lời hứa dựng worker không bao
 * giờ xong (xem getWorker). Kiểm ở đây thì trường hợp hay gặp nhất — sai tên ngôn ngữ
 * trong env, quên đưa tệp vào image Docker — báo lỗi ngay, không đẻ ra luồng nào.
 */
const missingLanguageFiles = () => LANGS.split('+').map((lang) => lang.trim()).filter(Boolean)
    .filter((lang) => {
        try {
            return fs.statSync(path.join(LANG_DIR, `${lang}.traineddata`)).size === 0;
        } catch {
            return true;
        }
    });

/**
 * tesseract.js đẩy lỗi ra dưới dạng CHUỖI chứ không phải Error, nên `err.message` là
 * undefined và mọi dòng log thành "OCR không quét được: undefined". Chuẩn hoá một chỗ.
 */
const toError = (value, code) => {
    const err = value instanceof Error ? value : new Error(String(value ?? 'Lỗi không rõ'));
    if (code && !err.code) err.code = code;
    return err;
};

const getWorker = async () => {
    if (!workerPromise) {
        const missing = missingLanguageFiles();
        if (missing.length > 0) {
            throw toError(`Thiếu tệp ngôn ngữ OCR trong ${LANG_DIR}: ${missing.map((l) => `${l}.traineddata`).join(', ')}`, 'OCR_INIT_FAILED');
        }

        const { createWorker } = require('tesseract.js');

        // tesseract.js có lỗi ở pha khởi động: chuỗi nạp core → nạp ngôn ngữ → khởi tạo
        // kết thúc bằng `.catch(() => {})`, còn lời hứa trả về chỉ bị reject khi riêng
        // pha nạp core hỏng. Pha nạp ngôn ngữ hay khởi tạo hỏng (tệp traineddata hỏng)
        // thì lỗi bị nuốt và lời hứa TREO VĨNH VIỄN. Cách duy nhất biết được là qua
        // errorHandler — nên tự dựng một lời hứa thất bại song song và đua với nó.
        let ready = false;
        let failInit;
        const initFailure = new Promise((_, reject) => { failInit = reject; });

        const created = createWorker(LANGS, 1, {
            langPath: LANG_DIR,
            cachePath: LANG_DIR,
            // BẮT BUỘC, KHÔNG ĐƯỢC BỎ. Mặc định, hễ khởi tạo thất bại là tesseract.js XOÁ
            // tệp <lang>.traineddata trong cachePath (nó giả định tệp trong cache bị hỏng).
            // cachePath ở đây là thư mục backend — nơi chứa chính hai tệp thật được git
            // theo dõi và đóng vào image Docker. Đã chạy thử: một lần khởi tạo hỏng xoá
            // sạch cả vie lẫn eng, sau đó OCR hỏng vĩnh viễn tới khi deploy lại, còn trên
            // máy dev thì tệp biến mất khỏi working tree. 'readOnly' vẫn đọc từ đó nhưng
            // không bao giờ ghi hay xoá.
            cacheMethod: 'readOnly',
            gzip: false,
            // Tesseract log mỗi 1% tiến độ; để mặc định thì một ảnh sinh hàng trăm dòng
            // log không ai đọc, lấp hết log thật.
            logger: () => {},
            // BẮT BUỘC, KHÔNG ĐƯỢC BỎ. Khi một việc thất bại (ảnh không giải mã được,
            // thiếu traineddata), tesseract.js reject promise của việc đó RỒI còn `throw`
            // thêm một lần bên trong event listener nếu không có errorHandler. Lần throw
            // thứ hai đó không try/catch nào của ta bắt được — nó thành uncaughtException,
            // và app.js bắt uncaughtException bằng process.exit(1).
            //
            // Đã chạy thử: một tệp JPEG bị cắt cụt hoặc vài KB bytes rác là đủ TẮT CẢ
            // BACKEND, kéo theo mọi request đang chạy trên instance đó. Lỗi của một việc
            // đang chạy vẫn tới được nơi gọi qua promise bị reject của chính việc đó; ở
            // đây chỉ còn phải xử lý lỗi ở pha khởi động, pha mà thư viện tự nuốt mất.
            errorHandler: (data) => {
                if (!ready) failInit(toError(data, 'OCR_INIT_FAILED'));
            },
        });

        const pending = Promise.race([created, initFailure]).then(async (worker) => {
            ready = true;
            // Worker của Node là EventEmitter. tesseract.js gán `worker.onerror` theo kiểu
            // Web Worker của trình duyệt — trong Node thuộc tính đó KHÔNG BAO GIỜ được
            // gọi. Luồng worker chết (WASM hết bộ nhớ, abort) sẽ phát sự kiện 'error' mà
            // không ai nghe, và EventEmitter ném nó thành uncaughtException — lại tắt
            // cả backend. Việc đang dở sẽ không bao giờ xong; hạn chót ở scanImage lo phần
            // đó, còn ở đây chỉ cần đánh dấu worker đã chết để lượt sau dựng cái mới.
            worker.worker?.on?.('error', (err) => {
                console.warn('[receipt] Luồng worker OCR bị chết:', toError(err).message);
                if (workerPromise === pending) workerPromise = null;
            });
            await worker.setParameters({
                tessedit_pageseg_mode: PSM,
                // Giữ khoảng trắng giữa các cột. Không có nó, "Nhớt 1 450.000" bị ép
                // thành "Nhớt 1 450.000" mất luôn khoảng cách cột — mà khoảng cách cột
                // là manh mối duy nhất còn lại để tách con số ra khỏi tên hàng.
                preserve_interword_spaces: '1',
            });
            initFailures = 0;
            return worker;
        }).catch((err) => {
            if (workerPromise === pending) workerPromise = null;
            throw toError(err, 'OCR_INIT_FAILED');
        });
        workerPromise = pending;
    }
    return workerPromise;
};

/** Dừng worker và trả bộ nhớ. Gọi khi rảnh lâu, khi worker kẹt, và cuối mỗi test. */
const shutdown = async () => {
    clearIdleTimer();
    const pending = workerPromise;
    workerPromise = null;
    if (!pending) return;
    try {
        const worker = await pending;
        await worker.terminate();
    } catch {
        // Worker đã chết sẵn — đúng cái ta muốn.
    }
};

/** Chạy tuần tự: mỗi việc chờ việc trước xong, kể cả khi việc trước ném lỗi. */
const runExclusive = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.then(() => {}, () => {});
    return run;
};

const withTimeout = (promise, ms, code, message) => {
    let timer;
    const guard = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(message), { code })), ms);
        if (typeof timer.unref === 'function') timer.unref();
    });
    return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
};

// ─── Đọc kết quả Tesseract ───────────────────────────────────────────────────

/**
 * Rút danh sách dòng kèm độ tin cậy từ kết quả Tesseract.
 *
 * Độ tin cậy THEO DÒNG quan trọng hơn độ tin cậy trung bình cả trang: một tờ hóa đơn
 * có phần tiêu đề rõ nét và phần bảng bị loá sáng sẽ cho trung bình "khá ổn" trong khi
 * đúng những con số ta cần lại là phần không đọc được. Có confidence theo dòng thì
 * tầng đối chiếu mới biết được là "không thấy con số này" hay "chỗ đó vốn không đọc nổi".
 *
 * Hình dạng kết quả đổi giữa các phiên bản tesseract.js (v4 có `data.lines`, v5 lồng
 * trong `data.blocks`), nên dò lần lượt rồi mới rơi về cắt chuỗi thô.
 */
const extractLines = (data) => {
    if (Array.isArray(data?.lines) && data.lines.length > 0) {
        return data.lines.map((line) => ({
            text: String(line?.text ?? '').trim(),
            confidence: Number(line?.confidence ?? 0),
        })).filter((line) => line.text);
    }

    if (Array.isArray(data?.blocks)) {
        const lines = [];
        for (const block of data.blocks) {
            for (const paragraph of block?.paragraphs ?? []) {
                for (const line of paragraph?.lines ?? []) {
                    const text = String(line?.text ?? '').trim();
                    if (text) lines.push({ text, confidence: Number(line?.confidence ?? 0) });
                }
            }
        }
        if (lines.length > 0) return lines;
    }

    return String(data?.text ?? '')
        .split(/\r?\n/)
        .map((text) => ({ text: text.trim(), confidence: Number(data?.confidence ?? 0) }))
        .filter((line) => line.text);
};

// ─── Điểm vào ────────────────────────────────────────────────────────────────

/**
 * Quét một ảnh thành text thô.
 *
 * KHÔNG ném lỗi ra ngoài — mọi sự cố thành `{ ok: false, code }`. Nơi gọi coi kênh OCR
 * là "không có ý kiến" và tiếp tục với một mình kênh Gemini.
 *
 * @param {Buffer} buffer  bytes của biến thể ảnh đã tăng cường (receiptImagePipeline)
 * @returns {Promise<{ok: boolean, code?: string, text?: string, confidence?: number,
 *                    lines?: Array<{text: string, confidence: number}>, latency_ms: number, engine?: string}>}
 */
const scanImage = async (buffer, { deadlineAt = null } = {}) => {
    const startedAt = Date.now();

    if (!isOcrEnabled()) {
        return { ok: false, code: 'OCR_DISABLED', latency_ms: 0 };
    }
    if (Date.now() < unavailableUntil) {
        return { ok: false, code: 'OCR_UNAVAILABLE', latency_ms: 0 };
    }
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { ok: false, code: 'OCR_NO_IMAGE', latency_ms: 0 };
    }

    // HẠN CHÓT TÍNH TỪ LÚC GỌI, không phải từ lúc tới lượt. Trước đây trần thời gian chỉ
    // bọc quanh `recognize`, nên hai khoảng chờ nằm NGOÀI mọi giới hạn:
    //   * xếp hàng sau các ảnh khác — đo được: 6 ảnh gọi cùng lúc thì ảnh cuối chờ gấp
    //     6 lần một ảnh, và nhiều tài xế tải ảnh cùng lúc là chuyện thường ngày;
    //   * dựng worker — kẹt ở đây thì cả hàng đợi kẹt theo, mọi lượt quét sau đó treo
    //     vô hạn, và runPipeline treo theo vì nó chờ OCR bằng Promise.all.
    // OCR chỉ là kênh đối chiếu THÊM: nó không bao giờ được phép làm tài xế chờ lâu hơn
    // trần này, dù hàng đợi có dài tới đâu.
    // Trần riêng của OCR, nhưng không được vượt hạn trả lời của cả request: nơi gọi chờ
    // OCR bằng Promise.all, nên OCR chạy quá hạn là cả request chạy quá hạn.
    const deadline = Math.min(startedAt + TIMEOUT_MS, deadlineAt ?? Infinity);
    const remaining = () => Math.max(0, deadline - Date.now());
    let started = false;

    const job = runExclusive(async () => {
        // Hết hạn trong lúc còn xếp hàng thì bỏ luôn — nơi gọi đã nhận "không có ý kiến"
        // và đi tiếp rồi, quét tiếp chỉ tổ bắt những ảnh xếp sau chờ thêm vô ích.
        if (remaining() === 0) {
            return { ok: false, code: 'OCR_BUSY', latency_ms: Date.now() - startedAt };
        }
        started = true;
        clearIdleTimer();
        try {
            // Dựng worker quá hạn KHÔNG phải chuyện tải cao nhất thời: đo được ~0,3 giây,
            // trần là 25 giây. Treo tới mức đó là dấu hiệu tệp ngôn ngữ hỏng (xem getWorker)
            // nên được đếm như một lần dựng hỏng, không phải một lần quét chậm.
            const worker = await withTimeout(getWorker(), remaining(), 'OCR_INIT_FAILED', 'Quá thời gian dựng worker OCR');
            const result = await withTimeout(
                // Chỉ xin `text` và `blocks`; hocr/tsv là hai lần dựng chuỗi nữa cho
                // định dạng không ai dùng tới.
                worker.recognize(buffer, {}, { text: true, blocks: true }),
                remaining(),
                'OCR_TIMEOUT',
                'Quá thời gian quét OCR',
            );

            const data = result?.data ?? {};
            // Bỏ NUL ngay tại nguồn. PostgreSQL từ chối U+0000 ở cả TEXT lẫn JSONB, mà text
            // OCR đi vào cả cột ocr_text lẫn phần chi tiết của lý do trong cột checks —
            // một ký tự NUL từ ảnh nhiễu là đủ làm hỏng câu INSERT và mất cả dòng vết.
            const lines = extractLines(data).map((line) => ({ ...line, text: line.text.replace(/\u0000/g, '') }));
            return {
                ok: true,
                text: String(data.text ?? '').replace(/\u0000/g, ''),
                confidence: Number(data.confidence ?? 0),
                lines,
                engine: `tesseract.js/${LANGS}`,
                latency_ms: Date.now() - startedAt,
            };
        } catch (rawErr) {
            const err = toError(rawErr);
            if (err.code === 'OCR_TIMEOUT') {
                // Worker quá thời gian là worker đang kẹt giữa một trang: lần sau gọi lại
                // nó vẫn kẹt. Giết hẳn để lượt sau dựng worker sạch.
                //
                // KHÔNG `await`. shutdown() gỡ worker khỏi vị trí dùng chung ngay lập tức
                // (phần đồng bộ), còn việc chờ worker dừng hẳn thì chạy nền. Nếu worker kẹt
                // ngay từ lúc dựng thì lời hứa dựng worker không bao giờ xong — await ở đây
                // sẽ làm việc này không bao giờ kết thúc, và cả hàng đợi OCR kẹt vĩnh viễn
                // sau nó.
                shutdown().catch(() => {});
            } else if (err.code === 'OCR_INIT_FAILED') {
                // Gỡ lời hứa dựng hỏng khỏi vị trí dùng chung, kể cả khi nó đang treo —
                // không thì lượt sau lại chờ đúng lời hứa đó tới hết hạn.
                shutdown().catch(() => {});
                recordInitFailure(err);
            } else {
                // Ảnh không giải mã được là lỗi của TẤM ẢNH, không phải của worker — worker
                // vẫn dùng tiếp được cho ảnh sau, không cần dựng lại.
                console.warn('[receipt] OCR không đọc được ảnh:', err.message);
            }
            return {
                ok: false,
                code: err.code === 'OCR_TIMEOUT' || err.code === 'OCR_INIT_FAILED' ? err.code : 'OCR_FAILED',
                error: err.message,
                latency_ms: Date.now() - startedAt,
            };
        } finally {
            scheduleIdleShutdown();
        }
    });

    // Chốt chặn phía nơi gọi. Việc trong hàng đợi chỉ tự kiểm tra hạn chót KHI TỚI LƯỢT;
    // nếu việc đứng trước đang chạy hết trần của nó thì việc xếp sau vẫn phải chờ. Đua
    // với hạn chót ở đây bảo đảm nơi gọi luôn có câu trả lời đúng hạn — việc bên trong vẫn
    // chạy tiếp tới khi tự dọn xong (giết worker kẹt), chỉ là không ai phải chờ nó nữa.
    let timer;
    const cutoff = new Promise((resolve) => {
        timer = setTimeout(() => resolve({
            ok: false,
            code: started ? 'OCR_TIMEOUT' : 'OCR_BUSY',
            latency_ms: Date.now() - startedAt,
        }), remaining() + 50);
    });
    return Promise.race([job, cutoff]).finally(() => clearTimeout(timer));
};

// ─── Đọc con số từ text OCR (thuần hàm, test được) ───────────────────────────

/**
 * Ký tự Tesseract hay nhầm lẫn trong CHUỖI SỐ.
 *
 * Chỉ áp dụng bên trong một cụm đã gần như toàn số — đổi bừa mọi chữ O thành 0 trong
 * cả trang thì "Lọc gió" thành "L0c gi0" và từ điển hết khớp.
 */
const DIGIT_LOOKALIKE = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', i: '1', '|': '1', Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', b: '6' };

const repairDigits = (token) => token.replace(/[OoDQIliZzSsBGb|]/g, (ch) => DIGIT_LOOKALIKE[ch] ?? ch);

// Số tiền Việt Nam đọc theo HAI cách, vì trên một dòng bảng cả hai đều đúng.
//
// Cách chặt: chỉ dấu chấm/phẩy mới ngăn nghìn ("1.320.000", "1,320,000"), cộng dãy số
// liền từ 4 chữ số ("1320000").
//
// Cách lỏng: chấp nhận cả khoảng trắng ("1 320 000"), vì OCR hay làm mất dấu chấm mờ.
//
// PHẢI CHẠY CẢ HAI. Chỉ dùng cách lỏng thì một dòng bảng như
// "Nhot Castrol GTX  1  450.000  450.000" bị nuốt thành MỘT số 1450000450000 — hai cột
// tiền dính vào nhau qua khoảng trắng — và hai con số 450.000 có thật trên giấy biến
// mất khỏi tập đối chiếu, sinh ra cảnh báo sai trên một hóa đơn hoàn toàn đúng (đo
// được trên ảnh hóa đơn thật, không phải giả định). Chỉ dùng cách chặt thì mất số ngăn
// bằng khoảng trắng. Hợp cả hai lại: mỗi cách đều là một cách đọc hợp lệ của cùng chỗ
// pixel đó, còn token rác kiểu 13 chữ số thì không con số nào trên hóa đơn trùng vào được.
//
// Số dưới 1.000 viết liền bị bỏ qua có chủ ý: "2" ở cột số lượng, "10" ở cột thuế suất
// không phải số tiền, nạp vào tập đối chiếu chỉ tạo ra trùng khớp giả.
const MONEY_TOKEN_TIGHT = /\d{1,3}(?:[.,]\d{3})+|\d{4,}/g;
const MONEY_TOKEN_LOOSE = /\d{1,3}(?:[.,\s ]\d{3})+/g;

// Cụm "gần như toàn số" để thử sửa ký tự nhầm: ít nhất 4 ký tự, có ít nhất 2 chữ số
// thật, và không lẫn chữ cái nào ngoài danh sách hay nhầm.
const NUMERIC_ISH = /[0-9OoDQIliZzSsBGb|][0-9OoDQIliZzSsBGb|.,\s ]{3,}[0-9OoDQIliZzSsBGb|]/g;

const toAmount = (raw) => {
    const digits = String(raw).replace(/[^\d]/g, '');
    if (!digits) return null;
    const value = Number(digits);
    return Number.isFinite(value) ? value : null;
};

/**
 * Mọi con số có thể là SỐ TIỀN, đọc từ text OCR.
 *
 * Trả về hai tập tách bạch, và sự tách bạch đó là điểm mấu chốt:
 *   * `strict`  — đọc y nguyên. Khớp ở đây là bằng chứng chắc chắn.
 *   * `repaired`— đọc sau khi sửa ký tự nhầm. Khớp ở đây chỉ là "nhiều khả năng".
 *
 * Gộp hai tập làm một thì mỗi lần sửa ký tự là một cơ hội tạo ra TRÙNG KHỚP GIẢ, mà
 * trùng khớp giả ở đây nguy hiểm hơn không khớp: nó xác nhận nhầm một con số model
 * bịa ra là "có thật trên giấy".
 */
const parseMoneyTokens = (text) => {
    const source = String(text ?? '');
    const strict = new Set();
    const repaired = new Set();

    for (const pattern of [MONEY_TOKEN_TIGHT, MONEY_TOKEN_LOOSE]) {
        for (const match of source.match(pattern) ?? []) {
            const value = toAmount(match);
            if (value !== null) strict.add(value);
        }
    }

    for (const chunk of source.match(NUMERIC_ISH) ?? []) {
        for (const pattern of [MONEY_TOKEN_TIGHT, MONEY_TOKEN_LOOSE]) {
            for (const match of repairDigits(chunk).match(pattern) ?? []) {
                const value = toAmount(match);
                if (value !== null && !strict.has(value)) repaired.add(value);
            }
        }
    }

    return { strict, repaired };
};

/**
 * Con số này có xuất hiện trên tờ giấy không?
 *
 * @returns {'yes'|'likely'|'no'|'unknown'}  'unknown' = không có gì để đối chiếu
 */
const amountAppearsIn = (tokens, value) => {
    if (!tokens || !Number.isFinite(value)) return 'unknown';
    // Tập token chỉ chứa số nguyên (VNĐ không có phần lẻ, và bộ tách số bỏ phần ",00").
    // Model thì có thể trả 1826000.5 hay 450000.0000001 sau khi tự ép kiểu — so thẳng
    // với Set thì không bao giờ khớp và sinh cảnh báo "không tìm thấy tổng tiền" oan.
    const amount = Math.round(value);
    if (tokens.strict?.has(amount)) return 'yes';
    if (tokens.repaired?.has(amount)) return 'likely';
    return 'no';
};

// ─── Dấu hiệu loại chứng từ ──────────────────────────────────────────────────

/**
 * Mẫu dò theo BIÊN TỪ trên text đã bỏ dấu.
 *
 * Bản trước dò bằng `includes`, tức chuỗi con tự do, và bị hai kiểu trùng giả:
 *   * dính giữa từ: "vat" khớp vào "vat tu" (vật tư);
 *   * bỏ dấu làm hai cụm khác nghĩa thành một: "đủ toàn bộ" → "du toan bo" chứa
 *     "du toan" (dự toán). Đã chạy thử: một hóa đơn thật ghi "khách đã thanh toán đủ
 *     toàn bộ" bị gắn OCR_QUOTE_SIGNAL, trừ 0,25 điểm, đẩy sang cần người xem và tốn
 *     thêm một lượt gọi model.
 * "dự toán bộ" không phải cụm có nghĩa trong tiếng Việt, nên loại riêng đuôi " bo".
 */
const DOC_SIGNAL_PATTERNS = {
    quote: [/\bbao gia\b/, /\bdu toan\b(?! bo\b)/, /\bquotation\b/, /\bquote\b/, /\bestimate\b/],
    invoice: [/\bhoa don\b/, /\bphieu thu\b/, /\bbien nhan\b/, /\binvoice\b/, /\breceipt\b/],
    vat: [/\bthue gtgt\b/, /\bthue suat\b/, /\btien thue\b/, /\bvat\b(?! (?:tu|lieu|dung|pham)\b)/],
    unpaid: [/\bchua thanh toan\b/, /\bcon no\b/, /\bno lai\b/],
};

// Những cụm CÓ DẤU mà bỏ dấu đi thì trùng mặt chữ với dấu hiệu báo giá. Khi OCR đọc
// được dấu (bản in rõ thường đọc được), dấu chính là thứ phân biệt được hai nghĩa.
const QUOTE_LOOKALIKES = ['đủ toàn', 'dù toàn'];

/**
 * Dò các cụm từ quyết định loại chứng từ, trên text đã bỏ dấu.
 *
 * Bỏ dấu trước khi dò là bắt buộc: Tesseract đọc tiếng Việt có dấu sai rất thường
 * xuyên ("BÁO GIÁ" ra "BAO GIA", "BÁO GlÁ", "BÁO G!Á"), nhưng phần chữ cái không dấu
 * thì gần như luôn đúng. Cái giá của việc bỏ dấu là những cặp chữ trùng mặt khi mất
 * dấu — nên với cụm nào mơ hồ, quay lại soi dấu trên text gốc trước khi kết luận.
 */
const detectDocSignals = (text) => {
    const flat = taxonomy.normalize(text);
    const accented = String(text ?? '').toLowerCase().normalize('NFC');

    const found = {};
    for (const [signal, patterns] of Object.entries(DOC_SIGNAL_PATTERNS)) {
        found[signal] = patterns.map((pattern) => flat.match(pattern)?.[0]).find(Boolean) ?? null;
    }

    if (found.quote === 'du toan'
        && QUOTE_LOOKALIKES.some((phrase) => accented.includes(phrase))
        && !accented.includes('dự toán')) {
        found.quote = null;
    }
    return found;
};

// ─── Biển số đọc từ text ─────────────────────────────────────────────────────

// Biển số Việt Nam: 2 số tỉnh + 1–2 chữ + 4–5 số, viết liền hay có gạch/chấm đều được.
const PLATE_PATTERN = /\b(\d{2})\s?-?\s?([A-Z]{1,2})\s?-?\s?(\d{3}[.\s]?\d{1,2})\b/g;

/** Mọi biển số dò được, đã chuẩn hoá về dạng chỉ chữ và số. */
const findPlates = (text) => {
    const source = String(text ?? '').toUpperCase();
    const plates = new Set();
    for (const match of source.matchAll(PLATE_PATTERN)) {
        plates.add(`${match[1]}${match[2]}${match[3]}`.replace(/[^A-Z0-9]/g, ''));
    }
    return [...plates];
};

// ─── Từ điển chạy trên text thô ──────────────────────────────────────────────

/**
 * Chạy từ điển hạng mục trên TỪNG DÒNG text OCR.
 *
 * Đây là đường thứ ba, độc lập với cả hai đường đang có (model tự phân loại, và từ
 * điển chạy trên tên hàng do model đọc ra). Nó bắt được đúng cái hai đường kia không
 * bắt được: một dòng hàng model BỎ SÓT hoàn toàn. Model bỏ sót dòng "Xăng A95
 * 500.000" thì từ điển chạy trên line_items không có gì để soi — nhưng chữ "xăng" vẫn
 * nằm sờ sờ trong text OCR.
 *
 * @returns {Array<{line: string, confidence: number, category: string, group: string, keyword: string}>}
 */
const dictionaryHits = (lines, keywordIndex) => {
    const hits = [];
    for (const line of lines ?? []) {
        const match = taxonomy.matchCategory(line?.text, keywordIndex);
        if (match) {
            hits.push({
                line: line.text,
                confidence: Number(line.confidence ?? 0),
                category: match.category,
                group: match.group,
                keyword: match.keyword,
            });
        }
    }
    return hits;
};

module.exports = {
    LANGS,
    TIMEOUT_MS,
    isOcrEnabled,
    scanImage,
    shutdown,
    extractLines,
    repairDigits,
    parseMoneyTokens,
    amountAppearsIn,
    detectDocSignals,
    findPlates,
    dictionaryHits,
};
