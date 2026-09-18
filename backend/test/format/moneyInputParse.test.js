/**
 * Số tiền người dùng khai phải được lưu ĐÚNG như họ nhìn thấy, hoặc bị từ chối kèm lý do.
 *
 * Trước đây phần lẻ bị lặng lẽ làm tròn về đồng chẵn: tài xế gõ "45.5" (ý là 45,5 nghìn) ở
 * ô sửa chi phí thì máy chủ lưu 46đ, gõ "1.50" thì thành 2đ — số tiền đổi mà không ai biết.
 */
const assert = require('node:assert');

const { parseMoneyInput, requireMoney } = require('../../utils/money');

describe('parseMoneyInput — không bao giờ tự đổi số tiền', () => {
    it.each([
        [1_234_567, 1_234_567],
        ['1234567', 1_234_567],
        ['1.234.567', 1_234_567],
        // Đúng dạng NUMERIC(12,2) DB trả ra — client gửi lại nguyên văn vẫn phải qua.
        ['150000.00', 150_000],
        [455_550, 455_550],
    ])('giữ nguyên %p → %p', (input, expected) => {
        assert.deepStrictEqual(parseMoneyInput(input), { ok: true, value: expected });
    });

    it.each([45.5, '45.5', '1.50', 50_000.999, '1234567.4'])('từ chối số có phần lẻ %p thay vì làm tròn', (input) => {
        const result = parseMoneyInput(input);

        assert.strictEqual(result.ok, false);
        assert.match(result.error, /không có phần lẻ/);
        assert.match(result.error, /không tự làm tròn/);
    });

    it('lỗi phần lẻ là lỗi người nhập (400), không phải lỗi máy chủ', () => {
        assert.throws(() => requireMoney('45.5', { field: 'Số tiền' }), (err) => err.statusCode === 400);
    });

    it('ô không phải tiền (quãng đường, khối lượng) vẫn nhận phần lẻ', () => {
        assert.deepStrictEqual(parseMoneyInput('12.5', { wholeDong: false, allowZero: true }), { ok: true, value: 12.5 });
    });
});
