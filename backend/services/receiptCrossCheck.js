/**
 * GIAI ĐOẠN 4: ĐỐI CHIẾU CHÉO GIỮA HAI KÊNH ĐỌC + TỪ ĐIỂN.
 *
 * Thuần hàm, không I/O, không gọi AI — nhận vào "model đọc được gì" và "OCR quét được
 * gì", trả ra "hai bên có khớp nhau không, và tin được tới đâu".
 *
 * VÌ SAO CẦN LỚP NÀY. Một model sinh không có khái niệm "không đọc được": khi ảnh mờ
 * ở đúng cột thành tiền, nó vẫn trả về một con số trông hoàn toàn hợp lý. Không có gì
 * trong bản thân kết quả đó tố cáo rằng con số ấy được suy ra chứ không phải đọc ra.
 * Tesseract thì ngược lại — nó không bịa được, nó chỉ báo cáo hình dạng ký tự nó thấy.
 * Nên câu hỏi "con số model khai có thật sự nằm trên tờ giấy không" chỉ trả lời được
 * khi có hai kênh độc lập, và đó chính là việc của file này.
 *
 * HAI KÊNH PHẢI ĐỘC LẬP. Đây là lý do lượt đọc đầu tiên KHÔNG được đưa text OCR vào
 * prompt: nếu model nhìn thấy text OCR trước khi trả lời thì việc hai bên khớp nhau
 * không còn là bằng chứng gì nữa — nó chỉ chứng minh model biết chép lại. Text OCR
 * chỉ được đưa vào ở lượt đọc lại (xem receiptVisionExtractor.extractReceipt), sau khi
 * lượt độc lập đã cho ra kết luận riêng.
 *
 * MỌI PHÁT HIỆN Ở ĐÂY ĐỀU LÀ `warning`, KHÔNG BAO GIỜ LÀ `error`. Bằng chứng OCR vốn
 * nhiễu: một cột số bị loá đèn là đủ để "không tìm thấy" một con số hoàn toàn có thật.
 * Dùng nó để CHẶN tài xế là chặn oan; dùng nó để BÁO cho người duyệt biết chỗ cần soi
 * là đúng tầm tin cậy của nó.
 */

const taxonomy = require('./receiptTaxonomy');
const ocrScanner = require('./receiptOcrScanner');

// ─── Ngưỡng tin cậy của kênh OCR ─────────────────────────────────────────────

const TRUST = {
    // Dưới mức này Tesseract đang đoán chứ không đọc. Kết luận "không tìm thấy con số"
    // rút ra từ một bản quét như vậy không có giá trị gì — tệ hơn, nó tạo ra cảnh báo
    // sai hàng loạt và người duyệt sẽ học cách bỏ qua mọi cảnh báo.
    MIN_CONFIDENCE: 55,
    // Quét ra vài chữ nghĩa là ảnh gần như không có text đọc được.
    MIN_TEXT_LENGTH: 40,
    // Không đọc nổi hai con số thì không có gì để đối chiếu về mặt tiền.
    MIN_MONEY_TOKENS: 2,
    // Chỉ tin một dòng OCR khi bản thân dòng đó đọc rõ. Trung bình cả trang đạt ngưỡng
    // không có nghĩa là đúng dòng đang xét cũng vậy.
    MIN_LINE_CONFIDENCE: 60,
};

// ─── Trọng số trừ điểm ───────────────────────────────────────────────────────

/**
 * Độ tin cậy chấm theo lối TRỪ ĐIỂM từ 1.0, không cộng điểm thưởng.
 *
 * Cộng điểm khi hai kênh khớp nhau nghe hợp lý nhưng sai về bản chất: hóa đơn viết tay
 * hoặc ảnh chụp nghiêng thì OCR khớp ít hơn hẳn dù hóa đơn hoàn toàn thật, và cách
 * chấm cộng điểm sẽ phạt đúng những người trung thực có điều kiện chụp kém nhất. Trừ
 * điểm thì chỉ trừ khi có BẰNG CHỨNG NGƯỢC, còn không có bằng chứng gì thì giữ nguyên.
 */
