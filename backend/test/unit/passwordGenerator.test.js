/**
 * L1 Unit Test — utils/passwordGenerator
 *
 * Mật khẩu tạm do quản trị viên cấp: sinh ngẫu nhiên (không còn cố định '123123' như
 * bản cũ), đủ 4 nhóm ký tự, và cố ý LOẠI các ký tự dễ nhầm khi đọc lại qua điện thoại
 * (0/O, 1/l/I) — tài xế thường được đọc mật khẩu qua điện thoại chứ không copy/paste.
 *
 * Hàm ngẫu nhiên nên không assert giá trị cụ thể; assert các BẤT BIẾN phải luôn đúng,
 * lặp nhiều lượt để không phụ thuộc may rủi của một lần chạy.
 */
const { generateRandomPassword } = require('../../utils/passwordGenerator');

const KY_TU_DE_NHAM = ['0', 'O', '1', 'l', 'I'];
const SO_LUOT = 200;

const nhieuLuot = (n = SO_LUOT) => Array.from({ length: n }, () => generateRandomPassword());

describe('passwordGenerator.generateRandomPassword', () => {
    it('TC-UNIT-PasswordGenerator-001 — generates 10 characters by default', () => {
        expect(generateRandomPassword()).toHaveLength(10);
    });

    it('TC-UNIT-PasswordGenerator-002 — honours the requested length', () => {
        expect(generateRandomPassword(16)).toHaveLength(16);
        expect(generateRandomPassword(24)).toHaveLength(24);
    });

    it('TC-UNIT-PasswordGenerator-003 — always contains all 4 groups: uppercase, lowercase, digit, symbol', () => {
        for (const mk of nhieuLuot()) {
            expect(mk).toMatch(/[A-Z]/);
            expect(mk).toMatch(/[a-z]/);
            expect(mk).toMatch(/[0-9]/);
            expect(mk).toMatch(/[!@#$%]/);
        }
    });

    it('TC-UNIT-PasswordGenerator-004 — never contains characters that are easy to misread aloud (0, O, 1, l, I)', () => {
        for (const mk of nhieuLuot()) {
            for (const kyTu of KY_TU_DE_NHAM) {
                expect(mk).not.toContain(kyTu);
            }
        }
    });

    it('TC-UNIT-PasswordGenerator-005 — uses only characters from the declared charsets', () => {
        const hopLe = /^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%]+$/;

        for (const mk of nhieuLuot()) {
            expect(mk).toMatch(hopLe);
        }
    });

    it('TC-UNIT-PasswordGenerator-006 — produces a different password on every call, never a fixed one', () => {
        const tap = new Set(nhieuLuot());

        // 200 lượt trùng nhau vài cái là chuyện của xác suất; trùng gần hết nghĩa là
        // hàm đã quay về giá trị cố định.
        expect(tap.size).toBeGreaterThan(190);
    });

    it('TC-UNIT-PasswordGenerator-007 — shuffles the 4 required characters instead of leaving them at the front', () => {
        // Bản dựng ban đầu là [hoa, thường, số, đặc biệt, ...phần còn lại]. Nếu quên
        // bước xáo trộn thì ký tự đầu LUÔN là chữ hoa và ký tự thứ 4 LUÔN là ký tự đặc biệt.
        const dauLaHoa = nhieuLuot().filter((mk) => /[A-Z]/.test(mk[0])).length;
        const thu4LaDacBiet = nhieuLuot().filter((mk) => /[!@#$%]/.test(mk[3])).length;

        expect(dauLaHoa).toBeLessThan(SO_LUOT);
        expect(thu4LaDacBiet).toBeLessThan(SO_LUOT);
    });

    it('TC-UNIT-PasswordGenerator-008 — still generates at length 4, the number of required characters (lower boundary)', () => {
        const mk = generateRandomPassword(4);

        expect(mk).toHaveLength(4);
        expect(mk).toMatch(/[A-Z]/);
        expect(mk).toMatch(/[a-z]/);
        expect(mk).toMatch(/[0-9]/);
        expect(mk).toMatch(/[!@#$%]/);
    });
});
