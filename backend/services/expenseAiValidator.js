const Tesseract = require('tesseract.js');
const cloudinary = require('../config/cloudinary');

const AMOUNT_TOLERANCE = 0.15;
const OCR_TIMEOUT_MS   = 25_000;

const fmtVND = (n) => Number(n || 0).toLocaleString('vi-VN') + 'd';

// ─── Number extraction ───────────────────────────────────────────────────────

/**
 * Parse "85.000" | "85,000" | "85000" -> 85000.
 * Returns null when outside valid price range.
 */
const parseAmount = (raw) => {
    const n = Number(raw.replace(/[.,\s]/g, ''));
    return Number.isFinite(n) && n >= 1_000 && n <= 500_000_000 ? n : null;
};

/**
 * Extract all plausible price amounts from OCR text.
 * Does NOT use \b at the end so "20,000VND" / "20,000VNĐ" are captured
 * even when the currency suffix is glued to the number (common in Tesseract output).
 */
const extractAmounts = (text) => {
    // Match formatted numbers (20,000 / 20.000) OR plain 4-9 digit numbers.
    // Manual start/end digit guards replace \b to avoid the "glued suffix" problem.
    const re = /\d{1,3}(?:[.,]\d{3})+|\d{4,9}/g;
    const result = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > 0 && /\d/.test(text[m.index - 1])) continue;       // part of longer num
        if (/\d/.test(text[m.index + m[0].length] ?? '')) continue;      // part of longer num
        const n = parseAmount(m[0]);
        if (n) result.push(n);
    }
    return result;
};

// ─── Total-line detection ────────────────────────────────────────────────────

/**
 * Scan the full OCR text for a total-keyword followed (on the same line, within
 * 90 chars) by the first valid price number.
 *
 * Works even when Tesseract merges words without spaces, e.g.:
 *   "Tongcongtienhanghang:| 20,000VND|"
 *
 * Keyword list covers both diacritic and ASCII (no-diacritic) spellings because
 * Tesseract sometimes strips Vietnamese diacritics.
 */
const KEYWORD_TOTAL_RE = new RegExp(
    '(?:' + [
        'tổng cộng tiền thanh toán',
        'tổng cộng tiền',
        'tổng cộng',
        'tong cong tien thanh toan',
        'tong cong tien',
        'tong cong',
        'total payment',
        'grand total',
        'amount due',
        'subtotal',
        'thành tiền',
        'thanh tien',
        'thanh toán',
        'thanh toan',
        'phải trả',
        'phai tra',
        'tổng tiền',
        'tong tien',
        'total',
        'tổng',
        'tong',
        'cộng',
        'cong',
    ].join('|') + ')' +
    '[^\\n\\r]{0,90}?' +                    // up to 90 non-newline chars (lazy)
    '(\\d{1,3}(?:[.,]\\d{3})+|\\d{4,9})',  // first number after keyword
    'gi',
);

const findKeywordTotals = (text) => {
    const found = [];
    KEYWORD_TOTAL_RE.lastIndex = 0;
    let m;
    while ((m = KEYWORD_TOTAL_RE.exec(text)) !== null) {
        const n = parseAmount(m[1]);
        if (n) found.push(n);
    }
    return found;
};

// ─── Resolve receipt total ───────────────────────────────────────────────────

/**
 * Determine the total amount shown on the receipt.
 *
 * Strategy (in order):
 *   1. Numbers found after total-keywords → take the LARGEST.
 *      (Handles "Tổng cộng: 45,000" and "TOTAL PAYMENT: 45,000".)
 *   2. Fallback: find the number that appears MOST FREQUENTLY in the text.
 *      (Totals are often printed twice — once in the table, once in the summary.)
 *   3. Last resort: largest number overall.
 */
const resolveReceiptTotal = (ocrText, allAmounts) => {
    // Strategy 1 — keyword lines
    const keywordTotals = findKeywordTotals(ocrText);
    if (keywordTotals.length > 0) {
        return Math.max(...keywordTotals);
    }

    if (allAmounts.length === 0) return null;

    // Strategy 2 — most frequent number
    const freq = {};
    for (const n of allAmounts) freq[n] = (freq[n] || 0) + 1;
    const maxFreq = Math.max(...Object.values(freq));
    if (maxFreq > 1) {
        const candidates = allAmounts.filter((n) => freq[n] === maxFreq);
        return Math.max(...candidates);
    }

    // Strategy 3 — largest number
    return Math.max(...allAmounts);
};

// ─── Tolerance check ─────────────────────────────────────────────────────────

const matchesTotal = (claimed, receiptTotal) => {
    const tolerance = Math.max(claimed, receiptTotal) * AMOUNT_TOLERANCE;
    return Math.abs(claimed - receiptTotal) <= tolerance;
};

// ─── OCR helper ──────────────────────────────────────────────────────────────

const withTimeout = (promise, ms) =>
    Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('OCR timeout')), ms),
        ),
    ]);

// ─── Main validator ──────────────────────────────────────────────────────────

/**
 * Validate an expense receipt image via OCR.
 *
 * Rules:
 *   - The claimed amount must match the TOTAL on the receipt (not a line item).
 *   - Fail-open on OCR error / timeout so drivers are never hard-blocked.
 *
 * @param {string} imageUrl   - Publicly accessible URL of the receipt image.
 * @param {{ amount: number|string, expenseType: string }} opts
 * @returns {{ valid: boolean, reject_reason: string|null }}
 */
const validateExpenseReceipt = async (imageUrl, { amount, expenseType }) => {
    const claimed = Number(amount);

    let ocrText;
    try {
        const result = await withTimeout(
            Tesseract.recognize(imageUrl, 'vie+eng', { logger: () => {} }),
            OCR_TIMEOUT_MS,
        );
        ocrText = result.data.text || '';
    } catch (err) {
        console.warn('[OCR] Failed / timed out — allowing through:', err.message);
        return { valid: true, reject_reason: null };
    }

    const allAmounts = extractAmounts(ocrText);

    if (allAmounts.length === 0) {
        return {
            valid: false,
            reject_reason: 'Không đọc được số tiền từ ảnh. Vui lòng chụp rõ hơn, đủ ánh sáng.',
        };
    }

    const receiptTotal = resolveReceiptTotal(ocrText, allAmounts);

    if (!receiptTotal) {
        return {
            valid: false,
            reject_reason: 'Không xác định được tổng tiền hóa đơn. Vui lòng chụp rõ toàn bộ hóa đơn.',
        };
    }

    if (!matchesTotal(claimed, receiptTotal)) {
        return {
            valid: false,
            reject_reason: `Số tiền khai (${fmtVND(claimed)}) không khớp với tổng hóa đơn (${fmtVND(receiptTotal)}). Vui lòng chụp đúng hóa đơn của khoản chi phí này.`,
        };
    }

    return { valid: true, reject_reason: null };
};

// ─── Cloudinary cleanup ───────────────────────────────────────────────────────

const deleteUploadedFile = async (publicId) => {
    if (!publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (err) {
        console.warn('[OCR] Cannot delete Cloudinary file:', publicId, err.message);
    }
};

module.exports = { validateExpenseReceipt, deleteUploadedFile };
