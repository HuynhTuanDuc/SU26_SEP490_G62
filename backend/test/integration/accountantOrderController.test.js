const { api, authHeader, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'AccountantOrderController', routeGuardCases.AccountantOrderController);

const externalOrderPayload = (vehicleGroupId, ghiDe = {}) => ({
    customer_name: 'Khách Đơn Ngoài',
    customer_phone: '0903111222',
    order_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }),
    notes: 'Don nhap tay tu so ke toan',
    shipments: [{
        vehicle_group_id: vehicleGroupId,
        pickup_addresses: ['Kho Sóc Sơn, Hà Nội'],
        delivery_addresses: ['KCN Yên Phong, Bắc Ninh'],
        cargo_name: 'Hàng điện tử',
        cargo_fee: 3_000_000,
        ticket_fee: 150_000,
        distance_km: 60,
        payment_type: 'client_credit',
    }],
    ...ghiDe,
});

const countOrders = async () => {
    const { rows } = await getPool().query('SELECT COUNT(*)::int AS n FROM orders');
    return rows[0].n;
};

describe('POST /accountant/orders', () => {
    it('TC-INT-AccountantOrderController-001 — accountant books an external order and both order and shipment reach the database', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/accountant/orders')
            .set(authHeader(accounts.accountant.token))
            .send(externalOrderPayload(driverVehicle.groupId));

        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
        expect(await countOrders()).toBe(1);

        const { rows } = await getPool().query(
            `SELECT COUNT(*)::int AS n FROM order_shipments os
              JOIN orders o ON o.id = os.order_id`,
        );
        expect(rows[0].n).toBe(1);
    });

    it('TC-INT-AccountantOrderController-002 — an order carrying no shipment is rejected', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/accountant/orders')
            .set(authHeader(accounts.accountant.token))
            .send(externalOrderPayload(driverVehicle.groupId, { shipments: [] }));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/ít nhất 1 chuyến xe/i);
        expect(await countOrders()).toBe(0);
    });

    it('TC-INT-AccountantOrderController-003 — a shipment without a delivery point is rejected and the error names which shipment', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/accountant/orders')
            .set(authHeader(accounts.accountant.token))
            .send(externalOrderPayload(driverVehicle.groupId, {
                shipments: [{
                    vehicle_group_id: driverVehicle.groupId,
                    pickup_addresses: ['Kho Sóc Sơn, Hà Nội'],
                    delivery_addresses: [],
                    payment_type: 'client_credit',
                }],
            }));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Chuyến 1: cần ít nhất 1 điểm giao hàng/i);
    });

    it('TC-INT-AccountantOrderController-004 — a malformed customer phone number is rejected', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/accountant/orders')
            .set(authHeader(accounts.accountant.token))
            .send(externalOrderPayload(driverVehicle.groupId, { customer_phone: '12ab' }));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Số điện thoại không đúng định dạng/i);
    });

    it('TC-INT-AccountantOrderController-005 — client credit cannot be combined with a driver-holding-cash state', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/accountant/orders')
            .set(authHeader(accounts.accountant.token))
            .send(externalOrderPayload(driverVehicle.groupId, {
                shipments: [{
                    vehicle_group_id: driverVehicle.groupId,
                    pickup_addresses: ['Kho A'],
                    delivery_addresses: ['Kho B'],
                    payment_type: 'client_credit',
                    driver_payment_state: 'driver_holding',
                }],
            }));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Ghi nợ khách không thể kết hợp/i);
    });

    it('TC-INT-AccountantOrderController-006 — one order accepts at most 50 shipments', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const chuyen = Array.from({ length: 51 }, () => ({
            vehicle_group_id: driverVehicle.groupId,
            pickup_addresses: ['Kho A'],
            delivery_addresses: ['Kho B'],
            payment_type: 'client_credit',
        }));

        const res = await api(ctx.app)
            .post('/accountant/orders')
            .set(authHeader(accounts.accountant.token))
            .send(externalOrderPayload(driverVehicle.groupId, { shipments: chuyen }));

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/tối đa 50 chuyến/i);
    });
});

describe('GET /accountant/orders', () => {
    it('TC-INT-AccountantOrderController-007 — the accountant order list returns the order just booked', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        await api(ctx.app)
            .post('/accountant/orders')
            .set(authHeader(accounts.accountant.token))
            .send(externalOrderPayload(driverVehicle.groupId));

        const res = await api(ctx.app)
            .get('/accountant/orders')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toMatch(/Khách Đơn Ngoài/);
    });
});

describe('GET /accountant/orders/customer-by-phone', () => {
    it('TC-INT-AccountantOrderController-008 — with no phone typed the lookup returns an empty list instead of scanning every customer', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/accountant/orders/customer-by-phone')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(200);
        expect(res.body.customers).toEqual([]);
    });
});

describe('GET /accountant/orders/lookup', () => {
    it('TC-INT-AccountantOrderController-009 — the vehicle and driver lookup returns the seeded vehicle available for an external order', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/accountant/orders/lookup')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toMatch(/51C-100\.01/);
    });
});
