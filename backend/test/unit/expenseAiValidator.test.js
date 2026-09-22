/**
 * L1 Unit Test — expenseAiValidator (chống khai khống hoá đơn bằng OCR)
 *
 * Mock ĐÚNG MỘT tầng: tesseract.js (chậm + tải WASM). Toàn bộ logic bóc số, dò dòng
 * "tổng cộng", chọn tổng và so sai số 15% được chạy THẬT — đó chính là phần cần đo.
 * Mock cả tầng parse thì test chỉ còn kiểm tra chính cái mock.
 *
 * cloudinary đã được jest.config map sang test/helpers/cloudinaryJestMock.js.
 */
jest.mock('tesseract.js', () => ({ recognize: jest.fn() }));

const tesseract = require('tesseract.js');
const cloudinary = require('../../config/cloudinary');
const validator = require('../../services/expenseAiValidator');

/** Giả lập OCR trả về đúng đoạn text truyền vào */
const ocrTraVe = (text) => tesseract.recognize.mockResolvedValue({ data: { text } });

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('expenseAiValidator.matchesTotal — sai số cho phép 15%', () => {
    it('TC-UNIT-ExpenseAiValidator-001 — two equal amounts match', () => {
        expect(validator.matchesTotal(100_000, 100_000)).toBe(true);
    });

    it('TC-UNIT-ExpenseAiValidator-002 — a gap of exactly 15% still counts as a match (upper boundary)', () => {
        // tolerance = max(100000, 85000) * 0.15 = 15000; |100000-85000| = 15000 → khớp
        expect(validator.matchesTotal(100_000, 85_000)).toBe(true);
    });

    it('TC-UNIT-ExpenseAiValidator-003 — a gap slightly over 15% no longer matches', () => {
        // tolerance = 100000*0.15 = 15000; |100000-84000| = 16000 > 15000
        expect(validator.matchesTotal(100_000, 84_000)).toBe(false);
    });

    it('TC-UNIT-ExpenseAiValidator-004 — the tolerance is computed from the LARGER figure, not from the claimed one', () => {
        // tolerance = max(10000, 100000)*0.15 = 15000 nhưng |10000-100000| = 90000 → lệch
        expect(validator.matchesTotal(10_000, 100_000)).toBe(false);
    });

    it('TC-UNIT-ExpenseAiValidator-005 — a claim inflated several times over never matches', () => {
        expect(validator.matchesTotal(5_000_000, 200_000)).toBe(false);
    });
});

describe('expenseAiValidator.fmtVND', () => {
    it('TC-UNIT-ExpenseAiValidator-006 — formats the amount in Vietnamese style', () => {
        expect(validator.fmtVND(1_500_000)).toBe('1.500.000d');
    });

    it('TC-UNIT-ExpenseAiValidator-007 — treats a null or empty value as 0', () => {
        expect(validator.fmtVND(null)).toBe('0d');
        expect(validator.fmtVND(undefined)).toBe('0d');
    });
});

