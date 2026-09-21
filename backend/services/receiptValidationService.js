/**
 * ĐIỀU PHỐI cả dây chuyền đọc hóa đơn BẢO DƯỠNG. Đây là mặt tiền mà driverService (tải
 * ảnh, hoàn tất) và vehicleManagementController (màn duyệt) gọi. Chi phí chuyến không
 * đi qua dây chuyền này. Các giai đoạn đứng riêng từng file:
 *
 *   1. receiptImagePipeline  — tải ảnh MỘT lần, sinh hai biến thể, chấm chất lượng ảnh
 *   2. receiptOcrScanner     — quét Tesseract lấy text thô (nhân chứng độc lập)
 *   3. receiptVisionExtractor— Gemini đọc ra JSON có cấu trúc
 *   3b.                       đọc LẠI có trợ giúp text OCR, chỉ khi bước 4 nghi ngờ
 *   4. receiptCrossCheck     — đối chiếu chéo hai kênh + từ điển, ra độ tin cậy
 *   5. receiptChecks         — chấm luật thuần, ra phán quyết
 *   6. repository            — lưu vết đủ để tranh chấp và để đo lại
 *
 * Bước 2 và 3 chạy SONG SONG, cố ý, vì hai lý do cùng chiều: độ trễ tổng bằng bên chậm
 * hơn thay vì bằng tổng hai bên, và quan trọng hơn — hai kênh không nhìn thấy kết quả
 * của nhau nên việc chúng khớp nhau mới là bằng chứng. Chỉ ở bước 3b, khi đã có nghi
 * ngờ cụ thể, model mới được xem text OCR.
 *
 * Ba nguyên tắc chi phối toàn bộ file này:
 *
 *   1. Sự cố hạ tầng KHÔNG BAO GIỜ thành `passed`. Lớp cũ fail-open — OCR timeout thì
 *      trả valid:true — nên trong thực tế nó chỉ có hai chế độ: chặn oan người trung
 *      thực khi ảnh hơi mờ, và cho qua tất cả khi hạ tầng trục trặc. Ở đây mọi sự cố
 *      đều thành `needs_review`: vẫn không chặn tài xế, nhưng khoản đó không biến mất
 *      khỏi tầm mắt người duyệt.
 *
 *   2. Việc lưu vết không được làm hỏng luồng chính. Ghi log lỗi rồi đi tiếp.
 *
 *   3. Cùng một tấm ảnh chỉ chạy dây chuyền MỘT lần. Lần đọc (kể cả text OCR) được lưu
 *      lại và dùng lại ở bước hoàn tất, nơi chỉ có phép đối chiếu số tiền là mới.
 */

const repository = require('../repositories/receiptExtractionRepository');
const imagePipeline = require('./receiptImagePipeline');
const ocrScanner = require('./receiptOcrScanner');
const extractor = require('./receiptVisionExtractor');
const crossCheck = require('./receiptCrossCheck');
const checks = require('./receiptChecks');
const taxonomy = require('./receiptTaxonomy');

// Lượt đọc lại tốn thêm một lần gọi model. Tắt được qua env để khi hạn mức API căng
// thì hạ chi phí mà không mất cả tính năng — hệ thống lùi về đúng hành vi một lượt đọc.
const RECHECK_ENABLED = String(process.env.RECEIPT_VISION_RECHECK ?? 'true').toLowerCase() !== 'false';

// Lượt đọc lại chỉ được chạy khi dây chuyền còn thời gian. Một lượt gọi model có thể mất
// tới 45 giây; app tài xế cắt request tải ảnh ở 120 giây, và 120 giây đó còn gồm cả thời
// gian đẩy ảnh qua mạng điện thoại yếu. Đọc lại khi đã tốn hơn mức này thì cái giá có thể
// là tài xế nhận lỗi "hết thời gian" trong khi máy chủ vẫn lưu hóa đơn — tệ hơn nhiều so
// với việc để hóa đơn đó cần người xem.
const RECHECK_MAX_ELAPSED_MS = Number(process.env.RECEIPT_RECHECK_MAX_ELAPSED_MS || 20_000);

// Trần thời gian CẢ lượt đọc một ảnh (tải ảnh + model, tính cả lượt đọc lại và mọi lần thử
// lại). Trước đây mỗi lần gọi model có hạn 45 giây nhưng được thử lại tới 3 lần, và lượt
// đọc lại — chạy đúng với những hóa đơn LỆCH TRƯỜNG — lại thêm 3 × 45 giây nữa. Tài xế
// đứng chờ trên màn hình "Đang kiểm tra..." có thể quá hạn chờ app cho phép, và kết nối
// di động treo lâu không có dữ liệu là kết nối hay bị cắt. Hết trần thì hóa đơn chỉ rơi
// vào "cần người xem" — không bao giờ bị chặn vì hệ thống chậm.
const SCAN_BUDGET_MS = Number(process.env.RECEIPT_SCAN_BUDGET_MS || 55_000);

// Lượt đọc lại chỉ chạy khi còn ít nhất chừng này trong trần — ít hơn thì gần như chắc
// chắn hết giờ giữa chừng, tốn quota mà không sửa được gì.
const MIN_RECHECK_REMAINING_MS = 15_000;

// Sàn của trần thời gian quét. Trần thật là phần CÒN LẠI của hạn trả lời (xem
// RESPONSE_BUDGET_MS), mà phần còn lại đó có thể đã bị đoạn tải ảnh ăn gần hết khi tài xế
// đứng chỗ sóng yếu. Không có sàn thì đúng những hóa đơn gửi từ nơi sóng yếu lại là những
// hóa đơn không được đọc lần nào — tính năng tự đọc tắt đúng lúc cần nhất.
const MIN_SCAN_BUDGET_MS = Number(process.env.RECEIPT_MIN_SCAN_BUDGET_MS || 20_000);

// Hạn TRẢ LỜI cho một request có quét hóa đơn, đếm từ lúc request tới máy chủ (req.receivedAt).
// Khác với SCAN_BUDGET_MS ở chỗ nó tính cả những đoạn nằm NGOÀI dây chuyền quét: thân
// request đi qua mạng di động, rồi ảnh đẩy tiếp lên Cloudinary. Trước đây hai đoạn đó là
// thời gian "miễn phí" — trần 55 giây của lượt quét bắt đầu đếm SAU chúng, nên tổng thời
// gian tài xế phải chờ là (tải ảnh) + 55 giây, còn app thì cắt request. Ảnh sai lại
// đúng là ảnh đi hết trần (lệch trường → đọc lại → thử lại), nên "ảnh sai" và "app báo
// hết thời gian chờ" gần như luôn đi cùng nhau.
const RESPONSE_BUDGET_MS = Number(process.env.RECEIPT_RESPONSE_BUDGET_MS || 55_000);

