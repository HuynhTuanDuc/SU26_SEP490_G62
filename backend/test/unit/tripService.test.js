/**
 * L1 Unit Test — tripService (vòng đời chuyến của tài xế)
 *
 * Bao phủ các Business Rule cốt lõi trong CLAUDE.md:
 *   BR-DRV-006/007  một chuyến hoạt động tại một thời điểm, tranh chấp claim
 *   BR-DRV-009      chuyển trạng thái nghiêm ngặt, không nhảy cóc
 *   BR-DRV-010/011  bắt buộc ảnh bằng chứng thật khi lấy hàng / giao hàng
 *   SEC-DRV-002     chỉ thao tác được trên chuyến mình sở hữu
 *
 * Lưu ý về ALLOWED_TRANSITIONS: chỉ 3 bước đi qua PATCH /status
 * (claimed→picking, transit→arrived, arrived→failed). Các bước còn lại có endpoint
 * riêng vì bắt buộc kèm ảnh — test phản ánh đúng thiết kế đó.
 */
jest.mock('../../repositories/tripRepository');
jest.mock('../../repositories/paymentRepository');
jest.mock('../../repositories/stopRepository');
jest.mock('../../repositories/revenueAllocationRepository');
jest.mock('../../repositories/incidentRepository');
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
    getUserIdsByRole: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/notificationGateway', () => ({
    broadcastToRole: jest.fn(), broadcastToUser: jest.fn(), notifyCreated: jest.fn(),
}));
jest.mock('../../services/kpiService', () => ({
    recalculateAfterCompletion: jest.fn().mockResolvedValue([]),
}));

const tripRepository = require('../../repositories/tripRepository');
const paymentRepository = require('../../repositories/paymentRepository');
const stopRepository = require('../../repositories/stopRepository');
const revenueAllocationRepository = require('../../repositories/revenueAllocationRepository');
const incidentRepository = require('../../repositories/incidentRepository');
const notificationService = require('../../services/notificationService');
const notificationGateway = require('../../services/notificationGateway');
const kpiService = require('../../services/kpiService');
const tripService = require('../../services/tripService');

const chuyen = (o = {}) => ({ id: 100, owner_driver_id: 5, status: 'arrived', order_id: 900, ...o });

beforeEach(() => {
    jest.clearAllMocks();
    tripRepository.getTripById.mockResolvedValue(chuyen());
    tripRepository.getDriverVehicleId.mockResolvedValue(22);
    tripRepository.getPendingReceiptOrder.mockResolvedValue(null);
    tripRepository.updateTripStatus.mockResolvedValue({ id: 100, status: 'updated' });
    tripRepository.getFullTripById.mockResolvedValue({ id: 100, is_final_shipment: false, order_id: 900 });
    tripRepository.saveDeliveryProof.mockResolvedValue(undefined);
    tripRepository.saveLoadingProof.mockResolvedValue(undefined);
    tripRepository.activateNextShipment.mockResolvedValue(null);
    stopRepository.getStopsByShipment.mockResolvedValue([]);
    revenueAllocationRepository.getDriverIdsForShipment.mockResolvedValue([5]);
    notificationService.getUserIdsByRole.mockResolvedValue([30]);
});

describe('tripService.getTripPool', () => {
    it('TC-UNIT-TripService-001 — the trip pool is filtered by the vehicle group of the driver (BR-DRV-004)', async () => {
        tripRepository.getDriverVehicleGroupId.mockResolvedValue(3);
        tripRepository.getAvailableShipments.mockResolvedValue({ rows: [], total: 0 });
        tripRepository.getAllVehicleGroups.mockResolvedValue([{ id: 3, name: '5m2' }]);

        const result = await tripService.getTripPool(5, {});

        expect(tripRepository.getAvailableShipments).toHaveBeenCalledWith({ page: 1, limit: 5, vehicleGroupId: 3 });
        expect(result.vehicleGroups).toEqual([{ id: 3, name: '5m2' }]);
    });

    it('TC-UNIT-TripService-002 — an explicit vehicle group from the coordinator overrides the lookup of the driver group', async () => {
        tripRepository.getAvailableShipments.mockResolvedValue({ rows: [], total: 0 });
        tripRepository.getAllVehicleGroups.mockResolvedValue([]);

        await tripService.getTripPool(5, { vehicleGroupId: 9 });

        expect(tripRepository.getDriverVehicleGroupId).not.toHaveBeenCalled();
        expect(tripRepository.getAvailableShipments).toHaveBeenCalledWith(
            expect.objectContaining({ vehicleGroupId: 9 }),
        );
    });
});

