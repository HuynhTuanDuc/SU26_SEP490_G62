/**
 * L1 Unit Test — expenseConstants (quy tắc thuần, không phụ thuộc gì)
 *
 * Đây là chỗ quyết định AI CHỊU một khoản chi: khách (chi hộ, cộng vào phiếu thu)
 * hay doanh nghiệp. Sai ở đây thì hoặc là bắt khách trả cho chuyến làm hỏng hàng,
 * hoặc treo số dư 3388 không bao giờ thu được.
 */
const {
    ALLOWED_EXPENSE_TYPES,
    isCompanyBorneShipment,
    isCustomerBillableExpense,
    CUSTOMER_BILLABLE_EXPENSE_SQL,
} = require('../../constants/expenseConstants');

describe('expenseConstants.isCustomerBillableExpense', () => {
    it.each([
        ['toll', 'completed', true],
        ['parking', 'completed', true],
        ['etc', 'completed', true],
        ['fuel', 'completed', false],
        ['repair', 'completed', false],
    ])('TC-UNIT-ExpenseConstants-001 — normal shipment: %s is billed to the customer = %s', (type, status, expected) => {
        expect(isCustomerBillableExpense(type, status)).toBe(expected);
    });

    it('TC-UNIT-ExpenseConstants-002 — cancelled shipment shifts the toll fee onto the company', () => {
        expect(isCustomerBillableExpense('toll', 'cancelled')).toBe(false);
    });

    it('TC-UNIT-ExpenseConstants-003 — failed delivery shifts the parking fee onto the company as well', () => {
        expect(isCustomerBillableExpense('parking', 'failed')).toBe(false);
    });

    it('TC-UNIT-ExpenseConstants-004 — expense type with surrounding whitespace is still recognised', () => {
        expect(isCustomerBillableExpense(' toll ', 'completed')).toBe(true);
    });

    it('TC-UNIT-ExpenseConstants-005 — empty or null expense type is never billed to the customer', () => {
        expect(isCustomerBillableExpense(null, 'completed')).toBe(false);
        expect(isCustomerBillableExpense('', 'completed')).toBe(false);
    });
});

describe('expenseConstants.isCompanyBorneShipment', () => {
    it('TC-UNIT-ExpenseConstants-006 — cancelled and failed are the two company-borne shipment statuses', () => {
        expect(isCompanyBorneShipment('cancelled')).toBe(true);
        expect(isCompanyBorneShipment('failed')).toBe(true);
    });

    it('TC-UNIT-ExpenseConstants-007 — uppercase or padded status is still recognised', () => {
        expect(isCompanyBorneShipment('  CANCELLED  ')).toBe(true);
    });

    it('TC-UNIT-ExpenseConstants-008 — in-transit or completed shipments are not company-borne', () => {
        expect(isCompanyBorneShipment('transit')).toBe(false);
        expect(isCompanyBorneShipment('completed')).toBe(false);
        expect(isCompanyBorneShipment(null)).toBe(false);
    });
});

describe('expenseConstants — bản SQL phải khớp bản JS', () => {
    it('TC-UNIT-ExpenseConstants-009 — the SQL clause lists the same 3 pass-through types and excludes the same 2 statuses as the JS rule', () => {
        // Khớp từng cặp (loại chi, trạng thái) giữa hàm JS và mệnh đề SQL. Lệch nhau thì
        // màn Doanh thu báo "khách còn nợ" một khoản mà phiếu thu không hề đòi.
        const sql = CUSTOMER_BILLABLE_EXPENSE_SQL('e', 'os');
        const loaiTrongSql = ['toll', 'parking', 'etc'].filter((t) => sql.includes(`'${t}'`));
        const trangThaiLoaiTru = ['cancelled', 'failed'].filter((s) => sql.includes(`'${s}'`));

        expect(loaiTrongSql).toEqual(['toll', 'parking', 'etc']);
        expect(trangThaiLoaiTru).toEqual(['cancelled', 'failed']);

        for (const type of ALLOWED_EXPENSE_TYPES) {
            const jsBillable = isCustomerBillableExpense(type, 'completed');
            expect(sql.includes(`'${type}'`)).toBe(jsBillable);
        }
    });
});