const PENALTY = {
    // Không có kênh đối chiếu: hệ thống lùi về đúng năng lực cũ (một mình model). Trừ
    // nhẹ để phân biệt với trường hợp đã được đối chiếu và khớp, nhưng phải đủ nhỏ để
    // KHÔNG tự nó đẩy hóa đơn xuống mức cần người xem — nếu không thì bật OCR lên là
    // toàn bộ hóa đơn cũ đột nhiên cần duyệt tay.
    NO_CORROBORATION: 0.15,
    // Nặng nhất. Tổng tiền là con số quyết định số tiền chi ra; nó không nằm trên giấy
    // nghĩa là hoặc model bịa, hoặc đúng chỗ đó không đọc được — cả hai đều cần người xem.
    TOTAL_NOT_GROUNDED: 0.30,
    // Chỉ khớp sau khi sửa ký tự nhầm (O/0, S/5): gần như chắc là đúng, trừ tượng trưng.
    TOTAL_ONLY_LIKELY: 0.05,
    // Nhân với TỶ LỆ dòng không tìm thấy, không phải trừ thẳng: một dòng lệch trên hóa
    // đơn 12 dòng khác hẳn về ý nghĩa với 10 dòng lệch trên 12 dòng.
    LINE_TOTALS_UNGROUNDED: 0.20,
    VENDOR_NOT_GROUNDED: 0.08,
    // Chứng từ báo giá bị khai thành hóa đơn là một trong hai kiểu gian lận dễ làm nhất.
    QUOTE_SIGNAL_MISSED: 0.25,
    OFF_TOPIC_TEXT_EVIDENCE: 0.15,
    MISSING_LINE_ITEMS: 0.12,
};

const CONFIDENCE = {
    // Từ mức này trở lên coi là đọc chắc chắn.
    HIGH: 0.8,
    // Dưới mức này thì dù không lỗi gì cụ thể cũng phải có người nhìn lại.
    REVIEW: 0.6,
    // Dưới mức này thì đáng bỏ thêm một lượt gọi model để đọc lại (xem giai đoạn 3b).
    RECHECK: 0.8,
};

const label = (confidence) => {
    if (confidence >= CONFIDENCE.HIGH) return 'cao';
    if (confidence >= CONFIDENCE.REVIEW) return 'trung bình';
    return 'thấp';
};

const reason = (code, message, detail) => ({ code, severity: 'warning', message, ...(detail ? { detail } : {}) });

const money = (value) => Number(value).toLocaleString('vi-VN');

const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);

// ─── Kênh OCR có dùng được không ─────────────────────────────────────────────

/**
 * OCR chỉ được phép có ý kiến khi bản thân nó đọc đủ rõ.
 *
 * Tách hẳn thành một hàm vì đây là cái van an toàn của cả lớp đối chiếu: mọi cảnh báo
 * dưới đây đều là suy luận từ "không tìm thấy X trong text", và suy luận đó chỉ đúng
 * khi text thật sự đầy đủ.
 */
const isOcrTrustworthy = (ocr, tokens) => {
    if (!ocr?.ok) return false;
    if (Number(ocr.confidence ?? 0) < TRUST.MIN_CONFIDENCE) return false;
    if (String(ocr.text ?? '').trim().length < TRUST.MIN_TEXT_LENGTH) return false;
    if ((tokens?.strict?.size ?? 0) + (tokens?.repaired?.size ?? 0) < TRUST.MIN_MONEY_TOKENS) return false;
    return true;
};

// ─── Đối chiếu từng mặt ──────────────────────────────────────────────────────

/** Tổng tiền model khai có nằm trên giấy không. */
const groundTotal = (extraction, tokens) => {
    const total = finite(extraction?.total);
    if (total === null || total <= 0) return { field: 'total', value: null, status: 'unknown' };
    return { field: 'total', value: total, status: ocrScanner.amountAppearsIn(tokens, total) };
};

/** Bao nhiêu phần trăm số tiền từng dòng tìm được lại trong text quét. */
const groundLineTotals = (extraction, tokens) => {
    const values = (extraction?.line_items ?? [])
        .map((item) => finite(item?.line_total))
        .filter((value) => value !== null && value > 0);

    if (values.length === 0) return { checked: 0, grounded: 0, likely: 0, missing: [], share: null };

    let grounded = 0;
    let likely = 0;
    const missing = [];
    for (const value of values) {
        const status = ocrScanner.amountAppearsIn(tokens, value);
        if (status === 'yes') grounded += 1;
        else if (status === 'likely') likely += 1;
        else missing.push(value);
    }

    return {
        checked: values.length,
        grounded,
        likely,
        missing,
        // Khớp sau khi sửa ký tự tính nửa điểm — nó là bằng chứng yếu hơn khớp y nguyên.
        share: (grounded + likely * 0.5) / values.length,
    };
};