// Trần độ dài text OCR khi LƯU. Hóa đơn A4 quét ra 2–4 nghìn ký tự; hơn nhiều lần mức đó
// là nhiễu, lưu nguyên chỉ làm phình bảng và phình màn hình duyệt.
const MAX_STORED_OCR_CHARS = 20_000;

const VERDICT_RANK = { passed: 0, needs_review: 1, rejected: 2 };

// URL Cloudinary dài cả trăm ký tự mà chỉ phần đuôi là phân biệt được ảnh nào.
const shortUrl = (url) => String(url ?? '').split('/').pop().slice(0, 40);

// Lý do cho thấy tấm ảnh KHÔNG DÙNG LÀM HÓA ĐƠN được — phân biệt với lý do cho thấy một
// hóa đơn thật có vấn đề (lệch số, dùng lại, sai hạng mục). Chỉ còn dùng để gắn nhãn
// "chứng từ kèm theo" trên màn duyệt cho những đợt cũ, từ trước khi ảnh lúc gửi yêu cầu
// được tách sang request_pics; bước hoàn tất giờ chặn mọi ảnh loại này.
const NOT_AN_INVOICE_CODES = new Set([
    'NOT_A_DOCUMENT',
    'WRONG_DOC_TYPE',
    'NO_LINE_ITEMS',
    'IMAGE_TOO_SMALL',
    'EXTRACTION_NOT_AN_IMAGE',
    'EXTRACTION_IMAGE_TOO_LARGE',
]);

/**
 * Bỏ ký tự NUL trước khi lưu.
 *
 * PostgreSQL từ chối U+0000 ở cả cột TEXT lẫn JSONB. Text OCR của một ảnh nhiễu có thể
 * chứa nó, và một câu INSERT hỏng làm mất CẢ dòng vết — gồm cả khoá nhận dạng hóa đơn,
 * tức là hóa đơn đó sau này dùng lại cho khoản khác sẽ không bị bắt.
 */
const sanitizeText = (value) => String(value ?? '').replace(/\u0000/g, '');

// ─── Từ điển: nạp từ DB, giữ trong bộ nhớ ────────────────────────────────────

const TAXONOMY_TTL_MS = 5 * 60 * 1000;
let cachedIndex = null;
let cachedAt = 0;

/**
 * Bảng tra từ khoá, gộp danh sách gốc trong code với phần mở rộng trong DB.
 *
 * DB hỏng thì vẫn chạy được bằng danh sách gốc — phân loại kém chính xác hơn một chút
 * còn hơn là cả tính năng ngừng hoạt động.
 */
const getKeywordIndex = async () => {
    if (cachedIndex && Date.now() - cachedAt < TAXONOMY_TTL_MS) return cachedIndex;

    let extra = [];
    try {
        extra = await repository.getExtraKeywords();
    } catch (err) {
        console.warn('[receipt] Không nạp được từ điển mở rộng, dùng danh sách gốc:', err.message);
    }

    cachedIndex = taxonomy.buildKeywordIndex(extra);
    cachedAt = Date.now();
    return cachedIndex;
};

/** Xoá cache — gọi sau khi thêm từ khoá mới để khỏi phải chờ hết TTL. */
const invalidateTaxonomyCache = () => { cachedIndex = null; cachedAt = 0; };

// ─── Kết quả khi không đọc được ──────────────────────────────────────────────

const EXTRACTION_ERROR_MESSAGE = {
    NOT_CONFIGURED: 'Chưa bật tính năng đọc hóa đơn tự động. Người duyệt vui lòng kiểm tra bằng mắt.',
    FETCH_FAILED: 'Không tải được ảnh hóa đơn để kiểm tra. Người duyệt vui lòng kiểm tra bằng mắt.',
    NOT_AN_IMAGE: 'Tệp tải lên không phải ảnh. Vui lòng chụp lại hóa đơn.',
    IMAGE_TOO_LARGE: 'Ảnh quá lớn để xử lý. Vui lòng chụp lại với dung lượng nhỏ hơn.',
    TIMEOUT: 'Quá thời gian đọc hóa đơn. Người duyệt vui lòng kiểm tra bằng mắt.',
    RATE_LIMIT: 'Hệ thống đọc hóa đơn đang quá tải. Người duyệt vui lòng kiểm tra bằng mắt.',
    SERVICE_UNAVAILABLE: 'Dịch vụ đọc hóa đơn tạm thời quá tải. Người duyệt vui lòng kiểm tra bằng mắt.',
    NETWORK: 'Không kết nối được dịch vụ đọc hóa đơn. Người duyệt vui lòng kiểm tra bằng mắt.',
    BAD_JSON: 'Không đọc được nội dung hóa đơn. Người duyệt vui lòng kiểm tra bằng mắt.',
    MODEL_ERROR: 'Không đọc được nội dung hóa đơn. Người duyệt vui lòng kiểm tra bằng mắt.',
};

// Ảnh sai loại/quá lớn là lỗi của người gửi, sửa được ngay bằng cách chụp lại → chặn.
// Còn lại là lỗi phía hệ thống, không được đổ lên đầu tài xế → đẩy cho người duyệt.
const BLOCKING_EXTRACTION_ERRORS = new Set(['NOT_AN_IMAGE', 'IMAGE_TOO_LARGE']);

const failedResult = (code, message) => {
    const blocking = BLOCKING_EXTRACTION_ERRORS.has(code);
    return {
        verdict: blocking ? 'rejected' : 'needs_review',
        reasons: [{
            code: `EXTRACTION_${code}`,
            severity: blocking ? 'error' : 'warning',
            message: message ?? EXTRACTION_ERROR_MESSAGE[code] ?? EXTRACTION_ERROR_MESSAGE.MODEL_ERROR,
        }],
        items: [],
        groups: null,
        totals: null,
        receipt_total: null,
        // Không đọc được thì không có gì để tin — nói 0 chứ không nói null, vì null ở
        // đây sẽ bị hiểu là "chưa chấm" và lọt qua lớp kiểm tra độ tin cậy.
        confidence: 0,
        confidence_label: 'thấp',
    };
};

// ─── Đọc một ảnh ─────────────────────────────────────────────────────────────

/**
 * Dựng lại kênh OCR từ bản đã lưu, để lần chấm sau không phải quét lại.
 *
 * Chỉ lưu text và độ tin cậy CẢ TRANG, không lưu từng dòng: dữ liệu dòng nặng gấp
 * nhiều lần text mà chỉ phục vụ vài phép lọc. Dựng lại thì mỗi dòng mang độ tin cậy
 * trung bình của trang — thô hơn bản gốc, nhưng đây là lần chấm THỨ HAI của cùng tấm
 * ảnh, mọi cảnh báo đáng nói đã được ghi vết từ lần đầu rồi.
 */