describe('tripService.claimTrip', () => {
    it('TC-UNIT-TripService-003 — a successful claim assigns the driver and notifies them', async () => {
        tripRepository.claimShipment.mockResolvedValue({ id: 100 });

        const result = await tripService.claimTrip(100, 5);

        expect(tripRepository.claimShipment).toHaveBeenCalledWith(100, 5, 22);
        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5, expect.objectContaining({ type: 'TRIP_ASSIGNED', entityId: 100 }), { displayMode: 'silent' },
        );
        expect(result).toEqual({ id: 100 });
    });

    it('TC-UNIT-TripService-004 — blocks a new claim while an earlier trip still lacks mileage or a receipt request', async () => {
        tripRepository.getPendingReceiptOrder.mockResolvedValue({ shipment_id: 88, order_id: 700 });

        await expect(tripService.claimTrip(100, 5)).rejects.toThrow(/^PENDING_RECEIPT:/);

        expect(tripRepository.claimShipment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-005 — a driver with no vehicle assigned cannot claim a trip (BR-DRV-003)', async () => {
        tripRepository.getDriverVehicleId.mockResolvedValue(null);

        await expect(tripService.claimTrip(100, 5)).rejects.toThrow('Tài xế chưa được gán xe');

        expect(tripRepository.claimShipment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-006 — a driver with an active trip cannot claim another (BR-DRV-006)', async () => {
        tripRepository.claimShipment.mockRejectedValue(new Error('ACTIVE_TRIP'));

        await expect(tripService.claimTrip(100, 5))
            .rejects.toThrow('Bạn đang có chuyến đang hoạt động, không thể nhận thêm chuyến mới');
    });

    it('TC-UNIT-TripService-007 — losing the claim race reports that the trip is already taken (BR-DRV-007)', async () => {
        tripRepository.claimShipment.mockResolvedValue(null);

        await expect(tripService.claimTrip(100, 5)).rejects.toThrow(/^ALREADY_CLAIMED:/);

        expect(notificationService.createForUser).not.toHaveBeenCalled();
    });

    it.each([
        ['ACTIVE_VEHICLE_TRIP', 'Xe đang có chuyến đang hoạt động, không thể nhận thêm chuyến mới'],
        ['VEHICLE_UNAVAILABLE', 'Xe hiện không sẵn sàng cho vận hành'],
        ['VEHICLE_MAINTENANCE', 'Xe đang trong bảo trì, không thể nhận chuyến'],
        ['DRIVER_VEHICLE_MISMATCH', 'Tài xế chưa được gán hợp lệ với xe này'],
        ['DRIVER_MAINTENANCE', 'Tài xế đang phụ trách bảo trì xe khác'],
    ])('TC-UNIT-TripService-008 — repository code %s is translated into a business message', async (ma, thongBao) => {
        tripRepository.claimShipment.mockRejectedValue(new Error(ma));

        await expect(tripService.claimTrip(100, 5)).rejects.toThrow(thongBao);
    });

    it('TC-UNIT-TripService-009 — a trip belonging to another vehicle group is rejected (BR-DRV-004)', async () => {
        tripRepository.claimShipment.mockRejectedValue(new Error('VEHICLE_GROUP_MISMATCH'));

        await expect(tripService.claimTrip(100, 5)).rejects.toThrow(/^VEHICLE_GROUP_MISMATCH:/);
    });

    it('TC-UNIT-TripService-010 — an unexpected repository error is not swallowed into a business message', async () => {
        tripRepository.claimShipment.mockRejectedValue(new Error('deadlock detected'));

        await expect(tripService.claimTrip(100, 5)).rejects.toThrow('deadlock detected');
    });
});

describe('tripService.updateStatus — chuyển trạng thái nghiêm ngặt (BR-DRV-009)', () => {
    it('TC-UNIT-TripService-011 — claimed to picking is a valid step', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'claimed' }));

        await tripService.updateStatus(100, 5, 'picking');

        expect(tripRepository.updateTripStatus).toHaveBeenCalledWith(100, 'picking', null, 5);
    });

    it('TC-UNIT-TripService-012 — transit to arrived is a valid step', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'transit' }));

        await tripService.updateStatus(100, 5, 'arrived');

        expect(tripRepository.updateTripStatus).toHaveBeenCalledWith(100, 'arrived', null, 5);
    });

    it('TC-UNIT-TripService-013 — skipping from claimed straight to transit is rejected', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'claimed' }));

        await expect(tripService.updateStatus(100, 5, 'transit'))
            .rejects.toThrow('Không thể chuyển trạng thái từ "claimed" sang "transit"');

        expect(tripRepository.updateTripStatus).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-014 — moving backwards from transit to picking is rejected', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'transit' }));

        await expect(tripService.updateStatus(100, 5, 'picking'))
            .rejects.toThrow('Không thể chuyển trạng thái từ "transit" sang "picking"');
    });

    it('TC-UNIT-TripService-015 — a completed trip can no longer change status', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'completed' }));

        await expect(tripService.updateStatus(100, 5, 'picking')).rejects.toThrow('Không thể chuyển trạng thái');
    });

    it('TC-UNIT-TripService-016 — another driver cannot update the trip (SEC-DRV-002)', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ owner_driver_id: 9, status: 'claimed' }));

        await expect(tripService.updateStatus(100, 5, 'picking'))
            .rejects.toThrow('Bạn không có quyền cập nhật chuyến này');

        expect(tripRepository.updateTripStatus).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-017 — reports an error when the trip does not exist', async () => {
        tripRepository.getTripById.mockResolvedValue(null);

        await expect(tripService.updateStatus(100, 5, 'picking')).rejects.toThrow('Chuyến không tồn tại');
    });

    it('TC-UNIT-TripService-018 — blocks a failed-delivery report that carries no reason', async () => {
        await expect(tripService.updateStatus(100, 5, 'failed', '   '))
            .rejects.toThrow('Lý do giao thất bại là bắt buộc');

        expect(tripRepository.updateTripStatus).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-019 — a failed delivery raises a customer_refusal incident for the coordinator', async () => {
        incidentRepository.createIncident.mockResolvedValue({ id: 500 });

        await tripService.updateStatus(100, 5, 'failed', '  Khách từ chối nhận  ');

        expect(incidentRepository.createIncident).toHaveBeenCalledWith(expect.objectContaining({
            shipmentId: 100, reportedBy: 5, incidentType: 'customer_refusal', severityLevel: 'medium',
            description: 'Giao hàng thất bại: Khách từ chối nhận',
        }));
        expect(tripRepository.updateTripStatus).toHaveBeenCalledWith(100, 'failed', 'Khách từ chối nhận', 5);
    });

    it('TC-UNIT-TripService-020 — the status change and the coordinator notice still happen when the incident cannot be created', async () => {
        incidentRepository.createIncident.mockRejectedValue(new Error('DB lỗi'));

        await tripService.updateStatus(100, 5, 'failed', 'Khách vắng');

        expect(tripRepository.updateTripStatus).toHaveBeenCalled();
        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [30], expect.objectContaining({ type: 'INCIDENT_REPORTED', entityId: null }), { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-TripService-021 — a failed delivery pushes a realtime event to the coordinator', async () => {
        incidentRepository.createIncident.mockResolvedValue({ id: 500 });

        await tripService.updateStatus(100, 5, 'failed', 'Sai địa chỉ');

        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('coordinator', expect.objectContaining({
            type: 'coordinator.shipment.failed', shipmentId: 100, incidentId: 500, reason: 'Sai địa chỉ',
        }));
    });
});

