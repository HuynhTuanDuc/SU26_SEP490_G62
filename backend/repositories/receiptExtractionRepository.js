const pool = require('../config/database');

/**
 * Từ khoá hạng mục thêm/đè lúc chạy. Danh sách gốc nằm trong code
 * (services/receiptTaxonomy.js) — bảng này chỉ chứa phần mở rộng, để sửa được một
 * phân loại sai mà không phải chờ deploy.
 */
const getExtraKeywords = async () => {
    const result = await pool.query(
        `SELECT keyword, category, item_group
           FROM maintenance_item_keywords`,
    );
    return result.rows;
};

/**
 * Lưu vết một lần đọc hóa đơn: nguyên văn model trả về + kết quả từng kiểm tra.
 *
 * Tách bạch hai cột là có chủ đích: raw_extraction là "máy đọc được gì", checks là
 * "hệ thống kết luận gì". Khi tranh chấp thì phải chỉ ra được cả hai, và khi sửa luật
 * kiểm tra thì vẫn chấm lại được trên dữ liệu đọc cũ.
 */
const saveExtraction = async ({
    entityType, entityId, imageUrl, imageSha256,
    provider, model, promptVersion,
    rawExtraction, checks, verdict,
    claimedAmount, receiptTotal, latencyMs,
    vendorKey, invoiceNoKey,
    ocrText, ocrConfidence, ocrEngine,
    confidence, imageWidth, imageHeight, pipeline,
}) => {
    const result = await pool.query(
        `INSERT INTO receipt_extractions (
            entity_type, entity_id, image_url, image_sha256,
            provider, model, prompt_version,
            raw_extraction, checks, verdict,
            claimed_amount, receipt_total, latency_ms,
            vendor_key, invoice_no_key,
            ocr_text, ocr_confidence, ocr_engine,
            confidence, image_width, image_height, pipeline
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING id`,
        [
            entityType, entityId ?? null, imageUrl, imageSha256 ?? null,
            provider ?? null, model ?? null, promptVersion ?? null,
            rawExtraction ? JSON.stringify(rawExtraction) : null,
            JSON.stringify(checks ?? []), verdict,
            claimedAmount ?? null, receiptTotal ?? null, latencyMs ?? null,
            vendorKey ?? null, invoiceNoKey ?? null,
            ocrText ?? null, ocrConfidence ?? null, ocrEngine ?? null,
            confidence ?? null, imageWidth ?? null, imageHeight ?? null,
            pipeline ? JSON.stringify(pipeline) : null,
        ],
    );
    return result.rows[0];
};

/**
 * Tìm những lần đọc trước khớp CÙNG MỘT tờ hóa đơn.
 *
 * Hai đường nhận dạng, đủ một là khớp:
 *   * cùng băm ảnh                       — đúng một file được gửi lại
 *   * cùng (bên bán, số hóa đơn)         — cùng tờ giấy chụp lại từ góc khác
 *
 * Bỏ qua các lần đọc đã bị TỪ CHỐI: hóa đơn bị từ chối thì chưa được dùng vào đâu cả,
 * chặn lần nộp lại sau khi tài xế chụp lại cho rõ là chặn oan.
 *
 * Điều kiện `IS NOT NULL` trên tham số là bắt buộc chứ không phải phòng thủ thừa: hóa
 * đơn viết tay không có số hóa đơn, để lọt NULL vào thì mọi hóa đơn thiếu số sẽ khớp
 * lẫn nhau.
 */
const findDuplicates = async ({ imageSha256, vendorKey, invoiceNoKey, excludeId = null }) => {
    if (!imageSha256 && !(vendorKey && invoiceNoKey)) return [];

    const result = await pool.query(
        `SELECT id, entity_type, entity_id, image_url, image_sha256,
                vendor_key, invoice_no_key, receipt_total::text, verdict, created_at
           FROM receipt_extractions
          WHERE verdict <> 'rejected'
            AND ($4::int IS NULL OR id <> $4)
            AND (
                  ($1::text IS NOT NULL AND image_sha256 = $1)
               OR ($2::text IS NOT NULL AND $3::text IS NOT NULL
                   AND vendor_key = $2 AND invoice_no_key = $3)
            )
          ORDER BY created_at DESC
          LIMIT 10`,
        [imageSha256 ?? null, vendorKey ?? null, invoiceNoKey ?? null, excludeId],
    );
    return result.rows;
};