describe('expenseAiValidator.scanMaintenanceReceipt — dò tổng tiền trên hoá đơn', () => {
    it('TC-UNIT-ExpenseAiValidator-008 — takes the number right after the total keyword', async () => {
        ocrTraVe('Xang dau 30.000\nRua xe 15.000\nTổng cộng: 45.000');

        const r = await validator.scanMaintenanceReceipt('https://cdn/hd.jpg', {});

        expect(r).toMatchObject({ valid: true, receiptTotal: 45_000 });
    });

    it('TC-UNIT-ExpenseAiValidator-009 — recognises the keyword without diacritics, Tesseract often drops them', async () => {
        ocrTraVe('Muc 1 30.000\nTong cong tien thanh toan 45.000');

        expect((await validator.scanMaintenanceReceipt('u', {})).receiptTotal).toBe(45_000);
    });

    it('TC-UNIT-ExpenseAiValidator-010 — recognises a number glued to its currency suffix (20,000VND)', async () => {
        ocrTraVe('Tongcongtienhanghang:| 20,000VND|');

        expect((await validator.scanMaintenanceReceipt('u', {})).receiptTotal).toBe(20_000);
    });

    it('TC-UNIT-ExpenseAiValidator-011 — picks the LARGEST figure when several total lines are present', async () => {
        ocrTraVe('Tổng cộng: 45.000\nTotal payment: 49.500');

        expect((await validator.scanMaintenanceReceipt('u', {})).receiptTotal).toBe(49_500);
    });

    it('TC-UNIT-ExpenseAiValidator-012 — with no keyword it picks the MOST FREQUENT number, even when that is NOT the largest', async () => {
        // 45.000 in hai lần (bảng + dòng khách trả) → đó là tổng, dù 90.000 lớn hơn.
        // Cố ý để số lớn nhất KHÁC số hay lặp nhất: nếu bỏ chiến lược tần suất mà rơi
        // thẳng về "lấy số lớn nhất" thì test này phải đỏ.
        ocrTraVe('Muc A 90.000\n45.000\nKhach tra 45.000');

        expect((await validator.scanMaintenanceReceipt('u', {})).receiptTotal).toBe(45_000);
    });

    it('TC-UNIT-ExpenseAiValidator-013 — with no keyword and all numbers unique it picks the largest', async () => {
        ocrTraVe('12.000\n7.500\n99.000\n3.200');

        expect((await validator.scanMaintenanceReceipt('u', {})).receiptTotal).toBe(99_000);
    });

    it('TC-UNIT-ExpenseAiValidator-014 — rejects an image with no readable amount and explains how to re-shoot it', async () => {
        ocrTraVe('HOA DON BAN LE\nkhong co so nao ca');

        const r = await validator.scanMaintenanceReceipt('u', {});

        expect(r.valid).toBe(false);
        expect(r.receiptTotal).toBeNull();
        expect(r.reject_reason).toMatch(/Không đọc được số tiền/);
    });

    it('TC-UNIT-ExpenseAiValidator-015 — short numbers such as quantity, date or code are not read as money', async () => {
        ocrTraVe('So luong 12\nMa 999\nNgay 05');

        expect((await validator.scanMaintenanceReceipt('u', {})).valid).toBe(false);
    });

    it('TC-UNIT-ExpenseAiValidator-034 — a money-shaped number worth less than 1.000 is still rejected', async () => {
        // "0.999" khớp mẫu nhóm 3 chữ số nhưng quy ra 999 — dưới ngưỡng giá hợp lệ.
        // Đây là ca duy nhất chạm được vào chốt chặn giá trị tối thiểu.
        ocrTraVe('Tong cong 0.999');

        expect((await validator.scanMaintenanceReceipt('u', {})).valid).toBe(false);
    });

    it('TC-UNIT-ExpenseAiValidator-035 — a number over the 500 million ceiling is rejected (upper boundary), OCR misread an invoice code', async () => {
        ocrTraVe('Tong cong 999.999.999');

        expect((await validator.scanMaintenanceReceipt('u', {})).valid).toBe(false);
    });

    it('TC-UNIT-ExpenseAiValidator-016 — the amount 1.000 sits exactly on the lower boundary and is accepted', async () => {
        ocrTraVe('Tong cong 1.000');

        expect((await validator.scanMaintenanceReceipt('u', {})).receiptTotal).toBe(1_000);
    });

    it('TC-UNIT-ExpenseAiValidator-017 — an over-long digit string, an invoice code, is not read as money', async () => {
        // 1234567890123 dài hơn 9 chữ số → không khớp mẫu giá tiền
        ocrTraVe('Ma hoa don 1234567890123');

        expect((await validator.scanMaintenanceReceipt('u', {})).valid).toBe(false);
    });

    it('TC-UNIT-ExpenseAiValidator-018 — an OCR failure fails open so the driver is not wrongly blocked', async () => {
        tesseract.recognize.mockRejectedValue(new Error('WASM crash'));

        const r = await validator.scanMaintenanceReceipt('u', { amount: 5_000_000 });

        expect(r).toEqual({ valid: true, receiptTotal: null, reject_reason: null });
    });

    it('TC-UNIT-ExpenseAiValidator-019 — a known cost matching the receipt total is valid', async () => {
        ocrTraVe('Tổng cộng: 2.000.000');

        expect((await validator.scanMaintenanceReceipt('u', { amount: 2_000_000 })).valid).toBe(true);
    });

    it('TC-UNIT-ExpenseAiValidator-020 — a known cost outside the tolerance is rejected', async () => {
        ocrTraVe('Tổng cộng: 200.000');

        const r = await validator.scanMaintenanceReceipt('u', { amount: 5_000_000 });

        expect(r.valid).toBe(false);
        expect(r.receiptTotal).toBe(200_000);
        expect(r.reject_reason).toMatch(/không khớp chi phí đã nhập/);
    });

    it('TC-UNIT-ExpenseAiValidator-021 — with no cost entered yet, only image readability is checked', async () => {
        ocrTraVe('Tổng cộng: 200.000');

        expect((await validator.scanMaintenanceReceipt('u', { amount: null })).valid).toBe(true);
        expect((await validator.scanMaintenanceReceipt('u', {})).valid).toBe(true);
    });

    it('TC-UNIT-ExpenseAiValidator-022 — a cost of 0 does not trigger the amount comparison either', async () => {
        ocrTraVe('Tổng cộng: 200.000');

        expect((await validator.scanMaintenanceReceipt('u', { amount: 0 })).valid).toBe(true);
    });

    it('TC-UNIT-ExpenseAiValidator-023 — OCR reads both Vietnamese and English', async () => {
        ocrTraVe('Tổng cộng: 45.000');

        await validator.scanMaintenanceReceipt('https://cdn/hd.jpg', {});

        expect(tesseract.recognize).toHaveBeenCalledWith(
            'https://cdn/hd.jpg', 'vie+eng', expect.any(Object),
        );
    });
});