/**
 * Tên bên bán có xuất hiện trên giấy không.
 *
 * So theo TỪ chứ không so cả chuỗi: Tesseract đọc "GARAGE THÀNH CÔNG" ra
 * "GARAGE THANH CONG" hay "GARAOE THANH CONG" là chuyện thường, so chuỗi nguyên khối
 * sẽ trượt gần như mọi lần. Đủ 60% số từ là coi như tìm thấy.
 */
const groundVendor = (extraction, flatText) => {
    const words = taxonomy.normalize(extraction?.vendor?.name)
        .split(' ')
        .filter((word) => word.length >= 3);

    if (words.length === 0 || !flatText) return { status: 'unknown', matched: 0, total: words.length };

    const matched = words.filter((word) => flatText.includes(word)).length;
    return {
        status: matched / words.length >= 0.6 ? 'yes' : 'no',
        matched,
        total: words.length,
    };
};

/**
 * Trên giấy có dấu hiệu BÁO GIÁ mà model lại khai là hóa đơn không.
 *
 * CỐ Ý chỉ cảnh báo chứ không từ chối, dù model đọc ra `doc_type: 'quote'` thì bị từ
 * chối thẳng: hóa đơn sửa xe thật rất hay có dòng "theo báo giá số ... ngày ...". Bắt
 * được cụm "bao gia" trong text OCR KHÔNG đủ để kết luận cả tờ giấy là báo giá, nên
 * việc đọc kỹ tiêu đề tờ giấy phải để người duyệt làm.
 */
const checkQuoteSignal = (extraction, signals) => {
    if (!signals?.quote) return null;
    const docType = extraction?.doc_type;
    if (docType === 'quote') return null;   // model đã tự nhận ra, tầng luật lo tiếp
    return { phrase: signals.quote, doc_type: docType ?? null };
};

/**
 * Hạng mục NGOÀI PHẠM VI nhìn thấy trong text OCR mà không có trong danh sách dòng
 * hàng model đọc ra.
 *
 * Đây là thứ hai đường phân loại đang có đều mù: cả model lẫn từ điển đều chỉ soi được
 * những dòng model đã liệt kê. Dòng bị bỏ sót hoàn toàn thì không đường nào thấy — trừ
 * đường này, vì chữ vẫn nằm trong text thô.
 */
const checkOffTopicText = (extraction, ocr, { keywordIndex, accepted }) => {
    if (!accepted || !Array.isArray(ocr?.lines)) return [];

    const known = new Set(
        (extraction?.line_items ?? [])
            .map((item) => taxonomy.matchCategory(item?.raw_name, keywordIndex)?.category)
            .filter(Boolean),
    );

    const hits = ocrScanner.dictionaryHits(
        ocr.lines.filter((line) => Number(line.confidence ?? 0) >= TRUST.MIN_LINE_CONFIDENCE),
        keywordIndex,
    );

    const unseen = new Map();
    for (const hit of hits) {
        if (accepted.has(hit.category) || known.has(hit.category)) continue;
        if (!unseen.has(hit.category)) unseen.set(hit.category, hit);
    }
    return [...unseen.values()];
};

/**
 * OCR nhìn thấy nhiều dòng hàng hơn số dòng model trả về.
 *
 * Chỉ đếm những dòng vừa khớp từ điển VỪA có con số tiền — đó là hình dạng của một
 * dòng hàng thật. Đếm mọi dòng có số thì địa chỉ, số điện thoại, mã số thuế đều bị
 * tính vào và cảnh báo này kêu suốt ngày.
 */
