const { api, authHeader, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'VehicleManagementController', routeGuardCases.VehicleManagementController);

const readVehicleGroup = async (id) => {
    const { rows } = await getPool().query(
        'SELECT id, name, price_per_km, max_load_weight_kg, status FROM vehicle_groups WHERE id = $1',
        [id],
    );
    return rows[0] ?? null;
};

const readVehicle = async (id) => {
    const { rows } = await getPool().query(
        'SELECT id, plate_number, vehicle_group_id, status, assigned_driver_id FROM vehicles WHERE id = $1',
        [id],
    );
    return rows[0] ?? null;
};

describe('POST /api/admin/vehicle-groups', () => {
    it('TC-INT-VehicleManagementController-001 — the manager creates a vehicle group and the price per km is stored correctly', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/admin/vehicle-groups')
            .set(authHeader(accounts.manager.token))
            .send({ name: '9m6', price_per_km: 18000, max_load_weight_kg: 8000, description: 'Xe thùng dài 9m6' });

        expect(res.status).toBe(201);
        const stored = await readVehicleGroup(res.body.vehicleGroup.id);
        expect(stored.name).toBe('9m6');
        expect(Number(stored.price_per_km)).toBe(18000);
        expect(Number(stored.max_load_weight_kg)).toBe(8000);
    });

    it('TC-INT-VehicleManagementController-002 — a vehicle group without a price per km is refused', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/admin/vehicle-groups')
            .set(authHeader(accounts.manager.token))
            .send({ name: 'Nhóm thiếu giá' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/price_per_km is required/i);

        const { rows } = await getPool().query(
            'SELECT COUNT(*)::int AS n FROM vehicle_groups WHERE name = $1', ['Nhóm thiếu giá'],
        );
        expect(rows[0].n).toBe(0);
    });

    it('TC-INT-VehicleManagementController-003 — a duplicate vehicle-group name returns 409', async () => {
        const { accounts } = await seedDriverWorld();

        // seedDriverWorld đã tạo sẵn nhóm '5m2'.
        const res = await api(ctx.app)
            .post('/api/admin/vehicle-groups')
            .set(authHeader(accounts.manager.token))
            .send({ name: '5m2', price_per_km: 12000 });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/name already exists/i);
    });

    it('TC-INT-VehicleManagementController-004 — the accountant can read the vehicle-group list but cannot create one', async () => {
        const { accounts } = await seedDriverWorld();

        const readRes = await api(ctx.app)
            .get('/api/admin/vehicle-groups')
            .set(authHeader(accounts.accountant.token));
        expect(readRes.status).toBe(200);

        const writeRes = await api(ctx.app)
            .post('/api/admin/vehicle-groups')
            .set(authHeader(accounts.accountant.token))
            .send({ name: 'Kế toán tự tạo', price_per_km: 10000 });
        expect(writeRes.status).toBe(403);
    });
});

describe('DELETE /api/admin/vehicle-groups/:id', () => {
    it('TC-INT-VehicleManagementController-005 — a vehicle group still holding vehicles cannot be hidden and the error names the plate', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .delete(`/api/admin/vehicle-groups/${driverVehicle.groupId}`)
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Không thể ẩn nhóm xe vì còn 1 xe đang dùng/i);
        expect(res.body.error).toMatch(/51C-100\.01/);

        // Nhóm xe vẫn còn nguyên — không bị ẩn nửa vời.
        expect(await readVehicleGroup(driverVehicle.groupId)).not.toBeNull();
    });

    it('TC-INT-VehicleManagementController-006 — an empty vehicle group can be hidden and its status becomes hidden', async () => {
        const { accounts } = await seedDriverWorld();
        const createRes = await api(ctx.app)
            .post('/api/admin/vehicle-groups')
            .set(authHeader(accounts.manager.token))
            .send({ name: 'Nhóm rỗng', price_per_km: 9000 });

        const res = await api(ctx.app)
            .delete(`/api/admin/vehicle-groups/${createRes.body.vehicleGroup.id}`)
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBe(200);
        expect((await readVehicleGroup(createRes.body.vehicleGroup.id)).status).toBe('hidden');
    });
});

describe('POST /api/admin/vehicles', () => {
    it('TC-INT-VehicleManagementController-007 — a new vehicle joins an existing group and starts in the active status', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/admin/vehicles')
            .set(authHeader(accounts.manager.token))
            .send({ plate_number: '51C-200.99', vehicle_group_id: driverVehicle.groupId, load_capacity_kg: 5000 });

        expect(res.status).toBe(201);
        const stored = await readVehicle(res.body.vehicle.id);
        expect(stored.plate_number).toBe('51C-200.99');
        expect(stored.status).toBe('active');
        expect(Number(stored.vehicle_group_id)).toBe(driverVehicle.groupId);
    });

    it('TC-INT-VehicleManagementController-008 — an existing plate number returns 409 and no second vehicle is created', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/admin/vehicles')
            .set(authHeader(accounts.manager.token))
            .send({ plate_number: '51C-100.01', vehicle_group_id: driverVehicle.groupId });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/Plate number already exists/i);

        const { rows } = await getPool().query(
            'SELECT COUNT(*)::int AS n FROM vehicles WHERE plate_number = $1', ['51C-100.01'],
        );
        expect(rows[0].n).toBe(1);
    });

    it('TC-INT-VehicleManagementController-009 — a vehicle cannot be created in any status but active, lifecycle changes need their own actions', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/admin/vehicles')
            .set(authHeader(accounts.manager.token))
            .send({ plate_number: '51C-200.98', vehicle_group_id: driverVehicle.groupId, status: 'maintenance' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/only supports initial status ACTIVE/i);
    });

    it('TC-INT-VehicleManagementController-010 — a vehicle referencing a non-existent group is refused', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/admin/vehicles')
            .set(authHeader(accounts.manager.token))
            .send({ plate_number: '51C-200.97', vehicle_group_id: 999999 });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Vehicle group does not exist/i);
    });

    it('TC-INT-VehicleManagementController-011 — a driver already assigned to a vehicle cannot be given a second one', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/admin/vehicles')
            .set(authHeader(accounts.manager.token))
            .send({
                plate_number: '51C-200.96',
                vehicle_group_id: driverVehicle.groupId,
                assigned_driver_id: accounts.driver.id,
            });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/already assigned to another vehicle/i);
    });
});
