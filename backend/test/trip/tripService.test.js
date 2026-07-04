const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const tripRepository = require('../../repositories/tripRepository');
const paymentRepository = require('../../repositories/paymentRepository');
const stopRepository = require('../../repositories/stopRepository');
const revenueAllocationRepository = require('../../repositories/revenueAllocationRepository');
const notificationService = require('../../services/notificationService');
const notificationGateway = require('../../services/notificationGateway');
const kpiService = require('../../services/kpiService');
const pool = require('../../config/database');

const tripService = require('../../services/tripService');

describe('Trip Service', () => {
    afterEach(() => {
        mock.restoreAll();
    });

    describe('getTripPool', () => {
        it('BR-003: filters pool by driver vehicle group when vehicleGroupId not provided', async () => {
            mock.method(tripRepository, 'getDriverVehicleGroupId', async () => 5);
            mock.method(tripRepository, 'getAvailableShipments', async (opts) => {
                assert.strictEqual(opts.vehicleGroupId, 5);
                return { items: [], total: 0 };
            });
            mock.method(tripRepository, 'getAllVehicleGroups', async () => []);

            await tripService.getTripPool(1, {});
        });
    });

    describe('claimTrip', () => {
        it('BR-001: throws if driver has no vehicle assigned', async () => {
            mock.method(tripRepository, 'getDriverVehicleId', async () => null);

            await assert.rejects(
                () => tripService.claimTrip(10, 1),
                { message: 'Tài xế chưa được gán xe' },
            );
        });

        it('BR-006: translates ACTIVE_TRIP repo error into Vietnamese message', async () => {
            mock.method(tripRepository, 'getDriverVehicleId', async () => 3);
            mock.method(tripRepository, 'claimShipment', async () => { throw new Error('ACTIVE_TRIP'); });

            await assert.rejects(
                () => tripService.claimTrip(10, 1),
                { message: 'Bạn đang có chuyến đang hoạt động, không thể nhận thêm chuyến mới' },
            );
        });

        it('BR-008: translates SAME_ORDER repo error with SAME_ORDER: prefix', async () => {
            mock.method(tripRepository, 'getDriverVehicleId', async () => 3);
            mock.method(tripRepository, 'claimShipment', async () => { throw new Error('SAME_ORDER'); });

            await assert.rejects(
                () => tripService.claimTrip(10, 1),
                { message: 'SAME_ORDER:Bạn đã có một chuyến trong đơn hàng này rồi' },
            );
        });

        it('BR-007: throws ALREADY_CLAIMED when repo returns falsy (lost the atomic race)', async () => {
            mock.method(tripRepository, 'getDriverVehicleId', async () => 3);
            mock.method(tripRepository, 'claimShipment', async () => null);

            await assert.rejects(
                () => tripService.claimTrip(10, 1),
                { message: 'ALREADY_CLAIMED:Chuyến này đã được tài xế khác nhận' },
            );
        });

        it('BR-005: claims successfully and fires a silent notification', async () => {
            mock.method(tripRepository, 'getDriverVehicleId', async () => 3);
            mock.method(tripRepository, 'claimShipment', async () => ({ id: 10, status: 'claimed' }));
            mock.method(notificationService, 'createForUser', async () => {});

            const result = await tripService.claimTrip(10, 1);

            assert.strictEqual(result.id, 10);
            assert.strictEqual(notificationService.createForUser.mock.calls.length, 1);
        });
    });

    describe('updateStatus', () => {
        it('throws if trip does not exist', async () => {
            mock.method(tripRepository, 'getTripById', async () => null);

            await assert.rejects(
                () => tripService.updateStatus(999, 1, 'picking'),
                { message: 'Chuyến không tồn tại' },
            );
        });

        it('throws if driver is not the owner', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'claimed', owner_driver_id: 2 }));

            await assert.rejects(
                () => tripService.updateStatus(10, 1, 'picking'),
                { message: 'Bạn không có quyền cập nhật chuyến này' },
            );
        });

        it('BR-009: rejects skipping a status (claimed -> arrived is not in ALLOWED_TRANSITIONS)', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'claimed', owner_driver_id: 1 }));

            await assert.rejects(
                () => tripService.updateStatus(10, 1, 'arrived'),
                { message: 'Không thể chuyển trạng thái từ "claimed" sang "arrived"' },
            );
        });

        it('requires a reason when transitioning to failed', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'arrived', owner_driver_id: 1 }));

            await assert.rejects(
                () => tripService.updateStatus(10, 1, 'failed', ''),
                { message: 'Lý do giao thất bại là bắt buộc' },
            );
        });

        it('BR-010: allowed transition (claimed -> picking) updates status and fires notification', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'claimed', owner_driver_id: 1 }));
            mock.method(tripRepository, 'updateTripStatus', async (id, status) => ({ id, status }));
            mock.method(notificationService, 'createForUser', async () => {});

            const result = await tripService.updateStatus(10, 1, 'picking');

            assert.strictEqual(result.status, 'picking');
            assert.strictEqual(notificationService.createForUser.mock.calls.length, 1);
        });

        it('failed transition with a valid reason succeeds', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'arrived', owner_driver_id: 1 }));
            mock.method(tripRepository, 'updateTripStatus', async (id, status, reason) => ({ id, status, reason }));
            mock.method(notificationService, 'createForUser', async () => {});

            const result = await tripService.updateStatus(10, 1, 'failed', 'Khách từ chối nhận hàng');

            assert.strictEqual(result.status, 'failed');
            assert.strictEqual(result.reason, 'Khách từ chối nhận hàng');
        });
    });

    describe('releaseTrip', () => {
        it('only releases when status is claimed or picking (RELEASABLE_STATUSES)', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'transit', owner_driver_id: 1 }));

            await assert.rejects(
                () => tripService.releaseTrip(10, 1, 'reason'),
                { message: 'Chỉ có thể hủy chuyến khi ở trạng thái "claimed" hoặc "picking"' },
            );
        });

        it('releases a claimed trip back to the pool', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'claimed', owner_driver_id: 1 }));
            mock.method(tripRepository, 'releaseShipmentToPool', async () => ({ id: 10, status: 'available' }));
            mock.method(notificationService, 'createForUser', async () => {});

            const result = await tripService.releaseTrip(10, 1, 'Xe hỏng');

            assert.strictEqual(result.status, 'available');
        });
    });

    describe('startTransit()', () => {
        it('BR-013: fails if trip is not in picking status', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'claimed', owner_driver_id: 1 }));

            await assert.rejects(
                () => tripService.startTransit(10, 1, 'url'),
                { message: 'Chuyến phải ở trạng thái "picking" để xác nhận lấy hàng' },
            );
        });

        it('BR-013: fails if no proof photo and no pickup stops completed', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'picking', owner_driver_id: 1 }));
            mock.method(stopRepository, 'getStopsByShipment', async () => []);

            await assert.rejects(
                () => tripService.startTransit(10, 1, null),
                { message: 'Ảnh xác nhận lấy hàng là bắt buộc (BR-013)' },
            );
        });

        it('BR-012: succeeds with proof photo and moves straight to TRANSIT (no LOADED state)', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'picking', owner_driver_id: 1 }));
            mock.method(stopRepository, 'getStopsByShipment', async () => []);
            mock.method(tripRepository, 'saveLoadingProof', async () => {});
            mock.method(tripRepository, 'updateTripStatus', async (id, status) => ({ id, status }));
            mock.method(notificationService, 'createForUser', async () => {});

            const result = await tripService.startTransit(10, 1, 'https://proof.jpg');

            assert.strictEqual(result.status, 'transit');
            assert.strictEqual(tripRepository.saveLoadingProof.mock.calls.length, 1);
        });

        it('bypasses photo requirement when all pickup stops are already completed', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'picking', owner_driver_id: 1 }));
            mock.method(stopRepository, 'getStopsByShipment', async () => ([
                { stop_type: 'pickup', completed_at: '2024-01-01' },
            ]));
            mock.method(tripRepository, 'updateTripStatus', async (id, status) => ({ id, status }));
            mock.method(notificationService, 'createForUser', async () => {});

            const result = await tripService.startTransit(10, 1, null);

            assert.strictEqual(result.status, 'transit');
        });
    });

    describe('completeTrip()', () => {
        it('BR-015: fails if trip is not arrived', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'transit', owner_driver_id: 1 }));

            await assert.rejects(
                () => tripService.completeTrip(10, 1, 'url'),
                { message: 'Chuyến phải ở trạng thái "arrived" để hoàn thành' },
            );
        });

        it('BR-015: fails if no delivery proof and no delivery stops completed', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'arrived', owner_driver_id: 1 }));
            mock.method(stopRepository, 'getStopsByShipment', async () => []);

            await assert.rejects(
                () => tripService.completeTrip(10, 1, null),
                { message: 'Ảnh xác nhận giao hàng là bắt buộc (BR-015)' },
            );
        });

        it('BR-030: completes trip and immediately triggers KPI recalculation regardless of payment_type', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'arrived', owner_driver_id: 1, order_id: 501 }));
            mock.method(stopRepository, 'getStopsByShipment', async () => []);
            mock.method(tripRepository, 'saveDeliveryProof', async () => {});
            mock.method(tripRepository, 'updateTripStatus', async () => {});
            mock.method(tripRepository, 'getFullTripById', async () => ({ id: 10, is_final_shipment: false }));
            mock.method(tripRepository, 'getDriverVehicleId', async () => 3);
            mock.method(tripRepository, 'activateNextShipment', async () => null);
            mock.method(revenueAllocationRepository, 'getDriverIdsForShipment', async () => [1]);
            mock.method(notificationService, 'createForUser', async () => {});
            mock.method(kpiService, 'recalculateAfterCompletion', () => {});

            const result = await tripService.completeTrip(10, 1, 'https://proof.jpg');

            assert.strictEqual(result.id, 10);
            assert.strictEqual(kpiService.recalculateAfterCompletion.mock.calls.length, 1);
            assert.deepStrictEqual(kpiService.recalculateAfterCompletion.mock.calls[0].arguments[0], [1]);
        });

        it('activates next shipment leg and notifies driver when coordinator pre-assigned it', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'arrived', owner_driver_id: 1, order_id: 501 }));
            mock.method(stopRepository, 'getStopsByShipment', async () => []);
            mock.method(tripRepository, 'saveDeliveryProof', async () => {});
            mock.method(tripRepository, 'updateTripStatus', async () => {});
            mock.method(tripRepository, 'getFullTripById', async () => ({ id: 10, is_final_shipment: true }));
            mock.method(tripRepository, 'getDriverVehicleId', async () => 3);
            mock.method(tripRepository, 'activateNextShipment', async () => ({ id: 11 }));
            mock.method(revenueAllocationRepository, 'getDriverIdsForShipment', async () => [1]);
            mock.method(notificationService, 'createForUser', async () => {});
            mock.method(kpiService, 'recalculateAfterCompletion', () => {});

            await tripService.completeTrip(10, 1, 'https://proof.jpg');

            // 2 notifications: completion + next-leg-ready
            assert.strictEqual(notificationService.createForUser.mock.calls.length, 2);
        });
    });

    describe('markUnpaid() — TH3 customer debt', () => {
        it('only allowed when trip is completed', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'arrived', owner_driver_id: 1 }));

            await assert.rejects(
                () => tripService.markUnpaid(10, 1, { amount: 100000 }),
                { message: 'Chỉ có thể báo nợ khi chuyến đã hoàn thành (completed)' },
            );
        });

        it('rejects a non-positive amount', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'completed', owner_driver_id: 1 }));

            await assert.rejects(
                () => tripService.markUnpaid(10, 1, { amount: -5 }),
                { message: 'Số tiền nợ phải là số dương hợp lệ' },
            );
        });

        it('rejects amount exceeding the remaining unpaid balance (anti-overflow guard)', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'completed', owner_driver_id: 1, order_id: 501 }));
            mock.method(paymentRepository, 'getShipmentFinancialSummary', async () => ({
                remaining: 100000, trip_value: 500000, cash_collected: 400000, customer_debt_total: 0,
            }));

            await assert.rejects(
                () => tripService.markUnpaid(10, 1, { amount: 200000 }),
                (err) => err.message.includes('vượt quá phần còn lại'),
            );
        });

        it('creates a customer debt row when valid', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ status: 'completed', owner_driver_id: 1, order_id: 501 }));
            mock.method(paymentRepository, 'getShipmentFinancialSummary', async () => null);
            mock.method(pool, 'query', async (sql) => {
                if (sql.includes('SELECT customer_id FROM orders')) return { rows: [{ customer_id: 7 }] };
                if (sql.includes('INSERT INTO debts')) return { rows: [{ id: 1, debt_type: 'customer', total_amount: 200000 }] };
                return { rows: [] };
            });
            mock.method(notificationService, 'createForUser', async () => {});

            const debt = await tripService.markUnpaid(10, 1, { amount: 200000 });

            assert.strictEqual(debt.debt_type, 'customer');
        });
    });

    describe('requestOrderReceipt() — BR-008A/B/C multi-driver order', () => {
        it('requires a positive actual_km', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'completed', order_id: 501 }));

            await assert.rejects(
                () => tripService.requestOrderReceipt(501, 1, { shipmentId: 10, actualKm: 0 }),
                { message: 'Số km thực tế là bắt buộc và phải lớn hơn 0' },
            );
        });

        it('BR-008A: non-final shipment only saves actual_km, no receipt request created', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'completed', order_id: 501 }));
            mock.method(tripRepository, 'saveShipmentActualKm', async () => {});
            mock.method(tripRepository, 'isFinalShipment', async () => false);
            mock.method(pool, 'query', async () => ({ rows: [{ payment_type: 'cash' }] }));

            const result = await tripService.requestOrderReceipt(501, 1, { shipmentId: 10, actualKm: 120 });

            assert.deepStrictEqual(result, { km_saved: true, receipt_request_created: false });
        });

        it('BR-008A: final shipment but non-cash order only saves actual_km', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'completed', order_id: 501 }));
            mock.method(tripRepository, 'saveShipmentActualKm', async () => {});
            mock.method(tripRepository, 'isFinalShipment', async () => true);
            mock.method(pool, 'query', async () => ({ rows: [{ payment_type: 'bank_transfer' }] }));

            const result = await tripService.requestOrderReceipt(501, 1, { shipmentId: 10, actualKm: 120 });

            assert.strictEqual(result.receipt_request_created, false);
        });

        it('BR-008B: final shipment of cash order creates the receipt request', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'completed', order_id: 501 }));
            mock.method(tripRepository, 'saveShipmentActualKm', async () => {});
            mock.method(tripRepository, 'isFinalShipment', async () => true);
            mock.method(pool, 'query', async () => ({ rows: [{ payment_type: 'cash' }] }));
            mock.method(tripRepository, 'getOrderReceiptRequestByOrderId', async () => null);
            mock.method(tripRepository, 'createOrderReceiptRequest', async () => ({ id: 1 }));
            mock.method(notificationGateway, 'broadcastToRole', () => {});
            mock.method(notificationService, 'getUserIdsByRole', async () => [99]);
            mock.method(notificationService, 'createForUsers', async () => {});
            mock.method(notificationService, 'createForUser', async () => {});

            const result = await tripService.requestOrderReceipt(501, 1, { shipmentId: 10, actualKm: 200 });

            assert.strictEqual(result.receipt_request_created, true);
        });

        it('BR-018: rejects if the order already has a pending receipt request', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'completed', order_id: 501 }));
            mock.method(tripRepository, 'saveShipmentActualKm', async () => {});
            mock.method(tripRepository, 'isFinalShipment', async () => true);
            mock.method(pool, 'query', async () => ({ rows: [{ payment_type: 'cash' }] }));
            mock.method(tripRepository, 'getOrderReceiptRequestByOrderId', async () => ({ id: 5 }));

            await assert.rejects(
                () => tripService.requestOrderReceipt(501, 1, { shipmentId: 10, actualKm: 200 }),
                { message: 'Đơn hàng này đã có yêu cầu tạo phiếu thu rồi (BR-018B)' },
            );
        });

        it('BR-008C: unique constraint violation (concurrent completion) is translated to BR-018B message', async () => {
            mock.method(tripRepository, 'getTripById', async () => ({ owner_driver_id: 1, status: 'completed', order_id: 501 }));
            mock.method(tripRepository, 'saveShipmentActualKm', async () => {});
            mock.method(tripRepository, 'isFinalShipment', async () => true);
            mock.method(pool, 'query', async () => ({ rows: [{ payment_type: 'cash' }] }));
            mock.method(tripRepository, 'getOrderReceiptRequestByOrderId', async () => null);
            mock.method(tripRepository, 'createOrderReceiptRequest', async () => {
                const err = new Error('duplicate key');
                err.code = '23505';
                throw err;
            });

            await assert.rejects(
                () => tripService.requestOrderReceipt(501, 1, { shipmentId: 10, actualKm: 200 }),
                { message: 'Đơn hàng này đã có yêu cầu tạo phiếu thu rồi (BR-018B)' },
            );
        });
    });

    describe('recordReceiptCollection() — driver 3-button confirmation', () => {
        it('rejects an invalid payment type', async () => {
            await assert.rejects(
                () => tripService.recordReceiptCollection(77, 1, { paymentType: 'invalid' }),
                { message: 'Hình thức thanh toán không hợp lệ' },
            );
        });

        it('requires proof for cash_collected', async () => {
            await assert.rejects(
                () => tripService.recordReceiptCollection(77, 1, { paymentType: 'cash_collected', proofUrl: null }),
                { message: 'Ảnh xác minh là bắt buộc cho hình thức này' },
            );
        });

        it('requires proof for bank_transfer', async () => {
            await assert.rejects(
                () => tripService.recordReceiptCollection(77, 1, { paymentType: 'bank_transfer', proofUrl: null }),
                { message: 'Ảnh xác minh là bắt buộc cho hình thức này' },
            );
        });

        it('client_credit does not require proof', async () => {
            mock.method(tripRepository, 'recordReceiptCollection', async () => ({ payment_type: 'client_credit' }));

            const result = await tripService.recordReceiptCollection(77, 1, { paymentType: 'client_credit', proofUrl: null });

            assert.strictEqual(result.payment_type, 'client_credit');
        });
    });
});