const rehydrateOcr = (row) => {
    if (!row?.ocr_text) return { ok: false, code: 'OCR_NOT_STORED' };
    const confidence = Number(row.ocr_confidence ?? 0);
    const lines = ocrScanner.extractLines({ text: row.ocr_text, confidence });

    // Độ tin cậy TỪNG DÒNG được lưu trong vết dây chuyền. Dùng lại nó khi số dòng khớp
    // đúng — đo được là khớp 1-1 với cách Tesseract chia dòng. Không khớp (bản ghi cũ, hay
    // text đã bị cắt ngắn lúc lưu) thì rơi về độ tin cậy cả trang như trước.
    //
    // Vì sao đáng làm: hai phép kiểm OCR_OFF_TOPIC_TEXT và OCR_MISSING_LINE_ITEMS chỉ tin
    // dòng nào tự nó đọc rõ (≥ 60). Chấm lại bằng con số cả trang thì ảnh có trang 70
    // nhưng vài dòng 40 sẽ được tin CẢ những dòng mờ đó — phán quyết ở bước hoàn tất lệch
    // với lúc tải ảnh, và số "điểm cần kiểm tra" báo cho quản lý không khớp với cái họ
    // thấy trên màn hình duyệt.
    const stored = row.pipeline?.ocr?.line_confidences;
    if (Array.isArray(stored) && stored.length === lines.length) {
        lines.forEach((line, i) => {
            if (Number.isFinite(Number(stored[i]))) line.confidence = Number(stored[i]);
        });
    }

    return {
        ok: true,
        text: row.ocr_text,
        confidence,
        lines,
        engine: row.ocr_engine ?? null,
        latency_ms: 0,
        rehydrated: true,
    };
};

/**
 * Dựng lại kết quả chấm chất lượng ảnh từ kích thước đã lưu.
 *
 * Chấm lại chứ không lưu sẵn danh sách lý do: ngưỡng có thể đã đổi từ lúc tải ảnh, và
 * phép chấm vốn thuần hàm, rẻ. Không có kích thước (bản ghi cũ) thì không có ý kiến.
 */
