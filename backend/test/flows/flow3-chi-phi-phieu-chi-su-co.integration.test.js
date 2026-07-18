/**
 * L2-FLOW-04 — Luồng: Chi phí tài xế → Duyệt → Sổ kế toán  +  Phiếu chi 2 cấp
 * L2-FLOW-05 — Luồng: Sự cố giữa đường → Coordinator điều chuyển → Tài mới chạy tiếp → KPI
 *
 * Test THEO LUỒNG xuyên service/role trên cùng một DB thật:
 *   expenseService (driver khai) → expenseService.approve (coordinator duyệt, BR-021/022)
 *     → financial_transactions (pass_through 3388 vs chi phí 642 — BR-027)
 *   spendingService (kế toán lập phiếu chi → manager duyệt → kế toán chi → ghi sổ 642/111x)
 *   incidentService (driver báo hỏng xe BR-023/024/025 → coordinator resolve + thay tài
 *     → chuyển 100% doanh thu khi CHƯA lấy hàng → tài mới hoàn thành → KPI về tài mới)
 */
const assert = require('node:assert');
const { setupTestDb } = require('../helpers/testDb');

let pool;
let teardown;
let tripService;
let expenseService;
let spendingService;
let incidentService;

const MGR_ID = 1;
const COORD_ID = 2;
const ACCT_ID = 3;
const DRIVER_A = 4;
const DRIVER_B = 5;

