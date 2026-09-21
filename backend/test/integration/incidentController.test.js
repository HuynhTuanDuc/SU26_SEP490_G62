const { api, authHeader, domain, seedDriverWorld, setupL2Suite } = require('./support');
const routeGuardCases = require('./routeGuardCases');
const { runRouteGuardSuite } = require('./routeGuardSupport');

const ctx = setupL2Suite();

describe('POST /api/incidents', () => {
    it('TC-INT-IncidentController-001 — creates a shipment incident for the driver who currently owns the active trip', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'transit',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const res = await api(ctx.app)
            .post('/api/incidents')
            .set(authHeader(accounts.driver.token))
            .send({
                shipmentId: shipment.shipmentId,
                incidentType: 'road_incident',
                severityLevel: 'high',
                description: 'Tai nan nhe o giao lo can dieu phoi ho tro',
                location: 'Nga tu Hang Xanh',
            });

        expect(res.status).toBe(201);
        expect(res.body.incident).toMatchObject({
            shipment_id: shipment.shipmentId,
            incident_type: 'road_incident',
            reported_by: accounts.driver.id,
        });
    });

    it('TC-INT-IncidentController-002 — rejects a second incident of the same type on the same shipment', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'transit',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        await api(ctx.app)
            .post('/api/incidents')
            .set(authHeader(accounts.driver.token))
            .send({
                shipmentId: shipment.shipmentId,
                incidentType: 'cargo_damage',
                description: 'Thung hang bi moc vach va co dau hieu vo',
            });

        const res = await api(ctx.app)
            .post('/api/incidents')
            .set(authHeader(accounts.driver.token))
            .send({
                shipmentId: shipment.shipmentId,
                incidentType: 'cargo_damage',
                description: 'Bao lai cung mot loai su co tren cung chuyen',
            });

        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/đã có sự cố loại/i);
    });

    it('TC-INT-IncidentController-003 — allows a free vehicle breakdown report without binding it to a shipment', async () => {
        const { accounts } = await seedDriverWorld();

        const res = await api(ctx.app)
            .post('/api/incidents')
            .set(authHeader(accounts.driver.token))
            .send({
                incidentType: 'vehicle_breakdown',
                severityLevel: 'medium',
                description: 'Dong co mat luc giua duong can doi xe ho tro',
                location: 'Quoc lo 1A',
            });

        expect(res.status).toBe(201);
        expect(res.body.incident.shipment_id).toBeNull();
        expect(res.body.incident.incident_type).toBe('vehicle_breakdown');
    });
});

runRouteGuardSuite(ctx, 'IncidentController', routeGuardCases.IncidentController);

describe('GET /api/incidents/:id', () => {
    it('TC-INT-IncidentController-004 — another driver cannot read the detail of an incident they did not report', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'claimed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const created = await api(ctx.app)
            .post('/api/incidents')
            .set(authHeader(accounts.driver.token))
            .send({
                shipmentId: shipment.shipmentId,
                incidentType: 'road_incident',
                description: 'Duong dang bi phong toa tam thoi do cong trinh',
            });

        const res = await api(ctx.app)
            .get(`/api/incidents/${created.body.incident.id}`)
            .set(authHeader(accounts.driver2.token));

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/không có quyền xem sự cố/i);
    });
});

describe('PATCH /api/incidents/:id', () => {
    it('TC-INT-IncidentController-005 — the reporting driver can update an open incident and coordinators see the edited detail', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'claimed',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });

        const created = await api(ctx.app)
            .post('/api/incidents')
            .set(authHeader(accounts.driver.token))
            .send({
                shipmentId: shipment.shipmentId,
                incidentType: 'cargo_damage',
                severityLevel: 'medium',
                description: 'Tem nhan tren kien hang bi rach can lap bien ban',
            });

        const res = await api(ctx.app)
            .patch(`/api/incidents/${created.body.incident.id}`)
            .set(authHeader(accounts.driver.token))
            .send({
                severityLevel: 'high',
                description: 'Tem nhan va vo thung deu hong, can doi chieu lai ngay',
                location: 'Kho Binh Tan',
            });

        expect(res.status).toBe(200);
        expect(res.body.incident).toMatchObject({
            id: created.body.incident.id,
            severity_level: 'high',
            location: 'Kho Binh Tan',
        });
    });
});

describe('GET /api/incidents/:id', () => {
    it('TC-INT-IncidentController-006 — the reporting driver reads back the full detail of their own incident', async () => {
        const { accounts, driverVehicle } = await seedDriverWorld();
        const shipment = await domain.createOrderWithShipment({
            createdBy: accounts.coordinator.id,
            vehicleGroupId: driverVehicle.groupId,
            status: 'transit',
            ownerDriverId: accounts.driver.id,
            vehicleId: driverVehicle.vehicleId,
        });
        const created = await api(ctx.app)
            .post('/api/incidents')
            .set(authHeader(accounts.driver.token))
            .send({
                shipmentId: shipment.shipmentId,
                incidentType: 'vehicle_breakdown',
                severityLevel: 'high',
                description: 'Xe thung lop truoc phai, can cuu ho tai cho',
                location: 'Quoc lo 1A km 25',
            });
        expect(created.status).toBe(201);

        const res = await api(ctx.app)
            .get(`/api/incidents/${created.body.incident.id}`)
            .set(authHeader(accounts.driver.token));

        expect(res.status).toBe(200);
        expect(res.body.incident).toMatchObject({
            id: created.body.incident.id,
            shipment_id: shipment.shipmentId,
            incident_type: 'vehicle_breakdown',
            reported_by: accounts.driver.id,
        });
        expect(res.body.incident.description).toMatch(/thung lop truoc phai/i);
    });
});
