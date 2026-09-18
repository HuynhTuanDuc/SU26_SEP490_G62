/**
 * Lõi kiểm tra hóa đơn — thuần hàm, không I/O, không gọi AI.
 *
 * Ranh giới trách nhiệm là điểm quan trọng nhất của thiết kế này:
 *   * MODEL chỉ được nói "trên tờ giấy này viết gì" (receiptVisionExtractor).
 *   * FILE NÀY quyết định hợp lệ hay không, bằng số học và luật.
 *
 * Không bao giờ hỏi model "hóa đơn này hợp lệ không": câu trả lời đó không tái lập
 * được, không kiểm toán được, và không giải thích được cho người bị từ chối. Còn phép
 * cộng thì luôn giải thích được — và cũng là thứ duy nhất bắt được hóa đơn bị sửa số.
 *
 * Toàn bộ hàm ở đây nhận dữ liệu vào, trả kết quả ra, không đụng DB/mạng/đồng hồ
 * (ngày "hôm nay" phải truyền vào) nên test được trọn vẹn mà không cần dựng gì.
 */

const taxonomy = require('./receiptTaxonomy');
// Chỉ lấy bộ ngưỡng độ tin cậy. Chiều phụ thuộc là một chiều (crossCheck không biết
// gì về file này) nên không có vòng lặp, và ngưỡng "dưới bao nhiêu thì cần người xem"
// chỉ được định nghĩa ở đúng một chỗ.
const { CONFIDENCE } = require('./receiptCrossCheck');

// ─── Ngưỡng ──────────────────────────────────────────────────────────────────

const THRESHOLDS = {
    // Dòng hàng: số in trên giấy phải khớp phép nhân gần như tuyệt đối. Sàn 1.000đ
    // để bỏ qua việc làm tròn tới hàng nghìn, 0,1% để không bắt bẻ hóa đơn tiền tỷ.
    LINE_ABS: 1_000,
    LINE_PCT: 0.001,

    // Tổng cộng: nới hơn một chút vì hóa đơn hay làm tròn ở dòng tổng.
    TOTAL_ABS: 1_000,
    TOTAL_PCT: 0.005,

    // Thuế: nới nhất, cách làm tròn VAT giữa các phần mềm kế toán không giống nhau.
    VAT_ABS: 1_000,
    VAT_PCT: 0.01,

    // Số khai vs tổng hóa đơn. Thay cho dung sai 15% cũ — 15% trên hóa đơn 10 triệu
    // là 1,5 triệu, tức lớp kiểm tra cũ không kiểm tra gì cả.
    CLAIM_EXACT_ABS: 1_000,      // dưới mức này coi như khớp (làm tròn)
    CLAIM_WARN_ABS: 50_000,      // trên mức khớp nhưng dưới ngưỡng này → cảnh báo
    CLAIM_WARN_PCT: 0.02,

    // Tỷ trọng tiền, KHÔNG phải tỷ trọng số dòng: hóa đơn garage 5 triệu kèm một chai
    // nước 10k vẫn là hóa đơn bảo dưỡng; hóa đơn 5 triệu mà 4,5 triệu là xăng thì không.
    MAX_OFF_TOPIC_SHARE: 0.20,
    MIN_ON_TOPIC_SHARE: 0.80,

    // Hóa đơn được phép sớm hơn ngày mở phiếu bao nhiêu (tài xế sửa xe rồi mới mở phiếu)
    // và trễ hơn ngày hoàn tất bao nhiêu.
    WINDOW_BEFORE_DAYS: 7,
    WINDOW_AFTER_DAYS: 1,
};

const ACCEPTED_DOC_TYPES = ['invoice', 'receipt'];

// ─── Tiện ích ────────────────────────────────────────────────────────────────

const { money } = require('../utils/formatNumber');

/** Số hữu hạn hoặc null — mọi thứ khác (chuỗi rỗng, undefined, NaN) đều thành null. */
const num = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const moneyClose = (a, b, abs, pct) =>
    Math.abs(a - b) <= Math.max(abs, Math.max(Math.abs(a), Math.abs(b)) * pct);

