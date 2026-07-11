// Taxonomy chi phí (chốt 2026-07):
//   Khách chi trả (pass-through — thu hộ/chi hộ, không phải doanh thu):
//     toll    — Phí cầu đường
//     parking — Phí đỗ xe / bến bãi
//     etc     — Phí ETC (thu phí không dừng)
//   Công ty chi trả:
//     fuel    — Xăng dầu / nhiên liệu
//     repair  — Sửa xe
const ALLOWED_EXPENSE_TYPES = ['toll', 'parking', 'etc', 'fuel', 'repair'];

const PASS_THROUGH_EXPENSE_TYPES = new Set(['toll', 'parking', 'etc']);

const EXPENSE_TYPE_LABEL = Object.freeze({
    toll:    'Phí cầu đường (khách chịu)',
    parking: 'Phí đỗ xe (khách chịu)',
    etc:     'Phí ETC (khách chịu)',
    fuel:    'Xăng dầu / nhiên liệu (công ty chịu)',
    repair:  'Sửa xe (công ty chịu)',
    // Giá trị hệ thống / dữ liệu cũ — không cho chọn mới, chỉ để hiển thị
    maintenance:  'Bảo dưỡng',
    depreciation: 'Khấu hao',
    other:        'Khác',
});

module.exports = { ALLOWED_EXPENSE_TYPES, PASS_THROUGH_EXPENSE_TYPES, EXPENSE_TYPE_LABEL };
