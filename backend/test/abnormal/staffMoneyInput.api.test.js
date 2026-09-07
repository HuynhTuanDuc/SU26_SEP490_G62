/**
 * Nhân viên văn phòng gõ số tiền theo thói quen tiếng Việt — hệ thống hiểu đúng không?
 *
 * Đây là phần bổ sung cho moneyInput.api.test.js (vốn đứng ở phía tài xế). Ở đây đứng ở
 * phía kế toán và quản lý, nơi mỗi ô tiền chi phối nhiều tiền hơn hẳn: đơn giá/km quyết
 * định giá MỌI đơn của một nhóm xe, công nợ khai tay là số dư mở sổ, phiếu chi là tiền
 * thật ra khỏi quỹ.
 *
 * Tình huống trung tâm: người Việt gõ "500.000" để nói năm trăm nghìn. `Number("500.000")`
 * trong JavaScript ra 500 — đúng cú pháp, không lỗi, không cảnh báo, và ít hơn thật đúng
 * một nghìn lần. Đó là kiểu sai nguy hiểm nhất vì con số nhận được trông vẫn hợp lệ:
 * khác với NaN (lộ ra ngay khi mở báo cáo), 500 nằm im trong sổ cho tới lúc đối chiếu.
 *
 * Nguyên tắc kiểm ở đây: mỗi ô tiền phải HOẶC hiểu đúng ý người gõ, HOẶC từ chối bằng
 * một câu tiếng Việt nói rõ phải gõ thế nào. Tuyệt đối không có đường thứ ba là "nhận
 * một con số khác rồi lưu lại".
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'TEST_SECRET';

const assert = require('node:assert');
const express = require('express');
const request = require('supertest');
const { setupTestDb } = require('../helpers/testDb');
const { TEST_PASSWORD_HASH, loginAs } = require('../helpers/httpAuth');

let pool;
let teardown;
let app;
let accountantToken;
let managerToken;

const auth = (t) => ({ Authorization: `Bearer ${t}` });

/**
 * Câu báo lỗi có dùng được cho người không biết lập trình không?
 *
 * Kế toán đọc "invalid input syntax for type numeric" thì kết luận phần mềm hỏng và đi
 * báo IT, chứ không nghĩ tới việc sửa lại con số vừa gõ. Một mã 400 kèm câu tiếng Anh
 * của Postgres về mặt kỹ thuật vẫn là "đã chặn", nhưng nó không giúp họ đi tiếp.
 */
