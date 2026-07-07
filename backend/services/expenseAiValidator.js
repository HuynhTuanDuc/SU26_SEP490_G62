const Tesseract = require('tesseract.js');
const cloudinary = require('../config/cloudinary');

// Chênh lệch cho phép giữa số tiền OCR đọc và driver nhập (15%)
const AMOUNT_TOLERANCE = 0.15;

// Timeout tối đa cho OCR (ms) — fail-open nếu quá thời gian
const OCR_TIMEOUT_MS = 20_000;

/**
 * Parse số theo định dạng Việt Nam / quốc tế:
 *   85.000  →  85000
 *   85,000  →  85000
 *   1.200.000 → 1200000
 *   85000   →  85000
 */
const parseNumber = (str) => {
    const cleaned = str.replace(/[.,\s]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Trích tất cả số tiền hợp lý từ text OCR.
 * Trả về mảng các số nguyên dương trong khoảng 1.000 – 500.000.000 VNĐ.
 */
const extractAmounts = (text) => {
    // Match: 85.000 | 85,000 | 1.200.000 | 85000
    const re = /\b\d{1,3}(?:[.,]\d{3})+\b|\b\d{4,9}\b/g;
    const found = new Set();
    let m;
    while ((m = re.exec(text)) !== null) {
        const n = parseNumber(m[0]);
        if (n && n >= 1_000 && n <= 500_000_000) {
            found.add(n);
        }
    }
    return [...found];
};

const amountMatches = (amounts, claimed) => {
    const target = Number(claimed);
    const tolerance = target * AMOUNT_TOLERANCE;
    return amounts.some((a) => Math.abs(a - target) <= tolerance);
};

const withTimeout = (promise, ms) =>
    Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('OCR timeout')), ms),
        ),
    ]);

/**
 * Validate ảnh hóa đơn bằng OCR.
 * - Đọc số tiền từ ảnh
 * - So sánh với số driver nhập
 * - Không tìm được số → ảnh không rõ → từ chối
 * - Số không khớp → từ chối
 * - OCR lỗi / timeout → fail-open (cho qua, log warning)
 *
 * @returns {{ valid: boolean, reject_reason: string|null }}
 */
const validateExpenseReceipt = async (imageUrl, { amount }) => {
    console.log(`[ExpenseOCR] Bat dau quet hoa don — so tien khai: ${Number(amount).toLocaleString('vi-VN')}d`);

    let ocrText;
    try {
        const result = await withTimeout(
            Tesseract.recognize(imageUrl, 'eng', { logger: () => {} }),
            OCR_TIMEOUT_MS,
        );
        ocrText = result.data.text || '';
        console.log(`[ExpenseOCR] OCR xong — doc duoc: "${ocrText.replace(/\n/g, ' ').trim().slice(0, 120)}"`);
    } catch (err) {
        console.warn('[ExpenseOCR] OCR that bai, cho qua:', err.message);
        return { valid: true, reject_reason: null };
    }

    const amounts = extractAmounts(ocrText);
    console.log(`[ExpenseOCR] So tien doc duoc tu anh:`, amounts);

    if (amounts.length === 0) {
        console.log('[ExpenseOCR] TU CHOI — khong doc duoc so tien nao');
        return {
            valid: false,
            reject_reason: 'Không đọc được thông tin từ ảnh. Vui lòng chụp rõ hơn, đủ ánh sáng.',
        };
    }

    if (!amountMatches(amounts, amount)) {
        console.log(`[ExpenseOCR] TU CHOI — ${Number(amount).toLocaleString('vi-VN')}d khong co trong [${amounts.join(', ')}]`);
        const claimedFmt = Number(amount).toLocaleString('vi-VN');
        return {
            valid: false,
            reject_reason: `Số tiền ${claimedFmt}đ không tìm thấy trên hóa đơn. Kiểm tra lại hoặc chụp ảnh rõ hơn.`,
        };
    }

    console.log(`[ExpenseOCR] HOP LE — so tien khop`);
    return { valid: true, reject_reason: null };
};

/**
 * Xóa ảnh khỏi Cloudinary theo public_id.
 * Gọi khi OCR reject để dọn dẹp file đã upload.
 */
const deleteUploadedFile = async (publicId) => {
    if (!publicId) return;
    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (err) {
        console.warn('[ExpenseOCR] Không thể xóa file Cloudinary:', publicId, err.message);
    }
};

module.exports = { validateExpenseReceipt, deleteUploadedFile };