/** Biển số về dạng so sánh: chỉ chữ và số, viết hoa. "51C-123.45" -> "51C12345". */
const normalizePlate = (plate) => String(plate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Ngày (YYYY-MM-DD hoặc Date) về mốc 00:00 UTC; null nếu không parse được. */
const toDay = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const DAY_MS = 24 * 60 * 60 * 1000;

const reason = (code, severity, message, detail) => ({ code, severity, message, ...(detail ? { detail } : {}) });

// ─── Nhận dạng tờ hóa đơn ────────────────────────────────────────────────────

/**
 * Khoá định danh NỘI DUNG của tờ hóa đơn, dùng để chặn việc nộp lại cho đợt khác.
 *
 * Băm ảnh chỉ bắt được đúng một file gửi hai lần; chụp lại cùng tờ hóa đơn từ góc khác
 * là file khác, băm khác. Cặp (đơn vị bán, số hóa đơn) mới là thứ định danh tờ giấy.
 *
 * Mã số thuế được ưu tiên hơn tên: tên đơn vị bán đọc mỗi lần một khác (viết tắt, thiếu
 * chữ, sai dấu), còn mã số thuế là dãy số nên đọc ổn định hơn nhiều.
 *
 * Trả invoiceNoKey = null khi hóa đơn không ghi số — khi đó cặp khoá này KHÔNG định
 * danh được gì (hai lần thay dầu cùng garage cùng giá là chuyện bình thường) và nơi
 * gọi phải bỏ qua, nếu không sẽ báo trùng oan hàng loạt.
 */
const invoiceIdentity = (extraction) => {
    const taxCode = String(extraction?.vendor?.tax_code ?? '').replace(/[^0-9]/g, '');
    const nameKey = taxonomy.normalize(extraction?.vendor?.name).replace(/\s+/g, '');
    const vendorKey = taxCode.length >= 10 ? `tax:${taxCode}` : (nameKey ? `name:${nameKey}` : null);

    const invoiceNoKey = String(extraction?.invoice_no ?? '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '') || null;

    return { vendorKey, invoiceNoKey };
};

// ─── Phân loại dòng hàng ─────────────────────────────────────────────────────

/**
 * Gắn hạng mục cho từng dòng bằng HAI đường độc lập rồi đối chiếu:
 *   * từ điển  — kiểm toán được, chỉ ra được từ khoá nào đã khớp
 *   * model    — phủ được tên hàng lạ mà từ điển chưa có
 *
 * Khi hai bên chỏi nhau thì TỪ ĐIỂN THẮNG cho việc tính tiền (nó là nguồn giải thích
 * được), nhưng dòng đó bị đánh dấu `conflict` để người duyệt nhìn thấy.
 *
 * @returns {Array} dòng hàng kèm { category, group, matchedBy, value }
 */
const classifyLineItems = (lineItems, keywordIndex) => (lineItems ?? []).map((item, index) => {
    const quantity = num(item?.quantity);
    const unitPrice = num(item?.unit_price);
    const lineTotal = num(item?.line_total);

    // Giá trị dùng để tính tỷ trọng: ưu tiên số IN TRÊN GIẤY, chỉ nhân khi không có.
    const value = lineTotal ?? (quantity !== null && unitPrice !== null ? quantity * unitPrice : null);

    const fromDict = taxonomy.matchCategory(item?.raw_name, keywordIndex);
    const modelCategory = item?.category ?? null;
    const modelGroup = taxonomy.groupOfCategory(modelCategory);

    let category = null;
    let group = null;
    let matchedBy = 'none';

    if (fromDict && modelGroup) {
        category = fromDict.category;
        group = fromDict.group;
        matchedBy = fromDict.group === modelGroup ? 'both' : 'conflict';
    } else if (fromDict) {
        category = fromDict.category;
        group = fromDict.group;
        matchedBy = 'dictionary';
    } else if (modelGroup) {
        // Từ điển im lặng thì tin model — giai đoạn đầu từ điển chắc chắn còn thiếu,
        // bắt mọi dòng lạ phải duyệt tay sẽ khiến tính năng vô dụng vì quá phiền.
        category = modelCategory;
        group = modelGroup;
        matchedBy = 'model';
    }

    return {
        index,
        raw_name: item?.raw_name ?? null,
        quantity,
        unit: item?.unit ?? null,
        unit_price: unitPrice,
        line_total: lineTotal,
        value,
        category,
        group,
        category_label: category ? taxonomy.labelOfCategory(category) : null,
        matched_by: matchedBy,
        matched_keyword: fromDict?.keyword ?? null,
        model_category: modelCategory,
    };
});

/**
 * Đánh dấu từng dòng có ĐÚNG CHỦ ĐỀ của loại chi phí đang khai hay không.
 *
 * Tách khỏi classifyLineItems vì phân loại là việc tuyệt đối (nhớt luôn là nhớt) còn
 * đúng chủ đề hay không thì phụ thuộc loại chi phí: dòng "Xăng A95" đúng chủ đề trên
 * hóa đơn nhiên liệu và sai chủ đề trên hóa đơn bảo dưỡng.
 *
 * @param {Set<string>|null} accepted  null = không ràng buộc hạng mục
 */
const markTopicality = (items, accepted) => items.map((item) => ({
    ...item,
    on_topic: item.category === null ? null : (accepted === null ? true : accepted.has(item.category)),
}));

/**
 * Tỷ trọng tiền theo mức đúng chủ đề.
 *
 * Khi không dòng nào đọc được thành tiền thì rơi về đếm số dòng — thà cân bằng thô
 * còn hơn chia cho 0 rồi trả NaN vào phán quyết.
 */
const summarizeGroups = (items) => {
    const hasValue = items.some((item) => item.value !== null && item.value > 0);
    const weightOf = (item) => (hasValue ? (item.value ?? 0) : 1);

    let onTopic = 0;
    let offTopic = 0;
    let unknown = 0;

    for (const item of items) {
        const weight = weightOf(item);
        if (item.on_topic === true) onTopic += weight;
        else if (item.on_topic === false) offTopic += weight;
        else unknown += weight;
    }

    const total = onTopic + offTopic + unknown;
    return {
        weighted_by: hasValue ? 'value' : 'count',
        on_topic_value: onTopic,
        off_topic_value: offTopic,
        unknown_value: unknown,
        on_topic_share: total > 0 ? onTopic / total : 0,
        off_topic_share: total > 0 ? offTopic / total : 0,
        unknown_share: total > 0 ? unknown / total : 0,
    };
};

// ─── Kiểm tra số học ─────────────────────────────────────────────────────────

/**
 * Đối chiếu số học của hóa đơn với chính nó.
 *
 * Đây là tầng mạnh nhất vì nó không phụ thuộc vào việc máy hiểu tên hàng hay không:
 * tổng các dòng không bằng tổng in ở chân hóa đơn là dấu hiệu tờ hóa đơn đã bị sửa,
 * và đó chính là thứ dung sai 15% cũ bỏ lọt hoàn toàn.
 */
const checkArithmetic = (extraction, items) => {
    const reasons = [];

    const subtotal = num(extraction?.subtotal);
    const discount = num(extraction?.discount) ?? 0;
    const vatAmount = num(extraction?.vat_amount);
    const vatRate = num(extraction?.vat_rate);
    const total = num(extraction?.total);

    // ── Từng dòng: số lượng × đơn giá có bằng thành tiền in trên giấy không ──
    const lineMismatches = [];
    for (const item of items) {
        if (item.quantity === null || item.unit_price === null || item.line_total === null) continue;
        const expected = item.quantity * item.unit_price;
        if (!moneyClose(expected, item.line_total, THRESHOLDS.LINE_ABS, THRESHOLDS.LINE_PCT)) {
            lineMismatches.push({
                index: item.index,
                raw_name: item.raw_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                expected,
                printed: item.line_total,
            });
        }
    }

    // ── Tổng các dòng ──
    const valuedLines = items.filter((item) => item.line_total !== null);
    const lineSum = valuedLines.reduce((acc, item) => acc + item.line_total, 0);
    const allLinesValued = items.length > 0 && valuedLines.length === items.length;

    // Tổng tiền hàng suy ra từ chân hóa đơn khi không in riêng dòng "cộng tiền hàng".
    const effectiveSubtotal = subtotal
        ?? (total !== null ? total - (vatAmount ?? 0) + discount : null);

    let subtotalOk = true;
    if (allLinesValued && effectiveSubtotal !== null) {
        subtotalOk = moneyClose(lineSum, effectiveSubtotal, THRESHOLDS.TOTAL_ABS, THRESHOLDS.TOTAL_PCT);
        if (!subtotalOk) {
            reasons.push(reason(
                'SUBTOTAL_MISMATCH', 'error',
                `Cộng các dòng trên hóa đơn ra ${money(lineSum)} nhưng hóa đơn ghi tiền hàng là `
                + `${money(effectiveSubtotal)} (lệch ${money(Math.abs(lineSum - effectiveSubtotal))}). `
                + 'Vui lòng chụp lại rõ toàn bộ hóa đơn.',
                { line_sum: lineSum, subtotal: effectiveSubtotal },
            ));
        }
    } else if (items.length > 0 && !allLinesValued && effectiveSubtotal !== null) {
        reasons.push(reason(
            'LINE_TOTALS_INCOMPLETE', 'warning',
            `Không đọc được thành tiền của ${items.length - valuedLines.length}/${items.length} dòng `
            + 'nên chưa đối chiếu được tổng. Người duyệt vui lòng kiểm tra bằng mắt.',
        ));
    }

    // Một dòng lệch mà tổng vẫn khớp thì gần như chắc là đọc nhầm số lượng/đơn giá,
    // không phải sửa hóa đơn — các con số thành tiền vẫn nhất quán với nhau. Chặn cứng
    // ca này là từ chối oan người trung thực vì lỗi của máy.
    if (lineMismatches.length > 0) {
        const minor = lineMismatches.length === 1 && subtotalOk;
        const detail = lineMismatches
            .map((m) => `"${m.raw_name ?? '?'}": ${m.quantity} × ${money(m.unit_price)} = `
                + `${money(m.expected)} nhưng ghi ${money(m.printed)}`)
            .join('; ');

        reasons.push(minor
            ? reason('LINE_MATH_MISMATCH_MINOR', 'warning',
                `Một dòng chưa khớp phép nhân (${detail}), nhưng tổng hóa đơn vẫn tự khớp. `
                + 'Có thể máy đọc nhầm số lượng/đơn giá, cũng có thể dòng này bị tính vống. '
                + 'Người duyệt vui lòng đối chiếu trực tiếp trên ảnh.',
                { mismatches: lineMismatches })
            : reason('LINE_MATH_MISMATCH', 'error',
                `Số lượng × đơn giá không khớp thành tiền ở ${lineMismatches.length} dòng — ${detail}. `
                + 'Hóa đơn không tự khớp, vui lòng kiểm tra lại.',
                { mismatches: lineMismatches }));
    }

    // ── Thuế ──
    if (subtotal !== null && vatRate !== null && vatAmount !== null && vatRate > 0) {
        const expectedVat = subtotal * (vatRate / 100);
        if (!moneyClose(expectedVat, vatAmount, THRESHOLDS.VAT_ABS, THRESHOLDS.VAT_PCT)) {
            reasons.push(reason(
                'VAT_MISMATCH', 'warning',
                `Thuế VAT ${vatRate}% của ${money(subtotal)} phải là ${money(expectedVat)} `
                + `nhưng hóa đơn ghi ${money(vatAmount)}.`,
                { expected: expectedVat, printed: vatAmount },
            ));
        }
    }

    // ── Tổng cuối ──
    if (subtotal !== null && total !== null) {
        const expectedTotal = subtotal - discount + (vatAmount ?? 0);
        if (!moneyClose(expectedTotal, total, THRESHOLDS.TOTAL_ABS, THRESHOLDS.TOTAL_PCT)) {
            reasons.push(reason(
                'TOTAL_MISMATCH', 'error',
                `Tiền hàng ${money(subtotal)}`
                + (discount ? ` trừ giảm giá ${money(discount)}` : '')
                + (vatAmount ? ` cộng thuế ${money(vatAmount)}` : '')
                + ` phải ra ${money(expectedTotal)} nhưng hóa đơn ghi tổng ${money(total)}.`,
                { expected: expectedTotal, printed: total },
            ));
        }
    }

    // Tổng để đối chiếu với số khai: ưu tiên số in ở chân hóa đơn, không có thì suy ra.
    const receiptTotal = total ?? effectiveSubtotal ?? (allLinesValued && items.length > 0 ? lineSum : null);
    const totalSource = total !== null ? 'printed_total'
        : effectiveSubtotal !== null ? 'derived_subtotal'
            : receiptTotal !== null ? 'line_sum' : 'none';

    return {
        reasons,
        receiptTotal,
        totals: {
            line_sum: allLinesValued ? lineSum : null,
            subtotal,
            discount,
            vat_rate: vatRate,
            vat_amount: vatAmount,
            total,
            receipt_total: receiptTotal,
            total_source: totalSource,
        },
    };
};

// ─── Kiểm tra "có phải chứng từ không" ───────────────────────────────────────

const DOC_TYPE_MESSAGE = {
    quote: 'Ảnh này là BÁO GIÁ, không phải hóa đơn đã thanh toán. Vui lòng chụp hóa đơn/phiếu thu cuối cùng.',
    screenshot: 'Ảnh này là ảnh chụp màn hình, không phải hóa đơn. Vui lòng chụp trực tiếp tờ hóa đơn.',
    other: 'Ảnh này không phải hóa đơn hay phiếu thu. Vui lòng chụp đúng chứng từ của khoản chi này.',
};

const checkDocument = (extraction, items) => {
    const reasons = [];
    const docType = extraction?.doc_type ?? null;

    if (extraction?.is_document !== true) {
        reasons.push(reason('NOT_A_DOCUMENT', 'error',
            'Không nhận ra chứng từ nào trong ảnh. Vui lòng chụp rõ toàn bộ tờ hóa đơn, đủ ánh sáng.'));
        return reasons;
    }

    // Hóa đơn viết tay là chuyện thường ở garage nhỏ — không chặn, nhưng bắt người
    // duyệt phải nhìn, vì viết tay là dạng dễ bịa số nhất.
    if (docType === 'handwritten') {
        reasons.push(reason('HANDWRITTEN_DOCUMENT', 'warning',
            'Đây là hóa đơn viết tay. Người duyệt vui lòng đối chiếu kỹ trước khi xác nhận.'));
    } else if (!ACCEPTED_DOC_TYPES.includes(docType)) {
        reasons.push(reason('WRONG_DOC_TYPE', 'error',
            DOC_TYPE_MESSAGE[docType] ?? DOC_TYPE_MESSAGE.other, { doc_type: docType }));
        return reasons;
    }

    // Không có dòng hàng thì cả ba yêu cầu (đúng loại chứng từ, đúng hạng mục, đúng
    // phép cộng) đều không kiểm được — không có gì để dựa vào.
    if (items.length === 0) {
        reasons.push(reason('NO_LINE_ITEMS', 'error',
            'Không đọc được dòng hàng nào trên hóa đơn. Vui lòng chụp rõ phần bảng kê hàng hóa/dịch vụ.'));
        return reasons;
    }

    const signals = [
        Boolean(extraction?.vendor?.name),
        Boolean(extraction?.invoice_no),
        Boolean(extraction?.issued_date),
        items.length > 0,
    ].filter(Boolean).length;

    if (signals < 2) {
        reasons.push(reason('WEAK_DOCUMENT_EVIDENCE', 'warning',
            'Hóa đơn thiếu thông tin nhận dạng (tên đơn vị bán, số hóa đơn, ngày). '
            + 'Người duyệt vui lòng kiểm tra bằng mắt.'));
    }

    return reasons;
};

// ─── Kiểm tra hạng mục ───────────────────────────────────────────────────────

const checkCategories = (items, groups, profile) => {
    const reasons = [];
    if (items.length === 0) return reasons;

    const offTopicItems = items.filter((item) => item.on_topic === false);

    // Báo xung đột TRƯỚC mọi lối thoát sớm. Đúng lúc hóa đơn bị từ chối vì "không
    // thuộc bảo dưỡng" là lúc người duyệt cần biết nhất rằng AI đã nghĩ khác từ điển
    // — đó là ca họ có thể phải ghi đè, và là dữ liệu để bổ sung từ điển.
    const conflicts = items.filter((item) => item.matched_by === 'conflict');
    if (conflicts.length > 0) {
        reasons.push(reason('CATEGORY_CONFLICT', 'warning',
            `Có ${conflicts.length} dòng mà từ điển và AI phân loại khác nhau `
            + `(${conflicts.map((item) => item.raw_name ?? '?').join(', ')}).`,
            { items: conflicts.map((item) => ({ raw_name: item.raw_name, dictionary: item.category, model: item.model_category })) }));
    }

    if (groups.off_topic_share > THRESHOLDS.MAX_OFF_TOPIC_SHARE) {
        // Gom theo hạng mục để chỉ đúng tên thứ sai chủ đề, và để nói được câu hữu ích
        // nhất: khoản này phải khai vào loại chi phí nào.
        const byCategory = new Map();
        for (const item of offTopicItems) {
            const current = byCategory.get(item.category) ?? 0;
            byCategory.set(item.category, current + (item.value ?? 0));
        }
        const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
        const [topCategory] = ranked[0] ?? [];
        const names = ranked.map(([category]) => taxonomy.labelOfCategory(category)).join(', ');

        const redirect = taxonomy.getProfile(topCategory);
        const hint = redirect && redirect.accepted?.includes(topCategory)
            // Viết hoa để trùng với tên hiển thị trên giao diện chọn loại chi phí.
            ? ` Khoản này phải khai vào loại chi phí "${redirect.label.charAt(0).toUpperCase()}${redirect.label.slice(1)}".`
            : '';

        reasons.push(reason('OFF_TOPIC_INVOICE', 'error',
            `${Math.round(groups.off_topic_share * 100)}% giá trị hóa đơn không thuộc ${profile.label} (${names}).${hint}`,
            {
                off_topic_share: groups.off_topic_share,
                items: offTopicItems.map((item) => ({ raw_name: item.raw_name, category: item.category, value: item.value })),
            }));
        return reasons;
    }

    if (groups.on_topic_share < THRESHOLDS.MIN_ON_TOPIC_SHARE) {
        const unknownItems = items.filter((item) => item.on_topic === null);
        reasons.push(reason('UNCLASSIFIED_ITEMS', 'warning',
            `Chưa phân loại được ${unknownItems.length} dòng `
            + `(${unknownItems.map((item) => item.raw_name ?? '?').join(', ')}). `
            + `Người duyệt xác nhận giúp các dòng này có thuộc ${profile.label} không.`,
            { items: unknownItems.map((item) => ({ raw_name: item.raw_name, value: item.value })) }));
    }

    return reasons;
};

// ─── Kiểm tra số tiền khai ───────────────────────────────────────────────────

const checkClaimedAmount = (claimedAmount, receiptTotal, totals) => {
    const reasons = [];
    const claimed = num(claimedAmount);

    if (claimed === null || claimed <= 0) {
        // Bình thường: tài xế up ảnh trước khi nhập tiền. Việc đối chiếu sẽ diễn ra ở
        // bước hoàn tất — nơi duy nhất biết cả ảnh lẫn số tiền cuối cùng.
        return reasons;
    }
    if (receiptTotal === null) {
        reasons.push(reason('NO_RECEIPT_TOTAL', 'warning',
            'Không xác định được tổng tiền trên hóa đơn nên chưa đối chiếu được với số đã khai.'));
        return reasons;
    }

    const diff = Math.abs(claimed - receiptTotal);
    if (diff <= THRESHOLDS.CLAIM_EXACT_ABS) return reasons;

    if (diff <= THRESHOLDS.CLAIM_WARN_ABS && diff <= receiptTotal * THRESHOLDS.CLAIM_WARN_PCT) {
        reasons.push(reason('AMOUNT_MINOR_DIFF', 'warning',
            `Số khai (${money(claimed)}) lệch ${money(diff)} so với tổng hóa đơn (${money(receiptTotal)}).`,
            { claimed, receipt_total: receiptTotal, diff }));
        return reasons;
    }

    // Nói rõ lệch ở đâu thay vì câu chung chung — người bị từ chối phải biết phải sửa gì.
    const breakdown = totals.subtotal !== null && totals.vat_amount
        ? ` (${money(totals.subtotal)} tiền hàng + ${money(totals.vat_amount)} thuế)`
        : '';

    reasons.push(reason('AMOUNT_MISMATCH', 'error',
        `Hóa đơn ghi tổng ${money(receiptTotal)}${breakdown}, bạn khai ${money(claimed)}, `
        + `lệch ${money(diff)}. Vui lòng nhập đúng số tiền trên hóa đơn.`,
        { claimed, receipt_total: receiptTotal, diff }));

    return reasons;
};

/**
 * Đối chiếu khi số khai là TRẦN chứ không phải đích danh — dùng lúc tài xế vừa upload
 * một ảnh mà đợt bảo dưỡng có thể còn hóa đơn khác chưa nộp.
 *
 * Ở thời điểm đó KHÔNG được đòi hóa đơn phải bằng số khai: một đợt 800.000đ hoàn toàn
 * có thể gồm hai hóa đơn 300.000đ và 500.000đ, đòi bằng nhau là từ chối oan ngay tấm
 * đầu tiên. Nhưng vẫn kiểm được một chiều: một hóa đơn lẻ KHÔNG THỂ lớn hơn tổng chi
 * phí đã khai. Chiều còn lại (khai vống hơn tổng hóa đơn) được chốt ở bước hoàn tất,
 * nơi đã biết đủ mọi hóa đơn.
 */
const checkClaimedCeiling = (claimedAmount, receiptTotal) => {
    const reasons = [];
    const claimed = num(claimedAmount);
    if (claimed === null || claimed <= 0 || receiptTotal === null) return reasons;

    const excess = receiptTotal - claimed;
    if (excess <= Math.max(THRESHOLDS.CLAIM_EXACT_ABS, claimed * THRESHOLDS.CLAIM_WARN_PCT)) return reasons;

    reasons.push(reason('AMOUNT_BELOW_RECEIPT', 'error',
        `Riêng hóa đơn này đã là ${money(receiptTotal)}, lớn hơn chi phí bạn đã nhập `
        + `(${money(claimed)}). Vui lòng kiểm tra lại số tiền đã nhập.`,
        { claimed, receipt_total: receiptTotal, excess }));

    return reasons;
};

// ─── Chi phí bất thường so với lịch sử xe ────────────────────────────────────

const OUTLIER = {
    // Dưới 3 mốc thì "bình thường" chưa có nghĩa gì — cảnh báo lúc đó chỉ là nhiễu.
    MIN_SAMPLES: 3,
    // Ngưỡng quen thuộc cho modified z-score.
    ROBUST_Z: 3.5,
    // Đưa MAD về cùng thang với độ lệch chuẩn (với phân phối chuẩn).
    MAD_SCALE: 1.4826,
    // Khi cả lịch sử bằng nhau y hệt thì MAD = 0, z hoá vô cực — rơi về so tỉ lệ.
    FLAT_RATIO: 2,
    // Sàn "đáng kể về vận hành", đi KÈM ngưỡng thống kê chứ không thay thế nó.
    // Xe nào chi phí rất đều thì MAD bé, z vọt lên và gần như mọi khoản nhỉnh hơn đều
    // thành bất thường — đúng về thống kê nhưng vô dụng với người duyệt vì quá nhiễu.
    MIN_RATIO: 1.5,
};

const MAINTENANCE_TYPE_LABEL = {
    scheduled: 'định kỳ',
    repair: 'sửa chữa',
    inspection: 'kiểm tra',
    emergency: 'khẩn cấp',
};

const median = (sortedAsc) => {
    const n = sortedAsc.length;
    if (n === 0) return null;
    const mid = Math.floor(n / 2);
    return n % 2 ? sortedAsc[mid] : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
};

/**
 * Chọn tập chi phí đáng đem ra so sánh.
 *
 * So một đợt thay dầu định kỳ với một lần đại tu khẩn cấp là so hai thứ khác loại, nên
 * ưu tiên lịch sử CÙNG LOẠI bảo dưỡng. Chỉ khi cùng loại chưa đủ mẫu mới gộp tất cả —
 * thà so thô còn hơn im lặng, và câu cảnh báo có nói rõ đang so với cái gì.
 */
const pickComparableCosts = (rows, maintenanceType, minSamples = OUTLIER.MIN_SAMPLES) => {
    const all = (rows ?? [])
        .map((row) => ({ cost: num(row?.cost), type: row?.maintenance_type }))
        .filter((row) => row.cost !== null && row.cost > 0);

    const sameType = maintenanceType ? all.filter((row) => row.type === maintenanceType) : [];
    if (sameType.length >= minSamples) {
        return {
            costs: sameType.map((row) => row.cost),
            scopeLabel: `đợt bảo dưỡng ${MAINTENANCE_TYPE_LABEL[maintenanceType] ?? maintenanceType} trước`,
        };
    }
    return { costs: all.map((row) => row.cost), scopeLabel: 'đợt bảo dưỡng trước' };
};

/**
 * So chi phí khai với lịch sử của chính chiếc xe đó.
 *
 * Dùng TRUNG VỊ và MAD chứ không dùng trung bình và độ lệch chuẩn. Lý do nằm ở chính
 * thứ đang đi tìm: trung bình và độ lệch chuẩn bị kéo lệch bởi outlier, nên một hóa đơn
 * khống trong quá khứ sẽ nâng ngưỡng lên và che luôn cái tiếp theo. Trung vị gần như
 * không nhúc nhích, và MAD cũng vậy — đúng thứ cần khi mẫu chỉ có 3–10 mốc.
 *
 * Chỉ cảnh báo một chiều (cao bất thường). Một đợt bảo dưỡng rẻ hơn thường lệ không
 * phải dấu hiệu gian lận, báo lên chỉ thêm nhiễu cho người duyệt.
 *
 * Luôn là CẢNH BÁO, không bao giờ là lỗi: sửa xe tốn tiền là chuyện có thật, đây là
 * tín hiệu "nhìn kỹ cái này" chứ không phải căn cứ từ chối.
 */
const checkCostOutlier = (cost, costs, { scopeLabel = 'đợt bảo dưỡng trước' } = {}) => {
    const reasons = [];
    const value = num(cost);
    const samples = (costs ?? []).map(num).filter((n) => n !== null && n > 0).sort((a, b) => a - b);

    if (value === null || value <= 0 || samples.length < OUTLIER.MIN_SAMPLES) return reasons;

    const med = median(samples);
    const mad = median(samples.map((n) => Math.abs(n - med)).sort((a, b) => a - b));

    const isOutlier = mad > 0
        // Phải vượt cả hai: lệch xa so với độ dao động quen thuộc CỦA XE ĐÓ, và cao hơn
        // mức thường lệ đủ nhiều để đáng gọi người duyệt vào xem.
        ? (value - med) / (OUTLIER.MAD_SCALE * mad) > OUTLIER.ROBUST_Z && value > med * OUTLIER.MIN_RATIO
        : value > med * OUTLIER.FLAT_RATIO;
    if (!isOutlier) return reasons;

    reasons.push(reason('COST_OUTLIER', 'warning',
        `Chi phí ${money(value)} cao bất thường so với ${samples.length} ${scopeLabel} của xe này `
        + `(khoảng ${money(samples[0])} – ${money(samples[samples.length - 1])}, `
        + `thường vào khoảng ${money(med)}). Người duyệt vui lòng xác nhận đợt này có hạng mục lớn thật.`,
        {
            cost: value, median: med, mad, samples: samples.length,
            min: samples[0], max: samples[samples.length - 1],
        }));

    return reasons;
};

// ─── Chống dùng lại hóa đơn ──────────────────────────────────────────────────

// Lý do một lần nộp được thả ra, nói theo cách người duyệt hiểu (xem releaseByEntity).
const RELEASE_LABEL = {
    returned: 'đã bị trả về làm lại',
    cancelled: 'đợt đó đã bị huỷ',
    removed: 'tài xế đã xoá khỏi đợt đó',
};

const describeEntity = (entityType, entityId) => (entityType === 'expense'
    ? `khoản chi phí #${entityId}`
    : `đợt bảo dưỡng #${entityId}`);

/**
 * Chấm các bản đọc trùng khớp tìm được trong lịch sử.
 *
 * Hai kiểu trùng, hai thông điệp khác nhau vì người dùng phải làm hai việc khác nhau:
 *   * cùng bản ghi  — tài xế bấm nộp hai lần, ảnh đã có rồi, chỉ cần bỏ qua
 *   * khác bản ghi  — một hóa đơn dùng cho hai đợt: đây là kiểu gian lận dễ làm nhất
 *                     và trước đây hệ thống không chặn gì cả
 * Lần nộp đã bị trả về/huỷ (released_at) không chặn, chỉ cảnh báo — xem thân hàm.
 *
 * @param {Array} matches  các dòng receipt_extractions khớp khoá, KHÔNG gồm dòng hiện tại
 * @param {{entityType: string, entityId: number|null}} current
 */
const checkDuplicates = (matches, current) => {
    const reasons = [];
    if (!Array.isArray(matches) || matches.length === 0) return reasons;

    const isSameEntity = (row) => row.entity_type === current.entityType
        && Number(row.entity_id) === Number(current.entityId);

    // Cùng khoản VÀ cùng URL ảnh không phải là nộp lại — đó là đọc lại ĐÚNG lần tải lên
    // đó. Chuyện này xảy ra mỗi khi lần đọc đầu hỏng vì hạ tầng (Gemini 503/timeout):
    // vết ghi lại không có bản đọc nên bước hoàn tất không dùng lại được, phải đọc lại
    // từ đầu, và lần đọc lại tìm thấy đúng dòng vết của chính nó.
    //
    // Trước khi có dòng lọc này, đã tái hiện được: Gemini lỗi lúc tải ảnh → tài xế bấm
    // hoàn tất → bị CHẶN với câu "ảnh đã tải lên cho chính khoản này rồi, vui lòng chọn
    // ảnh khác" — không làm gì sai, và cũng không có ảnh nào khác để chọn.
    //
    // Nộp lại thật sự (bấm tải hai lần, chụp lại cùng tờ giấy) luôn sinh ra URL MỚI, vì
    // mỗi lần tải lên là một tệp mới trên Cloudinary — nên vẫn bị bắt như cũ.
    const relevant = current.imageUrl
        ? matches.filter((row) => !(isSameEntity(row) && row.image_url === current.imageUrl))
        : matches;
    if (relevant.length === 0) return reasons;

    // Lần đọc đã THẢ RA (released_at) — đợt bảo dưỡng bị quản lý trả về làm lại hoặc huỷ,
    // hay ảnh không vào được đợt — là hóa đơn CHƯA được dùng vào đâu. Trả về làm lại xoá
    // sạch bill_pics và app bảo tài xế "chụp lại hoá đơn"; tờ hóa đơn thật vẫn là tờ đó.
    // Đã tái hiện: chặn ở đây thì tài xế không bao giờ nộp lại được. Nên chỉ cảnh báo, để
    // người duyệt biết tờ này từng bị trả về và đối chiếu với lý do lần trước.
    //
    // Lý do thả ra quyết định có đáng nhắc hay không. Tài xế tự xoá một ảnh rồi tải lại
    // (chụp nhầm góc, chọn nhầm ảnh) ở CHÍNH đợt đó là thao tác bình thường — cảnh báo ở
    // đây chỉ làm đợt sạch rơi vào "cần xem". Ảnh chưa từng vào được đợt nào
    // (not_attached) thì không có gì để nói.
    const active = relevant.filter((row) => !row.released_at);
    const released = relevant.filter((row) => row.released_at && row.release_reason !== 'not_attached'
        && (!isSameEntity(row) || (row.release_reason ?? 'returned') === 'returned'));

    const sameEntity = active.filter(isSameEntity);
    const otherEntity = active.filter((row) => !isSameEntity(row));

    if (otherEntity.length > 0) {
        const where = [...new Set(otherEntity.map((row) => describeEntity(row.entity_type, row.entity_id)))];
        reasons.push(reason('DUPLICATE_RECEIPT', 'error',
            `Hóa đơn này đã được dùng cho ${where.join(', ')}. `
            + 'Mỗi hóa đơn chỉ được kê khai một lần.',
            { matches: otherEntity.map((row) => ({ id: row.id, entity_type: row.entity_type, entity_id: row.entity_id, created_at: row.created_at })) }));
        return reasons;
    }

    if (sameEntity.length > 0) {
        reasons.push(reason('DUPLICATE_IMAGE_SAME_RECORD', 'error',
            'Ảnh hóa đơn này đã được tải lên cho chính khoản này rồi. Vui lòng chọn ảnh khác.',
            { matches: sameEntity.map((row) => ({ id: row.id, image_url: row.image_url })) }));
        return reasons;
    }

    if (released.length === 0) return reasons;

    const elsewhere = [...new Set(released
        .filter((row) => !isSameEntity(row))
        .map((row) => `${describeEntity(row.entity_type, row.entity_id)} (${RELEASE_LABEL[row.release_reason] ?? RELEASE_LABEL.returned})`))];
    reasons.push(reason('RECEIPT_PREVIOUSLY_RETURNED', 'warning',
        elsewhere.length > 0
            ? `Hóa đơn này từng được nộp cho ${elsewhere.join(', ')}. Người duyệt vui lòng kiểm tra lại.`
            : 'Hóa đơn này đã được nộp cho chính khoản này trước khi bị trả về làm lại. Người duyệt đối chiếu với lý do lần trước.',
        { matches: released.map((row) => ({ id: row.id, entity_type: row.entity_type, entity_id: row.entity_id, released_at: row.released_at, release_reason: row.release_reason ?? null })) }));

    return reasons;
};

// ─── Kiểm tra đối chiếu ngữ cảnh ─────────────────────────────────────────────

/**
 * Đối chiếu hóa đơn với dữ liệu hệ thống đã có.
 *
 * Đây là phần không phần mềm OCR ngoài kia làm được, vì nó cần chứng từ và dữ liệu
 * vận hành nằm cùng một chỗ.
 */
/** Số phép sửa một ký tự để biến biển này thành biển kia (Levenshtein). */
const plateDistance = (a, b) => {
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
        let diagonal = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const above = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = above;
        }
    }
    return prev[b.length];
};

