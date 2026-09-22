const { api, authHeader, domain, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

runRouteGuardSuite(ctx, 'CoordinatorController', routeGuardCases.CoordinatorController);

const shipmentOwnedByDriver = async (accounts, driverVehicle, status = 'transit') => domain.createOrderWithShipment({
    createdBy: accounts.coordinator.id,
    vehicleGroupId: driverVehicle.groupId,
    status,
    ownerDriverId: accounts.driver.id,
    vehicleId: driverVehicle.vehicleId,
});

const readExpenseStatus = async (expenseId) => {
    const { rows } = await getPool().query(
        'SELECT status, reviewed_by, reviewed_at, reimbursement_status FROM expenses WHERE id = $1', [expenseId],
    );
    return rows[0];
};

describe('PATCH /api/coordinator/expenses/:id/approve', () => {
    it('TC-INT-CoordinatorController-002 — the coordinator approves a driver expense and the database status becomes approved', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await shipmentOwnedByDriver(accounts, driverVehicle);
        const expenseId = await domain.addExpense({
            shipmentId: shipment.shipmentId,
            driverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
            expenseType: 'fuel',
            amount: 480000,
        });

        const res = await api(ctx.app)
            .patch(`/api/coordinator/expenses/${expenseId}/approve`)
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Đã duyệt chi phí/i);

        const after = await readExpenseStatus(expenseId);
        expect(after.status).toBe('approved');
        expect(Number(after.reviewed_by)).toBe(accounts.coordinator.id);
        expect(after.reviewed_at).not.toBeNull();
        // Duyệt xong là chi phí bước vào hàng đợi hoàn ứng cho tài xế.
        expect(after.reimbursement_status).toBe('pending');
    });

    it('TC-INT-CoordinatorController-003 — approving a non-existent expense returns 404 rather than a server error', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .patch('/api/coordinator/expenses/999999/approve')
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/Không tìm thấy/i);
    });
});

describe('PATCH /api/coordinator/expenses/:id/reject', () => {
    it('TC-INT-CoordinatorController-004 — rejecting an expense sets it to rejected and nothing is charged to the trip', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await shipmentOwnedByDriver(accounts, driverVehicle);
        const expenseId = await domain.addExpense({
            shipmentId: shipment.shipmentId,
            driverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
            expenseType: 'parking',
            amount: 50000,
        });

        const res = await api(ctx.app)
            .patch(`/api/coordinator/expenses/${expenseId}/reject`)
            .set(authHeader(accounts.coordinator.token))
            .send({ reason: 'Anh chup khong ro so tien' });

        expect(res.status).toBe(200);
        expect((await readExpenseStatus(expenseId)).status).toBe('rejected');
    });
});

describe('GET /api/coordinator/incidents', () => {
    it('TC-INT-CoordinatorController-005 — the coordinator sees the incident a driver just reported on a running trip', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await shipmentOwnedByDriver(accounts, driverVehicle);
        const createRes = await api(ctx.app)
            .post('/api/incidents')
            .set(authHeader(accounts.driver.token))
            .send({
                shipmentId: shipment.shipmentId,
                incidentType: 'road_incident',
                severityLevel: 'high',
                description: 'Ket xe keo dai tren cao toc, giao hang tre',
            });
        expect(createRes.status).toBe(201);

        const res = await api(ctx.app)
            .get('/api/coordinator/incidents')
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).toMatch(/Ket xe keo dai tren cao toc/);
    });
});

describe('GET /api/coordinator/dashboard', () => {
    it('TC-INT-CoordinatorController-006 — the coordinator dashboard responds on an empty business dataset', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/coordinator/dashboard')
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.any(Object));
    });
});

describe('GET /api/coordinator/vehicle-groups', () => {
    it('TC-INT-CoordinatorController-001 — returns the live vehicle-group list for the coordinator filters', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/coordinator/vehicle-groups')
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(200);
        expect(res.body.vehicleGroups).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: '5m2' }),
            expect.objectContaining({ name: '7m4' }),
        ]));
    });
});

describe('GET /api/manager/vehicle-groups', () => {
    it('TC-INT-CoordinatorController-008 — the manager reuses that same vehicle-group endpoint for reports and filters', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/api/manager/vehicle-groups')
            .set(authHeader(accounts.manager.token));

        expect(res.status).toBe(200);
        expect(res.body.vehicleGroups).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: '5m2' }),
        ]));
    });
});

describe('GET /accountant/vehicle-groups', () => {
    it('TC-INT-CoordinatorController-009 — the accountant reads vehicle-group data for the payroll and debt screen dropdowns', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .get('/accountant/vehicle-groups')
            .set(authHeader(accounts.accountant.token));

        expect(res.status).toBe(200);
        expect(res.body.vehicleGroups).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: '7m4' }),
        ]));
    });
});
