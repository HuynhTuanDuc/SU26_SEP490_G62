const assert = require('node:assert');
const { _calcTet } = require('../../repositories/bonusRepository');

// Thưởng Tết (PDF Điều II §6): chuyên cần xét trên các tháng làm TRỌN trong năm.
//   thiếu công < 3 tháng → 1.000.000 × số tháng đủ · 3-5 → 500.000 × số tháng xét · ≥ 6 → 0
//   thâm niên 2.000.000 nếu vào làm từ năm trước
describe('_calcTet — thưởng Tết theo tháng làm trọn', () => {
    it('làm từ năm trước, không nghỉ: 12 tháng đủ + thâm niên = 14.000.000', () => {
        const r = _calcTet(1, '2020-05-10', 2025, {});
        assert.strictEqual(r.months_full_count, 12);
        assert.strictEqual(r.months_incomplete_count, 0);
        assert.strictEqual(r.seniority_bonus, 2_000_000);
        assert.strictEqual(r.attendance_bonus, 12_000_000);
        assert.strictEqual(r.total, 14_000_000);
    });

    it('vào làm 28/12: tháng 12 KHÔNG được xét (trước đây vẫn ăn 1.000.000)', () => {
        const r = _calcTet(1, '2025-12-28', 2025, {});
        assert.strictEqual(r.months_full_count, 0);
        assert.strictEqual(r.months_incomplete_count, 0);
        assert.strictEqual(r.total, 0);
    });

    it('vào làm đúng mùng 1: tháng đó được xét', () => {
        const r = _calcTet(1, '2025-10-01', 2025, {});
        assert.strictEqual(r.months_full_count, 3);
        assert.strictEqual(r.total, 3_000_000);
    });

    it('vào làm giữa tháng 3: xét từ tháng 4, tháng 3 KHÔNG bị tính là tháng thiếu công', () => {
        // Tháng 5, 6, 7 mỗi tháng nghỉ 5 công → 3 tháng thiếu → bậc 500.000 × 9 tháng xét.
        // Nếu tháng 3 bị tính là thiếu công thì thành 4 tháng thiếu / 10 tháng xét → 5.000.000.
        const r = _calcTet(1, '2025-03-15', 2025, { 5: 5, 6: 5, 7: 5 });
        assert.strictEqual(r.months_full_count, 6);
        assert.strictEqual(r.months_incomplete_count, 3);
        assert.strictEqual(r.attendance_bonus, 4_500_000);
        assert.strictEqual(r.seniority_bonus, 0);
    });

    it('nửa công tính 0.5 — tháng 2 (28 ngày, không có phần dư) có nửa công là thiếu công', () => {
        const r = _calcTet(1, '2020-01-01', 2025, { 2: 0.5 });
        assert.strictEqual(r.months_full_count, 11);
        assert.strictEqual(r.attendance_bonus, 11_000_000);
    });

    it('phần dư ngày lịch: tháng 31 ngày nghỉ tới 3 công vẫn đủ, 3.5 công là thiếu', () => {
        const r = _calcTet(1, '2020-01-01', 2025, { 1: 3, 3: 3.5 });
        assert.strictEqual(r.months_full_count, 11);
        assert.strictEqual(r.months_incomplete_count, 1);
    });

    it('vào làm sau năm tính thưởng: không có tháng nào để xét', () => {
        const r = _calcTet(1, '2026-01-05', 2025, {});
        assert.strictEqual(r.months_full_count, 0);
        assert.strictEqual(r.total, 0);
    });
});