describe('tripService.startTransit — bắt buộc ảnh lấy hàng (BR-DRV-011)', () => {
    beforeEach(() => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'picking' }));
    });

    it('TC-UNIT-TripService-022 — a pickup photo is stored and the trip moves to transit', async () => {
        await tripService.startTransit(100, 5, 'https://cdn/lay-hang.jpg');

        expect(tripRepository.saveLoadingProof).toHaveBeenCalledWith(100, 5, 'https://cdn/lay-hang.jpg');
        expect(tripRepository.updateTripStatus).toHaveBeenCalledWith(100, 'transit', null, 5);
    });

    it('TC-UNIT-TripService-023 — blocks transit with no photo and no completed pickup stop', async () => {
        await expect(tripService.startTransit(100, 5, null))
            .rejects.toThrow('Ảnh xác nhận lấy hàng là bắt buộc (BR-013)');

        expect(tripRepository.updateTripStatus).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-024 — the photo is waived once every pickup stop is complete, each already captured its own', async () => {
        stopRepository.getStopsByShipment.mockResolvedValue([
            { stop_type: 'pickup', completed_at: '2026-08-18T01:00:00Z' },
            { stop_type: 'delivery', completed_at: null },
        ]);

        await tripService.startTransit(100, 5, null);

        expect(tripRepository.updateTripStatus).toHaveBeenCalledWith(100, 'transit', null, 5);
        expect(tripRepository.saveLoadingProof).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-025 — the photo is still required while a pickup stop is unfinished', async () => {
        stopRepository.getStopsByShipment.mockResolvedValue([
            { stop_type: 'pickup', completed_at: '2026-08-18T01:00:00Z' },
            { stop_type: 'pickup', completed_at: null },
        ]);

        await expect(tripService.startTransit(100, 5, null)).rejects.toThrow('(BR-013)');
    });

    it('TC-UNIT-TripService-026 — rejects the pickup confirmation unless the trip is in picking', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'claimed' }));

        await expect(tripService.startTransit(100, 5, 'https://cdn/a.jpg'))
            .rejects.toThrow('Chuyến phải ở trạng thái "picking" để xác nhận lấy hàng');
    });

    it('TC-UNIT-TripService-027 — another driver cannot confirm the pickup on behalf of the owner', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'picking', owner_driver_id: 9 }));

        await expect(tripService.startTransit(100, 5, 'https://cdn/a.jpg'))
            .rejects.toThrow('Bạn không có quyền cập nhật chuyến này');
    });
});

