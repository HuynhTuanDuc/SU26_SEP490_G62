const { api, attachImage, authHeader, domain, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

describe('POST /api/expenses', () => {
    it('TC-INT-ExpenseController-001 — rejects an expense without a receipt image before any record is created', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'claimed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await api(ctx.app)
            .post('/api/expenses')
            .set(authHeader(accounts.driver.token))
            .field('shipmentId', String(shipment.shipmentId))
            .field('expenseType', 'toll')
            .field('amount', '120000');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Ảnh bằng chứng là bắt buộc/i);
    });

    it('TC-INT-ExpenseController-002 — creates a pending expense with its receipt attachment on an active trip', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'claimed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await attachImage(
            api(ctx.app)
                .post('/api/expenses')
                .set(authHeader(accounts.driver.token))
                .field('shipmentId', String(shipment.shipmentId))
                .field('expenseType', 'toll')
                .field('amount', '120000')
                .field('description', 'Phi qua tram thu phi'),
            'receipt',
        );

        expect(res.status).toBe(201);
        expect(res.body.expenses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                shipment_id: shipment.shipmentId,
                expense_type: 'toll',
                status: 'pending',
            }),
        ]));
    });

    it('TC-INT-ExpenseController-003 — blocks a new expense after the trip has ended and no rejected receipt request reopens it', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'completed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await attachImage(
            api(ctx.app)
                .post('/api/expenses')
                .set(authHeader(accounts.driver.token))
                .field('shipmentId', String(shipment.shipmentId))
                .field('expenseType', 'fuel')
                .field('amount', '350000'),
            'receipt',
        );

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/Không thể thêm chi phí khi chuyến đã kết thúc/i);
    });
});

runRouteGuardSuite(ctx, 'ExpenseController', routeGuardCases.ExpenseController);

describe('GET /api/expenses/shipment/:shipmentId', () => {
    it('TC-INT-ExpenseController-004 — refuses another driver reading the expenses of a trip they do not own', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'claimed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });
        await domain.addExpense({
            shipmentId: shipment.shipmentId,
            driverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await api(ctx.app)
            .get(`/api/expenses/shipment/${shipment.shipmentId}`)
            .set(authHeader(accounts.driver2.token));

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/không có quyền xem chi phí/i);
    });
});
