/**
 * Hợp đồng hiển thị số tiền — với dữ liệu ĐÚNG NHƯ NÓ CHẢY QUA HỆ THỐNG.
 *
 * Điểm mấu chốt: node-postgres trả cột NUMERIC về dưới dạng CHUỖI, không phải số.
 * Một khoản 1.500.000 trong DB tới tay JavaScript là "1500000.00". Mọi hàm định dạng
 * phải chịu được điều đó — bản cũ có chỗ viết Number(n) không chắn, và một giá trị
 * NULL từ DB đi qua nó ra thẳng chuỗi "NaNđ" gửi tới người dùng.
 *
 * Đây không phải test cho vui: mọi con số tài xế đọc trên app đều đi qua đúng đường này.
 *
 * Hợp đồng chốt với người dùng: MỘT dạng duy nhất 1.500.000đ, không rút gọn bằng chữ,
 * và ô tiền rỗng hiện 0đ.
 */
const assert = require('node:assert');
const f = require('../../utils/formatNumber');

describe('Hiển thị số tiền — dữ liệu thật từ Postgres', () => {

    it('NUMERIC của Postgres về dạng chuỗi — vẫn phải ra đúng số', () => {
        // Đây chính xác là thứ pg trả về cho NUMERIC(12,2)
        assert.strictEqual(f.money('1500000.00'), '1.500.000đ');
        assert.strictEqual(f.money('0.00'), '0đ');
        assert.strictEqual(f.money('9999999999.99'), '10.000.000.000đ');
        assert.strictEqual(f.money('847000.00'), '847.000đ');
    });

    it('phần lẻ được làm tròn, không bị cắt cụt — cắt cụt là ăn bớt tiền của người ta', () => {
        assert.strictEqual(f.money('1500000.49'), '1.500.000đ');
        assert.strictEqual(f.money('1500000.50'), '1.500.001đ');
        assert.strictEqual(f.money('1500000.99'), '1.500.001đ');
    });

    it('ô tiền rỗng hiện 0đ, và KHÔNG BAO GIỜ lọt chữ NaN ra màn hình', () => {
        // Chữ "NaN" nằm đúng chỗ đáng lẽ là số tiền là thứ người dùng báo lỗi nhiều nhất:
        // một phép tính hỏng ở trên không được phép hiện nguyên trạng cho người đọc.
        for (const v of [null, undefined, '', '   ', 'abc', NaN, Infinity, -Infinity]) {
            const out = f.money(v);
            assert.strictEqual(out, '0đ', `money(${JSON.stringify(v)}) ra "${out}"`);
            assert.ok(!out.includes('NaN'), 'không được lọt chuỗi NaN tới người dùng');
        }
    });

    it('số 0 và giá trị rỗng viết giống nhau — một dạng duy nhất cho ô tiền', () => {
        assert.strictEqual(f.money(0), '0đ');
        assert.strictEqual(f.money('0'), '0đ');
        assert.strictEqual(f.money('0.00'), '0đ');
        assert.strictEqual(f.money(null), f.money(0));
    });

    it('số âm giữ nguyên dấu — khoản điều chỉnh giảm là chuyện có thật', () => {
        assert.strictEqual(f.money(-1500000), '-1.500.000đ');
        assert.strictEqual(f.money('-250000.00'), '-250.000đ');
    });

    it('KHÔNG rút gọn bằng chữ — mọi khoản đều viết đủ chữ số', () => {
        // Trước đây thẻ tổng quan in "1,5 tr" còn bảng chi tiết in "1.500.000đ" cho cùng
        // một khoản. Người dùng không đối chiếu được hai cách viết, nên bỏ hẳn bản rút gọn.
        assert.strictEqual(typeof f.moneyShort, 'undefined', 'moneyShort phải bị gỡ bỏ');
        for (const v of [1_500, 15_000, 1_500_000, 2_000_000, 1_234_567_890]) {
            const out = f.money(v);
            for (const donVi of ['tr', 'tỷ', 'k', '₫', 'M', 'K']) {
                assert.ok(!out.includes(donVi), `money(${v}) = "${out}" còn chứa đơn vị viết tắt "${donVi}"`);
            }
            assert.ok(/^-?[\d.]+đ$/.test(out), `money(${v}) = "${out}" phải đúng dạng xxx.xxx.xxxđ`);
        }
    });

    it('nhóm hàng nghìn bằng DẤU CHẤM, đủ ba chữ số một nhóm', () => {
        assert.strictEqual(f.money(1_500_000), '1.500.000đ');
        assert.strictEqual(f.money(999), '999đ');
        assert.strictEqual(f.money(1_000), '1.000đ');
        assert.strictEqual(f.money(1_234_567_890), '1.234.567.890đ');
    });

    it('tiền có dấu: số dương thêm "+" để nêu rõ chiều', () => {
        assert.strictEqual(f.moneySigned(250000), '+250.000đ');
        assert.strictEqual(f.moneySigned(-250000), '-250.000đ');
        assert.strictEqual(f.moneySigned(null), '0đ');
    });

    it('số nguyên (km, số chuyến) dùng đúng dấu phân cách hàng nghìn của tiếng Việt', () => {
        assert.strictEqual(f.num(1234567), '1.234.567');
        assert.strictEqual(f.num('95'), '95');
        // num() KHÔNG phải hàm tiền: nó vẫn giữ "—" cho ô chưa có số liệu
        assert.strictEqual(f.num(null), '—');
    });

    it('phần trăm dùng dấu phẩy thập phân', () => {
        assert.strictEqual(f.percent(12.5), '12,5%');
        assert.strictEqual(f.percent(0), '0,0%');
    });

    it('phần trăm rỗng vẫn là "—": num/percent không phải hàm tiền', () => {
        assert.strictEqual(f.percent(null), '—');
    });

    it('không sinh ra khoảng trắng lạ hay ký hiệu ₫ — cả hệ thống dùng đúng một ký hiệu', () => {
        for (const v of [0, 1000, 1_500_000, -2_000_000, '123456.78', null]) {
            const out = f.money(v);
            assert.ok(out.endsWith('đ'), `"${out}" phải kết thúc bằng đ`);
            assert.ok(!out.includes('₫'), `"${out}" không được dùng ký hiệu ₫`);
            assert.ok(!/\s+đ$/.test(out), `"${out}" không được có dấu cách trước đ`);
        }
    });
});