describe('expenseAiValidator.validateExpenseReceipt', () => {
    it('TC-UNIT-ExpenseAiValidator-024 — a claim matching the receipt total is valid', async () => {
        ocrTraVe('Tổng cộng: 500.000');

        expect(await validator.validateExpenseReceipt('u', { amount: 500_000, expenseType: 'fuel' }))
            .toEqual({ valid: true, reject_reason: null });
    });

    it('TC-UNIT-ExpenseAiValidator-025 — a claim off the receipt total is rejected and both figures are stated', async () => {
        ocrTraVe('Tổng cộng: 200.000');

        const r = await validator.validateExpenseReceipt('u', { amount: 5_000_000, expenseType: 'fuel' });

        expect(r.valid).toBe(false);
        expect(r.reject_reason).toContain('5.000.000d');
        expect(r.reject_reason).toContain('200.000d');
    });

    it('TC-UNIT-ExpenseAiValidator-026 — rejects an image with no readable amount', async () => {
        ocrTraVe('anh mo khong doc duoc');

        const r = await validator.validateExpenseReceipt('u', { amount: 100_000, expenseType: 'fuel' });

        expect(r.valid).toBe(false);
        expect(r.reject_reason).toMatch(/chụp rõ hơn/);
    });

    it('TC-UNIT-ExpenseAiValidator-027 — a broken OCR lets the claim through, fail-open, the manager decides last', async () => {
        tesseract.recognize.mockRejectedValue(new Error('OCR timeout'));

        expect(await validator.validateExpenseReceipt('u', { amount: 9_999_999, expenseType: 'fuel' }))
            .toEqual({ valid: true, reject_reason: null });
    });
});

describe('expenseAiValidator.readReceiptTotal', () => {
    it('TC-UNIT-ExpenseAiValidator-028 — returns the figure when the total can be read', async () => {
        ocrTraVe('Tổng cộng: 1.200.000');

        expect(await validator.readReceiptTotal('u')).toBe(1_200_000);
    });

    it('TC-UNIT-ExpenseAiValidator-029 — returns null on an unreadable image, the caller decides whether to fail open', async () => {
        ocrTraVe('khong co so');

        expect(await validator.readReceiptTotal('u')).toBeNull();
    });

    it('TC-UNIT-ExpenseAiValidator-030 — returns null on an OCR failure instead of throwing', async () => {
        tesseract.recognize.mockRejectedValue(new Error('crash'));

        expect(await validator.readReceiptTotal('u')).toBeNull();
    });
});

describe('expenseAiValidator.deleteUploadedFile', () => {
    it('TC-UNIT-ExpenseAiValidator-031 — calls Cloudinary delete when a publicId is supplied', async () => {
        await validator.deleteUploadedFile('expenses/abc123');

        expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('expenses/abc123');
    });

    it('TC-UNIT-ExpenseAiValidator-032 — calls nothing when there is no publicId', async () => {
        await validator.deleteUploadedFile(null);

        expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
    });

    it('TC-UNIT-ExpenseAiValidator-033 — swallows a Cloudinary failure so the calling flow is unaffected', async () => {
        cloudinary.uploader.destroy.mockRejectedValueOnce(new Error('network'));

        await expect(validator.deleteUploadedFile('expenses/abc123')).resolves.toBeUndefined();
    });
});