const checkMissingLineItems = (extraction, ocr, keywordIndex) => {
    if (!Array.isArray(ocr?.lines)) return null;

    const candidates = ocr.lines.filter((line) => {
        if (Number(line.confidence ?? 0) < TRUST.MIN_LINE_CONFIDENCE) return false;
        if (!taxonomy.matchCategory(line.text, keywordIndex)) return false;
        return (ocrScanner.parseMoneyTokens(line.text).strict.size > 0);
    });

    const readCount = (extraction?.line_items ?? []).length;
    // Chênh 1 dòng là chuyện bình thường (dòng tiêu đề bảng cũng khớp từ điển). Chỉ
    // lên tiếng khi chênh từ 2 dòng trở lên.
    if (candidates.length >= readCount + 2) {
        return { ocr_line_candidates: candidates.length, model_line_items: readCount };
    }
    return null;
};

// ─── Điểm vào ────────────────────────────────────────────────────────────────

/**
 * Đối chiếu bản đọc của model với bản quét OCR.
 *
 * @param {object} extraction  kết quả đã chuẩn hoá của receiptVisionExtractor
 * @param {object} ocr         kết quả của receiptOcrScanner.scanImage
 * @param {{keywordIndex: Array, profile?: string}} options
 * @returns {{available: boolean, trusted: boolean, confidence: number, confidence_label: string,
 *            reasons: Array, signals: object, penalties: Array, suspect_fields: Array<string>}}
 */
const corroborate = (extraction, ocr, { keywordIndex = [], profile = 'maintenance' } = {}) => {
    const tokens = ocr?.ok ? ocrScanner.parseMoneyTokens(ocr.text) : null;
    const trusted = isOcrTrustworthy(ocr, tokens);

    const base = {
        available: Boolean(ocr?.ok),
        trusted,
        ocr_confidence: ocr?.ok ? Number(ocr.confidence ?? 0) : null,
        ocr_code: ocr?.ok ? null : (ocr?.code ?? 'OCR_UNAVAILABLE'),
    };

    // OCR không dùng được → KHÔNG kết luận gì cả. Chỉ ghi nhận là hóa đơn này chỉ có
    // một kênh đọc, và trừ một khoản cố định nhỏ cho việc thiếu người làm chứng.
    if (!trusted) {
        const confidence = Math.max(0, 1 - PENALTY.NO_CORROBORATION);
        return {
            ...base,
            confidence,
            confidence_label: label(confidence),
            reasons: [],
            signals: { corroborated: false },
            penalties: [{ code: 'NO_CORROBORATION', weight: PENALTY.NO_CORROBORATION }],
            suspect_fields: [],
        };
    }

    const flatText = taxonomy.normalize(ocr.text);
    const docSignals = ocrScanner.detectDocSignals(ocr.text);
    const accepted = taxonomy.getProfile(profile).accepted
        ? new Set(taxonomy.getProfile(profile).accepted)
        : null;

    const total = groundTotal(extraction, tokens);
    const lineTotals = groundLineTotals(extraction, tokens);
    const vendor = groundVendor(extraction, flatText);
    const quote = checkQuoteSignal(extraction, docSignals);
    const offTopic = checkOffTopicText(extraction, ocr, { keywordIndex, accepted });
    const missingItems = checkMissingLineItems(extraction, ocr, keywordIndex);
    const plates = ocrScanner.findPlates(ocr.text);

    const reasons = [];
    const penalties = [];
    const suspect = new Set();

    const penalize = (code, weight) => penalties.push({ code, weight });

    if (total.status === 'no') {
        penalize('TOTAL_NOT_GROUNDED', PENALTY.TOTAL_NOT_GROUNDED);
        suspect.add('total');
        reasons.push(reason('OCR_TOTAL_NOT_GROUNDED',
            `Tổng tiền máy đọc được (${money(total.value)}đ) không tìm thấy trong văn bản quét từ ảnh. `
            + 'Người duyệt vui lòng đối chiếu lại con số này với ảnh gốc.',
            { total: total.value }));
    } else if (total.status === 'likely') {
        penalize('TOTAL_ONLY_LIKELY', PENALTY.TOTAL_ONLY_LIKELY);
    }

    if (lineTotals.checked >= 2 && lineTotals.share < 0.5) {
        const weight = PENALTY.LINE_TOTALS_UNGROUNDED * (1 - lineTotals.share);
        penalize('LINE_TOTALS_UNGROUNDED', weight);
        suspect.add('line_items');
        reasons.push(reason('OCR_LINE_TOTALS_NOT_GROUNDED',
            `Chỉ ${lineTotals.grounded}/${lineTotals.checked} dòng có thành tiền tìm thấy được trong văn bản quét. `
            + 'Người duyệt vui lòng kiểm tra lại bảng kê hàng hóa.',
            { checked: lineTotals.checked, grounded: lineTotals.grounded, missing: lineTotals.missing }));
    }

    if (vendor.status === 'no') {
        penalize('VENDOR_NOT_GROUNDED', PENALTY.VENDOR_NOT_GROUNDED);
        suspect.add('vendor');
    }

    if (quote) {
        penalize('QUOTE_SIGNAL_MISSED', PENALTY.QUOTE_SIGNAL_MISSED);
        suspect.add('doc_type');
        reasons.push(reason('OCR_QUOTE_SIGNAL',
            `Văn bản quét từ ảnh có cụm "${quote.phrase}" nhưng máy xếp chứng từ này là hóa đơn. `
            + 'Người duyệt vui lòng xác nhận đây là hóa đơn thật chứ không phải báo giá.',
            quote));
    }

    if (offTopic.length > 0) {
        penalize('OFF_TOPIC_TEXT_EVIDENCE', PENALTY.OFF_TOPIC_TEXT_EVIDENCE);
        suspect.add('line_items');
        const names = offTopic.map((hit) => taxonomy.labelOfCategory(hit.category));
        reasons.push(reason('OCR_OFF_TOPIC_TEXT',
            `Trên ảnh có dòng thuộc nhóm ${names.join(', ')} nhưng không nằm trong bảng kê máy đọc được. `
            + 'Người duyệt vui lòng kiểm tra hóa đơn có lẫn khoản ngoài phạm vi không.',
            { hits: offTopic }));
    }

    if (missingItems) {
        penalize('MISSING_LINE_ITEMS', PENALTY.MISSING_LINE_ITEMS);
        suspect.add('line_items');
        reasons.push(reason('OCR_MISSING_LINE_ITEMS',
            `Ảnh có khoảng ${missingItems.ocr_line_candidates} dòng hàng nhưng máy chỉ đọc ra `
            + `${missingItems.model_line_items} dòng. Người duyệt vui lòng đối chiếu đủ bảng kê.`,
            missingItems));
    }

    const confidence = Math.max(0, Math.min(1, 1 - penalties.reduce((sum, p) => sum + p.weight, 0)));

    return {
        ...base,
        confidence,
        confidence_label: label(confidence),
        reasons,
        penalties,
        suspect_fields: [...suspect],
        signals: {
            corroborated: true,
            total,
            line_totals: lineTotals,
            vendor,
            doc_signals: docSignals,
            off_topic_hits: offTopic,
            missing_line_items: missingItems,
            plates,
        },
    };
};

