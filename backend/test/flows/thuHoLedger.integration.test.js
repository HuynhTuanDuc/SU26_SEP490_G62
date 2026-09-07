/**
 * Thu hộ (COD) trên sổ tài chính — nửa còn thiếu của tài khoản 3388.
 *
 * BỐI CẢNH. Thu hộ là tiền HÀNG công ty thu giúp khách khi giao, rồi phải trả lại. Đó là
 * khoản công ty NỢ khách — ngược chiều hoàn toàn với cước (khách nợ công ty).
 *
 * LỖI ĐƯỢC CHỐT Ở ĐÂY. Trước bản vá, khi tài xế cầm cả cước lẫn thu hộ thì toàn bộ số
 * tiền đó được ghi Có 131 (phải thu khách hàng):
 *
 *     driver_debt_created   Nợ 1388 / Có 131    17.000.000   <-- gồm cả 15tr thu hộ
 *     shipment_revenue      Nợ 131  / Có 511     2.000.000
 *     => 131 = 2tr Nợ − 17tr Có = −15.000.000
 *
 * Sổ nói khách trả thừa 15 triệu, đúng bằng số thu hộ, và không có gì tự sửa lại. Đây là
 * số liệu xuất sang MISA nên sai ở đây là sai ra ngoài.
 *
 * VÌ SAO CÁC TEST CŨ KHÔNG BẮT ĐƯỢC. L2-FLOW-08B (flow12) đã phủ thu hộ khá kỹ, nhưng cả
 * sáu ca B1..B6 đều để driver_payment_state là company_received / client_credit — tức tài
 * xế KHÔNG giữ tiền. Đúng ca tài xế cầm tiền, ca duy nhất chạm tới bút toán, thì trống.
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let repo;
let ledger;

const KE_TOAN = 3;
const CUOC = 2_000_000;
const THU_HO = 15_000_000;

const donHang = (shipmentOverrides = {}) => ({
    customer_name: 'Khach Le',
    customer_phone: '0909000111',
    created_by: KE_TOAN,
    prepaid_amount: 0,
    completed_at: '2026-08-10',
    shipments: [{
        vehicle_plate: '51E-100.01',
        driver_name: 'Pham Van Tien',
        pickup_addresses: ['Kho A'],
        delivery_addresses: ['Kho B'],
        cargo_fee: CUOC,
        expenses: [],
        payment_type: 'cash',
        driver_payment_state: 'company_received',
        ...shipmentOverrides,
    }],
});

/** Số dư một tài khoản trên sổ của đơn: tổng Nợ − tổng Có (dương = còn phải thu). */
const soDu = async (orderId, taiKhoan) => {
    const { rows: [r] } = await pool.query(
        `SELECT
            COALESCE(SUM(amount) FILTER (WHERE debit_account  = $2), 0)
          - COALESCE(SUM(amount) FILTER (WHERE credit_account = $2), 0) AS du
         FROM financial_transactions
         WHERE (ref_type = 'order'    AND ref_id = $1)
            OR (ref_type = 'shipment' AND ref_id IN (SELECT id FROM order_shipments WHERE order_id = $1))
            OR (ref_type = 'debt'     AND ref_id IN (SELECT id FROM debts           WHERE order_id = $1))`,
        [orderId, taiKhoan]);
    return Number(r.du);
};

