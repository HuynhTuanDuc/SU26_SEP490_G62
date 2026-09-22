const { api, attachImage, authHeader, domain, getPool, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

describe('GET /api/trips/pool', () => {
    it('TC-INT-TripController-001 — shows only available shipments of the vehicle group the driver is assigned to', async () => {
        const { accounts, driverVehicle, driver2Vehicle } = await seedDriverWorld();
        const mine = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
        });
        const other = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driver2Vehicle.groupId,
        });

        const res = await api(ctx.app)
            .get('/api/trips/pool')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.trips.map((trip) => trip.shipment_id)).toContain(mine.shipmentId);
        expect(res.body.trips.map((trip) => trip.shipment_id)).not.toContain(other.shipmentId);
    });
});

runRouteGuardSuite(ctx, 'TripController', routeGuardCases.TripController);

describe('POST /api/trips/:id/claim', () => {
    it('TC-INT-TripController-002 — claims an available shipment and records the owner in the live shipment view', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
        });

        const res = await api(ctx.app)
            .post(`/api/trips/${shipment.shipmentId}/claim`)
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Nhận chuyến thành công/i);

        const current = await domain.readShipment(shipment.shipmentId);
        expect(current.status).toBe('claimed');
        expect(Number(current.owner_driver_id)).toBe(accounts.driver.id);
    });

    it('TC-INT-TripController-003 — refuses a direct claim to a shipment of another vehicle group', async () => {
        const { accounts, driver2Vehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driver2Vehicle.groupId,
        });

        const res = await api(ctx.app)
            .post(`/api/trips/${shipment.shipmentId}/claim`)
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(422);
        expect(res.body.code).toBe('VEHICLE_GROUP_MISMATCH');
    });

    it('TC-INT-TripController-004 — blocks a second claim while the driver already has an active trip', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const first = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
        });
        const second = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
        });

        await api(ctx.app)
            .post(`/api/trips/${first.shipmentId}/claim`)
            .set(authHeader(accounts.driver.token));

        const res = await api(ctx.app)
            .post(`/api/trips/${second.shipmentId}/claim`)
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/đang có chuyến đang hoạt động/i);
    });
});

describe('PATCH /api/trips/:id/status', () => {
    it('TC-INT-TripController-005 — accepts the strict claimed to picking transition and persists it', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'claimed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await api(ctx.app)
            .patch(`/api/trips/${shipment.shipmentId}/status`)
            .set(authHeader(accounts.driver.token))
            .send({ status: 'picking' });

        expect(res.status).toBe(200);
        expect((await domain.readShipment(shipment.shipmentId)).status).toBe('picking');
    });

    it('TC-INT-TripController-006 — refuses a skip from claimed straight to transit and keeps the database unchanged', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'claimed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await api(ctx.app)
            .patch(`/api/trips/${shipment.shipmentId}/status`)
            .set(authHeader(accounts.driver.token))
            .send({ status: 'transit' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Không thể chuyển trạng thái/i);
        expect((await domain.readShipment(shipment.shipmentId)).status).toBe('claimed');
    });

    it('TC-INT-TripController-007 — requires a failure reason when the driver marks a trip as failed', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'arrived',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await api(ctx.app)
            .patch(`/api/trips/${shipment.shipmentId}/status`)
            .set(authHeader(accounts.driver.token))
            .send({ status: 'failed' });

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/Lý do giao thất bại là bắt buộc/i);
    });

    it('TC-INT-TripController-008 — a failed delivery with a reason also writes an incident for coordinators to process', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'arrived',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await api(ctx.app)
            .patch(`/api/trips/${shipment.shipmentId}/status`)
            .set(authHeader(accounts.driver.token))
            .send({ status: 'failed', reason: 'Khách từ chối nhận hàng vì sai địa chỉ' });

        expect(res.status).toBe(200);

        const { rows } = await getPool().query(
            `SELECT incident_type, description
               FROM incidents
              WHERE shipment_id = $1`,
            [shipment.shipmentId],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].incident_type).toBe('customer_refusal');
        expect(rows[0].description).toMatch(/Khách từ chối nhận hàng/i);
    });
});

describe('GET /api/trips/active', () => {
    it('TC-INT-TripController-009 — returns the trip currently owned by the driver', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'claimed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await api(ctx.app)
            .get('/api/trips/active')
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(Number(res.body.trip.id)).toBe(shipment.shipmentId);
    });
});