/**
 * Có đáng bỏ thêm một lượt gọi model để đọc lại không.
 *
 * Lượt đọc lại tốn tiền và tốn vài giây, nên chỉ chạy khi CÓ CHỖ ĐỂ SỬA: kênh OCR
 * đáng tin, và nó chỉ ra được cụ thể trường nào đáng ngờ. Độ tin cậy thấp mà không rõ
 * vì sao thì đọc lại cũng chỉ ra kết quả như cũ.
 */
const shouldRecheck = (corroboration) => Boolean(
    corroboration?.trusted
    && corroboration.confidence < CONFIDENCE.RECHECK
    && corroboration.suspect_fields?.length > 0,
);

/**
 * Chọn giữa lượt đọc độc lập và lượt đọc lại có trợ giúp của OCR.
 *
 * Hòa thì lấy lượt SAU: nó nhìn được đúng những gì lượt trước nhìn được, cộng thêm
 * text OCR. Chỉ giữ lượt đầu khi lượt sau thật sự tệ hơn — trường hợp model bị text
 * OCR sai dẫn đi lạc.
 */
const pickBetterRead = (first, second) => (
    second && second.corroboration.confidence >= first.corroboration.confidence ? second : first
);

module.exports = {
    TRUST,
    PENALTY,
    CONFIDENCE,
    isOcrTrustworthy,
    groundTotal,
    groundLineTotals,
    groundVendor,
    checkQuoteSignal,
    checkOffTopicText,
    checkMissingLineItems,
    corroborate,
    shouldRecheck,
    pickBetterRead,
    confidenceLabel: label,
};