// Lệch đúng một ký tự là vùng "có thể đọc nhầm" (8↔B, 0↔D, 5↔S). Hai biển số khác xe
// trong thực tế gần như luôn khác nhau từ hai ký tự trở lên.
const PLATE_MISREAD_DISTANCE = 1;

/**
 * Biển số in trên hóa đơn phải là xe đang bảo dưỡng.
 *
 * Trước đây lệch biển số chỉ CẢNH BÁO — lo đọc nhầm — nên hóa đơn của xe khác vẫn được
 * nhận và đi tới bàn duyệt như một khoản bình thường. Giờ phân biệt ba ca:
 *   * văn bản OCR (quét độc lập, không qua model) THẤY biển số của xe → model đọc nhầm,
 *     chỉ cảnh báo
 *   * lệch đúng một ký tự → có thể là đọc nhầm, chỉ cảnh báo
 *   * còn lại → hóa đơn của xe khác, CHẶN
 * Chỉ OCR thấy biển khác (model không đọc ra biển nào) thì cảnh báo chứ không chặn: mẫu
 * biển số trên text thô có thể khớp nhầm một mã khác in trên hóa đơn. Hóa đơn không in
 * biển số nào thì không có gì để đối chiếu.
 */
const checkPlate = (extraction, context) => {
    const expected = normalizePlate(context?.plateNumber);
    if (!expected) return [];

    const ocrPlates = (context?.corroboration?.signals?.plates ?? []).map(normalizePlate).filter(Boolean);
    if (ocrPlates.includes(expected)) {
        const onBill = normalizePlate(extraction?.vehicle_plate);
        return onBill && onBill !== expected
            ? [reason('PLATE_MISMATCH', 'warning',
                `Máy đọc biển số trên hóa đơn là ${extraction.vehicle_plate}, nhưng văn bản quét được từ ảnh có biển `
                + `${context.plateNumber} của xe đang bảo dưỡng. Người duyệt vui lòng đối chiếu.`,
                { on_bill: extraction.vehicle_plate, expected: context.plateNumber, ocr_plates: ocrPlates })]
            : [];
    }

    const printed = normalizePlate(extraction?.vehicle_plate);
    if (!printed) {
        const other = ocrPlates.find((plate) => plateDistance(plate, expected) > PLATE_MISREAD_DISTANCE);
        return other
            ? [reason('PLATE_MISMATCH', 'warning',
                `Văn bản quét từ ảnh có biển số ${other}, khác xe đang bảo dưỡng (${context.plateNumber}). `
                + 'Người duyệt vui lòng đối chiếu.',
                { expected: context.plateNumber, ocr_plates: ocrPlates })]
            : [];
    }
    if (printed === expected) return [];

    const shown = extraction.vehicle_plate;
    if (plateDistance(printed, expected) <= PLATE_MISREAD_DISTANCE) {
        return [reason('PLATE_MISMATCH', 'warning',
            `Biển số trên hóa đơn (${shown}) lệch một ký tự so với xe đang bảo dưỡng (${context.plateNumber}) `
            + '— có thể do ảnh mờ. Người duyệt vui lòng đối chiếu.',
            { on_bill: shown, expected: context.plateNumber })];
    }

    return [reason('PLATE_MISMATCH', 'error',
        `Hóa đơn ghi biển số ${shown}, không phải xe đang bảo dưỡng (${context.plateNumber}). `
        + 'Vui lòng tải hóa đơn của đúng xe này.',
        { on_bill: shown, expected: context.plateNumber, ocr_plates: ocrPlates })];
};