describe('tripService.completeTrip — bắt buộc ảnh giao hàng (BR-DRV-010)', () => {
    it('TC-UNIT-TripService-028 — stores the proof, marks the trip completed and recalculates KPI', async () => {
        const result = await tripService.completeTrip(100, 5, 'https://cdn/giao-hang.jpg');

        expect(tripRepository.saveDeliveryProof).toHaveBeenCalledWith(100, 5, 'https://cdn/giao-hang.jpg');
        expect(tripRepository.updateTripStatus).toHaveBeenCalledWith(100, 'completed', null, 5);
        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledWith([5], expect.any(Date));
        expect(result).toMatchObject({ id: 100 });
    });

    it('TC-UNIT-TripService-029 — rejects completion when the delivery proof photo is missing', async () => {
        await expect(tripService.completeTrip(100, 5, null))
            .rejects.toThrow('Ảnh xác nhận giao hàng là bắt buộc (BR-015)');

        expect(tripRepository.updateTripStatus).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-030 — the overall photo is waived once every delivery stop is complete', async () => {
        stopRepository.getStopsByShipment.mockResolvedValue([
            { stop_type: 'delivery', completed_at: '2026-08-18T05:00:00Z' },
        ]);

        await tripService.completeTrip(100, 5, null);

        expect(tripRepository.updateTripStatus).toHaveBeenCalledWith(100, 'completed', null, 5);
    });

    it('TC-UNIT-TripService-031 — a trip not yet arrived cannot be completed', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'transit' }));

        await expect(tripService.completeTrip(100, 5, 'https://cdn/a.jpg'))
            .rejects.toThrow('Chuyến phải ở trạng thái "arrived" để hoàn thành');
    });

    it('TC-UNIT-TripService-032 — another driver cannot complete the trip on behalf of the owner (SEC-DRV-002)', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ owner_driver_id: 9 }));

        await expect(tripService.completeTrip(100, 5, 'https://cdn/a.jpg'))
            .rejects.toThrow('Bạn không có quyền hoàn thành chuyến này');
    });

    it('TC-UNIT-TripService-033 — a queued next trip in the same order is activated and the driver notified (BR-DRV-015)', async () => {
        tripRepository.activateNextShipment.mockResolvedValue({ id: 101 });

        await tripService.completeTrip(100, 5, 'https://cdn/a.jpg');

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5, expect.objectContaining({ type: 'TRIP_QUEUED', entityId: 101 }), { displayMode: 'alert' },
        );
    });

    it('TC-UNIT-TripService-034 — no queue notification is sent when there is no next trip', async () => {
        await tripService.completeTrip(100, 5, 'https://cdn/a.jpg');

        const loai = notificationService.createForUser.mock.calls.map((c) => c[1].type);
        expect(loai).not.toContain('TRIP_QUEUED');
    });

    it('TC-UNIT-TripService-035 — KPI is recalculated for EVERY driver holding a revenue share of the trip', async () => {
        revenueAllocationRepository.getDriverIdsForShipment.mockResolvedValue([5, 8]);

        await tripService.completeTrip(100, 5, 'https://cdn/a.jpg');

        expect(kpiService.recalculateAfterCompletion).toHaveBeenCalledWith([5, 8], expect.any(Date));
    });
});