const rehydrateQuality = (row) => {
    const width = Number(row?.image_width);
    const height = Number(row?.image_height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const bytes = Number(row.pipeline?.image?.bytes);
    return {
        width,
        height,
        bytes: Number.isFinite(bytes) ? bytes : null,
        format: row.pipeline?.image?.format ?? null,
        reasons: imagePipeline.assessImage({ bytes: Number.isFinite(bytes) ? bytes : undefined, width, height }),
    };
};

/**
 * Đối chiếu chéo, nhưng không bao giờ được làm hỏng luồng chính.
 *
 * Lớp này là lớp THÊM, chạy trên dữ liệu từ hai nguồn ngoài (model và OCR). Một hình
 * dạng dữ liệu không lường trước mà làm nó ném lỗi thì cái giá không được là tài xế nhận
 * lỗi 500 khi tải ảnh — mà chỉ là hóa đơn đó thiếu một lớp đối chiếu.
 */
const safeCorroborate = (extraction, ocr, options) => {
    try {
        return crossCheck.corroborate(extraction, ocr, options);
    } catch (err) {
        console.warn('[receipt] Lớp đối chiếu chéo lỗi, bỏ qua lớp này:', err.message);
        return crossCheck.corroborate(extraction, { ok: false, code: 'CROSSCHECK_FAILED' }, options);
    }
};

/**
 * Chạy đủ dây chuyền cho một ảnh: tải → (OCR ‖ Gemini) → đối chiếu → (đọc lại nếu ngờ).
 *
 * @returns {{extraction: object|null, meta: object, ocr: object, corroboration: object|null,
 *            quality: object|null, error: {code: string, message: string}|null, cached: boolean}}
 */
const runPipeline = async (imageUrl, { profile, allowRecheck = true, deadlineAt: responseDeadline = null }) => {
    const startedAt = Date.now();
    // Trần của lượt quét = phần còn lại của hạn trả lời, nhưng không bao giờ quá
    // SCAN_BUDGET_MS và không bao giờ dưới MIN_SCAN_BUDGET_MS.
    const deadlineAt = Math.max(
        startedAt + MIN_SCAN_BUDGET_MS,
        Math.min(startedAt + SCAN_BUDGET_MS, responseDeadline ?? Infinity),
    );
    // Không tải biến thể ảnh dành riêng cho OCR khi kênh OCR đang không dùng được (tắt
    // bằng env, hoặc đang tạm tắt vì dựng worker hỏng). Đó là một lượt tải ảnh nữa qua
    // mạng cho một tấm ảnh sẽ không ai đọc.
    const loaded = await imagePipeline.loadImage(imageUrl, {
        withOcrVariant: ocrScanner.isOcrAvailable(),
    });
    if (!loaded.ok) {
        return {
            extraction: null,
            meta: { provider: 'google', latency_ms: 0 },
            ocr: { ok: false, code: 'OCR_SKIPPED' },
            corroboration: null,
            quality: null,
            error: { code: loaded.code, message: loaded.error },
            cached: false,
        };
    }

    // Ảnh không đủ để đọc thì dừng ngay tại đây: không tốn một lượt gọi model và cả
    // chục giây OCR để rồi vẫn trả về đúng câu "chụp lại đi".
    if (loaded.quality.reasons.some((r) => r.severity === 'error')) {
        return {
            extraction: null,
            meta: { provider: 'google', image_sha256: loaded.vision.sha256, latency_ms: 0 },
            ocr: { ok: false, code: 'OCR_SKIPPED' },
            corroboration: null,
            quality: loaded.quality,
            error: null,
            blockedByQuality: true,
            cached: false,
        };
    }

    const [ocr, first] = await Promise.all([
        loaded.ocr ? ocrScanner.scanImage(loaded.ocr.buffer, { deadlineAt }) : Promise.resolve({ ok: false, code: 'OCR_SKIPPED' }),
        extractor.extractReceipt(imageUrl, { image: loaded.vision, deadlineAt }),
    ]);

    if (!first.ok) {
        // Lượt đọc hỏng cũng phải có một dòng. Trước đây chỉ lượt THÀNH CÔNG mới được ghi,
        // nên đúng lúc hệ thống đọc không nổi hóa đơn nào thì log lại im lặng nhất.
        console.warn(
            `[receipt] Không đọc được ${shortUrl(imageUrl)} sau ${Date.now() - startedAt}ms: `
            + `${first.code} (${first.meta?.attempts ?? 0} lượt gọi model) — hóa đơn chuyển sang cần người xem.`,
        );
        return {
            extraction: null,
            meta: { ...first.meta, image_sha256: first.meta?.image_sha256 ?? loaded.vision.sha256 },
            ocr,
            corroboration: null,
            quality: loaded.quality,
            error: { code: first.code, message: first.error },
            cached: false,
        };
    }

    const keywordIndex = await getKeywordIndex();
    let best = {
        result: first,
        corroboration: safeCorroborate(first.extraction, ocr, { keywordIndex, profile }),
    };

    // Giai đoạn 3b — đọc lại có trợ giúp. Chỉ chạy khi kênh OCR đáng tin VÀ chỉ ra được
    // trường cụ thể đang lệch: đó là lúc duy nhất một lượt đọc nữa có cơ hội sửa được
    // cái gì. Lượt này thất bại thì im lặng giữ kết quả cũ — nó là phần THÊM.
    const recheck = { ran: false, skipped: null, chosen: 'first' };
    if (RECHECK_ENABLED && crossCheck.shouldRecheck(best.corroboration)) {
        const elapsed = Date.now() - startedAt;
        if (!allowRecheck) {
            recheck.skipped = 'not_allowed';
        } else if (elapsed > RECHECK_MAX_ELAPSED_MS || deadlineAt - Date.now() < MIN_RECHECK_REMAINING_MS) {
            recheck.skipped = 'time_budget';
        } else {
            recheck.ran = true;
            const second = await extractor.extractReceipt(imageUrl, {
                image: loaded.vision,
                ocrText: ocr.text,
                suspectFields: best.corroboration.suspect_fields,
                deadlineAt,
            });
            if (second.ok) {
                const candidate = {
                    result: second,
                    corroboration: safeCorroborate(second.extraction, ocr, { keywordIndex, profile }),
                };
                best = crossCheck.pickBetterRead(best, candidate);
                if (best === candidate) recheck.chosen = 'second';
            } else {
                recheck.skipped = `failed:${second.code}`;
            }
        }
    }

    // Một dòng cho mỗi lượt quét THẬT. Đây là thứ trả lời câu "vì sao request này lâu":
    // tách riêng thời gian của model và của OCR, thay vì chỉ thấy tổng thời gian request
    // rồi phải đoán. Lượt dùng lại bản đọc cũ không tốn gì nên không cần một dòng log.
    console.log(
        `[receipt] Quét xong ${shortUrl(imageUrl)}: tổng ${Date.now() - startedAt}ms `
        + `(model ${best.result.meta?.latency_ms ?? '-'}ms, OCR ${ocr?.latency_ms ?? '-'}ms/${ocr?.ok ? 'ok' : ocr?.code}`
        + `${recheck.ran ? ', có đọc lại' : ''})`,
    );

    return {
        extraction: best.result.extraction,
        raw: best.result.raw,
        meta: {
            ...best.result.meta,
            image_sha256: best.result.meta?.image_sha256 ?? loaded.vision.sha256,
        },
        ocr,
        corroboration: best.corroboration,
        quality: loaded.quality,
        recheck,
        total_ms: Date.now() - startedAt,
        error: null,
        cached: false,
    };
};

/**
 * Lấy bản đọc của một ảnh: dùng lại bản đã lưu nếu có, không thì chạy cả dây chuyền.
 */
const readReceipt = async (imageUrl, {
    allowCache = true, profile = 'maintenance', allowRecheck = true, deadlineAt = null,
} = {}) => {
    if (allowCache) {
        try {
            const previous = await repository.findLatestByImageUrl(imageUrl);
            if (previous?.raw_extraction) {
                const extraction = extractor.normalizeExtraction(previous.raw_extraction);
                const ocr = rehydrateOcr(previous);
                return {
                    extraction,
                    meta: {
                        provider: previous.provider,
                        model: previous.model,
                        prompt_version: previous.prompt_version,
                        image_sha256: previous.image_sha256,
                        latency_ms: 0,
                    },
                    ocr,
                    corroboration: safeCorroborate(extraction, ocr, {
                        keywordIndex: await getKeywordIndex(),
                        profile,
                    }),
                    // Trước đây là null: bước hoàn tất mất hẳn cảnh báo ảnh độ phân giải
                    // thấp đã có lúc tải ảnh, nên phán quyết cuối lệch với cái người duyệt
                    // thấy trên màn hình.
                    quality: rehydrateQuality(previous),
                    error: null,
                    cached: true,
                };
            }
        } catch (err) {
            console.warn('[receipt] Không đọc được bản trích xuất cũ:', err.message);
        }

        // Tới được đây nghĩa là CÓ xin bản đọc cũ nhưng không dùng được: hoặc ảnh này chưa
        // từng được quét, hoặc lần quét trước hỏng nên không lưu được nội dung đọc. Bước
        // hoàn tất rơi vào đây là phải chạy lại cả dây chuyền cho từng ảnh — đúng chỗ khác
        // nhau giữa một request vài giây và một request vài chục giây.
        console.warn(`[receipt] Không dùng lại được bản đọc cũ của ${shortUrl(imageUrl)} — chạy lại cả dây chuyền.`);
    }

    return runPipeline(imageUrl, { profile, allowRecheck, deadlineAt });
};

const persist = async (row) => {
    try {
        return await repository.saveExtraction(row);
    } catch (err) {
        console.warn('[receipt] Không lưu được vết đọc hóa đơn:', err.message);
        return null;
    }
};

/**
 * Tóm tắt những gì từng giai đoạn đã làm, để lưu kèm bản ghi.
 *
 * Cố ý CHỈ giữ phần tóm tắt, không giữ mảng dòng OCR hay danh sách khớp từ điển đầy
 * đủ: những mảng đó nặng gấp nhiều lần phần còn lại và dựng lại được từ `ocr_text` khi
 * thật sự cần. Cái không dựng lại được — vì sao lượt đọc đó bị trừ điểm, trừ bao nhiêu,
 * ở trường nào — thì giữ đủ.
 *
 * Đây là dữ liệu để trả lời được câu "vì sao hóa đơn này bị đẩy sang cần người xem"
 * sau đó vài tuần, và để đo xem mỗi lớp kiểm tra thực sự bắt được bao nhiêu.
 */
/**
 * Dựng vết dây chuyền nhưng không bao giờ ném lỗi.
 *
 * Lời gọi này nằm trong phần đối số của persist(), tức là NGOÀI try/catch của persist —
 * một hình dạng dữ liệu lạ ở đây sẽ biến việc ghi vết thành lỗi 500 cho tài xế, trái
 * nguyên tắc "lưu vết không được làm hỏng luồng chính". Đã bắt được đúng ca này bằng
 * test: một dòng OCR null làm hỏng cả lần tải ảnh dù lớp đối chiếu đã được bọc an toàn.
 */
const safeTrace = (input) => {
    try {
        return buildPipelineTrace(input);
    } catch (err) {
        console.warn('[receipt] Không dựng được vết dây chuyền, lưu không có vết:', err.message);
        return null;
    }
};

const buildPipelineTrace = ({ quality, ocr, corroboration, meta, recheck = null, totalMs = null }) => ({
    total_ms: totalMs,
    recheck,
    image: quality ? {
        width: quality.width,
        height: quality.height,
        bytes: quality.bytes,
        format: quality.format,
        checks: quality.reasons.map((r) => r.code),
    } : null,
    ocr: {
        ok: Boolean(ocr?.ok),
        code: ocr?.ok ? null : (ocr?.code ?? null),
        engine: ocr?.engine ?? null,
        confidence: ocr?.ok ? ocr.confidence : null,
        chars: ocr?.ok ? String(ocr.text ?? '').length : 0,
        latency_ms: ocr?.latency_ms ?? null,
        // Chỉ các con số, không lặp lại text — text đã nằm ở cột ocr_text. Cần để lần
        // chấm lại ở bước hoàn tất ra đúng phán quyết như lần đầu (xem rehydrateOcr).
        // Text bị cắt ngắn lúc lưu thì số dòng không còn khớp, nên không lưu mảng này.
        line_confidences: ocr?.ok && Array.isArray(ocr.lines) && String(ocr.text ?? '').length <= MAX_STORED_OCR_CHARS
            ? ocr.lines.map((line) => Math.round(Number(line?.confidence) || 0))
            : null,
    },
    vision: {
        model: meta?.model ?? null,
        prompt_version: meta?.prompt_version ?? null,
        ocr_assisted: Boolean(meta?.ocr_assisted),
        attempts: meta?.attempts ?? null,
        latency_ms: meta?.latency_ms ?? null,
    },
    corroboration: corroboration ? {
        trusted: corroboration.trusted,
        confidence: corroboration.confidence,
        penalties: corroboration.penalties,
        suspect_fields: corroboration.suspect_fields,
        total: corroboration.signals?.total ?? null,
        line_totals: corroboration.signals?.line_totals
            ? {
                checked: corroboration.signals.line_totals.checked,
                grounded: corroboration.signals.line_totals.grounded,
                likely: corroboration.signals.line_totals.likely,
            }
            : null,
        vendor: corroboration.signals?.vendor ?? null,
        plates: corroboration.signals?.plates ?? null,
    } : null,
});

/**
 * Kiểm tra MỘT ảnh hóa đơn bảo dưỡng.
 *
 * @param {string} imageUrl
 * @param {object} context  { claimedAmount, plateNumber, windowStart, windowEnd, entityType, entityId,
 *                            profile, allowCache, allowRecheck, checkDuplicates }
 */
const validateReceipt = async (imageUrl, context = {}) => {
    const {
        extraction, raw, meta, error, cached, ocr, corroboration, quality, recheck, total_ms: totalMs,
    } = await readReceipt(imageUrl, {
        allowCache: context.allowCache !== false,
        profile: context.profile ?? 'maintenance',
        allowRecheck: context.allowRecheck !== false,
        // Hạn trả lời của CẢ request, do tầng controller tính từ lúc request tới.
        deadlineAt: context.deadlineAt ?? null,
    });

    // Khoá nhận dạng tờ hóa đơn — lưu cùng bản đọc để lần sau dò trùng được.
    const identity = extraction ? checks.invoiceIdentity(extraction) : { vendorKey: null, invoiceNoKey: null };

    // Dò trùng PHẢI chạy trước khi ghi vết, nếu không nó tìm thấy chính dòng vừa ghi.
    //
    // Và chỉ dò cho lần nộp MỚI (`!cached`). Ở bước hoàn tất, bản đọc được lấy lại từ
    // vết đã ghi lúc upload — dò trùng lúc đó sẽ khớp đúng dòng của chính nó và báo
    // "ảnh đã tải lên rồi" cho mọi đợt bảo dưỡng hợp lệ. Ảnh đã qua cửa upload thì đã
    // được dò một lần rồi, không cần dò lại.
    //
    // Lỗi tra cứu không được chặn tài xế — mất một lớp kiểm tra còn hơn chặn oan.
    let duplicateMatches = [];
    if (!error && !cached && context.checkDuplicates !== false) {
        try {
            duplicateMatches = await repository.findDuplicates({
                imageSha256: meta?.image_sha256,
                vendorKey: identity.vendorKey,
                invoiceNoKey: identity.invoiceNoKey,
            });
        } catch (err) {
            console.warn('[receipt] Không dò được hóa đơn trùng:', err.message);
        }
    }

    const keywordIndex = error ? null : await getKeywordIndex();
    const evaluate = (matches) => checks.evaluateReceipt(extraction, {
        ...context,
        imageUrl,
        keywordIndex,
        duplicateMatches: matches,
        imageQuality: quality,
        corroboration,
    });

    let result = error
        ? failedResult(error.code, EXTRACTION_ERROR_MESSAGE[error.code])
        : evaluate(duplicateMatches);

    // Bản đọc lấy từ cache thì đã có vết rồi, chỉ ghi thêm khi thực sự chạy dây chuyền
    // — nếu không mỗi lần đối chiếu lại sinh một dòng trùng lặp.
    if (!cached) {
        const storedOcrText = ocr?.ok ? sanitizeText(ocr.text).slice(0, MAX_STORED_OCR_CHARS) : null;
        const saved = await persist({
            entityType: context.entityType ?? 'maintenance_record',
            entityId: context.entityId,
            imageUrl,
            imageSha256: meta?.image_sha256,
            provider: meta?.provider,
            model: meta?.model,
            promptVersion: meta?.prompt_version,
            rawExtraction: raw ?? extraction ?? null,
            checks: result.reasons,
            verdict: error ? 'error' : result.verdict,
            claimedAmount: context.claimedAmount ?? null,
            receiptTotal: result.receipt_total,
            latencyMs: meta?.latency_ms,
            vendorKey: identity.vendorKey,
            invoiceNoKey: identity.invoiceNoKey,
            // Vết của dây chuyền mới. Lưu text OCR NGUYÊN VĂN là có chủ đích: khi tranh
            // chấp "máy đọc sai", đây là bằng chứng độc lập với model, đọc được bằng
            // mắt và không cần gọi lại API nào để dựng lại.
            ocrText: storedOcrText,
            ocrConfidence: ocr?.ok ? ocr.confidence : null,
            ocrEngine: ocr?.ok ? ocr.engine : null,
            confidence: result.confidence,
            imageWidth: quality?.width ?? null,
            imageHeight: quality?.height ?? null,
            pipeline: safeTrace({ quality, ocr, corroboration, meta, recheck, totalMs }),
        });

        // DÒ TRÙNG LẦN HAI, SAU KHI GHI. Lần dò trước ghi chạy xong từ lúc bắt đầu, còn
        // ghi thì xảy ra sau cả lượt gọi model — khe hở giữa hai việc dài đúng bằng thời
        // gian Gemini đọc ảnh, vài giây tới vài chục giây. Hai lần nộp cùng một tờ hóa đơn
        // rơi vào khe đó (bấm hai lần, hoặc cố ý nộp cho hai đợt bảo dưỡng cùng lúc) thì
        // cả hai đều dò không thấy bên kia và cả hai đều qua.
        //
        // Sau khi ghi, mỗi bên dò lại và chỉ NHƯỜNG cho dòng có id NHỎ HƠN — tức là dòng
        // ghi trước. Bên ghi trước thấy bên ghi sau nhưng bỏ qua; bên ghi sau thấy bên ghi
        // trước và tự hạ xuống rejected. Không cần khoá, vì id do DB cấp theo thứ tự.
        //
        // Khe còn lại chỉ là khoảng giữa lúc DB cấp id và lúc ghi xong một câu INSERT —
        // cỡ mili giây, thay vì cỡ chục giây như trước.
        // Đã rejected thì không còn mức nào để nâng lên — khỏi tốn thêm một lượt truy vấn.
        if (saved?.id && !error && result.verdict !== 'rejected' && context.checkDuplicates !== false) {
            try {
                const earlier = (await repository.findDuplicates({
                    imageSha256: meta?.image_sha256,
                    vendorKey: identity.vendorKey,
                    invoiceNoKey: identity.invoiceNoKey,
                    excludeId: saved.id,
                })).filter((row) => Number(row.id) < Number(saved.id));

                const known = new Set(duplicateMatches.map((row) => Number(row.id)));
                if (earlier.some((row) => !known.has(Number(row.id)))) {
                    const rechecked = evaluate(earlier);
                    // Chỉ được NÂNG mức phán quyết, không bao giờ hạ. Lớp này sinh ra để
                    // bắt thêm, không phải để gỡ một phán quyết đã có lý do riêng.
                    if (VERDICT_RANK[rechecked.verdict] > VERDICT_RANK[result.verdict]) {
                        result = rechecked;
                        await repository.updateVerdict(saved.id, { checks: result.reasons, verdict: result.verdict });
                    }
                }
            } catch (err) {
                console.warn('[receipt] Không dò lại được hóa đơn trùng sau khi ghi:', err.message);
            }
        }
    }

    return {
        ...result,
        image_url: imageUrl,
        blocked: result.verdict === 'rejected',
        reject_reason: checks.firstErrorMessage(result.reasons),
    };
};

// ─── Nhiều ảnh cho một đợt bảo dưỡng ─────────────────────────────────────────

/**
 * Kiểm tra toàn bộ hóa đơn của một đợt bảo dưỡng và đối chiếu với số tiền khai.
 *
 * NGHIÊM: mọi ảnh trong bill_pics đều phải là một hóa đơn hợp lệ của đợt này, và số khai
 * phải khớp TỔNG các hóa đơn. Trước đây có hai chỗ nới:
 *   * ảnh không phải hóa đơn chỉ bị gạt khỏi tổng — vì ảnh chụp lúc gửi yêu cầu (báo giá)
 *     nằm lẫn trong bill_pics và tài xế không gỡ được;
 *   * số khai khớp hóa đơn LỚN NHẤT cũng được — cho ca chụp một hóa đơn từ nhiều góc.
 * Hệ quả người dùng đã báo: nộp nhiều ảnh, chỉ cần MỘT ảnh đúng là các ảnh sai vẫn lọt
 * tới bàn duyệt. Giờ ảnh lúc yêu cầu nằm ở cột riêng (request_pics) và tài xế xoá được
 * ảnh chụp nhầm, nên cả hai chỗ nới không còn lý do tồn tại: ảnh sai thì chặn, kèm số thứ
 * tự ảnh để tài xế biết phải xoá tấm nào.
 */
const validateMaintenanceBills = async (billUrls, context = {}) => {
    const urls = (billUrls ?? []).filter(Boolean);
    if (urls.length === 0) {
        return { verdict: 'needs_review', reasons: [], perImage: [], receipt_total: null, blocked: false, reject_reason: null };
    }

    // Từng ảnh kiểm tra độc lập, CHƯA đối chiếu số tiền (claimedAmount = null).
    //
    // Không đọc lại lượt 3b ở bước này: ảnh trong bill_pics đều đã được quét lúc tải nên
    // thường không chạy lại dây chuyền; ảnh nào chưa có bản đọc (model lỗi lúc tải) thì
    // chạy song song, và thêm một lượt gọi model cho mỗi ảnh có thể đẩy request quá hạn chờ
    // của app.
    const perImage = await Promise.all(urls.map((url) => validateReceipt(url, {
        ...context,
        claimedAmount: null,
        allowRecheck: false,
    })));

    const many = urls.length > 1;
    const reasons = perImage.flatMap((item, index) => item.reasons.map((r) => {
        const located = { ...r, image_index: index, image_url: item.image_url };
        // Nhiều ảnh thì phải nói ẢNH NÀO — tài xế cần biết xoá tấm nào.
        if (!many) return located;
        const hint = r.severity === 'error' ? ' Nếu đây là ảnh chụp nhầm, hãy xoá ảnh này.' : '';
        return { ...located, message: `Ảnh thứ ${index + 1}: ${r.message}${hint}` };
    }));

    const totals = perImage.map((item) => item.receipt_total).filter((n) => Number.isFinite(n) && n > 0);
    const sum = totals.reduce((acc, n) => acc + n, 0);

    const claimed = Number(context.claimedAmount);
    if (Number.isFinite(claimed) && claimed > 0) {
        if (totals.length === 0) {
            reasons.push({
                code: 'NO_RECEIPT_TOTAL', severity: 'warning',
                message: 'Không đọc được tổng tiền trên hóa đơn nào nên chưa đối chiếu được với số đã khai.',
            });
        } else {
            const bySum = checks.checkClaimedAmount(claimed, sum, { subtotal: null, vat_amount: null });
            reasons.push(...bySum.map((r) => (many && r.severity === 'error'
                ? {
                    ...r,
                    message: `${r.message} Tổng được cộng từ ${totals.length} ảnh hóa đơn — nếu có ảnh chụp trùng `
                        + 'một hóa đơn hoặc ảnh không thuộc đợt này, hãy xoá bớt.',
                }
                : r)));
        }
    }

    // Đối chiếu với lịch sử của chính chiếc xe — lớp này không nhìn vào tờ hóa đơn mà
    // nhìn vào bối cảnh, nên nó bắt được thứ mọi lớp trên bỏ lọt: một hóa đơn hoàn toàn
    // thật, số học đúng, hạng mục đúng, nhưng cao gấp mấy lần mọi lần trước của xe đó.
    if (Array.isArray(context.costHistory) && context.costHistory.length > 0) {
        const { costs, scopeLabel } = checks.pickComparableCosts(context.costHistory, context.maintenanceType);
        reasons.push(...checks.checkCostOutlier(context.claimedAmount, costs, { scopeLabel }));
    }

    const verdict = checks.resolveVerdict(reasons);

    // Độ tin cậy của cả đợt lấy theo ảnh THẤP NHẤT, không lấy trung bình: một hóa đơn
    // đọc chắc chắn không bù được cho một hóa đơn đọc mù mờ — người duyệt vẫn phải mở
    // đúng cái mù mờ đó ra xem, nên con số hiển thị phải chỉ về nó.
    const confidences = perImage.map((item) => item.confidence).filter((value) => Number.isFinite(value));
    const confidence = confidences.length > 0 ? Math.min(...confidences) : null;

    return {
        verdict,
        reasons,
        perImage,
        receipt_total: totals.length > 0 ? sum : null,
        receipt_totals: totals,
        confidence,
        confidence_label: confidence === null ? null : crossCheck.confidenceLabel(confidence),
        blocked: verdict === 'rejected',
        reject_reason: checks.firstErrorMessage(reasons),
    };
};

// ─── Màn hình duyệt của quản lý ──────────────────────────────────────────────

const REVIEW_ACTIONS = ['agree', 'override_accept', 'override_reject'];

/**
 * Chọn đúng những lần đọc người duyệt cần xem: mỗi ảnh ĐANG thuộc khoản một dòng.
 *
 * Trước đây màn duyệt liệt kê MỌI dòng vết của khoản. Đã tái hiện: ảnh bị chặn lúc tải
 * (không hề vào đợt, và tệp đã bị xoá khỏi Cloudinary nên hiện ảnh vỡ) vẫn hiện ra và làm
 * tổng kết báo "1 hóa đơn không đạt"; ảnh của lần nộp trước khi bị trả về làm lại cũng
 * vậy. Người duyệt nhìn thấy một đợt có vấn đề trong khi đợt thật thì sạch.
 *
 * Một ảnh có thể có nhiều dòng (đọc lỗi rồi đọc lại) — lấy dòng mới nhất CÓ bản đọc.
 */
const pickAttachedRows = (rows, imageUrls) => {
    const attached = new Set(imageUrls);
    const byUrl = new Map();
    for (const row of rows) { // listByEntity trả mới nhất trước
        if (row.released_at || !attached.has(row.image_url)) continue;
        const current = byUrl.get(row.image_url);
        if (!current || (!current.raw_extraction && row.raw_extraction)) byUrl.set(row.image_url, row);
    }

    const rejectedUploads = new Set(rows
        .filter((row) => !row.released_at && row.verdict === 'rejected' && !attached.has(row.image_url))
        .map((row) => row.image_url));

    return {
        rows: [...attached].map((url) => byUrl.get(url)).filter(Boolean),
        unread: [...attached].filter((url) => !byUrl.has(url)).length,
        rejectedUploads: rejectedUploads.size,
    };
};

/**
 * Dữ liệu để người duyệt nhìn thấy máy đã đọc được gì, thay vì phải căng mắt vào ảnh.
 *
 * Dòng hàng được DỰNG LẠI từ raw_extraction chứ không lưu sẵn dạng đã phân loại. Cố ý:
 * từ điển lớn lên theo thời gian, dựng lại nghĩa là những bản ghi cũ cũng được hưởng
 * phân loại mới — lưu sẵn thì chúng đóng băng ở mức hiểu biết của ngày hôm đó.
 *
 * @param {'maintenance_record'|'expense'} entityType
 * @param {number} entityId
 * @param {string} profileCode  loại chi phí, quyết định hạng mục nào là đúng chủ đề
 * @param {{imageUrls?: string[]|null}} options  ảnh ĐANG thuộc khoản (bill_pics). Có thì chỉ
 *        hiện đúng những ảnh đó; vắng thì hiện mọi dòng vết như trước.
 */
const getReceiptReview = async (entityType, entityId, profileCode = 'maintenance', { imageUrls = null } = {}) => {
    const allRows = await repository.listByEntity(entityType, entityId);
    const attachedMode = Array.isArray(imageUrls);
    const picked = attachedMode
        ? pickAttachedRows(allRows, imageUrls.filter(Boolean))
        : { rows: allRows, unread: 0, rejectedUploads: 0 };
    const { rows } = picked;

    if (rows.length === 0) {
        return {
            entity_type: entityType,
            entity_id: entityId,
            profile: profileCode,
            profile_label: taxonomy.getProfile(profileCode).label,
            categories: taxonomy.categoryOptions(profileCode),
            receipts: [],
            // Cùng hình dạng với nhánh có dữ liệu — thiếu một trường ở nhánh rỗng là giao
            // diện phải tự đoán `undefined` nghĩa là gì.
            summary: {
                total: 0, needs_review: 0, rejected: 0, unreviewed: 0, low_confidence: 0,
                supporting: 0, unread: picked.unread, rejected_uploads: picked.rejectedUploads,
            },
        };
    }

    const keywordIndex = await getKeywordIndex();
    const profile = taxonomy.getProfile(profileCode);
    const accepted = profile.accepted ? new Set(profile.accepted) : null;

    const receipts = rows.map((row) => {
        const extraction = row.raw_extraction ? extractor.normalizeExtraction(row.raw_extraction) : null;
        const items = extraction
            ? checks.markTopicality(checks.classifyLineItems(extraction.line_items, keywordIndex), accepted)
            : [];

        const reasons = Array.isArray(row.checks) ? row.checks : [];
        return {
            id: row.id,
            image_url: row.image_url,
            verdict: row.verdict,
            // Ảnh không dùng làm hóa đơn được (báo giá, chứng từ gửi kèm yêu cầu) — bước hoàn
            // tất đã gạt nó khỏi tổng, không chặn. Chỉ nói được điều này khi biết ảnh đang
            // thuộc đợt: một ảnh cùng loại bị chặn lúc tải thì không hề nằm trong đợt.
            supporting: attachedMode && reasons.some(
                (r) => r.severity === 'error' && NOT_AN_INVOICE_CODES.has(r.code),
            ),
            errors: reasons.filter((r) => r.severity === 'error'),
            warnings: reasons.filter((r) => r.severity === 'warning'),
            vendor: extraction?.vendor ?? null,
            invoice_no: extraction?.invoice_no ?? null,
            issued_date: extraction?.issued_date ?? null,
            vehicle_plate: extraction?.vehicle_plate ?? null,
            items,
            groups: checks.summarizeGroups(items),
            totals: extraction ? {
                subtotal: extraction.subtotal,
                discount: extraction.discount,
                vat_rate: extraction.vat_rate,
                vat_amount: extraction.vat_amount,
                total: extraction.total,
            } : null,
            receipt_total: row.receipt_total === null ? null : Number(row.receipt_total),
            claimed_amount: row.claimed_amount === null ? null : Number(row.claimed_amount),
            confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
            confidence_label: row.confidence === null || row.confidence === undefined
                ? null
                : crossCheck.confidenceLabel(Number(row.confidence)),
            // Text OCR trả nguyên văn cho màn hình duyệt. Đây là thứ người duyệt đối
            // chiếu khi nghi máy đọc sai: nó không đi qua model nào, nên nó là bằng
            // chứng độc lập chứ không phải một lời khai nữa của cùng một nhân chứng.
            ocr: row.ocr_text
                ? { text: row.ocr_text, confidence: row.ocr_confidence === null ? null : Number(row.ocr_confidence), engine: row.ocr_engine }
                : null,
            pipeline: row.pipeline ?? null,
            read_by: { provider: row.provider, model: row.model, prompt_version: row.prompt_version, latency_ms: row.latency_ms },
            review: row.review_action
                ? { action: row.review_action, note: row.review_note, at: row.reviewed_at, by: row.reviewed_by_name ?? null }
                : null,
            created_at: row.created_at,
        };
    });

    const invoices = receipts.filter((r) => !r.supporting);
    return {
        entity_type: entityType,
        entity_id: entityId,
        profile: profileCode,
        profile_label: profile.label,
        // Gửi kèm danh mục để giao diện khỏi phải giữ một bản sao — bản sao lệch đi là
        // người duyệt chọn được mã mà backend sẽ lặng lẽ loại bỏ.
        categories: taxonomy.categoryOptions(profileCode),
        receipts,
        // Tổng kết nhanh để giao diện biết có cần bật cảnh báo hay không. Ảnh chứng từ
        // không tính vào "không đạt"/"cần xem": nó không phải hóa đơn của đợt.
        summary: {
            total: receipts.length,
            needs_review: invoices.filter((r) => r.verdict === 'needs_review').length,
            rejected: invoices.filter((r) => r.verdict === 'rejected').length,
            unreviewed: receipts.filter((r) => !r.review).length,
            // Đếm riêng những tờ đọc không chắc: đây là danh sách việc thật sự cần mắt
            // người, tách khỏi những tờ bị gắn cảnh báo vì lý do nghiệp vụ (sai ngày,
            // lệch biển số) mà bản thân việc đọc thì không có vấn đề gì.
            low_confidence: invoices.filter((r) => Number.isFinite(r.confidence)
                && r.confidence < crossCheck.CONFIDENCE.REVIEW).length,
            supporting: receipts.length - invoices.length,
            // Ảnh thuộc đợt mà máy chưa đọc được lần nào — phải xem bằng mắt.
            unread: picked.unread,
            // Số ảnh tài xế đã thử tải nhưng bị máy chặn. Không hiện từng tấm (tệp đã bị xoá),
            // nhưng con số này là tín hiệu: thử năm tấm hóa đơn khác nhau là chuyện đáng hỏi.
            rejected_uploads: picked.rejectedUploads,
        },
    };
};

/**
 * Thả các lần đọc ảnh ra khỏi lớp dò trùng — xem receiptExtractionRepository.releaseByEntity.
 * Không bao giờ ném lỗi: nó chạy trên đường báo lỗi cho tài xế, không được che lỗi thật.
 */
const releaseReceipts = async (entityType, entityId, { imageUrl = null, reason = 'returned' } = {}) => {
    try {
        await repository.releaseByEntity(entityType, entityId, { imageUrl, reason });
    } catch (err) {
        console.warn('[receipt] Không thả được lần đọc hóa đơn:', err.message);
    }
};

/**
 * Ghi nhận phán quyết của người duyệt, kèm những từ khoá học được từ lần sửa này.
 *
 * Xoá cache từ điển sau khi học chỉ có tác dụng trên tiến trình hiện tại. Cloud Run
 * chạy nhiều instance nên các instance khác vẫn dùng từ điển cũ tới hết TTL (5 phút) —
 * chấp nhận được: từ khoá mới có hiệu lực trễ vài phút không gây sai lệch gì, chỉ là
 * vài hóa đơn nữa rơi vào "cần người xem".
 */
const submitReceiptReview = async (extractionId, userId, { action, note, learnKeywords } = {}) => {
    // Sửa phân loại một dòng và kết luận về cả tờ hóa đơn là HAI việc khác nhau.
    // Gộp chúng lại thì mỗi lần người duyệt sửa một chữ là hệ thống ghi luôn "đã chấp
    // nhận hóa đơn" — vết kiểm toán thành sai, và chính cột review_action là thứ dùng
    // để đo độ chính xác của máy. Nên `action` được phép vắng mặt khi chỉ dạy từ điển.
    const hasAction = action !== undefined && action !== null && action !== '';
    const hasKeywords = Array.isArray(learnKeywords) && learnKeywords.length > 0;

    if (!hasAction && !hasKeywords) {
        throw Object.assign(new Error('Cần một hành động duyệt hoặc từ khoá cần ghi nhớ'), { statusCode: 400 });
    }
    if (hasAction && !REVIEW_ACTIONS.includes(action)) {
        throw Object.assign(new Error(`Hành động duyệt không hợp lệ: ${action}`), { statusCode: 400 });
    }

    const cleanKeywords = (Array.isArray(learnKeywords) ? learnKeywords : [])
        .map((row) => ({
            keyword: taxonomy.normalize(row?.keyword),
            category: row?.category,
            item_group: row?.item_group,
        }))
        .filter((row) => row.keyword
            && taxonomy.groupOfCategory(row.category)
            && (row.item_group === taxonomy.MAINTENANCE || row.item_group === taxonomy.EXCLUDED));

    let learned = [];
    if (cleanKeywords.length > 0) {
        learned = await repository.addKeywords(cleanKeywords, userId);
        invalidateTaxonomyCache();
    }

    // Chỉ dạy từ điển, chưa kết luận gì về tờ hóa đơn — không đụng tới review_action.
    if (!hasAction) return { id: extractionId, review_action: null, learned_keywords: learned };

    const saved = await repository.saveReview(extractionId, { reviewedBy: userId, action, note });
    if (!saved) {
        throw Object.assign(new Error('Không tìm thấy bản ghi đọc hóa đơn'), { statusCode: 404 });
    }

    return { ...saved, learned_keywords: learned };
};

module.exports = {
    RESPONSE_BUDGET_MS,
    MIN_SCAN_BUDGET_MS,
    getKeywordIndex,
    invalidateTaxonomyCache,
    buildPipelineTrace,
    rehydrateOcr,
    runPipeline,
    validateReceipt,
    validateMaintenanceBills,
    releaseReceipts,
    getReceiptReview,
    submitReceiptReview,
    REVIEW_ACTIONS,
};
