/**
 * L1 Unit Test — utils/loginIdentifier (thuần, không dependency)
 *
 * Đây là cửa vào của đăng nhập: phân loại sai thì tài xế gõ đúng số điện thoại vẫn
 * bị tra theo email và nhận "Tài khoản không tồn tại".
 */
const {
    normalizeVietnamPhone,
    classifyLoginIdentifier,
    looksLikePhoneInput,
} = require('../../utils/loginIdentifier');

describe('loginIdentifier.normalizeVietnamPhone', () => {
    it.each([
        ['0901000001', '0901000001', 'dạng nội địa chuẩn'],
        ['0901 000 001', '0901000001', 'có dấu cách'],
        ['0901-000-001', '0901000001', 'có gạch nối'],
        ['(+84) 901.000.001', '0901000001', 'dạng quốc tế có dấu cộng'],
        ['84901000001', '0901000001', 'mã quốc gia không dấu cộng'],
        ['0084901000001', '0901000001', 'quay số quốc tế bằng 00'],
        ['  0901000001  ', '0901000001', 'thừa khoảng trắng hai đầu'],
    ])('TC-UNIT-LoginIdentifier-001 — normalises "%s" to "%s" (%s)', (input, expected) => {
        expect(normalizeVietnamPhone(input)).toBe(expected);
    });

    it.each([
        ['0201000001', 'đầu số 02 cố định'],
        ['0301000001', 'đầu số 03'],
        ['0501000001', 'đầu số 05'],
        ['0701000001', 'đầu số 07'],
        ['0801000001', 'đầu số 08'],
    ])('TC-UNIT-LoginIdentifier-002 — accepts valid mobile prefix %s (%s)', (input) => {
        expect(normalizeVietnamPhone(input)).toBe(input);
    });

    it.each([
        ['0401000001', 'đầu số 04 không tồn tại'],
        ['0601000001', 'đầu số 06 không tồn tại'],
        ['0101000001', 'đầu số 01 không tồn tại'],
        ['090100000', 'thiếu 1 chữ số (9 số)'],
        ['09010000012', 'thừa 1 chữ số (11 số)'],
        ['1901000001', 'không bắt đầu bằng 0'],
    ])('TC-UNIT-LoginIdentifier-003 — rejects "%s" (%s)', (input) => {
        expect(normalizeVietnamPhone(input)).toBeNull();
    });

    it('TC-UNIT-LoginIdentifier-004 — a string containing letters is not a phone number', () => {
        expect(normalizeVietnamPhone('0901abc001')).toBeNull();
        expect(normalizeVietnamPhone('taixe@logiscount.vn')).toBeNull();
    });

    it('TC-UNIT-LoginIdentifier-005 — returns null for a non-string or empty input', () => {
        expect(normalizeVietnamPhone(null)).toBeNull();
        expect(normalizeVietnamPhone(901000001)).toBeNull();
        expect(normalizeVietnamPhone('   ')).toBeNull();
    });
});

describe('loginIdentifier.classifyLoginIdentifier', () => {
    it('TC-UNIT-LoginIdentifier-006 — classifies a valid number as phone and supplies both lookup forms', () => {
        expect(classifyLoginIdentifier('0901000001')).toEqual({
            type: 'phone', localDigits: '0901000001', intlDigits: '84901000001',
        });
    });

    it('TC-UNIT-LoginIdentifier-007 — lowercases the email and trims surrounding whitespace', () => {
        expect(classifyLoginIdentifier('  TaiXe01@LogisCount.VN  ')).toEqual({
            type: 'email', email: 'taixe01@logiscount.vn',
        });
    });

    it('TC-UNIT-LoginIdentifier-008 — an all-digit string with an invalid prefix falls back to the email path', () => {
        expect(classifyLoginIdentifier('0401000001')).toEqual({ type: 'email', email: '0401000001' });
    });

    it('TC-UNIT-LoginIdentifier-009 — a non-string input yields an empty email instead of throwing', () => {
        expect(classifyLoginIdentifier(undefined)).toEqual({ type: 'email', email: '' });
    });
});

describe('loginIdentifier.looksLikePhoneInput', () => {
    it('TC-UNIT-LoginIdentifier-010 — a string of digits and separators counts as phone-shaped input', () => {
        expect(looksLikePhoneInput('0401000001')).toBe(true);
        expect(looksLikePhoneInput('(+84) 901.000.001')).toBe(true);
    });

    it('TC-UNIT-LoginIdentifier-011 — a string with letters, or an empty one, is not phone-shaped', () => {
        expect(looksLikePhoneInput('taixe@logiscount.vn')).toBe(false);
        expect(looksLikePhoneInput('   ')).toBe(false);
        expect(looksLikePhoneInput(null)).toBe(false);
    });
});