describe('tripService.returnComplete', () => {
    beforeEach(() => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'returning' }));
        tripRepository.isFinalShipment.mockResolvedValue(false);
        tripRepository.recomputeOrderDerivedStatus.mockResolvedValue(null);
    });

    it('TC-UNIT-TripService-036 — a return trip with a photo is marked completed', async () => {
        await tripService.returnComplete(100, 5, 'https://cdn/hoan-hang.jpg');

        expect(tripRepository.saveDeliveryProof).toHaveBeenCalledWith(100, 5, 'https://cdn/hoan-hang.jpg');
        expect(tripRepository.updateTripStatus).toHaveBeenCalledWith(100, 'completed', null, 5);
    });

    it('TC-UNIT-TripService-037 — a return trip WITHOUT a photo is blocked, that photo is the only proof the goods came back', async () => {
        await expect(tripService.returnComplete(100, 5, null))
            .rejects.toThrow('Ảnh xác nhận đã trả hàng về điểm lấy là bắt buộc');

        expect(tripRepository.updateTripStatus).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-038 — rejects the return confirmation unless the trip is in returning', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'arrived' }));

        await expect(tripService.returnComplete(100, 5, 'https://cdn/a.jpg'))
            .rejects.toThrow('Chuyến phải ở trạng thái "returning" để xác nhận hoàn hàng');
    });

    it('TC-UNIT-TripService-039 — a newly derived order status is pushed to the coordinator in realtime', async () => {
        tripRepository.recomputeOrderDerivedStatus.mockResolvedValue('completed');

        await tripService.returnComplete(100, 5, 'https://cdn/a.jpg');

        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('coordinator', expect.objectContaining({
            type: 'coordinator.order.completed', action: 'completed', orderId: 900,
        }));
    });

    it('TC-UNIT-TripService-040 — no order-closed event is pushed while the order cannot be closed yet', async () => {
        tripRepository.recomputeOrderDerivedStatus.mockResolvedValue(null);

        await tripService.returnComplete(100, 5, 'https://cdn/a.jpg');

        expect(notificationGateway.broadcastToRole).not.toHaveBeenCalled();
    });
});

describe('tripService.releaseTrip', () => {
    it.each([['claimed'], ['picking']])('TC-UNIT-TripService-041 — the trip can be released back to the pool while in %s', async (st) => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: st }));
        tripRepository.releaseShipmentToPool.mockResolvedValue({ id: 100, status: 'available' });

        await tripService.releaseTrip(100, 5, 'Xe hỏng');

        expect(tripRepository.releaseShipmentToPool).toHaveBeenCalledWith(100, 5, 'Xe hỏng');
    });

    it('TC-UNIT-TripService-042 — a trip already in transit can no longer be released by the driver', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'transit' }));

        await expect(tripService.releaseTrip(100, 5, 'đổi ý'))
            .rejects.toThrow('Chỉ có thể hủy chuyến khi ở trạng thái "claimed" hoặc "picking"');

        expect(tripRepository.releaseShipmentToPool).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-043 — another driver cannot release the trip on behalf of the owner', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'claimed', owner_driver_id: 9 }));

        await expect(tripService.releaseTrip(100, 5, 'x'))
            .rejects.toThrow('Bạn không có quyền hủy chuyến này');
    });
});

