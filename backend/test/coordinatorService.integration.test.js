const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { setupTestDb } = require('./helpers/testDb');

const buildExcelBuffer = (rows) => {
    const header = ['Ngày', 'BKS', 'Lái xe', 'Khách hàng', 'SĐT', 'Hành trình', 'Quãng đường', 'Ghi chú'];
    const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

let pool;
let teardown;
let coordinatorService;

describe('Coordinator Service Integration Tests (L2)', () => {
    before(async () => {
        ({ pool, teardown } = await setupTestDb());
        coordinatorService = require('../services/coordinatorService');
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await pool.query(`
            TRUNCATE incidents, expenses, shipment_receipts, order_receipt_requests, trip_stops,
                     shipment_assignment_history, order_shipments, orders, customers, partners,
                     vehicles, vehicle_groups, drivers, profiles, roles, accounts
            RESTART IDENTITY CASCADE
        `);
        await pool.query(`INSERT INTO roles (id, name) VALUES (1, 'coordinator'), (2, 'driver') ON CONFLICT DO NOTHING`);
        await pool.query(`INSERT INTO accounts (id, email, password_hash, role_id) VALUES (1, 'coord@test.com', 'hash', 1), (2, 'driver1@test.com', 'hash', 2)`);
        await pool.query(`INSERT INTO profiles (id, full_name, role_id) VALUES (1, 'Coordinator One', 1), (2, 'Driver One', 2)`);
        await pool.query(`INSERT INTO vehicle_groups (id, name, price_per_km) VALUES (1, 'Truck 5T', 15000)`);
        await pool.query(`INSERT INTO vehicles (id, plate_number, vehicle_group_id, assigned_driver_id, status) VALUES (1, '29A-11111', 1, 2, 'active')`);
        await pool.query(`INSERT INTO drivers (profile_id, vehicle_id, license_number, hire_date) VALUES (2, 1, 'L123', CURRENT_DATE)`);
        await pool.query(`INSERT INTO customers (id, customer_type, full_name, phone) VALUES (1, 'individual', 'Nguyen Van A', '0912345678')`);
        await pool.query(`INSERT INTO orders (id, customer_id, created_by, cargo_name, payment_type, total_estimated_price) VALUES (1, 1, 1, 'Cargo', 'cash', 1000000)`);
        await pool.query(`
            INSERT INTO order_shipments (id, order_id, shipment_index, vehicle_group_id, estimated_distance_km, status)
            VALUES (1, 1, 1, 1, 100, 'completed')
        `);
        await pool.query(`
            INSERT INTO shipment_assignment_history (shipment_id, to_driver_id, to_vehicle_id, changed_by, change_reason)
            VALUES (1, 2, 1, 1, 'initial_assign')
        `);
    });

    it('listVehicleGroups() returns vehicle groups with their available vehicles', async () => {
        const groups = await coordinatorService.listVehicleGroups();
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].name, 'Truck 5T');
    });

    it('importExcel() rejects when no file buffer is provided', async () => {
        await assert.rejects(
            () => coordinatorService.importExcel(1, null),
            { message: 'Thiếu file Excel' },
        );
    });

    it('importExcel() creates an order+shipment per data row using the vehicle group price', async () => {
        const buffer = buildExcelBuffer([
            ['2999-01-01', '29A-11111', 'Driver One', 'Nguyen Van A', '0912345678', 'HN - HCM', 50, ''],
        ]);

        const result = await coordinatorService.importExcel(1, buffer);

        assert.strictEqual(result.rows.length, 1);
        assert.strictEqual(Number(result.rows[0].total_estimated_price), 50 * 15000);

        const order = await pool.query('SELECT * FROM orders WHERE id = $1', [result.rows[0].id]);
        assert.strictEqual(order.rows.length, 1);
    });

    it('importExcel() skips rows whose note marks a leave day ("nghỉ")', async () => {
        const buffer = buildExcelBuffer([
            ['2999-01-01', '29A-11111', 'Driver One', '', '', 'HN - HCM', 50, 'nghi'],
        ]);

        const result = await coordinatorService.importExcel(1, buffer);
        assert.strictEqual(result.rows.length, 0);
    });

    it('importExcel() rejects an unknown plate number', async () => {
        const buffer = buildExcelBuffer([
            ['2999-01-01', 'ZZ-99999', 'Driver One', '', '', 'HN - HCM', 50, ''],
        ]);

        await assert.rejects(
            () => coordinatorService.importExcel(1, buffer),
            /không tồn tại trong hệ thống/,
        );
    });

    it('getIncidents() delegates to the incident repository with the given filters', async () => {
        await pool.query(`
            INSERT INTO incidents (id, shipment_id, reported_by, incident_type, severity_level, description, status)
            VALUES (1, 1, 2, 'vehicle_breakdown', 'high', 'Xe hỏng giữa đường', 'open')
        `);

        const result = await coordinatorService.getIncidents({ status: 'open', page: 1, limit: 10 });

        assert.strictEqual(result.incidents.length, 1);
        assert.strictEqual(result.incidents[0].incident_type, 'vehicle_breakdown');
    });

    it('listPartners() returns partners ordered by company name', async () => {
        await pool.query(`INSERT INTO partners (id, company_name, contact_person, phone) VALUES (1, 'ACME Corp', 'Mr. A', '0900000000')`);

        const partners = await coordinatorService.listPartners();
        assert.strictEqual(partners.length, 1);
        assert.strictEqual(partners[0].company_name, 'ACME Corp');
    });

    it('getReceiptRequests() lists pending requests with driver/order/customer info', async () => {
        await pool.query(`
            INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 2, 'pending')
        `);

        const result = await coordinatorService.getReceiptRequests({ kind: 'requests' });

        assert.strictEqual(result.requests.length, 1);
        assert.strictEqual(result.requests[0].driver_name, 'Driver One');
        assert.strictEqual(result.requests[0].customer_name, 'Nguyen Van A');
        assert.strictEqual(result.pagination.total, 1);
    });

    it('getReceiptRequestDetail() rejects when the request does not exist', async () => {
        await assert.rejects(
            () => coordinatorService.getReceiptRequestDetail(999999),
            { message: 'Yêu cầu phiếu thu không tồn tại' },
        );
    });

    it('getReceiptRequestDetail() computes revenue from actual_distance_km × price_per_km', async () => {
        await pool.query(`UPDATE order_shipments SET actual_distance_km = 120 WHERE id = 1`);
        await pool.query(`
            INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 2, 'pending')
        `);

        const detail = await coordinatorService.getReceiptRequestDetail(1);

        assert.strictEqual(detail.summary.total_actual_price, 120 * 15000);
        assert.strictEqual(detail.request.driver_name, 'Driver One');
    });

    it('approveReceiptRequest() rejects when the request does not exist', async () => {
        await assert.rejects(
            () => coordinatorService.approveReceiptRequest(999999, 1, {}),
            { message: 'Yêu cầu phiếu thu không tồn tại' },
        );
    });

    it('approveReceiptRequest() approves, records expenses, and creates a pending-payment-type receipt', async () => {
        await pool.query(`UPDATE order_shipments SET actual_distance_km = 100 WHERE id = 1`);
        await pool.query(`
            INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 2, 'pending')
        `);

        const result = await coordinatorService.approveReceiptRequest(1, 1, {
            notes: 'ok',
            expenses: [{ expense_type: 'fuel', amount: 200000, shipment_id: 1 }],
        });

        assert.strictEqual(result.total_actual_price, 100 * 15000);
        assert.strictEqual(result.total_expenses, 200000);

        const request = await pool.query('SELECT status, processed_by FROM order_receipt_requests WHERE id = 1');
        assert.strictEqual(request.rows[0].status, 'approved');
        assert.strictEqual(request.rows[0].processed_by, 1);

        const receipt = await pool.query('SELECT amount, payment_type FROM shipment_receipts WHERE order_receipt_request_id = 1');
        assert.strictEqual(receipt.rows[0].payment_type, null);
        assert.strictEqual(Number(receipt.rows[0].amount), 100 * 15000);

        const expense = await pool.query('SELECT expense_type, amount FROM expenses WHERE shipment_id = 1');
        assert.strictEqual(expense.rows[0].expense_type, 'fuel');
    });

    it('approveReceiptRequest() rejects an already-approved request', async () => {
        await pool.query(`UPDATE order_shipments SET actual_distance_km = 100 WHERE id = 1`);
        await pool.query(`
            INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status, processed_by, processed_at)
            VALUES (1, 1, 1, 2, 'approved', 1, NOW())
        `);

        await assert.rejects(
            () => coordinatorService.approveReceiptRequest(1, 1, {}),
            { message: 'Yêu cầu này đã được duyệt rồi' },
        );
    });

    it('approveReceiptRequest() rejects when the shipment has no valid actual_distance_km', async () => {
        await pool.query(`UPDATE order_shipments SET estimated_distance_km = NULL, actual_distance_km = NULL WHERE id = 1`);
        await pool.query(`
            INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 2, 'pending')
        `);

        await assert.rejects(
            () => coordinatorService.approveReceiptRequest(1, 1, {}),
            /chưa có số km thực tế hợp lệ/,
        );
    });

    it('rejectReceiptRequest() rejects when the request does not exist', async () => {
        await assert.rejects(
            () => coordinatorService.rejectReceiptRequest(999999, 1, {}),
            { message: 'Yêu cầu phiếu thu không tồn tại' },
        );
    });

    it('rejectReceiptRequest() marks the request rejected with coordinator notes', async () => {
        await pool.query(`
            INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status)
            VALUES (1, 1, 1, 2, 'pending')
        `);

        const result = await coordinatorService.rejectReceiptRequest(1, 1, { notes: 'thiếu chứng từ' });

        assert.deepStrictEqual(result, { success: true });
        const row = await pool.query('SELECT status, coordinator_notes, processed_by FROM order_receipt_requests WHERE id = 1');
        assert.strictEqual(row.rows[0].status, 'rejected');
        assert.strictEqual(row.rows[0].coordinator_notes, 'thiếu chứng từ');
        assert.strictEqual(row.rows[0].processed_by, 1);
    });

    it('rejectReceiptRequest() rejects an already-rejected request', async () => {
        await pool.query(`
            INSERT INTO order_receipt_requests (id, order_id, requesting_shipment_id, driver_id, status, processed_by, processed_at)
            VALUES (1, 1, 1, 2, 'rejected', 1, NOW())
        `);

        await assert.rejects(
            () => coordinatorService.rejectReceiptRequest(1, 1, {}),
            { message: 'Yêu cầu này đã bị từ chối rồi' },
        );
    });
});
