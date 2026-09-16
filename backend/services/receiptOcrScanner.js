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

const path = require('path');
const taxonomy = require('./receiptTaxonomy');

// ─── Cấu hình ────────────────────────────────────────────────────────────────

// Hai tệp vie.traineddata / eng.traineddata nằm sẵn ở thư mục backend. Trỏ cả
// `langPath` lẫn `cachePath` vào đó để Tesseract đọc thẳng từ đĩa: mặc định nó tải
// từ CDN mỗi lần khởi động worker, tức là container không có Internet ra ngoài là
// OCR chết, còn có Internet thì cũng tốn vài giây đầu tiên vô ích.
const LANG_DIR = path.join(__dirname, '..');

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

const getWorker = async () => {
    if (!workerPromise) {
        const { createWorker } = require('tesseract.js');
        workerPromise = createWorker(LANGS, 1, {
            langPath: LANG_DIR,
            cachePath: LANG_DIR,
            gzip: false,
            // Tesseract log mỗi 1% tiến độ; để mặc định thì một ảnh sinh hàng trăm dòng
            // log không ai đọc, lấp hết log thật.
            logger: () => {},
        }).then(async (worker) => {
            await worker.setParameters({
                tessedit_pageseg_mode: PSM,
                // Giữ khoảng trắng giữa các cột. Không có nó, "Nhớt 1 450.000" bị ép
                // thành "Nhớt 1 450.000" mất luôn khoảng cách cột — mà khoảng cách cột
                // là manh mối duy nhất còn lại để tách con số ra khỏi tên hàng.
                preserve_interword_spaces: '1',
            });
            return worker;
        }).catch((err) => {
            workerPromise = null;
            throw err;
        });
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
const scanImage = async (buffer) => {
    const startedAt = Date.now();

    if (!isOcrEnabled()) {
        return { ok: false, code: 'OCR_DISABLED', latency_ms: 0 };
    }
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { ok: false, code: 'OCR_NO_IMAGE', latency_ms: 0 };
    }

    return runExclusive(async () => {
        clearIdleTimer();
        try {
            const worker = await getWorker();
            const result = await withTimeout(
                // Chỉ xin `text` và `blocks`; hocr/tsv là hai lần dựng chuỗi nữa cho
                // định dạng không ai dùng tới.
                worker.recognize(buffer, {}, { text: true, blocks: true }),
                TIMEOUT_MS,
                'OCR_TIMEOUT',
                'Quá thời gian quét OCR',
            );

            const data = result?.data ?? {};
            const lines = extractLines(data);
            return {
                ok: true,
                text: String(data.text ?? ''),
                confidence: Number(data.confidence ?? 0),
                lines,
                engine: `tesseract.js/${LANGS}`,
                latency_ms: Date.now() - startedAt,
            };
        } catch (err) {
            // Worker quá thời gian là worker đang kẹt giữa một trang: lần sau gọi lại
            // nó vẫn kẹt. Giết hẳn để lượt sau dựng worker sạch.
            if (err?.code === 'OCR_TIMEOUT') await shutdown();
            console.warn('[receipt] OCR không quét được:', err.message);
            return {
                ok: false,
                code: err?.code === 'OCR_TIMEOUT' ? 'OCR_TIMEOUT' : 'OCR_FAILED',
                error: err.message,
                latency_ms: Date.now() - startedAt,
            };
        } finally {
            scheduleIdleShutdown();
        }
    });
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
    if (tokens.strict?.has(value)) return 'yes';
    if (tokens.repaired?.has(value)) return 'likely';
    return 'no';
};

// ─── Dấu hiệu loại chứng từ ──────────────────────────────────────────────────

const DOC_SIGNAL_PHRASES = {
    quote: ['bao gia', 'bang bao gia', 'du toan', 'phieu bao gia', 'quotation', 'quote', 'estimate'],
    invoice: ['hoa don', 'hoa don gia tri gia tang', 'hoa don ban hang', 'phieu thu', 'bien nhan', 'invoice', 'receipt'],
    vat: ['thue gtgt', 'thue suat', 'tien thue', 'vat'],
    unpaid: ['chua thanh toan', 'con no', 'no lai'],
};

/**
 * Dò các cụm từ quyết định loại chứng từ, trên text đã bỏ dấu.
 *
 * Bỏ dấu trước khi dò là bắt buộc: Tesseract đọc tiếng Việt có dấu sai rất thường
 * xuyên ("BÁO GIÁ" ra "BAO GIA", "BÁO GlÁ", "BÁO G!Á"), nhưng phần chữ cái không dấu
 * thì gần như luôn đúng.
 */
const detectDocSignals = (text) => {
    const flat = taxonomy.normalize(text);
    const found = {};
    for (const [signal, phrases] of Object.entries(DOC_SIGNAL_PHRASES)) {
        const hit = phrases.find((phrase) => flat.includes(phrase));
        found[signal] = hit ?? null;
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