const checkContext = (extraction, context) => {
    const reasons = [];

    // ── Biển số ──
    reasons.push(...checkPlate(extraction, context));

    // ── Ngày ──
    const issued = toDay(extraction?.issued_date);
    const today = toDay(context?.today ?? new Date());

    if (issued !== null && today !== null && issued > today) {
        reasons.push(reason('FUTURE_DATE', 'error',
            `Ngày trên hóa đơn (${extraction.issued_date}) nằm ở tương lai. Vui lòng kiểm tra lại chứng từ.`));
        return reasons;
    }

    const windowStart = toDay(context?.windowStart);
    const windowEnd = toDay(context?.windowEnd) ?? today;
    if (issued !== null && windowStart !== null) {
        const from = windowStart - THRESHOLDS.WINDOW_BEFORE_DAYS * DAY_MS;
        const to = (windowEnd ?? windowStart) + THRESHOLDS.WINDOW_AFTER_DAYS * DAY_MS;
        if (issued < from || issued > to) {
            reasons.push(reason('DATE_OUTSIDE_WINDOW', 'warning',
                `Ngày hóa đơn (${extraction.issued_date}) nằm ngoài khoảng thời gian của đợt bảo dưỡng này. `
                + 'Người duyệt vui lòng kiểm tra đây có đúng hóa đơn của đợt này không.',
                { issued_date: extraction.issued_date }));
        }
    }

    return reasons;
};