describe('tripService.markUnpaid — báo khách chưa trả tiền', () => {
    beforeEach(() => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'completed' }));
        paymentRepository.getShipmentFinancialSummary.mockResolvedValue({
            remaining: 2_000_000, trip_value: 2_000_000, cash_collected: 0, customer_debt_total: 0,
        });
        tripRepository.getOrderCustomerId.mockResolvedValue(70);
        tripRepository.createCustomerDebtForTrip.mockResolvedValue({ id: 400 });
    });

    it('TC-UNIT-TripService-044 — a valid unpaid report opens the customer debt', async () => {
        const result = await tripService.markUnpaid(100, 5, { amount: 2_000_000, notes: 'khách khất' });

        expect(tripRepository.createCustomerDebtForTrip).toHaveBeenCalledWith({
            customerId: 70, driverId: 5, shipmentId: 100, orderId: 900, amount: 2_000_000, notes: 'khách khất',
        });
        expect(result).toEqual({ id: 400 });
    });

    it('TC-UNIT-TripService-045 — an unpaid report is refused until the trip is completed', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'arrived' }));

        await expect(tripService.markUnpaid(100, 5, { amount: 100 }))
            .rejects.toThrow('Chỉ có thể báo nợ khi chuyến đã hoàn thành (completed)');
    });

    it('TC-UNIT-TripService-046 — rejects a non-positive amount', async () => {
        await expect(tripService.markUnpaid(100, 5, { amount: 0 }))
            .rejects.toThrow('Số tiền nợ phải là số dương hợp lệ');

        expect(tripRepository.createCustomerDebtForTrip).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-047 — accepts an unpaid report of exactly the remaining balance (upper boundary)', async () => {
        paymentRepository.getShipmentFinancialSummary.mockResolvedValue({
            remaining: 500_000, trip_value: 2_000_000, cash_collected: 1_500_000, customer_debt_total: 0,
        });

        await tripService.markUnpaid(100, 5, { amount: 500_000 });

        expect(tripRepository.createCustomerDebtForTrip).toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-048 — blocks an unpaid report above the remaining balance and states the figures', async () => {
        paymentRepository.getShipmentFinancialSummary.mockResolvedValue({
            remaining: 500_000, trip_value: 2_000_000, cash_collected: 1_500_000, customer_debt_total: 0,
        });

        await expect(tripService.markUnpaid(100, 5, { amount: 500_001 }))
            .rejects.toThrow(/vượt quá phần còn lại/);

        expect(tripRepository.createCustomerDebtForTrip).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-049 — blocks further unpaid reports once the trip is fully collected, anti-spam', async () => {
        paymentRepository.getShipmentFinancialSummary.mockResolvedValue({
            remaining: 0, trip_value: 2_000_000, cash_collected: 2_000_000, customer_debt_total: 0,
        });

        await expect(tripService.markUnpaid(100, 5, { amount: 100_000 }))
            .rejects.toThrow(/đã được ghi nhận đủ số tiền/);
    });

    it('TC-UNIT-TripService-050 — stops when the related order cannot be found', async () => {
        tripRepository.getOrderCustomerId.mockResolvedValue(null);

        await expect(tripService.markUnpaid(100, 5, { amount: 100_000 }))
            .rejects.toThrow('Không tìm thấy đơn hàng liên quan');
    });
});

