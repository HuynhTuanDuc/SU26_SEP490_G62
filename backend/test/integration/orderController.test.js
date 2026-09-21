const { api, authHeader, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'OrderController', routeGuardCases.OrderController);

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const dayOffsetFromToday = (soNgay) => {
    const d = new Date();
    d.setDate(d.getDate() + soNgay);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const basicOrderPayload = (vehicleGroupId, ghiDe = {}) => ({
    arrived_at: today(),
    customer_name: 'Công Ty TNHH Thử',
    customer_phone: '0987000111',
    cargo_name: 'Thùng linh kiện',
    cargo_weight_kg: 1200,
    pickup_address: 'Kho Long Biên, Hà Nội',
    delivery_address: 'KCN Tiên Sơn, Bắc Ninh',
    trips: [{ vehicle_group_id: vehicleGroupId, distance: 45 }],
    ...ghiDe,
});

const countOrders = async () => {
    const { rows } = await getPool().query('SELECT COUNT(*)::int AS n FROM orders');
    return rows[0].n;
};

describe('POST /api/orders', () => {
    it('TC-INT-OrderController-002 — the coordinator creates an order with its shipment and both reach the database in one transaction', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/orders')
            .set(authHeader(accounts.coordinator.token))
            .send(basicOrderPayload(driverVehicle.groupId));

        expect(res.status).toBe(201);
        expect(res.body.message).toMatch(/Tạo đơn hàng thành công/i);

        const orderId = res.body.order?.id ?? res.body.orderId ?? res.body.id;
        const { rows: don } = await getPool().query(
            'SELECT cargo_name, created_by FROM orders WHERE id = $1', [orderId],
        );
        expect(don[0].cargo_name).toBe('Thùng linh kiện');
        expect(Number(don[0].created_by)).toBe(accounts.coordinator.id);

        const { rows: chuyen } = await getPool().query(
            'SELECT vehicle_group_id, estimated_distance_km, status FROM order_shipments WHERE order_id = $1',
            [orderId],
        );
        expect(chuyen).toHaveLength(1);
        expect(Number(chuyen[0].vehicle_group_id)).toBe(driverVehicle.groupId);
        expect(Number(chuyen[0].estimated_distance_km)).toBe(45);
    });

    it('TC-INT-OrderController-003 — a missing pickup or delivery point is refused and no order row is written', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const before = await countOrders();

        const res = await api(ctx.app)
            .post('/api/orders')
            .set(authHeader(accounts.coordinator.token))
            .send(basicOrderPayload(driverVehicle.groupId, { delivery_address: '' }));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Thiếu điểm nhận hoặc điểm đến/i);
        expect(await countOrders()).toBe(before);
    });

    it('TC-INT-OrderController-004 — a delivery date earlier than today is rejected', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/orders')
            .set(authHeader(accounts.coordinator.token))
            .send(basicOrderPayload(driverVehicle.groupId, { arrived_at: dayOffsetFromToday(-1) }));

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/Ngày không được trước hôm nay/i);
    });

    it('TC-INT-OrderController-005 — a shipment without a distance cannot be priced and the whole order is rolled back', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const before = await countOrders();

        const res = await api(ctx.app)
            .post('/api/orders')
            .set(authHeader(accounts.coordinator.token))
            .send(basicOrderPayload(driverVehicle.groupId, {
                trips: [{ vehicle_group_id: driverVehicle.groupId }],
            }));

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/Quãng đường là bắt buộc/i);
        // Giao dịch phải rollback trọn vẹn: khách hàng có thể đã được tạo trước khi
        // vòng lặp chuyến ném lỗi, nhưng đơn hàng thì tuyệt đối không được còn lại.
        expect(await countOrders()).toBe(before);
    });
});

describe('GET /api/orders/customer-by-phone', () => {
    it('TC-INT-OrderController-006 — typing the full phone number returns the customer already in the system', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        await api(ctx.app)
            .post('/api/orders')
            .set(authHeader(accounts.coordinator.token))
            .send(basicOrderPayload(driverVehicle.groupId));

        const res = await api(ctx.app)
            .get('/api/orders/customer-by-phone?phone=0987000111')
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toMatch(/0987000111/);
    });
});

describe('GET /api/orders', () => {
    it('TC-INT-OrderController-007 — the coordinator order list returns the order just created', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        await api(ctx.app)
            .post('/api/orders')
            .set(authHeader(accounts.coordinator.token))
            .send(basicOrderPayload(driverVehicle.groupId));

        const res = await api(ctx.app)
            .get('/api/orders')
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toMatch(/Thùng linh kiện/);
    });
});

describe('GET /api/orders/customer-by-phone — nothing typed yet', () => {
    it('TC-INT-OrderController-001 — with no phone fragment typed the suggestion list comes back empty', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/orders/customer-by-phone')
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(200);
        expect(res.body.customers).toEqual([]);
    });
});