// ─── Phán quyết ──────────────────────────────────────────────────────────────

const resolveVerdict = (reasons) => {
    if (reasons.some((r) => r.severity === 'error')) return 'rejected';
    if (reasons.some((r) => r.severity === 'warning')) return 'needs_review';
    return 'passed';
};

/**
 * Chạy toàn bộ kiểm tra trên một bản trích xuất.
 *
 * Ba trạng thái thay cho hợp lệ/không hợp lệ:
 *   passed        — mọi kiểm tra đạt, người duyệt chỉ xem lướt
 *   needs_review  — có điểm cần người nhìn; VẪN LƯU, kèm danh sách việc phải kiểm
 *   rejected      — vi phạm rõ ràng, chặn tại chỗ kèm lý do cụ thể
 *
 * Cách chia này sửa đúng chỗ hỏng của lớp cũ: fail-open biến mọi sự cố hạ tầng thành
 * "hợp lệ", tức là không còn ai nhìn lại khoản đó nữa.
 *
 * @param {object} extraction  JSON do model trả về (đã qua normalizeExtraction)
 * @param {object} context     { claimedAmount, plateNumber, windowStart, windowEnd, today,
 *                               keywordIndex, profile } — `profile` là mã loại chi phí
 *                               ('maintenance', 'fuel', 'toll'...), quyết định hạng mục
 *                               nào được coi là đúng chủ đề.
 *                               `imageQuality` là kết quả chấm ảnh của giai đoạn 1;
 *                               `corroboration` là kết quả đối chiếu chéo với kênh OCR
 *                               (receiptCrossCheck). Cả hai đều được phép vắng mặt —
 *                               thiếu thì đơn giản là bớt một lớp kiểm tra, không đổi
 *                               cách chấm của những lớp còn lại.
 */