const dongSo = async (orderId) => {
    const { rows } = await pool.query(
        `SELECT event_type, debit_account, credit_account, amount::numeric AS amount
         FROM financial_transactions
         WHERE (ref_type = 'order'    AND ref_id = $1)
            OR (ref_type = 'shipment' AND ref_id IN (SELECT id FROM order_shipments WHERE order_id = $1))
            OR (ref_type = 'debt'     AND ref_id IN (SELECT id FROM debts           WHERE order_id = $1))
         ORDER BY id`, [orderId]);
    return rows;
};

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    repo = require('../../repositories/accountantOrderRepository');
    ledger = require('../../repositories/financialLedgerRepository');

    await pool.query(`
        TRUNCATE financial_transactions, debts, expenses, trip_stops,
                 shipment_assignment_history, order_shipments, orders, customers,
                 vehicles, vehicle_groups, drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE`);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (3,'k@t.com','h',3),(4,'d@t.com','h',4)`);
    await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (3,'Ke Toan',3),(4,'Pham Van Tien',4)`);
    await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1,'Xe 5m2',15000)`);
    await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1,'51E-100.01',1,4,'active')`);
    await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date) VALUES (4,1,1,'DL-A',CURRENT_DATE)`);
});

afterAll(async () => { await teardown(); });

describe('Thu hộ (COD) — tài xế đang cầm cả cước lẫn tiền hàng', () => {
    it('B1 — 131 chỉ nhận phần cước; phần thu hộ sang Có 3388', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + THU_HO,
        }));

        const so = await dongSo(id);
        const co131 = so.filter((t) => t.credit_account === '131')
            .reduce((a, t) => a + Number(t.amount), 0);
        const co3388 = so.filter((t) => t.credit_account === '3388')
            .reduce((a, t) => a + Number(t.amount), 0);

        assert.strictEqual(co131, CUOC,
            `Có 131 phải đúng bằng cước ${CUOC}, nhận ${co131} — chênh chính là số thu hộ`);
        assert.strictEqual(co3388, THU_HO, 'toàn bộ thu hộ phải nằm ở Có 3388');
    });

    it('B2 — tài khoản 131 về 0, không còn số dư âm', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + THU_HO,
        }));

        // Nợ 131 (doanh thu) 2tr − Có 131 (tài xế đã thu hộ khách) 2tr = 0.
        // Trước bản vá số này là −15.000.000.
        assert.strictEqual(await soDu(id, '131'), 0,
            'khách đã trả đủ cước cho tài xế thì 131 phải bằng 0, không âm');
    });

    it('B3 — 3388 mang số dư Có: đây là tiền công ty phải trả lại khách', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + THU_HO,
        }));

        // soDu trả Nợ − Có, nên số âm nghĩa là dư Có = khoản phải trả.
        assert.strictEqual(await soDu(id, '3388'), -THU_HO,
            '3388 phải dư Có đúng bằng số thu hộ đang giữ');
        assert.strictEqual(await ledger.getCollectOnBehalfOutstanding(pool, id), THU_HO);
    });

    it('B4 — công nợ tài xế vẫn là TOÀN BỘ số đang cầm, không bị bản vá cắt bớt', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + THU_HO,
        }));

        // Tài xế đang giữ 17tr thì phải nộp về 17tr. Việc tách vế chỉ đổi cách GHI SỔ,
        // không đổi số tiền tài xế nợ công ty.
        const { rows: [d] } = await pool.query(
            `SELECT debt_type, total_amount FROM debts WHERE order_id = $1`, [id]);
        assert.strictEqual(d.debt_type, 'driver');
        assert.strictEqual(Number(d.total_amount), CUOC + THU_HO);
        assert.strictEqual(await soDu(id, '1388'), CUOC + THU_HO);
    });

    it('B5 — sổ vẫn cân: tổng Nợ = tổng Có', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + THU_HO,
        }));

        const so = await dongSo(id);
        const tong = so.reduce((a, t) => a + Number(t.amount), 0);
        // Mỗi dòng có đúng một vế Nợ và một vế Có nên tổng hai bên luôn bằng nhau; điều
        // đáng kiểm là KHÔNG có dòng nào âm hay bằng 0 lọt vào.
        assert.ok(so.every((t) => Number(t.amount) > 0), 'không dòng nào được âm hoặc bằng 0');
        assert.strictEqual(tong, (CUOC + THU_HO) + CUOC, 'đúng 3 dòng: 2tr + 15tr + 2tr doanh thu');
    });
});

describe('Thu hộ — các ca KHÔNG được đổi hành vi', () => {
    it('B6 — tài xế chỉ cầm phần cước: không sinh vế thu hộ nào', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC,
        }));

        // Cột thu hộ nói công ty đã thu hộ 15tr, nhưng tài xế chỉ cầm 2tr — phần thu hộ
        // đã về công ty bằng đường khác, KHÔNG có dòng tiền nào ở đây để mà ghi.
        // Suy từ cột thu hộ thay vì từ số tiền thật sẽ đẻ ra một bút toán không có thật.
        assert.strictEqual(await soDu(id, '131'), 0, 'khách trả đủ cước ⇒ 131 bằng 0');
        assert.strictEqual(await ledger.getCollectOnBehalfOutstanding(pool, id), 0);
    });

    it('B7 — đơn KHÔNG có thu hộ: bút toán y hệt như trước bản vá', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC,
        }));

        const so = await dongSo(id);
        assert.deepStrictEqual(
            so.map((t) => `${t.event_type} ${t.debit_account}/${t.credit_account} ${Number(t.amount)}`),
            [
                `driver_debt_created 1388/131 ${CUOC}`,
                `shipment_revenue 131/511 ${CUOC}`,
            ],
        );
    });

    it('B8 — chi hộ và thu hộ cùng có mặt: hai nửa của 3388 không lẫn vào nhau', async () => {
        const CHI_HO = 300_000;   // phí cầu đường tài xế ứng túi, khách phải trả lại
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            expenses: [{ expense_type: 'toll', amount: CHI_HO }],
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + CHI_HO + THU_HO,
        }));

        const so = await dongSo(id);
        const codRows = so.filter((t) => t.event_type === 'collect_on_behalf_held');
        assert.strictEqual(codRows.length, 1, 'phải có đúng một vế thu hộ');
        assert.strictEqual(Number(codRows[0].amount), THU_HO);

        // Phần chi hộ đã được tất toán riêng và KHÔNG bị vế thu hộ nuốt mất.
        assert.strictEqual(await ledger.getPassThroughOutstanding(pool, id), 0,
            'chi hộ phải được tất toán đủ, không bị vế thu hộ tính lấn');
        assert.strictEqual(await ledger.getCollectOnBehalfOutstanding(pool, id), THU_HO,
            'thu hộ vẫn còn nguyên, không bị phép đếm chi hộ trừ mất');

        const co131 = so.filter((t) => t.credit_account === '131')
            .reduce((a, t) => a + Number(t.amount), 0);
        assert.strictEqual(co131, CUOC, 'khách chỉ nợ phần cước');
    });

    it('B9 — dữ liệu mâu thuẫn (thu hộ khai lớn hơn số tiền thật cầm) không đẻ ra vế cước âm', async () => {
        // Kế toán khai thu hộ 15tr nhưng tài xế chỉ cầm 1tr — ít hơn cả cước. Bản vá phải
        // kẹp lại chứ không được để phần cước thành số âm rồi rơi khỏi sổ.
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: 1_000_000,
        }));

        const so = await dongSo(id);
        assert.ok(so.every((t) => Number(t.amount) > 0), 'không dòng nào âm');
        const { rows: [d] } = await pool.query(
            `SELECT total_amount FROM debts WHERE order_id = $1`, [id]);
        assert.strictEqual(Number(d.total_amount), 1_000_000, 'nợ tài xế đúng số thật cầm');
    });
});

/**
 * Bút toán mới phải ĐỌC ĐƯỢC, không chỉ ghi đúng.
 *
 * Thêm một event_type mà quên khai nhãn thì màn Sổ nhật ký hiện tên máy
 * ("collect_on_behalf_held") và ô lọc từ chối chính loại đó với lỗi 400 — vì
 * EVENT_TYPE_LABEL vừa là bảng nhãn vừa là bộ kiểm tính hợp lệ của tham số lọc.
 * Sai lầm này im lặng với mọi test hiện có, nên chốt bằng cấu trúc: đối chiếu thẳng
 * danh sách CHECK trong CSDL với bảng nhãn.
 */
describe('Sổ nhật ký — mọi loại bút toán đều phải đọc được', () => {
    it('B10 — mỗi event_type CSDL cho phép đều có nhãn tiếng Việt', async () => {
        const { rows: [c] } = await pool.query(
            `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
             WHERE conname = 'financial_transactions_event_type_check'`);
        const trongDb = [...c.def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();

        const { EVENT_TYPE_LABEL } = require('../../controllers/accountantLedgerController');
        const thieu = trongDb.filter((e) => !EVENT_TYPE_LABEL[e]);

        assert.deepStrictEqual(thieu, [],
            `thiếu nhãn cho: ${thieu.join(', ')} — trên màn Sổ nhật ký sẽ hiện tên máy `
            + 'và ô lọc trả 400 cho đúng những loại này');
    });

    it('B11 — thu hộ lọc được và hiện đúng tên', async () => {
        const { EVENT_TYPE_LABEL } = require('../../controllers/accountantLedgerController');
        assert.strictEqual(EVENT_TYPE_LABEL.collect_on_behalf_held, 'Thu hộ khách (COD)');
    });
});

/**
 * ĐẦU–CUỐI: từ lúc tài xế cầm tiền tới lúc công ty trả xong cho người bán.
 *
 * Đây là câu hỏi thực tế: tài xế nộp 17 triệu về công ty rồi thì khoản "công ty đang nợ
 * người bán" nằm ở đâu và hiện ra sao? Bốn chặng:
 *
 *   1. Import   — tài xế cầm 17tr (cước 2tr + thu hộ 15tr)
 *   2. Nộp quỹ  — tiền chuyển từ túi tài xế vào két công ty. Nghĩa vụ với người bán KHÔNG
 *                 đổi: chỉ đổi chỗ ngồi của tiền, không đổi chủ sở hữu.
 *   3. Lập phiếu— kế toán lập phiếu chi trả người bán (sổ CHƯA đổi — tiền chưa ra)
 *   4. Đã chi   — tiền ra thật, khoản nợ đóng lại
 */
describe('Thu hộ — đầu đến cuối, kể cả sau khi tài xế đã nộp tiền', () => {
    let vouchers;
    let debtRepo;
    let codService;

    beforeAll(() => {
        vouchers = require('../../repositories/paymentVoucherRepository');
        debtRepo = require('../../repositories/debtRepository');
        codService = require('../../services/collectOnBehalfService');
    });

    /** Dòng hiển thị của MỘT đơn trên màn "Thu hộ (COD)". */
    const manHinh = async (orderId) => {
        const { rows } = await ledger.listCollectOnBehalfOutstanding({ search: String(orderId) });
        return rows.find((r) => Number(r.order_id) === Number(orderId)) || null;
    };

    it('B12 — bốn chặng: nộp quỹ KHÔNG làm giảm khoản nợ người bán, chỉ "đã chi" mới đóng', async () => {
        // Chặng 1: tài xế cầm cả cước lẫn thu hộ
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + THU_HO,
        }));

        assert.strictEqual(await soDu(id, '3388'), -THU_HO, 'chặng 1: 3388 dư Có = thu hộ');
        assert.strictEqual(await soDu(id, '1388'), CUOC + THU_HO, 'chặng 1: tài xế nợ 17tr');
        assert.strictEqual(Number((await manHinh(id)).con_giu), THU_HO,
            'chặng 1: màn Thu hộ hiện đúng số công ty đang nợ người bán');

        // Chặng 2: tài xế nộp trọn 17tr về công ty
        const { rows: [no] } = await pool.query(
            `SELECT id FROM debts WHERE order_id = $1 AND debt_type = 'driver'`, [id]);
        const pay = await debtRepo.submitRepayment(4, no.id, {
            amount: CUOC + THU_HO, paymentMethod: 'cash', notes: 'Nộp quỹ',
            receiptUrl: 'http://x/bienlai.jpg',
        });
        await debtRepo.confirmRepayment(pay.id, KE_TOAN);

        assert.strictEqual(await soDu(id, '1388'), 0,
            'chặng 2: tài xế hết nợ — đã nộp đủ');
        // ĐIỂM MẤU CHỐT: tiền đổi chỗ từ túi tài xế sang két công ty, nhưng nó vẫn là
        // tiền của người bán. Nghĩa vụ không được nhúc nhích.
        assert.strictEqual(await soDu(id, '3388'), -THU_HO,
            'chặng 2: tài xế nộp tiền KHÔNG làm giảm khoản công ty nợ người bán');
        assert.strictEqual(Number((await manHinh(id)).con_giu), THU_HO,
            'chặng 2: màn Thu hộ vẫn hiện nguyên 15tr');

        // Chặng 3: kế toán lập phiếu chi trả người bán
        const { voucher } = await codService.createReturnVoucher(id, {}, KE_TOAN);
        assert.strictEqual(Number(voucher.amount), THU_HO, 'bỏ trống số tiền = trả hết');
        assert.strictEqual(voucher.status, 'approved', 'phiếu duyệt sẵn, chờ chi');

        const sauLapPhieu = await manHinh(id);
        assert.strictEqual(Number(sauLapPhieu.con_giu), THU_HO,
            'chặng 3: sổ CHƯA đổi — lập phiếu không phải là đã trả tiền');
        assert.strictEqual(Number(sauLapPhieu.dang_cho_chi), THU_HO,
            'chặng 3: nhưng màn hình phải nói rõ đang có phiếu chờ chi');
        assert.strictEqual(Number(sauLapPhieu.chua_lap_phieu), 0,
            'chặng 3: phần chưa ai đụng tới về 0 — không lập phiếu lần hai được');

        // Chặng 4: kế toán bấm "Đã chi"
        await vouchers.markPaid(voucher.id, KE_TOAN, { paymentMethod: 'bank_transfer' });

        assert.strictEqual(await soDu(id, '3388'), 0,
            'chặng 4: trả xong thì khoản nợ người bán đóng lại, 3388 về 0');
        assert.strictEqual(await manHinh(id), null,
            'chặng 4: đơn biến mất khỏi màn Thu hộ — không còn nợ ai');
        assert.strictEqual(await ledger.getCollectOnBehalfOutstanding(pool, id), 0);
    });

    it('B13 — không lập được phiếu chi lần hai cho cùng một khoản', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + THU_HO,
        }));

        await codService.createReturnVoucher(id, {}, KE_TOAN);

        // Sổ vẫn còn dư Có 15tr (tiền chưa ra), nên nếu chỉ nhìn số dư 3388 thì phiếu thứ
        // hai sẽ lọt và tiền ra khỏi quỹ hai lần.
        await assert.rejects(
            () => codService.createReturnVoucher(id, {}, KE_TOAN),
            (err) => {
                assert.strictEqual(err.statusCode, 400);
                assert.ok(/đang chờ chi/.test(err.message), `câu báo: "${err.message}"`);
                return true;
            },
        );
    });

    it('B14 — không trả quá số đang giữ', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + THU_HO,
        }));

        await assert.rejects(
            () => codService.createReturnVoucher(id, { amount: THU_HO + 1_000_000 }, KE_TOAN),
            (err) => {
                assert.ok(/vượt quá khoản đang giữ/.test(err.message), `câu báo: "${err.message}"`);
                return true;
            },
        );
    });

    it('B15 — trả một phần: phần còn lại vẫn hiện trên màn hình', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + THU_HO,
        }));

        const MOT_PHAN = 5_000_000;
        const { voucher } = await codService.createReturnVoucher(id, { amount: MOT_PHAN }, KE_TOAN);
        await vouchers.markPaid(voucher.id, KE_TOAN, { paymentMethod: 'cash' });

        const conLai = THU_HO - MOT_PHAN;
        assert.strictEqual(await soDu(id, '3388'), -conLai);
        assert.strictEqual(Number((await manHinh(id)).con_giu), conLai,
            'trả 5tr thì màn hình còn hiện 10tr');
        assert.strictEqual(Number((await manHinh(id)).chua_lap_phieu), conLai,
            'và 10tr đó lập phiếu tiếp được');
    });

    it('B16 — tiền trả người bán KHÔNG bị tính thành chi phí của công ty', async () => {
        const { id } = await repo.createOrderWithShipments(donHang({
            collect_on_behalf: THU_HO,
            driver_payment_state: 'driver_holding',
            driver_holding_amount: CUOC + THU_HO,
        }));
        const { voucher } = await codService.createReturnVoucher(id, {}, KE_TOAN);
        await vouchers.markPaid(voucher.id, KE_TOAN, { paymentMethod: 'bank_transfer' });

        // Nếu bút toán rơi vào nhánh mặc định (Nợ 642 — chi phí QLDN) thì báo cáo lãi lỗ
        // đội lên đúng bằng số COD, thường lớn hơn cả tiền cước của chuyến.
        assert.strictEqual(await soDu(id, '642'), 0,
            'trả tiền thu hộ không được ghi vào tài khoản chi phí 642');

        const { rows: [ft] } = await pool.query(
            `SELECT debit_account, credit_account FROM financial_transactions
             WHERE event_type = 'collect_on_behalf_returned' AND ref_id = $1`, [id]);
        assert.strictEqual(ft.debit_account, '3388');
        assert.strictEqual(ft.credit_account, '1121', 'chuyển khoản ⇒ Có 1121');
    });
});
