/**
 * Người dùng gõ sai số tiền — hệ thống phản ứng thế nào?
 *
 * Không kiểm "đường hạnh phúc". Kiểm đúng những thứ người thật làm khi mệt, khi vội,
 * khi bàn phím điện thoại nhỏ: gõ thừa một số 0, dán nguyên chuỗi "1.500.000đ" từ tin
 * nhắn, để dấu trừ lọt vào, gõ số lẻ, bấm gửi hai lần.
 *
 * Điều cần chứng minh không phải là "hệ thống chặn được", mà là **người dùng có hiểu
 * mình sai ở đâu không**. Một mã 500 kèm câu tiếng Anh của Postgres về mặt kỹ thuật
 * cũng là "đã chặn", nhưng với người tài xế đứng ở cây xăng thì nó vô dụng.
 *
 * Chạy được cả trên testcontainers lẫn Postgres sẵn có (xem test/helpers/testDb.js).
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
let expenseService;
let driverToken;

const DRIVER = 4;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

// NUMERIC(12,2): tối đa 10 chữ số phần nguyên → 9.999.999.999,99
const NUMERIC_MAX = 9_999_999_999.99;

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    expenseService = require('../../services/expenseService');

    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/', require('../../routes'));

    await pool.query(`
        TRUNCATE expenses, trip_stops, shipment_assignment_history, order_shipments,
                 orders, customers, vehicles, vehicle_groups, drivers, profiles,
                 roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(
        `INSERT INTO accounts (id, email, password_hash, role_id) VALUES (2,'c@t.com',$1,2),(4,'d@t.com',$1,4)`,
        [TEST_PASSWORD_HASH]);
    await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (2,'Điều phối',2),(4,'Tài xế Hùng',4)`);
    await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1,'Xe 5m2',15000)`);
    await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1,'51E-246.80',1,4,'active')`);
    await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date) VALUES (4,1,1,'DL-1',CURRENT_DATE)`);
    await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1,'individual','Chị Lan','0912345678')`);
    await pool.query(`
        INSERT INTO orders (id, customer_id, created_by, cargo_name, payment_type, total_estimated_price)
        VALUES (1, 1, 2, 'Hàng gia dụng', 'bank_transfer', 1400000)`);
    await pool.query(`
        INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id,
                                     estimated_price, estimated_distance_km, status)
        VALUES (1, 1, 1, 1, 1400000, 95, 'available')`);
    await pool.query(`
        INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address)
        VALUES (1,1,'pickup','Kho A'), (1,2,'delivery','Nhà khách')`);

    driverToken = await loginAs(app, 'd@t.com');
    await request(app).post('/api/trips/1/claim').set(auth(driverToken)).expect(200);
});

afterAll(async () => { await teardown(); });

/** Khai một khoản chi phí đúng như controller gọi sau khi ảnh đã upload xong. */
const khaiChiPhi = async (amount) => {
    try {
        const rows = await expenseService.createExpense(DRIVER, {
            shipmentId: 1,
            expenseType: 'toll',
            amount,
            description: 'Phí cầu đường',
            receiptUrl: 'https://anh/bien-lai.jpg',
            clientRequestId: `t-${Math.random()}`,
        });
        return { ok: true, rows };
    } catch (err) {
        return { ok: false, message: err.message, err };
    }
};

const demChiPhi = async () => {
    const { rows: [r] } = await pool.query(`SELECT count(*)::int AS n FROM expenses`);
    return r.n;
};

/** Thông báo lỗi có nói được cho người dùng biết sai ở đâu không? */
const deHieu = (msg) => {
    if (!msg) return false;
    const en = /numeric|overflow|invalid input syntax|violates|constraint|out of range|NaN/i;
    if (en.test(msg)) return false;            // câu của Postgres, không phải câu cho người
    return /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(msg);
};