const evaluateReceipt = (extraction, context = {}) => {
    const keywordIndex = context.keywordIndex ?? taxonomy.buildKeywordIndex();
    const profile = taxonomy.getProfile(context.profile ?? 'maintenance');
    const accepted = profile.accepted ? new Set(profile.accepted) : null;

    const items = markTopicality(classifyLineItems(extraction?.line_items, keywordIndex), accepted);
    const groups = summarizeGroups(items);

    const reasons = [];

    // Chất lượng ảnh xét TRƯỚC nội dung: ảnh không đủ để đọc thì mọi kết luận rút ra
    // từ nó đều không đáng tin, và lý do trả cho tài xế phải là "chụp lại đi" chứ
    // không phải một lỗi nội dung khó hiểu do đọc nhầm trên ảnh mờ.
    const qualityReasons = Array.isArray(context.imageQuality?.reasons) ? context.imageQuality.reasons : [];
    reasons.push(...qualityReasons);
    if (qualityReasons.some((r) => r.severity === 'error')) {
        return {
            verdict: 'rejected',
            reasons,
            items,
            groups,
            totals: null,
            receipt_total: null,
            confidence: 0,
            confidence_label: 'thấp',
        };
    }

    // Không phải chứng từ / sai loại / không có dòng hàng thì các kiểm tra sau vô nghĩa.
    const documentReasons = checkDocument(extraction, items);
    reasons.push(...documentReasons);
    if (documentReasons.some((r) => r.severity === 'error')) {
        return {
            verdict: 'rejected',
            reasons,
            items,
            groups,
            totals: null,
            receipt_total: null,
            confidence: context.corroboration?.confidence ?? null,
            confidence_label: context.corroboration?.confidence_label ?? null,
        };
    }

    const arithmetic = checkArithmetic(extraction, items);
    reasons.push(...arithmetic.reasons);
    reasons.push(...checkCategories(items, groups, profile));
    // 'ceiling' = số khai chỉ là trần (lúc upload từng ảnh, có thể còn hóa đơn khác);
    // mặc định = đối chiếu đích danh (lúc hoàn tất, đã biết đủ hóa đơn).
    reasons.push(...(context.claimedAmountMode === 'ceiling'
        ? checkClaimedCeiling(context.claimedAmount, arithmetic.receiptTotal)
        : checkClaimedAmount(context.claimedAmount, arithmetic.receiptTotal, arithmetic.totals)));
    reasons.push(...checkContext(extraction, context));

    // Trùng hóa đơn do tầng dịch vụ tra DB rồi truyền vào — file này không đụng I/O.
    reasons.push(...checkDuplicates(context.duplicateMatches, {
        entityType: context.entityType ?? 'maintenance_record',
        entityId: context.entityId ?? null,
        imageUrl: context.imageUrl ?? null,
    }));

    const unreadable = Array.isArray(extraction?.unreadable_fields) ? extraction.unreadable_fields : [];
    if (unreadable.length > 0) {
        reasons.push(reason('PARTIAL_READ', 'warning',
            `Không đọc rõ ${unreadable.length} trường trên hóa đơn (${unreadable.join(', ')}).`,
            { fields: unreadable }));
    }

    // Đối chiếu chéo với kênh OCR do tầng dịch vụ chạy rồi truyền vào — file này không
    // đụng I/O. Mọi lý do từ đó đều là cảnh báo, không cái nào chặn được tài xế: bằng
    // chứng OCR quá nhiễu để dùng làm căn cứ từ chối (xem receiptCrossCheck).
    const corroboration = context.corroboration ?? null;
    reasons.push(...(corroboration?.reasons ?? []));

    // Chốt bằng một lớp CHUNG: kể cả khi không lý do cụ thể nào bật lên, độ tin cậy
    // thấp tự nó đã là lý do để có người nhìn lại. Không có lớp này thì một hóa đơn
    // mà mọi phép kiểm đều "không đủ dữ liệu để kết luận" sẽ lặng lẽ được `passed` —
    // đúng cái bẫy fail-open mà cả thiết kế này sinh ra để tránh.
    const confidence = corroboration?.confidence ?? null;
    if (confidence !== null && confidence < CONFIDENCE.REVIEW) {
        reasons.push(reason('LOW_CONFIDENCE', 'warning',
            `Độ tin cậy của lần đọc này chỉ ở mức ${Math.round(confidence * 100)}%. `
            + 'Người duyệt vui lòng đối chiếu trực tiếp với ảnh hóa đơn.',
            { confidence, penalties: corroboration.penalties }));
    }

    return {
        verdict: resolveVerdict(reasons),
        reasons,
        items,
        groups,
        totals: arithmetic.totals,
        receipt_total: arithmetic.receiptTotal,
        confidence,
        confidence_label: corroboration?.confidence_label ?? null,
    };
};

/** Câu tóm tắt ngắn để trả cho tài xế khi bị chặn. */
const firstErrorMessage = (reasons) =>
    reasons.find((r) => r.severity === 'error')?.message ?? null;

module.exports = {
    THRESHOLDS,
    normalizePlate,
    classifyLineItems,
    markTopicality,
    summarizeGroups,
    checkArithmetic,
    checkDocument,
    checkCategories,
    checkClaimedAmount,
    checkClaimedCeiling,
    checkContext,
    checkDuplicates,
    checkCostOutlier,
    pickComparableCosts,
    invoiceIdentity,
    OUTLIER,
    evaluateReceipt,
    resolveVerdict,
    firstErrorMessage,
};