describe('tripService.requestOrderReceipt', () => {
    beforeEach(() => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'completed' }));
        tripRepository.saveShipmentActualKm.mockResolvedValue(undefined);
        tripRepository.getShipmentFinalStatus.mockResolvedValue({ isMaxIndex: true, allOthersReady: true });
        tripRepository.getOrderPaymentType.mockResolvedValue('cash');
        tripRepository.getOrderReceiptRequestByOrderId.mockResolvedValue(null);
        tripRepository.createOrderReceiptRequest.mockResolvedValue({ id: 600 });
    });

    it('TC-UNIT-TripService-051 — the last driver of a cash order creates the receipt request', async () => {
        const result = await tripService.requestOrderReceipt(900, 5, { shipmentId: 100, actualKm: 120 });

        expect(tripRepository.saveShipmentActualKm).toHaveBeenCalledWith(100, 120);
        expect(tripRepository.createOrderReceiptRequest).toHaveBeenCalledWith(900, 5, 100);
        expect(result).toMatchObject({ km_saved: true, receipt_request_created: true });
    });

    it('TC-UNIT-TripService-052 — rejects mileage of 0 and saves nothing', async () => {
        await expect(tripService.requestOrderReceipt(900, 5, { shipmentId: 100, actualKm: 0 }))
            .rejects.toThrow('Số km thực tế là bắt buộc và phải lớn hơn 0');

        expect(tripRepository.saveShipmentActualKm).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-053 — rejects missing mileage', async () => {
        await expect(tripService.requestOrderReceipt(900, 5, { shipmentId: 100, actualKm: '   ' }))
            .rejects.toThrow('Số km thực tế là bắt buộc và phải lớn hơn 0');
    });

    it('TC-UNIT-TripService-054 — a non-final trip only saves mileage and creates no request', async () => {
        tripRepository.getShipmentFinalStatus.mockResolvedValue({ isMaxIndex: false, allOthersReady: true });

        const result = await tripService.requestOrderReceipt(900, 5, { shipmentId: 100, actualKm: 50 });

        expect(result).toEqual({ km_saved: true, receipt_request_created: false });
        expect(tripRepository.createOrderReceiptRequest).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-055 — the final trip reports waiting while another trip still lacks mileage', async () => {
        tripRepository.getShipmentFinalStatus.mockResolvedValue({ isMaxIndex: true, allOthersReady: false });

        const result = await tripService.requestOrderReceipt(900, 5, { shipmentId: 100, actualKm: 50 });

        expect(result).toEqual({ km_saved: true, receipt_request_created: false, waiting_for_other_shipments: true });
    });

    it('TC-UNIT-TripService-056 — a bank-transfer order creates no receipt request', async () => {
        tripRepository.getOrderPaymentType.mockResolvedValue('bank_transfer');

        const result = await tripService.requestOrderReceipt(900, 5, { shipmentId: 100, actualKm: 50 });

        expect(result).toEqual({ km_saved: true, receipt_request_created: false });
    });

    it('TC-UNIT-TripService-057 — blocks a duplicate receipt request on an order that already has one (BR-018B)', async () => {
        tripRepository.getOrderReceiptRequestByOrderId.mockResolvedValue({ id: 599 });

        await expect(tripService.requestOrderReceipt(900, 5, { shipmentId: 100, actualKm: 50 }))
            .rejects.toThrow('Đơn hàng này đã có yêu cầu tạo phiếu thu rồi (BR-018B)');

        expect(tripRepository.createOrderReceiptRequest).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-058 — two concurrent requests: the database unique violation becomes a business message', async () => {
        tripRepository.createOrderReceiptRequest.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));

        await expect(tripService.requestOrderReceipt(900, 5, { shipmentId: 100, actualKm: 50 }))
            .rejects.toThrow('(BR-018B)');
    });

    it('TC-UNIT-TripService-059 — the request is refused until the trip is completed', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'arrived' }));

        await expect(tripService.requestOrderReceipt(900, 5, { shipmentId: 100, actualKm: 50 }))
            .rejects.toThrow('Chuyến phải ở trạng thái "completed" để gửi yêu cầu phiếu thu');
    });

    it('TC-UNIT-TripService-060 — rejects a trip that does not belong to the given order', async () => {
        await expect(tripService.requestOrderReceipt(777, 5, { shipmentId: 100, actualKm: 50 }))
            .rejects.toThrow('Chuyến không thuộc đơn hàng này');
    });

    it('TC-UNIT-TripService-061 — another driver cannot send the receipt request on behalf of the owner', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ status: 'completed', owner_driver_id: 9 }));

        await expect(tripService.requestOrderReceipt(900, 5, { shipmentId: 100, actualKm: 50 }))
            .rejects.toThrow('Bạn không có quyền gửi yêu cầu phiếu thu cho chuyến này');
    });
});

