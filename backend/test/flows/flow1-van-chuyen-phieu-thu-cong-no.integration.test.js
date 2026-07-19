/**
 * L2-FLOW-01 — Luồng nghiệp vụ: Vận chuyển tiền mặt → Phiếu thu → Công nợ tài xế → Nộp tiền
 *
 * Test THEO LUỒNG: các bước chạy tuần tự trên CÙNG một trạng thái DB (không reset giữa
 * các bước), mỗi bước là một mắt xích của nghiệp vụ thật, xuyên qua nhiều service:
 *
 *   tripService (driver)  →  kpiService (hệ thống)  →  coordinatorService (điều phối)
 *   →  tripService (driver thu tiền)  →  debtService (driver nộp / kế toán xác nhận)
 *   →  financial_transactions (sổ kế toán) + v_driver_debt_summary
 *
 * Kịch bản: đơn CASH 1 chuyến — driver nhận từ pool, chạy đủ vòng đời BR-009,
 * hoàn thành (BR-015) → KPI ghi ngay (BR-030) → gửi yêu cầu phiếu thu kèm km thực tế
 * (BR-008A/B) → coordinator duyệt tạo phiếu thu (BR-018/019, giá = km × đơn giá nhóm xe)
 * → driver ghi nhận khách trả TIỀN MẶT (TH2 → nợ tài xế + bút toán 1388/131)
 * → driver nộp tiền (BR-020) → kế toán xác nhận → nợ về 0 + bút toán 1111/1388.
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let tripService;
let coordinatorService;
let debtService;
let companyService;

const DRIVER_ID = 4;
const COORD_ID = 2;
const ACCT_ID = 3;
const PRICE_PER_KM = 15000;
const ACTUAL_KM = 100;
const EXPECTED_PRICE = ACTUAL_KM * PRICE_PER_KM; // 1.500.000

// Container + seed dựng MỘT LẦN cho cả file — 2 luồng chạy tuần tự trên cùng DB
beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    tripService = require('../../services/tripService');
    coordinatorService = require('../../services/coordinatorService');
    debtService = require('../../services/debtService');
    companyService = require('../../services/companyService');

    // DB script.sql tự seed roles — dọn sạch rồi seed lại với id cố định cho dễ đọc
    await pool.query(`
        TRUNCATE financial_transactions, debt_payments, debts, payment_receipts, shipment_receipts,
                 order_receipt_requests, delivery_proofs, trip_stops, shipment_assignment_history,
                 shipment_revenue_allocations, kpi_records, expenses, order_shipments, orders,
                 customers, vehicles, vehicle_groups, drivers, profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
        await pool.query(`
            INSERT INTO accounts (id, email, password_hash, role_id) VALUES
            (1,'manager@test.com','hash',1),(2,'coord@test.com','hash',2),
            (3,'acct@test.com','hash',3),(4,'driver1@test.com','hash',4)
        `);
        await pool.query(`
            INSERT INTO profiles (id, full_name, role_id) VALUES
            (1,'Manager',1),(2,'Coordinator',2),(3,'Accountant',3),(4,'Driver A',4)
        `);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Xe 5m2', ${PRICE_PER_KM})`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '51E-246.80', 1, 4, 'active')`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, default_vehicle_group_id, license_number, hire_date) VALUES (4, 1, 1, 'DL-1', CURRENT_DATE)`);
        await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1, 'individual', 'Nguyen Van A', '0912345678')`);
        await pool.query(`
            INSERT INTO orders (id, customer_id, created_by, cargo_name, payment_type, total_estimated_price)
            VALUES (1, 1, 2, 'Hang gia dung', 'cash', 1400000)
        `);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_price, estimated_distance_km, status)
            VALUES (1, 1, 1, 1, 1400000, 95, 'available')
        `);
        await pool.query(`
            INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address) VALUES
            (1, 1, 'pickup', '123 Nguyen Hue, Q1'), (1, 2, 'delivery', '45 QL51, Long Thanh')
    `);
});

afterAll(async () => {
    await teardown();
});

describe('L2-FLOW-01 — Vận chuyển tiền mặt → Phiếu thu → Công nợ tài xế → Nộp tiền', () => {
    it('B1 — Driver nhận chuyến từ pool (BR-005/007): available → claimed + lịch sử gán', async () => {
        await tripService.claimTrip(1, DRIVER_ID);

        const { rows: [s] } = await pool.query('SELECT status, claimed_at FROM order_shipments WHERE id = 1');
        assert.strictEqual(s.status, 'claimed');
        assert.notStrictEqual(s.claimed_at, null);

        const { rows: [h] } = await pool.query(
            `SELECT to_driver_id, change_reason FROM shipment_assignment_history WHERE shipment_id = 1 ORDER BY id DESC LIMIT 1`,
        );
        assert.strictEqual(h.to_driver_id, DRIVER_ID);
    });

    it('B2 — Vòng đời BR-009 tuần tự: claimed → picking → transit (kèm ảnh BR-013) → arrived', async () => {
        await tripService.updateStatus(1, DRIVER_ID, 'picking');
        await tripService.startTransit(1, DRIVER_ID, 'https://proof-loading.test/1.jpg');
        await tripService.updateStatus(1, DRIVER_ID, 'arrived');

        const { rows: [s] } = await pool.query(
            'SELECT status, picking_at, transit_at, arrived_at FROM order_shipments WHERE id = 1',
        );
        assert.strictEqual(s.status, 'arrived');
        assert.notStrictEqual(s.picking_at, null, 'BR-010: mỗi trạng thái phải có timestamp');
        assert.notStrictEqual(s.transit_at, null);
        assert.notStrictEqual(s.arrived_at, null);
    });

    it('B3 — Hoàn thành chuyến với ảnh giao hàng (BR-015) → KPI ghi ngay (BR-030)', async () => {
        await tripService.completeTrip(1, DRIVER_ID, 'https://proof-delivery.test/1.jpg');

        const { rows: [s] } = await pool.query('SELECT status, completed_at FROM order_shipments WHERE id = 1');
        assert.strictEqual(s.status, 'completed');
        assert.notStrictEqual(s.completed_at, null);

        // KPI upsert chạy fire-and-forget sau khi commit — chờ ngắn
        const now = new Date();
        let kpi = null;
        for (let i = 0; i < 20 && !kpi; i += 1) {
            await new Promise((r) => setTimeout(r, 50));
            const res = await pool.query(
                'SELECT completed_shipments FROM kpi_records WHERE driver_id = $1 AND month = $2 AND year = $3',
                [DRIVER_ID, now.getMonth() + 1, now.getFullYear()],
            );
            kpi = res.rows[0] ?? null;
        }
        assert.ok(kpi, 'BR-030: KPI phải được ghi ngay khi COMPLETED, không chờ phiếu thu');
        assert.strictEqual(Number(kpi.completed_shipments), 1);
    });

    it('B4 — Driver cuối đơn cash nhập km thực tế → tạo yêu cầu phiếu thu (BR-008A/B, BR-018)', async () => {
        const result = await tripService.requestOrderReceipt(1, DRIVER_ID, {
            shipmentId: 1,
            actualKm: ACTUAL_KM,
        });
        assert.strictEqual(result.receipt_request_created, true, 'shipment cuối của đơn cash phải sinh yêu cầu');

        const { rows: [orr] } = await pool.query('SELECT status, driver_id FROM order_receipt_requests WHERE order_id = 1');
        assert.strictEqual(orr.status, 'pending');
        assert.strictEqual(orr.driver_id, DRIVER_ID);

        const { rows: [s] } = await pool.query('SELECT actual_distance_km FROM order_shipments WHERE id = 1');
        assert.strictEqual(Number(s.actual_distance_km), ACTUAL_KM);
    });

    it('B4b — BR-018: gửi yêu cầu lần 2 cho cùng đơn bị chặn ở tầng DB (unique)', async () => {
        await assert.rejects(
            () => tripService.requestOrderReceipt(1, DRIVER_ID, { shipmentId: 1, actualKm: ACTUAL_KM }),
        );
    });

    it('B4c — Manager cập nhật QR ngân hàng công ty (dùng để hiện trên Receipt Detail khi driver chọn cách khách trả)', async () => {
        await companyService.updateCompanyInfo({ bankName: 'Vietcombank', bankAccountNumber: '0011002233', bankAccountName: 'CONG TY LOGISCOUNT' }, COORD_ID);
        const info = await companyService.getCompanyInfo();
        assert.strictEqual(info.bank_name, 'Vietcombank');
    });

    it('B5 — Coordinator duyệt yêu cầu → phiếu thu tạo với giá = km × đơn giá, chốt actual_price + bút toán doanh thu 131/511', async () => {
        const { rows: [orr] } = await pool.query('SELECT id FROM order_receipt_requests WHERE order_id = 1');
        const result = await coordinatorService.approveReceiptRequest(orr.id, COORD_ID, { notes: 'ok', expenses: [] });

        assert.strictEqual(result.total_actual_price, EXPECTED_PRICE);

        const { rows: [receipt] } = await pool.query(
            'SELECT amount, payment_type FROM shipment_receipts WHERE order_receipt_request_id = $1', [orr.id],
        );
        assert.strictEqual(Number(receipt.amount), EXPECTED_PRICE);
        assert.strictEqual(receipt.payment_type, null, 'payment_type chờ driver xác nhận cách khách trả');

        const { rows: [s] } = await pool.query('SELECT actual_price FROM order_shipments WHERE id = 1');
        assert.strictEqual(Number(s.actual_price), EXPECTED_PRICE);

        const { rows: [ft] } = await pool.query(
            `SELECT debit_account, credit_account, amount FROM financial_transactions
             WHERE event_type = 'shipment_revenue' AND ref_type = 'shipment' AND ref_id = 1`,
        );
        assert.ok(ft, 'duyệt phiếu thu phải ghi sổ doanh thu');
        assert.strictEqual(ft.debit_account, '131');
        assert.strictEqual(ft.credit_account, '511');
        assert.strictEqual(Number(ft.amount), EXPECTED_PRICE);
    });

    it('B6 — Driver ghi nhận khách trả TIỀN MẶT (TH2) → nợ tài xế + bút toán 1388/131', async () => {
        const { rows: [receipt] } = await pool.query('SELECT id FROM shipment_receipts WHERE shipment_id = 1');
        await tripService.recordReceiptCollection(receipt.id, DRIVER_ID, {
            paymentType: 'cash_collected',
            proofUrl: 'https://proof-cash.test/1.jpg',
        });

        const { rows: [r] } = await pool.query('SELECT payment_type FROM shipment_receipts WHERE id = $1', [receipt.id]);
        assert.strictEqual(r.payment_type, 'cash_collected');

        const { rows: [debt] } = await pool.query(
            `SELECT id, total_amount FROM debts WHERE debt_type = 'driver' AND driver_id = $1`, [DRIVER_ID],
        );
        assert.ok(debt, 'thu tiền mặt phải sinh nợ tài xế');
        assert.strictEqual(Number(debt.total_amount), EXPECTED_PRICE);

        const { rows: [ft] } = await pool.query(
            `SELECT debit_account, credit_account FROM financial_transactions WHERE event_type = 'driver_debt_created'`,
        );
        assert.strictEqual(ft.debit_account, '1388');
        assert.strictEqual(ft.credit_account, '131');

        const { rows: [summary] } = await pool.query('SELECT remaining_debt FROM v_driver_debt_summary WHERE driver_id = $1', [DRIVER_ID]);
        assert.strictEqual(Number(summary.remaining_debt), EXPECTED_PRICE);
    });

    it('B7 — Driver nộp tiền thu hộ (BR-020, nộp 1 phần) → khoản nộp chờ kế toán xác nhận', async () => {
        const { rows: [debt] } = await pool.query(`SELECT id FROM debts WHERE debt_type = 'driver' AND driver_id = $1`, [DRIVER_ID]);
        const payment = await debtService.submitRepayment(DRIVER_ID, debt.id, {
            amount: 1000000, paymentMethod: 'cash', notes: 'Nộp đợt 1',
        }, 'https://receipt.test/repay1.jpg');
        assert.strictEqual(payment.status, 'pending');

        // Nợ CHƯA giảm khi kế toán chưa xác nhận
        const { rows: [summary] } = await pool.query('SELECT remaining_debt FROM v_driver_debt_summary WHERE driver_id = $1', [DRIVER_ID]);
        assert.strictEqual(Number(summary.remaining_debt), EXPECTED_PRICE);
    });

    it('B8 — Kế toán xác nhận khoản nộp → nợ giảm + bút toán 1111/1388', async () => {
        const { rows: [p] } = await pool.query(`SELECT id FROM debt_payments WHERE status = 'pending'`);
        await debtService.confirmRepayment(p.id, ACCT_ID);

        const { rows: [row] } = await pool.query('SELECT status, confirmed_by FROM debt_payments WHERE id = $1', [p.id]);
        assert.strictEqual(row.status, 'confirmed');
        assert.strictEqual(row.confirmed_by, ACCT_ID);

        const { rows: [summary] } = await pool.query('SELECT remaining_debt FROM v_driver_debt_summary WHERE driver_id = $1', [DRIVER_ID]);
        assert.strictEqual(Number(summary.remaining_debt), EXPECTED_PRICE - 1000000);

        const { rows: [ft] } = await pool.query(
            `SELECT debit_account, credit_account, amount FROM financial_transactions WHERE event_type = 'driver_debt_paid'`,
        );
        assert.strictEqual(ft.debit_account, '1111');
        assert.strictEqual(ft.credit_account, '1388');
        assert.strictEqual(Number(ft.amount), 1000000);
    });

    it('B9 — Driver nộp nốt phần còn lại, kế toán xác nhận → nợ về 0, biến mất khỏi danh sách nợ', async () => {
        const { rows: [debt] } = await pool.query(`SELECT id FROM debts WHERE debt_type = 'driver' AND driver_id = $1`, [DRIVER_ID]);
        const payment = await debtService.submitRepayment(DRIVER_ID, debt.id, {
            amount: EXPECTED_PRICE - 1000000, paymentMethod: 'bank_transfer', notes: 'Nộp đợt 2 — tất toán',
        }, 'https://receipt.test/repay2.jpg');
        await debtService.confirmRepayment(payment.id, ACCT_ID);

        const { rows } = await pool.query('SELECT * FROM v_driver_debt_summary WHERE driver_id = $1', [DRIVER_ID]);
        assert.strictEqual(rows.length, 0, 'nợ đã tất toán phải biến mất khỏi summary');

        // Đối chiếu sổ: tổng driver_debt_paid = tổng nợ đã tạo
        const { rows: [sum] } = await pool.query(
            `SELECT COALESCE(SUM(amount),0) AS paid FROM financial_transactions WHERE event_type = 'driver_debt_paid'`,
        );
        assert.strictEqual(Number(sum.paid), EXPECTED_PRICE);
    });
});

describe('L2-FLOW-02 — Đơn cash nhưng khách xin nợ (TH3 client_credit) → Nợ khách → Trả dần → Tất toán', () => {
    // Dùng chung container/DB với FLOW-01 (jest chạy tuần tự các describe trong 1 file).
    // Đơn #2: đơn CASH (nên driver cuối vẫn gửi yêu cầu phiếu thu theo BR-008A), nhưng khi
    // driver mở Receipt Detail thì khách xin nợ → chọn client_credit (TH3) → nợ KHÁCH HÀNG.
    const CREDIT_PRICE = 2 * PRICE_PER_KM * 100; // 200km → 3.000.000

    beforeAll(async () => {
        await pool.query(`
            INSERT INTO customers (id, customer_type, company_name, contact_person, phone)
            VALUES (2, 'business', 'Cong ty Moc Viet', 'Mr. Hung', '0987000003')
        `);
        await pool.query(`
            INSERT INTO orders (id, customer_id, created_by, cargo_name, payment_type, total_estimated_price)
            VALUES (2, 2, 2, 'Noi that', 'cash', ${CREDIT_PRICE})
        `);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_price, estimated_distance_km, status)
            VALUES (2, 2, 1, 1, ${CREDIT_PRICE}, 200, 'available')
        `);
        await pool.query(`
            INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address) VALUES
            (2, 1, 'pickup', 'Xuong Moc Viet, Q5'), (2, 2, 'delivery', 'Cang Cat Lai')
        `);
    });

    it('B1 — Driver chạy trọn vòng đời chuyến của đơn công nợ và gửi yêu cầu phiếu thu', async () => {
        await tripService.claimTrip(2, DRIVER_ID);
        await tripService.updateStatus(2, DRIVER_ID, 'picking');
        await tripService.startTransit(2, DRIVER_ID, 'https://proof-loading.test/2.jpg');
        await tripService.updateStatus(2, DRIVER_ID, 'arrived');
        await tripService.completeTrip(2, DRIVER_ID, 'https://proof-delivery.test/2.jpg');
        const result = await tripService.requestOrderReceipt(2, DRIVER_ID, { shipmentId: 2, actualKm: 200 });
        assert.strictEqual(result.receipt_request_created, true);
    });

    it('B2 — Coordinator duyệt → phiếu thu 3.000.000; driver chọn "Khách nợ" (TH3) → nợ KHÁCH HÀNG, không nợ tài xế', async () => {
        const { rows: [orr] } = await pool.query('SELECT id FROM order_receipt_requests WHERE order_id = 2');
        await coordinatorService.approveReceiptRequest(orr.id, COORD_ID, { notes: 'cong no 30 ngay', expenses: [] });

        const { rows: [receipt] } = await pool.query('SELECT id FROM shipment_receipts WHERE shipment_id = 2');
        await tripService.recordReceiptCollection(receipt.id, DRIVER_ID, { paymentType: 'client_credit' });

        const { rows: [debt] } = await pool.query(`SELECT total_amount, customer_id FROM debts WHERE debt_type = 'customer'`);
        assert.ok(debt, 'client_credit phải sinh nợ khách hàng');
        assert.strictEqual(Number(debt.total_amount), CREDIT_PRICE);
        assert.strictEqual(debt.customer_id, 2);

        const { rows: driverDebts } = await pool.query(
            `SELECT id FROM debts WHERE debt_type = 'driver' AND shipment_id = 2`,
        );
        assert.strictEqual(driverDebts.length, 0, 'driver không thu tiền thì không được sinh nợ tài xế');
    });

    it('B3 — Kế toán ghi nhận khách trả 1 phần (chuyển khoản) → nợ giảm + bút toán customer_payment 1121/131', async () => {
        const accountantPaymentRepository = require('../../repositories/accountantPaymentRepository');
        await accountantPaymentRepository.allocatePayment('customer', 2, {
            amount: 1000000, paymentMethod: 'bank_transfer', notes: 'tra dot 1', createdBy: ACCT_ID,
        });

        const { rows: [summary] } = await pool.query('SELECT remaining_debt FROM v_customer_debt_summary WHERE customer_id = 2');
        assert.strictEqual(Number(summary.remaining_debt), CREDIT_PRICE - 1000000);

        const { rows: [ft] } = await pool.query(
            `SELECT debit_account, credit_account FROM financial_transactions WHERE event_type = 'customer_payment'`,
        );
        assert.strictEqual(ft.debit_account, '1121');
        assert.strictEqual(ft.credit_account, '131');
    });

    it('B4 — Khách trả nốt → nợ tất toán, biến mất khỏi summary; sổ cân: tổng thu = giá phiếu', async () => {
        const accountantPaymentRepository = require('../../repositories/accountantPaymentRepository');
        await accountantPaymentRepository.allocatePayment('customer', 2, {
            amount: CREDIT_PRICE - 1000000, paymentMethod: 'cash', notes: 'tat toan', createdBy: ACCT_ID,
        });

        const { rows } = await pool.query('SELECT * FROM v_customer_debt_summary WHERE customer_id = 2');
        assert.strictEqual(rows.length, 0);

        const { rows: [sum] } = await pool.query(
            `SELECT COALESCE(SUM(amount),0) AS total FROM financial_transactions WHERE event_type = 'customer_payment'`,
        );
        assert.strictEqual(Number(sum.total), CREDIT_PRICE);
    });
});

describe('L2-FLOW-01/02 — Negative paths (BR violations, invalid input, duplicate actions)', () => {
    beforeAll(async () => {
        // Đơn/chuyến riêng cho các case negative — không đụng state của 2 luồng chính ở trên.
        // Order 90 (1 chuyến duy nhất → shipment 90 tự động là final shipment) dùng cho
        // N2-N9 (chạy tuần tự trên cùng chuyến). Order 91 (1 chuyến riêng, shipment 91) chỉ
        // dùng cho N1 (thử nhận 2 chuyến cùng lúc) rồi bỏ đó, không progress tiếp.
        await pool.query(`
            INSERT INTO orders (id, customer_id, created_by, cargo_name, payment_type, total_estimated_price) VALUES
            (90, 1, 2, 'Hang test negative 1', 'cash', 500000),
            (91, 1, 2, 'Hang test negative 2', 'cash', 500000)
        `);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_price, estimated_distance_km, status)
            VALUES (90, 90, 1, 1, 500000, 30, 'available'), (91, 91, 1, 1, 500000, 30, 'available')
        `);
        await pool.query(`
            INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address) VALUES
            (90, 1, 'pickup', 'A'), (90, 2, 'delivery', 'B'),
            (91, 1, 'pickup', 'C'), (91, 2, 'delivery', 'D')
        `);
    });

    it('N1 — BR-005: driver with an active trip cannot claim a second one', async () => {
        await tripService.claimTrip(90, DRIVER_ID);
        await assert.rejects(
            () => tripService.claimTrip(91, DRIVER_ID),
            /đang có chuyến đang hoạt động/,
        );
    });

    it('N2 — BR-009: skipping a lifecycle status (claimed → arrived, bypassing picking/transit) is rejected', async () => {
        await assert.rejects(
            () => tripService.updateStatus(90, DRIVER_ID, 'arrived'),
            /Không thể chuyển trạng thái/,
        );
    });

    it('N3 — BR-013: confirming "picking → transit" without a loading proof photo is rejected', async () => {
        await tripService.updateStatus(90, DRIVER_ID, 'picking');
        await assert.rejects(
            () => tripService.startTransit(90, DRIVER_ID, null),
            /Ảnh xác nhận lấy hàng là bắt buộc/,
        );
    });

    it('N4 — BR-015: completing a trip without a delivery proof photo is rejected', async () => {
        await tripService.startTransit(90, DRIVER_ID, 'https://proof-loading.test/90.jpg');
        await tripService.updateStatus(90, DRIVER_ID, 'arrived');
        await assert.rejects(
            () => tripService.completeTrip(90, DRIVER_ID, null),
            /Ảnh xác nhận giao hàng là bắt buộc/,
        );
    });

    it('N5 — a driver cannot act on a trip that is not their own', async () => {
        const OTHER_DRIVER_ID = 999;
        await assert.rejects(
            () => tripService.updateStatus(90, OTHER_DRIVER_ID, 'picking'),
            /không có quyền/,
        );
    });

    it('N6 — submitRepayment rejects a non-positive amount', async () => {
        await tripService.completeTrip(90, DRIVER_ID, 'https://proof-delivery.test/90.jpg');
        // Không có nợ thật cho case này — chỉ cần assert validate input chạy trước khi đụng DB
        await assert.rejects(
            () => debtService.submitRepayment(DRIVER_ID, 999999, { amount: 0, paymentMethod: 'cash' }, 'https://r.test/x.jpg'),
            /Số tiền phải lớn hơn 0/,
        );
    });

    it('N7 — submitRepayment rejects when the proof photo is missing', async () => {
        await assert.rejects(
            () => debtService.submitRepayment(DRIVER_ID, 999999, { amount: 100000, paymentMethod: 'cash' }, null),
            /Ảnh chứng từ là bắt buộc/,
        );
    });

    it('N8 — approving the same receipt request twice is rejected the second time', async () => {
        const result = await tripService.requestOrderReceipt(90, DRIVER_ID, { shipmentId: 90, actualKm: 30 });
        assert.strictEqual(result.receipt_request_created, true);
        const { rows: [orr] } = await pool.query('SELECT id FROM order_receipt_requests WHERE order_id = 90');

        await coordinatorService.approveReceiptRequest(orr.id, COORD_ID, { notes: 'ok', expenses: [] });
        await assert.rejects(
            () => coordinatorService.approveReceiptRequest(orr.id, COORD_ID, { notes: 'again', expenses: [] }),
            /đã được duyệt rồi/,
        );
    });

    it('N9 — confirming the same debt repayment twice is rejected the second time', async () => {
        const { rows: [receipt] } = await pool.query('SELECT id FROM shipment_receipts WHERE shipment_id = 90');
        await tripService.recordReceiptCollection(receipt.id, DRIVER_ID, {
            paymentType: 'cash_collected', proofUrl: 'https://proof-cash.test/90.jpg',
        });
        const { rows: [debt] } = await pool.query(`SELECT id, total_amount FROM debts WHERE debt_type = 'driver' AND driver_id = $1 AND shipment_id = 90`, [DRIVER_ID]);
        const payment = await debtService.submitRepayment(DRIVER_ID, debt.id, { amount: Number(debt.total_amount), paymentMethod: 'cash' }, 'https://r.test/repay90.jpg');

        await debtService.confirmRepayment(payment.id, ACCT_ID);
        await assert.rejects(
            () => debtService.confirmRepayment(payment.id, ACCT_ID),
            /đã được xử lý/,
        );
    });
});