const deHieu = (msg) => {
    assert.ok(msg, 'phải có câu báo lỗi');
    for (const tuKyThuat of ['numeric', 'overflow', 'constraint', 'NaN', 'syntax', 'undefined', 'null value']) {
        assert.ok(
            !msg.toLowerCase().includes(tuKyThuat.toLowerCase()),
            `câu báo lỗi lộ từ kỹ thuật "${tuKyThuat}": "${msg}"`,
        );
    }
    assert.ok(/[àáảãạăâđêôơưèéẹìíòóùúýỹ]/i.test(msg), `câu báo lỗi phải bằng tiếng Việt: "${msg}"`);
};

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());

    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/', require('../../routes'));

    await pool.query(`
        TRUNCATE payment_vouchers, debts, customers, vehicles, vehicle_groups,
                 drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(
        `INSERT INTO accounts (id, email, password_hash, role_id)
         VALUES (1,'m@t.com',$1,1),(3,'k@t.com',$1,3)`,
        [TEST_PASSWORD_HASH]);
    await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1,'Quản lý Bình',1),(3,'Kế toán Mai',3)`);
    await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1,'individual','Chị Lan','0912345678')`);

    managerToken = await loginAs(app, 'm@t.com');
    accountantToken = await loginAs(app, 'k@t.com');
});

afterAll(async () => { await teardown(); });

// ─────────────────────────────────────────────────────────────────────────────
// Kế toán khai công nợ cũ (số dư mở sổ khi bắt đầu dùng phần mềm)
// ─────────────────────────────────────────────────────────────────────────────

const khaiCongNo = (total_amount) => request(app)
    .post('/accountant/debts/manual')
    .set(auth(accountantToken))
    .send({
        debt_type: 'customer',
        owner_id: 1,
        total_amount,
        incurred_on: '2026-01-15',
        notes: 'Nợ cũ chuyển sổ từ file Excel',
    });

describe('Kế toán khai công nợ cũ', () => {
    it('gõ "500.000" là năm trăm nghìn — KHÔNG được thành 500', async () => {
        const res = await khaiCongNo('500.000');

        // Chấp nhận hai kết cục: hiểu đúng, hoặc từ chối và bảo gõ lại. Điều DUY NHẤT
        // không được phép là nhận rồi lưu một con số khác.
        if (res.status < 300) {
            const { rows } = await pool.query('SELECT total_amount FROM debts ORDER BY id DESC LIMIT 1');
            assert.strictEqual(
                Number(rows[0].total_amount), 500000,
                `khai 500.000đ mà sổ ghi ${rows[0].total_amount}đ`,
            );
        } else {
            deHieu(res.body.error);
        }
    });

    it('gõ thừa một số 0 (50 tỷ) — chặn ở 400, và nói thẳng là kiểm tra lại số 0', async () => {
        const res = await khaiCongNo('50000000000');

        assert.strictEqual(res.status, 400, `phải là 400, nhận ${res.status}`);
        deHieu(res.body.error);
        assert.ok(
            /số 0|thừa|tối đa|vượt/i.test(res.body.error),
            `câu báo phải gợi ý được lỗi thừa số 0: "${res.body.error}"`,
        );
    });

    it('dán nguyên "1.500.000đ" từ tin nhắn — không được đẩy NaN xuống sổ', async () => {
        const truoc = await pool.query('SELECT COUNT(*)::int AS n FROM debts');
        const res = await khaiCongNo('1.500.000đ');

        assert.strictEqual(res.status, 400, `phải là 400, nhận ${res.status}`);
        deHieu(res.body.error);

        const sau = await pool.query('SELECT COUNT(*)::int AS n FROM debts');
        assert.strictEqual(sau.rows[0].n, truoc.rows[0].n, 'không được tạo thêm khoản nợ nào');

        const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM debts WHERE total_amount = 'NaN'::numeric`);
        assert.strictEqual(rows[0].n, 0, 'có dòng NaN lọt vào bảng debts');
    });

    it('gõ kiểu bàn phím tiếng Anh "2,500,000" — chặn, và chỉ rõ cách gõ đúng', async () => {
        const res = await khaiCongNo('2,500,000');

        assert.strictEqual(res.status, 400, `phải là 400, nhận ${res.status}`);
        deHieu(res.body.error);
        assert.ok(
            res.body.error.includes('1500000') || res.body.error.includes('1.500.000'),
            `câu báo phải nêu ví dụ gõ đúng: "${res.body.error}"`,
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Quản lý đặt đơn giá/km cho nhóm xe
//
// Ô tiền có sức lan xa nhất hệ thống: nó nhân với quãng đường để ra giá của MỌI đơn
// thuộc nhóm xe đó. Sai ở đây không hỏng một bản ghi, mà hỏng toàn bộ bảng giá.
// ─────────────────────────────────────────────────────────────────────────────

const taoNhomXe = (name, price_per_km) => request(app)
    .post('/api/admin/vehicle-groups')
    .set(auth(managerToken))
    .send({ name, price_per_km, max_load_weight_kg: 5000 });

describe('Quản lý đặt đơn giá/km cho nhóm xe', () => {
    it('gõ "12.000" là mười hai nghìn đồng/km — KHÔNG được thành 12', async () => {
        const res = await taoNhomXe('Xe tải 5 tấn', '12.000');

        if (res.status < 300) {
            const { rows } = await pool.query(
                `SELECT price_per_km FROM vehicle_groups WHERE name = 'Xe tải 5 tấn'`);
            assert.strictEqual(rows.length, 1, 'nhóm xe phải được tạo');
            assert.strictEqual(
                Number(rows[0].price_per_km), 12000,
                `đặt 12.000đ/km mà bảng giá ghi ${rows[0].price_per_km}đ/km — `
                + `một chuyến 100km sẽ báo giá ${Number(rows[0].price_per_km) * 100}đ`,
            );
        } else {
            deHieu(res.body.error);
        }
    });

    it('bỏ trống đơn giá — phải chặn, không được âm thầm thành 0đ/km', async () => {
        const res = await taoNhomXe('Nhóm thiếu giá', '');

        assert.ok(res.status >= 400, `phải chặn, nhận ${res.status}`);
        deHieu(res.body.error);

        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM vehicle_groups WHERE name = 'Nhóm thiếu giá'`);
        assert.strictEqual(rows[0].n, 0, 'không được tạo nhóm xe khi chưa có đơn giá');
    });

    it('gõ thừa số 0 (1.200.000đ/km) — chặn trước khi cả bảng giá lệch 100 lần', async () => {
        const res = await taoNhomXe('Nhóm giá cao', 1_200_000_0);

        assert.ok(res.status >= 400, `phải chặn, nhận ${res.status}`);
        deHieu(res.body.error);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Kế toán lập phiếu chi (tiền thật ra khỏi quỹ)
// ─────────────────────────────────────────────────────────────────────────────

const lapPhieuChi = (amount) => request(app)
    .post('/accountant/vouchers')
    .set(auth(accountantToken))
    .send({
        voucher_type: 'other',
        amount,
        payee: 'Garage Thành Công',
        reason: 'Thanh toán sửa xe tháng 8',
        payment_method: 'cash',
    });

describe('Kế toán lập phiếu chi', () => {
    it('gõ "500.000" — quỹ phải chi năm trăm nghìn, không phải năm trăm đồng', async () => {
        const res = await lapPhieuChi('500.000');

        if (res.status < 300) {
            const { rows } = await pool.query(
                `SELECT amount FROM payment_vouchers ORDER BY id DESC LIMIT 1`);
            assert.strictEqual(Number(rows[0].amount), 500000,
                `lập phiếu 500.000đ mà phiếu ghi ${rows[0].amount}đ`);
        } else {
            deHieu(res.body.error);
        }
    });

    it('bỏ trống số tiền — chặn bằng câu nói rõ ô nào thiếu', async () => {
        const res = await lapPhieuChi('');

        assert.ok(res.status >= 400, `phải chặn, nhận ${res.status}`);
        deHieu(res.body.error);
    });

    it('gõ số âm — chặn, không tạo phiếu chi âm', async () => {
        const truoc = await pool.query('SELECT COUNT(*)::int AS n FROM payment_vouchers');
        const res = await lapPhieuChi('-500000');

        assert.ok(res.status >= 400, `phải chặn, nhận ${res.status}`);
        deHieu(res.body.error);

        const sau = await pool.query('SELECT COUNT(*)::int AS n FROM payment_vouchers');
        assert.strictEqual(sau.rows[0].n, truoc.rows[0].n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Kế toán xác nhận tiền chuyển khoản thực nhận
//
// Đây là lỗ NaN cuối cùng còn sót lại sau đợt trước: phép kiểm cũ là
// `Number(actual_amount) < 0`, mà NaN so sánh với bất cứ gì cũng ra false — nên chuỗi
// hỏng đi thẳng xuống cột NUMERIC.
// ─────────────────────────────────────────────────────────────────────────────

describe('Kế toán xác nhận tiền chuyển khoản thực nhận', () => {
    const service = () => require('../../services/accountantBankTransferService');

    // Phép kiểm chạy TRƯỚC mọi thao tác với DB, nên không cần dựng sẵn phiếu thu:
    // nếu nó ném lỗi thì đã chứng minh chuỗi hỏng không đi tiếp được.
    const xacNhan = (actual_amount) => service().confirmBankTransfer(1, 3, { actual_amount });

    for (const xau of ['1.500.000đ', '2,500,000', 'không nhớ', '  ']) {
        it(`"${xau}" không được lọt xuống cột số tiền`, async () => {
            await assert.rejects(
                () => xacNhan(xau),
                (err) => {
                    deHieu(err.message);
                    assert.strictEqual(err.statusCode, 400, 'phải là lỗi nhập liệu 400');
                    return true;
                },
            );
        });
    }

    it('gõ "1.500.000" hiểu đúng thành 1.500.000 — qua được vòng kiểm số tiền', async () => {
        // Vượt qua vòng kiểm rồi sẽ hỏng ở bước tìm phiếu thu #1 (không có trong DB).
        // Chính điều đó chứng minh con số đã được nhận: nếu bị chặn ở vòng kiểm thì
        // thông điệp sẽ nói về số tiền chứ không phải về phiếu thu.
        await assert.rejects(
            () => xacNhan('1.500.000'),
            (err) => {
                assert.ok(
                    !/số tiền/i.test(err.message),
                    `"1.500.000" phải được chấp nhận, nhưng bị chặn: "${err.message}"`,
                );
                return true;
            },
        );
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Controller KHÔNG được tự đổi số tiền trước khi gọi service
//
// Nhóm lỗi này khó thấy nhất trong cả đợt: service đã có requireMoney, nhìn vào là thấy
// yên tâm — nhưng controller ở trên đã chạy `Number(amount)` rồi mới truyền xuống. Chuỗi
// "500.000" biến thành 500 TRƯỚC khi tới lớp kiểm, và lớp kiểm nhận 500 thì thấy hoàn
// toàn hợp lệ. Lá chắn vẫn đứng đó, chỉ là kẻ cần chặn đã đi vòng qua nó từ trước.
//
// Vì vậy phải kiểm từ ngoài vào (qua HTTP), không kiểm service riêng lẻ: chỉ đường đi
// đầy đủ mới lộ ra chuyện có ai đó đổi số dọc đường.
// ─────────────────────────────────────────────────────────────────────────────

describe('Không lớp nào được âm thầm đổi số tiền dọc đường', () => {
    it('Manager sửa số tiền khi duyệt thưởng — "1.500.000" không được thành NaN', async () => {
        const bonusService = require('../../services/bonusService');

        // Phép kiểm nằm trước mọi thao tác DB: ném lỗi tức là chuỗi đã bị chặn đúng chỗ.
        await assert.rejects(
            () => bonusService.approve(1, 1, '1.500.000đ'),
            (err) => { deHieu(err.message); return true; },
        );

        // Còn "1.500.000" là cách gõ hợp lệ — phải đi qua được vòng kiểm số tiền.
        await assert.rejects(
            () => bonusService.approve(999999, 1, '1.500.000'),
            (err) => {
                assert.ok(!/số tiền/i.test(err.message),
                    `"1.500.000" phải được chấp nhận, nhưng bị chặn: "${err.message}"`);
                return true;
            },
        );

        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM driver_bonuses WHERE amount = 'NaN'::numeric`);
        assert.strictEqual(rows[0].n, 0, 'có dòng NaN lọt vào bảng driver_bonuses');
    });

    it('Sửa chi phí — controller phải chuyển nguyên chuỗi xuống, không tự Number()', async () => {
        // Đọc thẳng mã nguồn: đây là loại lỗi mà chạy thử không lộ ra, vì hậu quả của nó
        // là một con số TRÔNG VẪN HỢP LỆ. Chốt lại bằng chữ để lần sau ai sửa còn thấy.
        const fs = require('node:fs');
        const nguon = fs.readFileSync(require.resolve('../../controllers/expenseController.js'), 'utf8');
        assert.ok(
            !/amount:\s*amount\s*\?\s*Number\(/.test(nguon),
            'expenseController lại tự Number(amount) — việc đó vô hiệu hoá requireMoney ở expenseService',
        );
    });
});