beforeAll(async () => {
    ({ pool, teardown } = await setupTestDb());
    tripService = require('../../services/tripService');
    expenseService = require('../../services/expenseService');
    spendingService = require('../../services/spendingService');
    incidentService = require('../../services/incidentService');

    await pool.query(`
        TRUNCATE financial_transactions, payment_vouchers, expense_attachments, expenses, incidents,
                 incident_evidences, debt_payments, debts, shipment_receipts, order_receipt_requests,
                 delivery_proofs, trip_stops, shipment_assignment_history, shipment_revenue_allocations,
                 kpi_records, order_shipments, orders, customers, vehicles, vehicle_groups, drivers,
                 profiles, roles, accounts
        RESTART IDENTITY CASCADE
    `);
    await pool.query(`INSERT INTO roles (id, name) VALUES (1,'manager'),(2,'coordinator'),(3,'accountant'),(4,'driver')`);
    await pool.query(`
        INSERT INTO accounts (id, email, password_hash, role_id) VALUES
        (1,'manager@test.com','hash',1),(2,'coord@test.com','hash',2),(3,'acct@test.com','hash',3),
        (4,'driverA@test.com','hash',4),(5,'driverB@test.com','hash',4)
    `);
    await pool.query(`
        INSERT INTO profiles (id, full_name, role_id) VALUES
        (1,'Manager',1),(2,'Coordinator',2),(3,'Accountant',3),(4,'Driver A',4),(5,'Driver B',4)
    `);
    await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Xe 5m2', 15000)`);
    await pool.query(`
        INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES
        (1, '51E-111.11', 1, 4, 'active'), (2, '51E-222.22', 1, 5, 'active')
    `);
    await pool.query(`
        INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES
        (4, 1, 'DL-A', CURRENT_DATE), (5, 2, 'DL-B', CURRENT_DATE)
    `);
    await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1, 'individual', 'Khach A', '0912345678')`);
});

afterAll(async () => {
    await teardown();
});

describe('L2-FLOW-04 — Chi phí tài xế → Duyệt → Sổ kế toán + Phiếu chi 2 cấp', () => {
    beforeAll(async () => {
        // Chuyến đang chạy (transit) của Driver A — điều kiện để khai chi phí
        await pool.query(`INSERT INTO orders (id, customer_id, created_by, payment_type) VALUES (1, 1, 2, 'bank_transfer')`);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, status, claimed_at, picking_at, transit_at)
            VALUES (1, 1, 1, 1, 'transit', NOW(), NOW(), NOW())
        `);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (1, 4, 1, 4, 'self_claim')
        `);
    });

    it('B1 — Driver khai 2 chi phí kèm ảnh (BR-021): dầu 500k (công ty chịu) + cầu đường 120k (khách chịu) → pending', async () => {
        await expenseService.createExpense(DRIVER_A, {
            shipmentId: 1, expenseType: 'fuel', amount: 500000, description: 'Do dau', receiptUrl: 'https://r.test/fuel.jpg',
        });
        await expenseService.createExpense(DRIVER_A, {
            shipmentId: 1, expenseType: 'toll', amount: 120000, description: 'BOT Long Thanh', receiptUrl: 'https://r.test/toll.jpg',
        });

        const { rows } = await pool.query(`SELECT expense_type, status, vehicle_id FROM expenses ORDER BY id`);
        assert.strictEqual(rows.length, 2);
        assert.ok(rows.every((r) => r.status === 'pending'), 'chi phí driver khai phải chờ duyệt');
        assert.ok(rows.every((r) => r.vehicle_id === 1), 'BR-022: chi phí gắn với xe của driver');

        const { rows: [ft] } = await pool.query('SELECT COUNT(*)::int AS c FROM financial_transactions');
        assert.strictEqual(ft.c, 0, 'chưa duyệt thì chưa được ghi sổ');
    });

    it('B2 — Coordinator duyệt cả 2 → CHƯA ghi sổ (tiền tài ứng túi), chuyển trạng thái "chờ hoàn" cho tài', async () => {
        const { rows: expenses } = await pool.query('SELECT id, expense_type FROM expenses ORDER BY id');
        for (const e of expenses) {
            await expenseService.approveExpense(e.id, COORD_ID);
        }

        const { rows } = await pool.query(`SELECT reimbursement_status FROM expenses ORDER BY id`);
        assert.ok(rows.every((r) => r.reimbursement_status === 'pending'),
            'duyệt = xác nhận công ty NỢ TÀI, chưa phải đã chi tiền');

        const { rows: [c] } = await pool.query(`SELECT COUNT(*)::int AS c FROM financial_transactions WHERE ref_type = 'expense'`);
        assert.strictEqual(c.c, 0, 'chưa hoàn cho tài thì sổ chưa được ghi chi');
    });

    it('B3 — Kế toán lập phiếu chi tiền điện 2,5tr (pending) — kế toán KHÔNG tự duyệt được', async () => {
        const voucher = await spendingService.createVoucher({
            voucher_type: 'utilities', amount: 2_500_000, payee: 'Dien luc TP.HCM',
            reason: 'Tien dien thang nay', payment_method: 'bank_transfer',
        }, ACCT_ID);
        assert.strictEqual(voucher.status, 'pending');

        const { rows: [ft] } = await pool.query(
            `SELECT COUNT(*)::int AS c FROM financial_transactions WHERE ref_type = 'voucher'`,
        );
        assert.strictEqual(ft.c, 0, 'phiếu chưa duyệt/chưa chi thì chưa ghi sổ');
    });

    it('B4 — Manager duyệt phiếu → approved; kế toán xác nhận đã chi → paid + bút toán 642/1121 (chuyển khoản)', async () => {
        const { rows: [v] } = await pool.query(`SELECT id FROM payment_vouchers WHERE status = 'pending'`);

        const approved = await spendingService.approveVoucher(v.id, MGR_ID);
        assert.strictEqual(approved.status, 'approved');
        // Duyệt xong tiền vẫn CHƯA ra khỏi sổ
        const { rows: [mid] } = await pool.query(`SELECT COUNT(*)::int AS c FROM financial_transactions WHERE ref_type = 'voucher'`);
        assert.strictEqual(mid.c, 0);

        const paid = await spendingService.payVoucher(v.id, ACCT_ID);
        assert.strictEqual(paid.status, 'paid');

        const { rows: [ft] } = await pool.query(
            `SELECT debit_account, credit_account, amount FROM financial_transactions WHERE ref_type = 'voucher' AND ref_id = $1`, [v.id],
        );
        assert.strictEqual(ft.debit_account, '642');
        assert.strictEqual(ft.credit_account, '1121', 'chuyển khoản → có TK 1121, không phải 1111');
        assert.strictEqual(Number(ft.amount), 2_500_000);
    });

    it('B5 — Tổng hợp chi lúc này CHỈ có phiếu chi 2,5tr — khoản tài ứng chưa hoàn thì chưa phải tiền công ty đã chi', async () => {
        const now = new Date();
        const summary = await spendingService.getSpendingSummary({ month: now.getMonth() + 1, year: now.getFullYear() });

        const byType = Object.fromEntries(summary.by_type.map((r) => [r.event_type, Number(r.total_amount)]));
        assert.strictEqual(byType.expense_recorded, 2_500_000, 'chỉ phiếu chi; 500k dầu chưa hoàn cho tài');
        assert.strictEqual(byType.pass_through_cost ?? 0, 0, '120k chi hộ chưa hoàn — chưa vào sổ');
    });

    it('B6 — TH1: generate lương thấy ô "Hoàn chi phí" = 620k; chi lương → expense tất toán + bút toán 3388/334 và 642/334', async () => {
        const accountantPayrollRepository = require('../../repositories/accountantPayrollRepository');
        const now = new Date();
        await accountantPayrollRepository.calculateAndUpsertPayrolls(now.getMonth() + 1, now.getFullYear());

        const { rows: [p] } = await pool.query('SELECT id, expense_reimbursement, net_salary FROM payrolls WHERE driver_id = $1', [DRIVER_A]);
        assert.strictEqual(Number(p.expense_reimbursement), 620000, 'ô Hoàn chi phí = 500k dầu + 120k cầu đường');

        await accountantPayrollRepository.confirmPayroll(p.id, ACCT_ID);
        await accountantPayrollRepository.markPayrollPaid(p.id, ACCT_ID);

        const { rows: exps } = await pool.query(`SELECT reimbursement_status FROM expenses WHERE reimbursement_status IS NOT NULL`);
        assert.ok(exps.every((e) => e.reimbursement_status === 'paid_via_payroll'), 'mọi khoản ứng tất toán qua lương');

        const { rows: fts } = await pool.query(
            `SELECT event_type, debit_account, credit_account, amount::numeric AS amount
             FROM financial_transactions WHERE credit_account = '334' AND event_type IN ('pass_through_cost','expense_recorded')`,
        );
        const pass = fts.find((f) => f.event_type === 'pass_through_cost');
        const comp = fts.find((f) => f.event_type === 'expense_recorded');
        assert.strictEqual(Number(pass.amount), 120000, 'chi hộ hoàn qua lương: 3388/334');
        assert.strictEqual(pass.debit_account, '3388');
        assert.strictEqual(Number(comp.amount), 500000, 'chi phí công ty hoàn qua lương: 642/334');
        assert.strictEqual(comp.debit_account, '642');
    });
});

describe('L2-FLOW-05 — Sự cố hỏng xe → Điều chuyển tài → Tài mới hoàn thành → KPI', () => {
    beforeAll(async () => {
        // Driver A hoàn thành nốt chuyến 1 (đang transit từ FLOW-04) — BR-006: xe còn
        // chuyến hoạt động thì không nhận được chuyến mới
        await tripService.updateStatus(1, DRIVER_A, 'arrived');
        await tripService.completeTrip(1, DRIVER_A, 'https://proof-delivery.test/1.jpg');

        // Chuyến thứ 2 — Driver A nhận rồi hỏng xe khi CHƯA lấy hàng
        await pool.query(`INSERT INTO orders (id, customer_id, created_by, payment_type) VALUES (2, 1, 2, 'bank_transfer')`);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_price, status)
            VALUES (2, 2, 1, 1, 2000000, 'available')
        `);
        await pool.query(`
            INSERT INTO trip_stops (shipment_id, stop_index, stop_type, address) VALUES
            (2, 1, 'pickup', 'Kho Q1'), (2, 2, 'delivery', 'KCN Song Than')
        `);
    });

    it('B1 — Driver A nhận chuyến, đang picking thì báo sự cố hỏng xe (BR-023: driver không tự đóng)', async () => {
        await tripService.claimTrip(2, DRIVER_A);
        await tripService.updateStatus(2, DRIVER_A, 'picking');

        const incident = await incidentService.createIncident(DRIVER_A, {
            shipmentId: 2, incidentType: 'vehicle_breakdown', severityLevel: 'high',
            description: 'Xe chet may giua duong, khong the tiep tuc chuyen',
            location: 'Cau Phu My',
        }, ['https://evidence.test/1.jpg']);

        assert.strictEqual(incident.status, 'open');
        const { rows: [ev] } = await pool.query('SELECT COUNT(*)::int AS c FROM incident_evidences WHERE incident_id = $1', [incident.id]);
        assert.strictEqual(ev.c, 1);
    });

    it('B2 — Coordinator resolve + điều Driver B thay (BR-024/025): chuyến sang tài mới, doanh thu chuyển 100% (chưa lấy hàng)', async () => {
        const { rows: [inc] } = await pool.query(`SELECT id FROM incidents WHERE status = 'open'`);
        await incidentService.updateIncidentStatus(inc.id, COORD_ID, {
            status: 'resolved', resolution: 'Dieu xe 51E-222.22 thay the', replacementDriverId: DRIVER_B,
        });

        const { rows: [i] } = await pool.query('SELECT status, replacement_driver_id, replacement_vehicle_id FROM incidents WHERE id = $1', [inc.id]);
        assert.strictEqual(i.status, 'resolved');
        assert.strictEqual(i.replacement_driver_id, DRIVER_B);
        assert.strictEqual(i.replacement_vehicle_id, 2);

        const { rows: [owner] } = await pool.query('SELECT owner_driver_id FROM v_shipment_current WHERE shipment_id = 2');
        assert.strictEqual(owner.owner_driver_id, DRIVER_B, 'chuyến phải thuộc về tài thay thế');

        const { rows: allocs } = await pool.query(
            'SELECT driver_id, share_percent, allocation_reason FROM shipment_revenue_allocations WHERE shipment_id = 2',
        );
        assert.strictEqual(allocs.length, 1);
        assert.strictEqual(allocs[0].driver_id, DRIVER_B);
        assert.strictEqual(Number(allocs[0].share_percent), 100, 'chưa lấy hàng → chuyển toàn bộ doanh thu');
        assert.strictEqual(allocs[0].allocation_reason, 'incident_full_transfer');
    });

    it('B3 — Driver B chạy tiếp vòng đời và hoàn thành → KPI ghi cho Driver B, không phải Driver A', async () => {
        await tripService.startTransit(2, DRIVER_B, 'https://proof-loading.test/2.jpg');
        await tripService.updateStatus(2, DRIVER_B, 'arrived');
        await tripService.completeTrip(2, DRIVER_B, 'https://proof-delivery.test/2.jpg');

        const { rows: [s] } = await pool.query('SELECT status FROM order_shipments WHERE id = 2');
        assert.strictEqual(s.status, 'completed');

        const now = new Date();
        let kpiB = null;
        for (let i = 0; i < 20 && !kpiB; i += 1) {
            await new Promise((r) => setTimeout(r, 50));
            const res = await pool.query(
                'SELECT completed_shipments FROM kpi_records WHERE driver_id = $1 AND month = $2 AND year = $3',
                [DRIVER_B, now.getMonth() + 1, now.getFullYear()],
            );
            kpiB = res.rows[0] ?? null;
        }
        assert.ok(kpiB, 'KPI của tài thay thế phải được ghi');
        assert.strictEqual(Number(kpiB.completed_shipments), 1);

        // Driver A chỉ được tính chuyến 1 (đã hoàn thành trước sự cố) — chuyến 2 đã
        // chuyển 100% cho Driver B nên KPI của A giữ nguyên 1, không thành 2
        const { rows: [kpiA] } = await pool.query(
            'SELECT completed_shipments FROM kpi_records WHERE driver_id = $1 AND month = $2 AND year = $3',
            [DRIVER_A, now.getMonth() + 1, now.getFullYear()],
        );
        assert.strictEqual(Number(kpiA.completed_shipments), 1, 'Driver A không được cộng chuyến đã điều chuyển');
    });
});