describe('tripService.recordReceiptCollection', () => {
    beforeEach(() => {
        tripRepository.recordReceiptCollection.mockResolvedValue({ shipmentReceiptId: 800 });
        tripRepository.getReceiptAmountForDriver.mockResolvedValue(2_000_000);
    });

    it('TC-UNIT-TripService-062 — rejects a payment method outside the catalogue', async () => {
        await expect(tripService.recordReceiptCollection(600, 5, { paymentType: 'momo', proofUrl: 'x' }))
            .rejects.toThrow('Hình thức thanh toán không hợp lệ');

        expect(tripRepository.recordReceiptCollection).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-063 — blocks a cash collection with no verification photo', async () => {
        await expect(tripService.recordReceiptCollection(600, 5, { paymentType: 'cash_collected', proofUrl: null }))
            .rejects.toThrow('Ảnh xác minh là bắt buộc cho hình thức này');
    });

    it('TC-UNIT-TripService-064 — a receipt of 0d waives the photo, there is no transaction to capture', async () => {
        tripRepository.getReceiptAmountForDriver.mockResolvedValue(0);

        await tripService.recordReceiptCollection(600, 5, { paymentType: 'cash_collected', proofUrl: null });

        expect(tripRepository.recordReceiptCollection).toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-065 — a client_credit receipt needs no photo', async () => {
        await tripService.recordReceiptCollection(600, 5, { paymentType: 'client_credit', proofUrl: null });

        expect(tripRepository.getReceiptAmountForDriver).not.toHaveBeenCalled();
        expect(tripRepository.recordReceiptCollection).toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-066 — a customer bank transfer notifies accounting by shipment receipt id, not by request id', async () => {
        notificationService.getUserIdsByRole.mockResolvedValue([40]);

        await tripService.recordReceiptCollection(600, 5, { paymentType: 'bank_transfer', proofUrl: 'https://cdn/ck.jpg' });
        await new Promise(process.nextTick);

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [40],
            expect.objectContaining({ type: 'BANK_TRANSFER_PENDING', entityType: 'bank_transfer', entityId: 800 }),
            { displayMode: 'alert' },
        );
    });
});

describe('tripService.completeStop — thứ tự điểm dừng (BR-011)', () => {
    it('TC-UNIT-TripService-067 — a stop cannot be completed while the previous one is unfinished', async () => {
        stopRepository.isPreviousStopDone.mockResolvedValue(false);

        await expect(tripService.completeStop(100, 12, 5, 'https://cdn/a.jpg'))
            .rejects.toThrow('Phải hoàn thành stop trước (BR-011)');

        expect(stopRepository.markStopCompleted).not.toHaveBeenCalled();
    });

    it('TC-UNIT-TripService-068 — the current stop completes once the previous one is done', async () => {
        stopRepository.isPreviousStopDone.mockResolvedValue(true);
        stopRepository.markStopCompleted.mockResolvedValue({ id: 12 });

        const result = await tripService.completeStop(100, 12, 5, 'https://cdn/a.jpg');

        expect(stopRepository.markStopCompleted).toHaveBeenCalledWith(12, 100, 'https://cdn/a.jpg');
        expect(result).toEqual({ id: 12 });
    });

    it('TC-UNIT-TripService-069 — reports an error on a stop that is already complete', async () => {
        stopRepository.isPreviousStopDone.mockResolvedValue(true);
        stopRepository.markStopCompleted.mockResolvedValue(null);

        await expect(tripService.completeStop(100, 12, 5, 'x'))
            .rejects.toThrow('Stop không tồn tại hoặc đã hoàn thành');
    });

    it('TC-UNIT-TripService-070 — another driver cannot update the stop on behalf of the owner', async () => {
        tripRepository.getTripById.mockResolvedValue(chuyen({ owner_driver_id: 9 }));

        await expect(tripService.completeStop(100, 12, 5, 'x'))
            .rejects.toThrow('Bạn không có quyền cập nhật stop này');

        expect(stopRepository.isPreviousStopDone).not.toHaveBeenCalled();
    });
});

describe('tripService.getOrderHistory', () => {
    it('TC-UNIT-TripService-071 — pagination computes the offset and total page count correctly', async () => {
        tripRepository.getDriverOrderHistory.mockResolvedValue({ rows: [], total: 65 });

        const result = await tripService.getOrderHistory(5, 3, 30);

        expect(tripRepository.getDriverOrderHistory).toHaveBeenCalledWith(5, { limit: 30, offset: 60 });
        expect(result.pagination).toEqual({ total: 65, page: 3, limit: 30, totalPages: 3 });
    });
});

describe('tripService.getAvailableShipmentDetail', () => {
    it('TC-UNIT-TripService-072 — reports an error instead of returning null once another driver has taken the trip', async () => {
        tripRepository.getAvailableShipmentDetail.mockResolvedValue(null);

        await expect(tripService.getAvailableShipmentDetail(100))
            .rejects.toThrow('Chuyến không tồn tại hoặc đã được nhận');
    });
});