// ─── UC-DRV-06 / BR-DRV-010 — hoàn thành chuyến bắt buộc có ảnh thực địa ────────────
describe('POST /api/trips/:id/complete', () => {
    const arrivedShipment = async () => {
        const { accounts, driverVehicle, driver2Vehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'arrived',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });
        return { accounts, driverVehicle, driver2Vehicle, shipment };
    };

    const readDeliveryProofs = async (shipmentId) => {
        const { rows } = await getPool().query(
            `SELECT captured_by, file_url, is_realtime
               FROM delivery_proofs WHERE shipment_id = $1 ORDER BY id`,
            [shipmentId],
        );
        return rows;
    };

    it('TC-INT-TripController-010 — completion without a delivery photo is refused and the trip stays arrived', async () => {
        const { accounts, shipment } = await arrivedShipment();

        const res = await api(ctx.app)
            .post(`/api/trips/${shipment.shipmentId}/complete`)
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/Ảnh xác nhận giao hàng là bắt buộc/i);

        const after = await domain.readShipment(shipment.shipmentId);
        expect(after.status).toBe('arrived');
        expect(await readDeliveryProofs(shipment.shipmentId)).toHaveLength(0);
    });

    it('TC-INT-TripController-011 — completing with one on-site photo moves the trip to completed and stores the photo with its author', async () => {
        const { accounts, shipment } = await arrivedShipment();

        const res = await attachImage(
            api(ctx.app)
                .post(`/api/trips/${shipment.shipmentId}/complete`)
                .set(authHeader(accounts.driver.token)),
            'proof',
        );

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/Hoàn thành chuyến thành công/i);

        const after = await domain.readShipment(shipment.shipmentId);
        expect(after.status).toBe('completed');

        const proofs = await readDeliveryProofs(shipment.shipmentId);
        expect(proofs).toHaveLength(1);
        expect(Number(proofs[0].captured_by)).toBe(accounts.driver.id);
        expect(proofs[0].is_realtime).toBe(true);
        expect(proofs[0].file_url).toBeTruthy();
    });

    it('TC-INT-TripController-012 — another driver cannot complete a trip they do not own', async () => {
        const { accounts, shipment } = await arrivedShipment();

        const res = await attachImage(
            api(ctx.app)
                .post(`/api/trips/${shipment.shipmentId}/complete`)
                .set(authHeader(accounts.driver2.token)),
            'proof',
        );

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/không có quyền hoàn thành/i);
        expect((await domain.readShipment(shipment.shipmentId)).status).toBe('arrived');
    });

    it('TC-INT-TripController-013 — a trip that has not arrived cannot jump straight to completed even with a photo attached', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'transit',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await attachImage(
            api(ctx.app)
                .post(`/api/trips/${shipment.shipmentId}/complete`)
                .set(authHeader(accounts.driver.token)),
            'proof',
        );

        expect(res.status).toBe(422);
        expect(res.body.error).toMatch(/"arrived"/);
        expect((await domain.readShipment(shipment.shipmentId)).status).toBe('transit');
    });
});

// ─── UC-DRV-10 / BR-DRV-024, BR-DRV-025 — báo hình thức thanh toán ─────────────────
describe('POST /api/trips/receipt-requests/:orrId/record-collection', () => {
    it('TC-INT-TripController-014 — only the three catalogued payment methods are accepted, anything else is rejected', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'completed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });
        const orrId = await domain.createReceiptRequest({
            orderId: shipment.orderId,
            shipmentId: shipment.shipmentId,
            driverId: accounts.driver.id,
            status: 'approved',
        });

        const res = await api(ctx.app)
            .post(`/api/trips/receipt-requests/${orrId}/record-collection`)
            .set(authHeader(accounts.driver.token))
            .field('payment_type', 'momo_wallet');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Hình thức thanh toán không hợp lệ/i);
    });

    it('TC-INT-TripController-015 — a missing payment method is rejected at the route before the business layer is reached', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'completed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });
        const orrId = await domain.createReceiptRequest({
            orderId: shipment.orderId,
            shipmentId: shipment.shipmentId,
            driverId: accounts.driver.id,
            status: 'approved',
        });

        const res = await api(ctx.app)
            .post(`/api/trips/receipt-requests/${orrId}/record-collection`)
            .set(authHeader(accounts.driver.token))
            .field('notes', 'Khach da thanh toan');

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Thiếu hình thức thanh toán/i);
    });
});

// /api/coordinator/trip-pool gắn ở coordinatorRoutes nhưng handler là
// tripController.getTripPool — cùng hàm mà tài xế gọi qua /api/trips/pool, chỉ khác
// chỗ điều phối không bị lọc theo nhóm xe. Nên ca này thuộc sheet TripController.
describe('GET /api/coordinator/trip-pool', () => {
    it('TC-INT-TripController-016 — the coordinator sees claimable trips from every vehicle group, unfiltered unlike a driver', async () => {
        const { accounts, driverVehicle, driver2Vehicle } = await seedDriverWorld();
        const groupOneShipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
        });
        const groupTwoShipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driver2Vehicle.groupId,
        });

        const res = await api(ctx.app)
            .get('/api/coordinator/trip-pool')
            .set(authHeader(accounts.coordinator.token));

        expect(res.status).toBe(200);
        const ids = JSON.stringify(res.body);
        expect(ids).toMatch(String(groupOneShipment.shipmentId));
        expect(ids).toMatch(String(groupTwoShipment.shipmentId));
    });
});

// Ba endpoint /vehicle-groups của coordinator, manager và accountant đều trỏ về cùng
// coordinatorController.listVehicleGroups (managerRoutes.js:21 và accountantRoutes.js:19
// require rồi gọi lại), nên cả ba nằm chung sheet CoordinatorController.
