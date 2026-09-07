/**
 * ĐIỀU PHỐI cả dây chuyền đọc hóa đơn. Đây là mặt tiền mà driverService và
 * coordinatorController gọi; các giai đoạn đứng riêng từng file:
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
    return {
        ok: true,
        text: row.ocr_text,
        confidence,
        lines: ocrScanner.extractLines({ text: row.ocr_text, confidence }),
        engine: row.ocr_engine ?? null,
        latency_ms: 0,
        rehydrated: true,
    };
};

/**
 * Chạy đủ dây chuyền cho một ảnh: tải → (OCR ‖ Gemini) → đối chiếu → (đọc lại nếu ngờ).
 *
 * @returns {{extraction: object|null, meta: object, ocr: object, corroboration: object|null,
 *            quality: object|null, error: {code: string, message: string}|null, cached: boolean}}
 */
const runPipeline = async (imageUrl, { profile }) => {
    const loaded = await imagePipeline.loadImage(imageUrl);
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
        loaded.ocr ? ocrScanner.scanImage(loaded.ocr.buffer) : Promise.resolve({ ok: false, code: 'OCR_SKIPPED' }),
        extractor.extractReceipt(imageUrl, { image: loaded.vision }),
    ]);

    if (!first.ok) {
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
        corroboration: crossCheck.corroborate(first.extraction, ocr, { keywordIndex, profile }),
    };

    // Giai đoạn 3b — đọc lại có trợ giúp. Chỉ chạy khi kênh OCR đáng tin VÀ chỉ ra được
    // trường cụ thể đang lệch: đó là lúc duy nhất một lượt đọc nữa có cơ hội sửa được
    // cái gì. Lượt này thất bại thì im lặng giữ kết quả cũ — nó là phần THÊM.
    if (RECHECK_ENABLED && crossCheck.shouldRecheck(best.corroboration)) {
        const second = await extractor.extractReceipt(imageUrl, {
            image: loaded.vision,
            ocrText: ocr.text,
            suspectFields: best.corroboration.suspect_fields,
        });
        if (second.ok) {
            best = crossCheck.pickBetterRead(best, {
                result: second,
                corroboration: crossCheck.corroborate(second.extraction, ocr, { keywordIndex, profile }),
            });
        }
    }

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
        error: null,
        cached: false,
    };
};

/**
 * Lấy bản đọc của một ảnh: dùng lại bản đã lưu nếu có, không thì chạy cả dây chuyền.
 */
