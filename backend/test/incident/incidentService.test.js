const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const incidentRepository = require('../../repositories/incidentRepository');
const tripRepository = require('../../repositories/tripRepository');
const driverRepository = require('../../repositories/driverRepository');
const revenueAllocationRepository = require('../../repositories/revenueAllocationRepository');
const notificationService = require('../../services/notificationService');
const pool = require('../../config/database');

const incidentService = require('../../services/incidentService');

describe('Incident Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    describe('createIncident()', () => {
        it('rejects an invalid incident type', async () => {
            await assert.rejects(
                () => incidentService.createIncident(1, { incidentType: 'not_a_type' }),
                { message: 'Loại sự cố không hợp lệ' },
            );
        });

        it('requires a description for non-traffic incident types', async () => {
            await assert.rejects(
                () => incidentService.createIncident(1, { incidentType: 'vehicle_breakdown', description: '' }),
                { message: 'Mô tả sự cố là bắt buộc' },
            );
        });

        it('requires description to be at least 10 characters', async () => {
            await assert.rejects(
                () => incidentService.createIncident(1, { incidentType: 'vehicle_breakdown', description: 'ngắn' }),
                { message: 'Mô tả sự cố phải có ít nhất 10 ký tự' },
            );
        });

        it('does NOT require a description for traffic_jam / road_incident types', async () => {
            mock.method(incidentRepository, 'getOpenIncidentsByDriverAndType', async () => null);
            mock.method(incidentRepository, 'createIncident', async () => ({ id: 1 }));
            mock.method(incidentRepository, 'addIncidentEvidence', async () => {});
            mock.method(incidentRepository, 'getCoordinatorIds', async () => []);
            mock.method(incidentRepository, 'getActiveDriverIds', async () => []);
            mock.method(incidentRepository, 'getIncidentById', async () => ({ id: 1, incident_type: 'traffic_jam' }));
            mock.method(notificationService, 'createForUsers', async () => {});
            mock.method(notificationService, 'createForUser', async () => {});

            const result = await incidentService.createIncident(1, { incidentType: 'traffic_jam' });

            assert.strictEqual(result.id, 1);
        });

        it('throws if the shipment does not exist', async () => {
            mock.method(tripRepository, 'getTripById', async () => null);

            await assert.rejects(
                () => incidentService.createIncident(1, { shipmentId: 10, incidentType: 'vehicle_breakdown', description: 'Xe bị hỏng động cơ' }),
                { message: 'Chuyến vận chuyển không tồn tại' },
            );
        });

        it('throws if the driver does not own the shipment', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 2, status: 'transit' }));

            await assert.rejects(
                () => incidentService.createIncident(1, { shipmentId: 10, incidentType: 'vehicle_breakdown', description: 'Xe bị hỏng động cơ' }),
                { message: 'Bạn không có quyền báo sự cố cho chuyến này' },
            );
        });

        it('throws if the shipment is not active', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'available' }));

            await assert.rejects(
                () => incidentService.createIncident(1, { shipmentId: 10, incidentType: 'vehicle_breakdown', description: 'Xe bị hỏng động cơ' }),
                { message: 'Chỉ có thể báo sự cố khi chuyến đang hoạt động' },
            );
        });

        it('rejects a duplicate incident type on the same shipment (one type per shipment)', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'transit' }));
            mock.method(incidentRepository, 'getIncidentsByShipment', async () => ([{ incident_type: 'vehicle_breakdown' }]));

            await assert.rejects(
                () => incidentService.createIncident(1, { shipmentId: 10, incidentType: 'vehicle_breakdown', description: 'Xe bị hỏng động cơ' }),
                (err) => err.message.startsWith('DUPLICATE_TYPE:'),
            );
        });

        it('rejects more than MAX_IMAGES_PER_INCIDENT (3) images', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'transit' }));
            mock.method(incidentRepository, 'getIncidentsByShipment', async () => []);

            await assert.rejects(
                () => incidentService.createIncident(
                    1,
                    { shipmentId: 10, incidentType: 'vehicle_breakdown', description: 'Xe bị hỏng động cơ' },
                    ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'],
                ),
                { message: 'Tối đa 3 ảnh minh chứng' },
            );
        });

        it('creates the incident, uploads evidence, and notifies coordinators (alert)', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'transit' }));
            mock.method(incidentRepository, 'getIncidentsByShipment', async () => []);
            mock.method(incidentRepository, 'createIncident', async () => ({ id: 1 }));
            mock.method(incidentRepository, 'addIncidentEvidence', async () => {});
            mock.method(incidentRepository, 'getCoordinatorIds', async () => [10, 11]);
            mock.method(incidentRepository, 'getIncidentById', async () => ({ id: 1, incident_type: 'vehicle_breakdown' }));
            mock.method(notificationService, 'createForUsers', async () => {});
            mock.method(notificationService, 'createForUser', async () => {});

            const result = await incidentService.createIncident(
                1,
                { shipmentId: 10, incidentType: 'vehicle_breakdown', description: 'Xe bị hỏng động cơ' },
                ['a.jpg'],
            );

            assert.strictEqual(result.id, 1);
            assert.strictEqual(incidentRepository.addIncidentEvidence.mock.calls.length, 1);
            assert.strictEqual(notificationService.createForUsers.mock.calls[0].arguments[1].type, 'INCIDENT_REPORTED');
        });

        it('broadcasts a traffic alert to other active drivers for traffic_jam/road_incident', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'transit' }));
            mock.method(incidentRepository, 'getIncidentsByShipment', async () => []);
            mock.method(incidentRepository, 'createIncident', async () => ({ id: 1 }));
            mock.method(incidentRepository, 'addIncidentEvidence', async () => {});
            mock.method(incidentRepository, 'getCoordinatorIds', async () => []);
            mock.method(incidentRepository, 'getActiveDriverIds', async () => [2, 3]);
            mock.method(incidentRepository, 'getIncidentById', async () => ({ id: 1, incident_type: 'road_incident' }));
            mock.method(notificationService, 'createForUsers', async () => {});
            mock.method(notificationService, 'createForUser', async () => {});

            await incidentService.createIncident(
                1,
                { shipmentId: 10, incidentType: 'road_incident', location: 'Ngã tư ABC' },
            );

            const trafficCall = notificationService.createForUsers.mock.calls.find(
                (c) => c.arguments[1].type === 'TRAFFIC_ALERT',
            );
            assert.ok(trafficCall, 'expected a TRAFFIC_ALERT broadcast');
            assert.deepStrictEqual(trafficCall.arguments[0], [2, 3]);
        });
    });

    describe('updateMyIncident()', () => {
        it('validates description length when provided', async () => {
            await assert.rejects(
                () => incidentService.updateMyIncident(1, 1, { description: 'ngắn' }),
                { message: 'Mô tả phải có ít nhất 10 ký tự' },
            );
        });

        it('throws if the driver is not the reporter', async () => {
            mock.method(incidentRepository, 'getIncidentById', async () => ({ reported_by: 2, status: 'open' }));

            await assert.rejects(
                () => incidentService.updateMyIncident(1, 1, {}),
                { message: 'Bạn không có quyền chỉnh sửa sự cố này' },
            );
        });

        it('only allows editing while status is open', async () => {
            mock.method(incidentRepository, 'getIncidentById', async () => ({ reported_by: 1, status: 'resolved' }));

            await assert.rejects(
                () => incidentService.updateMyIncident(1, 1, {}),
                { message: 'Chỉ có thể chỉnh sửa sự cố đang ở trạng thái "Đang chờ"' },
            );
        });

        it('updates and notifies coordinators', async () => {
            let callCount = 0;
            mock.method(incidentRepository, 'getIncidentById', async () => {
                callCount += 1;
                return callCount === 1
                    ? { reported_by: 1, status: 'open', shipment_id: 10 }
                    : { id: 1, description: 'Đã cập nhật mô tả' };
            });
            mock.method(incidentRepository, 'updateIncident', async () => ({ id: 1 }));
            mock.method(incidentRepository, 'getCoordinatorIds', async () => [10]);
            mock.method(notificationService, 'createForUsers', async () => {});

            const result = await incidentService.updateMyIncident(1, 1, { description: 'Đã cập nhật mô tả' });

            assert.strictEqual(result.description, 'Đã cập nhật mô tả');
        });
    });

    describe('getShipmentIncidents()', () => {
        it('throws if the driver does not own the shipment', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 2 }));

            await assert.rejects(
                () => incidentService.getShipmentIncidents(10, 1),
                { message: 'Bạn không có quyền xem sự cố của chuyến này' },
            );
        });
    });

    describe('getIncidentDetail()', () => {
        it('throws if the driver is not the reporter', async () => {
            mock.method(incidentRepository, 'getIncidentById', async () => ({ reported_by: 2 }));

            await assert.rejects(
                () => incidentService.getIncidentDetail(1, 1),
                { message: 'Bạn không có quyền xem sự cố này' },
            );
        });
    });

    describe('getMyCounts()', () => {
        it('aggregates open and closed counts', async () => {
            mock.method(pool, 'query', async () => ({ rows: [{ open_count: '2', closed_count: '3' }] }));

            const result = await incidentService.getMyCounts(1);

            assert.deepStrictEqual(result, { open_count: 2, closed_count: 3 });
        });
    });

    describe('updateIncidentStatus() — coordinator resolution', () => {
        it('rejects an invalid status', async () => {
            await assert.rejects(
                () => incidentService.updateIncidentStatus(1, 99, { status: 'not_a_status' }),
                { message: 'Trạng thái sự cố không hợp lệ' },
            );
        });

        it('throws if the incident does not exist', async () => {
            mock.method(incidentRepository, 'getIncidentById', async () => null);

            await assert.rejects(
                () => incidentService.updateIncidentStatus(1, 99, { status: 'resolved' }),
                { message: 'Sự cố không tồn tại' },
            );
        });

        it('BR-024/025: replacement driver must have a vehicle assigned', async () => {
            mock.method(incidentRepository, 'getIncidentById', async () => ({ id: 1, shipment_id: 10, reported_by: 1 }));
            mock.method(driverRepository, 'getAllDrivers', async () => ([{ id: 5, vehicle_id: null }]));

            await assert.rejects(
                () => incidentService.updateIncidentStatus(1, 99, { status: 'resolved', replacementDriverId: 5 }),
                { message: 'Tài xế thay thế chưa được gán xe' },
            );
        });

        it('resolves without a replacement driver and notifies the reporter', async () => {
            const fakeClient = {
                query: async () => {},
                release: () => {},
            };
            let callCount = 0;
            mock.method(incidentRepository, 'getIncidentById', async () => {
                callCount += 1;
                return callCount === 1
                    ? { id: 1, reported_by: 1, replacement_driver_id: null, replacement_vehicle_id: null }
                    : { id: 1, status: 'resolved' };
            });
            mock.method(pool, 'connect', async () => fakeClient);
            mock.method(incidentRepository, 'updateIncidentResolution', async () => ({ id: 1, status: 'resolved' }));
            mock.method(notificationService, 'createForUser', async () => {});

            const result = await incidentService.updateIncidentStatus(1, 99, { status: 'resolved', resolution: 'Đã xử lý xong' });

            assert.strictEqual(result.status, 'resolved');
            assert.strictEqual(notificationService.createForUser.mock.calls.length, 1);
        });

        it('BR-024: reassigns to a replacement driver with revenue split when pickup already completed', async () => {
            const fakeClient = { query: async () => {}, release: () => {} };
            mock.method(incidentRepository, 'getIncidentById', async () => ({ id: 1, shipment_id: 10, reported_by: 1 }));
            mock.method(driverRepository, 'getAllDrivers', async () => ([{ id: 5, vehicle_id: 20 }]));
            mock.method(pool, 'connect', async () => fakeClient);
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, pickup_completed_at: '2024-01-01' }));
            mock.method(tripRepository, 'reassignShipmentAfterIncident', async () => ({ pickup_completed_at: '2024-01-01' }));
            mock.method(revenueAllocationRepository, 'replaceShipmentAllocations', async () => {});
            mock.method(incidentRepository, 'updateIncidentResolution', async () => ({ id: 1, status: 'resolved' }));
            mock.method(notificationService, 'createForUser', async () => {});

            await incidentService.updateIncidentStatus(1, 99, { status: 'resolved', replacementDriverId: 5 });

            const allocationsArg = revenueAllocationRepository.replaceShipmentAllocations.mock.calls[0].arguments[2];
            assert.deepStrictEqual(allocationsArg, [
                { driverId: 1, sharePercent: 50 },
                { driverId: 5, sharePercent: 50 },
            ]);
        });
    });
});
