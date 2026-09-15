const assert = require('node:assert');
const { normalizeHireDate } = require('../../utils/userValidation');

// Ngày vào làm quyết định tháng đầu tiên được tính bao nhiêu công — sai một ngày là sai
// lương, nên phải là ngày lịch có thật.
describe('normalizeHireDate — ngày vào làm của tài xế', () => {
    it('bỏ trống → null (sửa: giữ nguyên, tạo mới: lấy ngày tạo)', () => {
        for (const v of [undefined, null, '', '   ']) {
            assert.strictEqual(normalizeHireDate(v), null);
        }
    });

    it('ngày hợp lệ → YYYY-MM-DD, bỏ phần giờ nếu có', () => {
        assert.strictEqual(normalizeHireDate('2026-09-25'), '2026-09-25');
        assert.strictEqual(normalizeHireDate(' 2026-09-25T00:00:00.000Z '), '2026-09-25');
    });

    it('ngày không có thật bị chặn (new Date tự lăn 30/02 sang 02/03)', () => {
        assert.throws(() => normalizeHireDate('2026-02-30'), /Ngày vào làm không hợp lệ/);
        assert.throws(() => normalizeHireDate('2026-13-01'), /Ngày vào làm không hợp lệ/);
    });

    it('sai định dạng bị chặn', () => {
        assert.throws(() => normalizeHireDate('25/09/2026'), /định dạng YYYY-MM-DD/);
        assert.throws(() => normalizeHireDate(20260925), /Ngày vào làm không hợp lệ/);
    });

    it('trước năm 2000 hoặc xa hơn 1 năm tới bị chặn — gần như chắc chắn gõ nhầm năm', () => {
        assert.throws(() => normalizeHireDate('1999-12-31'), /Ngày vào làm không hợp lệ/);
        const farYear = new Date().getFullYear() + 2;
        assert.throws(() => normalizeHireDate(`${farYear}-01-01`), /quá 1 năm/);
    });

    it('ngày tương lai gần vẫn được — tạo tài khoản trước ngày nhận việc', () => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        const iso = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        assert.strictEqual(normalizeHireDate(iso), iso);
    });
});