/**
 * Lần đọc gần nhất của đúng tấm ảnh này.
 *
 * Tài xế up ảnh (quét lần 1) rồi mới nhập tiền và bấm hoàn tất (cần quét lại để đối
 * chiếu số tiền). Đọc lại từ đây thay vì gọi model lần nữa: cùng một tấm ảnh thì kết
 * quả đọc không đổi, chỉ có phép đối chiếu số tiền là mới.
 */
const findLatestByImageUrl = async (imageUrl) => {
    const result = await pool.query(
        `SELECT id, image_url, image_sha256, raw_extraction, verdict, receipt_total,
                provider, model, prompt_version,
                -- Lấy kèm text OCR để bước hoàn tất khỏi phải quét lại: quét lại tốn
                -- khoảng 10 giây CPU mỗi tấm mà kết quả không thể khác đi, ảnh vẫn thế.
                ocr_text, ocr_confidence, ocr_engine, confidence
           FROM receipt_extractions
          WHERE image_url = $1 AND raw_extraction IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 1`,
        [imageUrl],
    );
    return result.rows[0] ?? null;
};

/** Mọi lần đọc hóa đơn của một khoản, mới nhất trước — dùng cho màn hình duyệt. */
const listByEntity = async (entityType, entityId) => {
    const result = await pool.query(
        `SELECT re.id, re.image_url, re.verdict, re.checks, re.raw_extraction,
                re.receipt_total::text, re.claimed_amount::text,
                re.provider, re.model, re.prompt_version, re.latency_ms,
                re.ocr_text, re.ocr_confidence::text, re.ocr_engine,
                re.confidence::text, re.image_width, re.image_height, re.pipeline,
                re.review_action, re.review_note, re.reviewed_at, re.reviewed_by,
                p.full_name AS reviewed_by_name,
                re.created_at
           FROM receipt_extractions re
           LEFT JOIN profiles p ON p.id = re.reviewed_by
          WHERE re.entity_type = $1 AND re.entity_id = $2
          ORDER BY re.created_at DESC`,
        [entityType, entityId],
    );
    return result.rows;
};

/**
 * Ghi lại phán quyết của người duyệt.
 *
 * Cột review_action là dữ liệu quý nhất của cả tính năng: mỗi lần người duyệt GHI ĐÈ
 * là một lần máy sai, và đó là thứ đo được độ chính xác thật cũng như chỉ ra chỗ cần
 * bổ sung từ điển.
 */
const saveReview = async (id, { reviewedBy, action, note }) => {
    const result = await pool.query(
        `UPDATE receipt_extractions
            SET review_action = $2, review_note = $3, reviewed_by = $4, reviewed_at = NOW()
          WHERE id = $1
      RETURNING id, verdict, review_action, review_note, reviewed_at, reviewed_by`,
        [id, action, note ?? null, reviewedBy ?? null],
    );
    return result.rows[0] ?? null;
};

/**
 * Bổ sung từ khoá hạng mục học được từ lần duyệt tay.
 *
 * Đây là vòng phản hồi: người duyệt sửa một phân loại sai là từ điển lớn lên, lần sau
 * máy tự nhận ra. Trùng từ khoá thì ghi đè phân loại — coi lần sửa mới nhất là đúng.
 */
const addKeywords = async (keywords, createdBy) => {
    if (!Array.isArray(keywords) || keywords.length === 0) return [];

    const values = [];
    const params = [];
    keywords.forEach((row, i) => {
        const base = i * 4;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'learned', $${base + 4})`);
        params.push(row.keyword, row.category, row.item_group, createdBy ?? null);
    });

    const result = await pool.query(
        `INSERT INTO maintenance_item_keywords (keyword, category, item_group, source, created_by)
         VALUES ${values.join(', ')}
         ON CONFLICT (keyword) DO UPDATE
            SET category = EXCLUDED.category,
                item_group = EXCLUDED.item_group,
                source = 'learned',
                created_by = EXCLUDED.created_by
         RETURNING keyword, category, item_group`,
        params,
    );
    return result.rows;
};

module.exports = {
    getExtraKeywords,
    saveExtraction,
    findLatestByImageUrl,
    findDuplicates,
    listByEntity,
    saveReview,
    addKeywords,
};
