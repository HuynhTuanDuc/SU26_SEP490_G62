const { api, authHeader, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'CustomerController', routeGuardCases.CustomerController);

const countCustomers = async () => {
    const { rows } = await getPool().query('SELECT COUNT(*)::int AS n FROM customers');
    return rows[0].n;
};

describe('POST /api/customers', () => {
    it('TC-INT-CustomerController-001 — the coordinator creates an individual customer and the row is stored in the database', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/customers')
            .set(authHeader(accounts.coordinator.token))
            .send({
                customer_type: 'individual',
                full_name: 'Nguyễn Văn Khách',
                phone: '0912345678',
                address: 'Số 1 Trần Duy Hưng, Hà Nội',
            });

        expect(res.status).toBe(201);
        expect(res.body.customer).toMatchObject({
            full_name: 'Nguyễn Văn Khách',
            phone: '0912345678',
            customer_type: 'individual',
        });

        const { rows } = await getPool().query(
            'SELECT full_name, phone, customer_type FROM customers WHERE id = $1',
            [res.body.customer.id],
        );
        expect(rows[0]).toEqual({
            full_name: 'Nguyễn Văn Khách',
            phone: '0912345678',
            customer_type: 'individual',
        });
    });

    it('TC-INT-CustomerController-002 — a missing phone number is refused and no customer row is written', async () => {
        const { accounts } = await seedDriverWorld();
        const before = await countCustomers();

        const res = await api(ctx.app)
            .post('/api/customers')
            .set(authHeader(accounts.coordinator.token))
            .send({ customer_type: 'individual', full_name: 'Thiếu Số Điện Thoại' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Số điện thoại là bắt buộc/i);
        expect(await countCustomers()).toBe(before);
    });

    it('TC-INT-CustomerController-003 — a business customer must carry a company name', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/customers')
            .set(authHeader(accounts.coordinator.token))
            .send({ customer_type: 'business', phone: '0912345679', full_name: 'Người Liên Hệ' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Tên công ty là bắt buộc/i);
    });

    it('TC-INT-CustomerController-004 — a phone number already registered to another customer returns 409', async () => {
        const { accounts } = await seedDriverWorld();
        await api(ctx.app)
            .post('/api/customers')
            .set(authHeader(accounts.coordinator.token))
            .send({ customer_type: 'individual', full_name: 'Khách Một', phone: '0912345680' });

        const res = await api(ctx.app)
            .post('/api/customers')
            .set(authHeader(accounts.manager.token))
            .send({ customer_type: 'individual', full_name: 'Khách Hai', phone: '0912345680' });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/đã được đăng ký cho khách hàng khác/i);

        const { rows } = await getPool().query(
            'SELECT COUNT(*)::int AS n FROM customers WHERE phone = $1', ['0912345680'],
        );
        expect(rows[0].n).toBe(1);
    });
});

describe('DELETE /api/customers/:id', () => {
    it('TC-INT-CustomerController-005 — a customer with existing orders cannot be deleted and the row stays in the database', async () => {
        const { accounts } = await seedDriverWorld();
        const createRes = await api(ctx.app)
            .post('/api/customers')
            .set(authHeader(accounts.coordinator.token))
            .send({ customer_type: 'individual', full_name: 'Khách Có Đơn', phone: '0912345681' });
        const customerId = createRes.body.customer.id;

        await getPool().query(
            `INSERT INTO orders (customer_id, created_by, cargo_name, payment_type, total_estimated_price)
             VALUES ($1, $2, 'Hàng thử', 'cash', 1000000)`,
            [customerId, accounts.coordinator.id],
        );

        const res = await api(ctx.app)
            .delete(`/api/customers/${customerId}`)
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Không thể xóa: khách hàng đã có 1 đơn hàng/i);

        const { rows } = await getPool().query('SELECT COUNT(*)::int AS n FROM customers WHERE id = $1', [customerId]);
        expect(rows[0].n).toBe(1);
    });

    it('TC-INT-CustomerController-006 — a customer with no orders is deleted and disappears from the database', async () => {
        const { accounts } = await seedDriverWorld();
        const createRes = await api(ctx.app)
            .post('/api/customers')
            .set(authHeader(accounts.coordinator.token))
            .send({ customer_type: 'individual', full_name: 'Khách Chưa Đơn', phone: '0912345682' });

        const res = await api(ctx.app)
            .delete(`/api/customers/${createRes.body.customer.id}`)
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(200);
        const { rows } = await getPool().query(
            'SELECT COUNT(*)::int AS n FROM customers WHERE id = $1', [createRes.body.customer.id],
        );
        expect(rows[0].n).toBe(0);
    });
});