describe('Gõ sai số tiền — người dùng có hiểu mình sai ở đâu không', () => {

    it('gõ 0 vào ô số tiền: bị chặn, câu báo bằng tiếng Việt', async () => {
        const truoc = await demChiPhi();
        const r = await khaiChiPhi(0);

        assert.strictEqual(r.ok, false, 'không được nhận khoản 0đ');
        assert.ok(deHieu(r.message), `câu báo phải cho người đọc: "${r.message}"`);
        assert.match(r.message, /lớn hơn 0/);
        assert.strictEqual(await demChiPhi(), truoc, 'không được ghi gì vào DB');
    });

    it('dấu trừ lọt vào (copy nhầm): bị chặn', async () => {
        const truoc = await demChiPhi();
        const r = await khaiChiPhi(-50000);

        assert.strictEqual(r.ok, false);
        assert.ok(deHieu(r.message), `"${r.message}"`);
        assert.strictEqual(await demChiPhi(), truoc);
    });

    it('bỏ trống ô số tiền: bị chặn, không hiểu thành 0', async () => {
        for (const v of [null, undefined, '']) {
            const r = await khaiChiPhi(v);
            assert.strictEqual(r.ok, false, `giá trị ${JSON.stringify(v)} phải bị chặn`);
            assert.ok(deHieu(r.message), `"${r.message}"`);
        }
    });

    it('DÁN NGUYÊN CHUỖI "1.500.000đ" từ tin nhắn — chỗ này hay vỡ nhất', async () => {
        const truoc = await demChiPhi();
        const r = await khaiChiPhi('1.500.000đ');

        // Number('1.500.000đ') là NaN. Nếu tầng kiểm tra chỉ hỏi "có <= 0 không" thì
        // NaN lọt qua (NaN <= 0 là false), xuống tới Postgres mới vỡ — và lúc đó người
        // dùng nhận một câu tiếng Anh kèm mã 500.
        assert.strictEqual(r.ok, false, 'chuỗi có định dạng không được coi là số hợp lệ');
        assert.ok(deHieu(r.message),
            `phải là câu cho người đọc, nhận được: "${r.message}"`);
        assert.strictEqual(await demChiPhi(), truoc, 'không được ghi dòng rác');
    });

    it('gõ THỪA MỘT SỐ 0 — 50.000 thành 50.000.000.000, vượt sức chứa của cột', async () => {
        const truoc = await demChiPhi();
        const r = await khaiChiPhi(50_000_000_000);

        assert.ok(NUMERIC_MAX < 50_000_000_000, 'tiền đề: số này thật sự vượt NUMERIC(12,2)');
        assert.strictEqual(r.ok, false, 'phải bị chặn');
        assert.ok(deHieu(r.message),
            `người tài xế cần biết "số tiền quá lớn", không phải câu của Postgres: "${r.message}"`);
        assert.strictEqual(await demChiPhi(), truoc);
    });

    it('gõ chữ vào ô số tiền', async () => {
        const r = await khaiChiPhi('năm mươi nghìn');
        assert.strictEqual(r.ok, false);
        assert.ok(deHieu(r.message), `"${r.message}"`);
    });

    it('số lẻ tới hàng xu: lưu vào DB rồi đọc ra phải khớp với cái người dùng thấy', async () => {
        const r = await khaiChiPhi(50_000.999);
        if (!r.ok) {
            // Chặn cũng là một lựa chọn hợp lệ — miễn là nói rõ
            assert.ok(deHieu(r.message), `"${r.message}"`);
            return;
        }
        const { rows: [e] } = await pool.query(
            `SELECT amount FROM expenses ORDER BY id DESC LIMIT 1`);
        // NUMERIC(12,2) chỉ giữ 2 chữ số thập phân → 50000.999 thành 50001.00.
        // Điều quan trọng: con số ĐỌC RA phải là con số hệ thống thật sự dùng để tính
        // tiền, không phải con số người dùng đã gõ.
        const { money } = require('../../utils/formatNumber');
        assert.strictEqual(money(e.amount), '50.001đ',
            `DB giữ ${e.amount}, hiển thị phải khớp với nó`);
    });

    it('khoản hợp lệ vẫn phải vào được — chặn quá tay cũng là hỏng', async () => {
        const truoc = await demChiPhi();
        const r = await khaiChiPhi(50_000);

        assert.strictEqual(r.ok, true, `khoản 50.000 hợp lệ bị chặn: ${r.message}`);
        assert.strictEqual(await demChiPhi(), truoc + 1);

        const { rows: [e] } = await pool.query(`SELECT amount FROM expenses ORDER BY id DESC LIMIT 1`);
        const { money } = require('../../utils/formatNumber');
        assert.strictEqual(money(e.amount), '50.000đ');
    });

    it('gõ thừa số 0 ở ô chi phí: HTTP phải là 400 (lỗi của người gõ), không phải 500', async () => {
        // Đây là chỗ dễ trượt: controller suy mã HTTP từ NỘI DUNG câu lỗi, nên một câu
        // mới không khớp mẫu nào sẽ lặng lẽ rơi vào nhánh 500. Với người dùng, 500 nghĩa
        // là "hệ thống hỏng, chờ IT" — họ sẽ không nghĩ tới việc sửa lại con số mình gõ.
        const { requireMoney } = require('../../utils/money');
        let caught = null;
        try {
            requireMoney(50_000_000_000, { field: 'Số tiền' });
        } catch (e) { caught = e; }

        assert.ok(caught, 'phải ném lỗi');
        assert.strictEqual(caught.statusCode, 400,
            'lỗi số tiền phải mang sẵn statusCode 400 để controller không đoán nhầm');
        assert.ok(deHieu(caught.message), `"${caught.message}"`);
    });

    it('ứng lương vượt trần: câu báo phải kèm số tiền ĐÃ ĐỊNH DẠNG, không phải số thô', async () => {
        const now = new Date();
        const res = await request(app)
            .post('/api/payroll/advance')
            .set(auth(driverToken))
            .send({
                amount: 999_000_000,
                reason: 'Việc gấp',
                requestMonth: now.getMonth() + 1,
                requestYear: now.getFullYear(),
            });

        assert.ok(res.status >= 400, `phải bị chặn, nhận ${res.status}`);
        const msg = res.body.error ?? '';
        assert.ok(deHieu(msg), `"${msg}"`);
        // Số trong câu phải đọc được: "5.000.000đ" chứ không phải "5000000".
        // Một con số bảy chữ số dính liền là thứ người dùng phải tự đếm hàng nghìn.
        assert.match(msg, /\d{1,3}(\.\d{3})+đ/,
            `số tiền trong thông báo phải có phân cách hàng nghìn và đuôi đ: "${msg}"`);
        assert.ok(!/\d{5,}/.test(msg.replace(/\d{1,3}(\.\d{3})+/g, '')),
            `không được lọt số thô chưa định dạng: "${msg}"`);
    });

    it('dán "5.000.000đ" vào ô ứng lương: chặn ở API, câu báo nói rõ phải nhập gì', async () => {
        const now = new Date();
        const res = await request(app)
            .post('/api/payroll/advance')
            .set(auth(driverToken))
            .send({
                amount: '5.000.000đ',
                reason: 'Việc gấp',
                requestMonth: now.getMonth() + 1,
                requestYear: now.getFullYear(),
            });

        assert.strictEqual(res.status, 400);
        const msg = res.body.error ?? '';
        assert.ok(deHieu(msg), `"${msg}"`);
        assert.match(msg, /chỉ nhập số/, `phải chỉ cho người dùng cách nhập đúng: "${msg}"`);

        const { rows: [r] } = await pool.query(`SELECT count(*)::int AS n FROM salary_advances`);
        assert.strictEqual(r.n, 0, 'không được ghi dòng nào');
    });
});
