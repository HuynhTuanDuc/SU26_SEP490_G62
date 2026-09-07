/**
 * Hợp đồng hiển thị số tiền — với dữ liệu ĐÚNG NHƯ NÓ CHẢY QUA HỆ THỐNG.
 *
 * Điểm mấu chốt: node-postgres trả cột NUMERIC về dưới dạng CHUỖI, không phải số.
 * Một khoản 1.500.000 trong DB tới tay JavaScript là "1500000.00". Mọi hàm định dạng
 * phải chịu được điều đó — bản cũ có chỗ viết Number(n) không chắn, và một giá trị
 * NULL từ DB đi qua nó ra thẳng chuỗi "NaNđ" gửi tới người dùng.
 *
 * Đây không phải test cho vui: mọi con số tài xế đọc trên app đều đi qua đúng đường này.
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

    it('giá trị rỗng KHÔNG BAO GIỜ hiện thành 0đ', () => {
        // "chưa có số liệu" và "bằng không" là hai khẳng định khác nhau. Hiện 0đ cho
        // một khoản chưa khai là nói với người dùng một điều không đúng.
        for (const v of [null, undefined, '', '   ', 'abc', NaN, Infinity, -Infinity]) {
            const out = f.money(v);
            assert.strictEqual(out, '—', `money(${JSON.stringify(v)}) ra "${out}"`);
            assert.ok(!out.includes('NaN'), 'không được lọt chuỗi NaN tới người dùng');
            assert.ok(!out.includes('0đ'), 'không được biến giá trị rỗng thành 0đ');
        }
    });

    it('số 0 THẬT vẫn phải hiện là 0đ — khác hẳn với rỗng', () => {
        assert.strictEqual(f.money(0), '0đ');
        assert.strictEqual(f.money('0'), '0đ');
        assert.strictEqual(f.money('0.00'), '0đ');
    });

    it('số âm giữ nguyên dấu — khoản điều chỉnh giảm là chuyện có thật', () => {
        assert.strictEqual(f.money(-1500000), '-1.500.000đ');
        assert.strictEqual(f.money('-250000.00'), '-250.000đ');
    });

    it('dấu thập phân của bản rút gọn là DẤU PHẨY, không phải dấu chấm', () => {
        // Bản cũ in "1.5 tr". Trong tiếng Việt dấu chấm phân cách hàng NGHÌN, nên
        // "1.5" đọc ra là một nghìn năm trăm — sai hẳn ba bậc độ lớn.
        assert.strictEqual(f.moneyShort(1_500_000), '1,5 tr');
        assert.strictEqual(f.moneyShort(1_234_567_890), '1,2 tỷ');
        assert.ok(!f.moneyShort(1_500_000).includes('1.5'), 'không được dùng dấu chấm làm dấu thập phân');
    });

    it('bản rút gọn bỏ đuôi ",0" ở số tròn nhưng KHÔNG làm tròn thô ở mốc nghìn', () => {
        assert.strictEqual(f.moneyShort(2_000_000), '2 tr');
        assert.strictEqual(f.moneyShort(15_000), '15k');
        // 1.500 làm tròn thành "2k" là sai lệch một phần ba ngay trên màn hình,
        // mà đây lại là mốc hay gặp nhất: phí cầu đường, phí đỗ xe.
        assert.strictEqual(f.moneyShort(1_500), '1,5k');
    });

    it('bản rút gọn và bản đầy đủ không được mâu thuẫn nhau về độ lớn', () => {
        // Người dùng thấy "1,5 tr" ở thẻ tổng quan rồi bấm vào xem chi tiết thấy
        // "1.500.000đ" — hai con số phải cùng một độ lớn thì họ mới tin.
        for (const v of [1_500_000, 850_000, 12_345, 999, 2_500_000_000]) {
            const short = f.moneyShort(v);
            const full = f.money(v);
            assert.ok(short && full && short !== '—' && full !== '—');
            // Chữ số đầu tiên của hai bản phải giống nhau
            const d1 = short.match(/\d/)[0];
            const d2 = full.match(/\d/)[0];
            assert.strictEqual(d1, d2, `${v}: rút gọn "${short}" vs đầy đủ "${full}"`);
        }
    });

    it('số nguyên (km, số chuyến) dùng đúng dấu phân cách hàng nghìn của tiếng Việt', () => {
        assert.strictEqual(f.num(1234567), '1.234.567');
        assert.strictEqual(f.num('95'), '95');
        assert.strictEqual(f.num(null), '—');
    });

    it('phần trăm dùng dấu phẩy thập phân', () => {
        assert.strictEqual(f.percent(12.5), '12,5%');
        assert.strictEqual(f.percent(0), '0,0%');
        assert.strictEqual(f.percent(null), '—');
    });

    it('tiền có dấu: số dương được thêm "+" để người đọc thấy ngay chiều', () => {
        assert.strictEqual(f.moneySigned(500000), '+500.000đ');
        assert.strictEqual(f.moneySigned(-500000), '-500.000đ');
        assert.strictEqual(f.moneySigned(0), '0đ');
        assert.strictEqual(f.moneySigned(null), '—');
    });

    it('không sinh ra khoảng trắng lạ hay ký hiệu ₫ — cả hệ thống dùng đúng một ký hiệu', () => {
        for (const v of [0, 1000, 1_500_000, -2_000_000, '123456.78']) {
            const out = f.money(v);
            assert.ok(out.endsWith('đ'), `"${out}" phải kết thúc bằng đ`);
            assert.ok(!out.includes('₫'), `"${out}" không được dùng ký hiệu ₫`);
            assert.ok(!/\s+đ$/.test(out), `"${out}" không được có dấu cách trước đ`);
        }
    });
});