const readReceipt = async (imageUrl, { allowCache = true, profile = 'maintenance' } = {}) => {
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
                    corroboration: crossCheck.corroborate(extraction, ocr, {
                        keywordIndex: await getKeywordIndex(),
                        profile,
                    }),
                    quality: null,
                    error: null,
                    cached: true,
                };
            }
        } catch (err) {
            console.warn('[receipt] Không đọc được bản trích xuất cũ:', err.message);
        }
    }

    return runPipeline(imageUrl, { profile });
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
const buildPipelineTrace = ({ quality, ocr, corroboration, meta }) => ({
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
 * @param {object} context  { claimedAmount, plateNumber, windowStart, windowEnd, entityType, entityId }
 */
const validateReceipt = async (imageUrl, context = {}) => {
    const {
        extraction, raw, meta, error, cached, ocr, corroboration, quality,
    } = await readReceipt(imageUrl, {
        allowCache: context.allowCache !== false,
        profile: context.profile ?? 'maintenance',
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

    const result = error
        ? failedResult(error.code, EXTRACTION_ERROR_MESSAGE[error.code])
        : checks.evaluateReceipt(extraction, {
            ...context,
            keywordIndex: await getKeywordIndex(),
            duplicateMatches,
            imageQuality: quality,
            corroboration,
        });

    // Bản đọc lấy từ cache thì đã có vết rồi, chỉ ghi thêm khi thực sự chạy dây chuyền
    // — nếu không mỗi lần đối chiếu lại sinh một dòng trùng lặp.
    if (!cached) {
        await persist({
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
            ocrText: ocr?.ok ? ocr.text : null,
            ocrConfidence: ocr?.ok ? ocr.confidence : null,
            ocrEngine: ocr?.ok ? ocr.engine : null,
            confidence: result.confidence,
            imageWidth: quality?.width ?? null,
            imageHeight: quality?.height ?? null,
            pipeline: buildPipelineTrace({ quality, ocr, corroboration, meta }),
        });
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
 * Việc đối chiếu số tiền phải làm ở ĐÂY chứ không phải ở từng ảnh: một đợt bảo dưỡng
 * có thể có nhiều hóa đơn rời, số khai phải khớp TỔNG các hóa đơn. Nhưng tài xế cũng
 * hay chụp cùng một hóa đơn từ vài góc, nên khớp với hóa đơn LỚN NHẤT cũng được chấp
 * nhận — chỉ so tổng thì ca thứ hai bị từ chối oan.
 */
const validateMaintenanceBills = async (billUrls, context = {}) => {
    const urls = (billUrls ?? []).filter(Boolean);
    if (urls.length === 0) {
        return { verdict: 'needs_review', reasons: [], perImage: [], receipt_total: null, blocked: false, reject_reason: null };
    }

    // Từng ảnh kiểm tra độc lập, CHƯA đối chiếu số tiền (claimedAmount = null).
    const perImage = await Promise.all(urls.map((url) => validateReceipt(url, {
        ...context,
        claimedAmount: null,
    })));

    const reasons = perImage.flatMap((item, index) => item.reasons.map((r) => ({
        ...r,
        image_index: index,
        image_url: item.image_url,
    })));

    const totals = perImage.map((item) => item.receipt_total).filter((n) => Number.isFinite(n) && n > 0);
    const sum = totals.reduce((acc, n) => acc + n, 0);
    const max = totals.length > 0 ? Math.max(...totals) : null;

    const claimed = Number(context.claimedAmount);
    if (Number.isFinite(claimed) && claimed > 0) {
        if (totals.length === 0) {
            reasons.push({
                code: 'NO_RECEIPT_TOTAL', severity: 'warning',
                message: 'Không đọc được tổng tiền trên hóa đơn nào nên chưa đối chiếu được với số đã khai.',
            });
        } else {
            // Chấm số khai với cả hai cách hiểu, lấy cách nào gần hơn để báo lỗi cho
            // đúng — nói "lệch so với tổng" khi tài xế chụp trùng ảnh là gây hiểu nhầm.
            const bySum = checks.checkClaimedAmount(claimed, sum, { subtotal: null, vat_amount: null });
            const byMax = checks.checkClaimedAmount(claimed, max, { subtotal: null, vat_amount: null });

            if (bySum.length === 0 || byMax.length === 0) {
                // khớp một trong hai cách → không thêm lý do nào
            } else {
                reasons.push(...(Math.abs(claimed - sum) <= Math.abs(claimed - max) ? bySum : byMax));
            }
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
    const confidences = perImage
        .map((item) => item.confidence)
        .filter((value) => Number.isFinite(value));
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
 * Dữ liệu để người duyệt nhìn thấy máy đã đọc được gì, thay vì phải căng mắt vào ảnh.
 *
 * Dòng hàng được DỰNG LẠI từ raw_extraction chứ không lưu sẵn dạng đã phân loại. Cố ý:
 * từ điển lớn lên theo thời gian, dựng lại nghĩa là những bản ghi cũ cũng được hưởng
 * phân loại mới — lưu sẵn thì chúng đóng băng ở mức hiểu biết của ngày hôm đó.
 *
 * @param {'maintenance_record'|'expense'} entityType
 * @param {number} entityId
 * @param {string} profileCode  loại chi phí, quyết định hạng mục nào là đúng chủ đề
 */
const getReceiptReview = async (entityType, entityId, profileCode = 'maintenance') => {
    const rows = await repository.listByEntity(entityType, entityId);
    if (rows.length === 0) {
        return {
            entity_type: entityType,
            entity_id: entityId,
            profile: profileCode,
            profile_label: taxonomy.getProfile(profileCode).label,
            categories: taxonomy.categoryOptions(profileCode),
            receipts: [],
            summary: { total: 0, needs_review: 0, rejected: 0, unreviewed: 0 },
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

    return {
        entity_type: entityType,
        entity_id: entityId,
        profile: profileCode,
        profile_label: profile.label,
        // Gửi kèm danh mục để giao diện khỏi phải giữ một bản sao — bản sao lệch đi là
        // người duyệt chọn được mã mà backend sẽ lặng lẽ loại bỏ.
        categories: taxonomy.categoryOptions(profileCode),
        receipts,
        // Tổng kết nhanh để giao diện biết có cần bật cảnh báo hay không.
        summary: {
            total: receipts.length,
            needs_review: receipts.filter((r) => r.verdict === 'needs_review').length,
            rejected: receipts.filter((r) => r.verdict === 'rejected').length,
            unreviewed: receipts.filter((r) => !r.review).length,
            // Đếm riêng những tờ đọc không chắc: đây là danh sách việc thật sự cần mắt
            // người, tách khỏi những tờ bị gắn cảnh báo vì lý do nghiệp vụ (sai ngày,
            // lệch biển số) mà bản thân việc đọc thì không có vấn đề gì.
            low_confidence: receipts.filter((r) => Number.isFinite(r.confidence)
                && r.confidence < crossCheck.CONFIDENCE.REVIEW).length,
        },
    };
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
    getKeywordIndex,
    invalidateTaxonomyCache,
    buildPipelineTrace,
    rehydrateOcr,
    runPipeline,
    validateReceipt,
    validateMaintenanceBills,
    getReceiptReview,
    submitReceiptReview,
    REVIEW_ACTIONS,
};
