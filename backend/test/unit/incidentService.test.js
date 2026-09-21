/**
 * L1 Unit Test — incidentService (phần tài xế báo sự cố)
 *
 * Phủ BR-DRV-021 (bắt buộc chọn loại sự cố), BR-DRV-022 (ảnh minh chứng, tối đa 3),
 * BR-DRV-023 (điều phối phải được báo), cùng hai luật riêng của hệ thống:
 *   - tắc đường / sự cố đường sá báo được KHÔNG cần chuyến, và được phát cảnh báo
 *     cho toàn bộ tài xế khác;
 *   - mỗi chuyến chỉ 1 sự cố cho mỗi loại (chống spam), ngoài chuyến thì mỗi tài xế
 *     chỉ 1 sự cố đang mở cho mỗi loại.
 *
 * incidentService require config/database ở module level → mock để không mở kết nối thật.
 */
jest.mock('../../config/database', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../repositories/incidentRepository');
jest.mock('../../repositories/tripRepository');
jest.mock('../../repositories/orderRepository');
jest.mock('../../repositories/driverRepository');
jest.mock('../../repositories/revenueAllocationRepository');
jest.mock('../../services/notificationService', () => ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForUsers: jest.fn().mockResolvedValue([]),
    getUserIdsByRole: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../services/notificationGateway', () => ({
    broadcastToRole: jest.fn(), broadcastToUser: jest.fn(), notifyCreated: jest.fn(),
}));
jest.mock('../../services/vehicleManagementService', () => ({}));
jest.mock('../../services/spendingService', () => ({ createVoucher: jest.fn() }));

const incidentRepository = require('../../repositories/incidentRepository');
const tripRepository = require('../../repositories/tripRepository');
const notificationService = require('../../services/notificationService');
const notificationGateway = require('../../services/notificationGateway');
const incidentService = require('../../services/incidentService');

const SU_CO_HOP_LE = {
    shipmentId: 100,
    incidentType: 'vehicle_breakdown',
    severityLevel: 'high',
    description: 'Nổ lốp trước bên phải trên quốc lộ 51',
    location: '  Km 25 QL51  ',
};

beforeEach(() => {
    jest.clearAllMocks();
    tripRepository.getTripById.mockResolvedValue({ id: 100, owner_driver_id: 5, status: 'transit' });
    incidentRepository.getIncidentsByShipment.mockResolvedValue([]);
    incidentRepository.getOpenIncidentsByDriverAndType.mockResolvedValue(null);
    incidentRepository.createIncident.mockResolvedValue({ id: 500 });
    // createIncident trả về bản ĐỌC LẠI từ DB (getIncidentById), không trả thẳng row vừa insert
    incidentRepository.getIncidentById.mockResolvedValue({ id: 500, status: 'open', reported_by: 5 });
    incidentRepository.addIncidentEvidence.mockResolvedValue(undefined);
    incidentRepository.getCoordinatorIds.mockResolvedValue([30, 31]);
    incidentRepository.getActiveDriverIds.mockResolvedValue([6, 7]);
});

describe('incidentService.createIncident', () => {
    it('TC-UNIT-IncidentService-001 — a valid incident is recorded with the location trimmed', async () => {
        const result = await incidentService.createIncident(5, SU_CO_HOP_LE, []);

        expect(incidentRepository.createIncident).toHaveBeenCalledWith({
            shipmentId: 100,
            reportedBy: 5,
            incidentType: 'vehicle_breakdown',
            severityLevel: 'high',
            description: 'Nổ lốp trước bên phải trên quốc lộ 51',
            location: 'Km 25 QL51',
        });
        expect(result).toMatchObject({ id: 500 });
    });

    it('TC-UNIT-IncidentService-002 — rejects an incident type outside the catalogue (BR-DRV-021)', async () => {
        await expect(incidentService.createIncident(5, { ...SU_CO_HOP_LE, incidentType: 'het_xang' }))
            .rejects.toThrow('Loại sự cố không hợp lệ');

        expect(incidentRepository.createIncident).not.toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-003 — rejects a missing incident type', async () => {
        await expect(incidentService.createIncident(5, { ...SU_CO_HOP_LE, incidentType: null }))
            .rejects.toThrow('Loại sự cố không hợp lệ');
    });

    it('TC-UNIT-IncidentService-004 — rejects a missing description', async () => {
        await expect(incidentService.createIncident(5, { ...SU_CO_HOP_LE, description: '   ' }))
            .rejects.toThrow('Mô tả sự cố là bắt buộc');

        expect(incidentRepository.createIncident).not.toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-005 — rejects a 9-character description, below the minimum of 10', async () => {
        await expect(incidentService.createIncident(5, { ...SU_CO_HOP_LE, description: '123456789' }))
            .rejects.toThrow('Mô tả sự cố phải có ít nhất 10 ký tự');
    });

    it('TC-UNIT-IncidentService-006 — accepts a description of exactly 10 characters (lower boundary)', async () => {
        await incidentService.createIncident(5, { ...SU_CO_HOP_LE, description: '1234567890' });

        expect(incidentRepository.createIncident).toHaveBeenCalledWith(
            expect.objectContaining({ description: '1234567890' }),
        );
    });

    it('TC-UNIT-IncidentService-007 — an invalid severity falls back to the medium default', async () => {
        await incidentService.createIncident(5, { ...SU_CO_HOP_LE, severityLevel: 'tham_hoa' });

        expect(incidentRepository.createIncident).toHaveBeenCalledWith(
            expect.objectContaining({ severityLevel: 'medium' }),
        );
    });

    it('TC-UNIT-IncidentService-008 — an omitted severity falls back to the medium default', async () => {
        await incidentService.createIncident(5, { ...SU_CO_HOP_LE, severityLevel: undefined });

        expect(incidentRepository.createIncident).toHaveBeenCalledWith(
            expect.objectContaining({ severityLevel: 'medium' }),
        );
    });

    it('TC-UNIT-IncidentService-009 — a traffic jam can be reported without a trip, the description is generated', async () => {
        await incidentService.createIncident(5, {
            incidentType: 'traffic_jam', location: 'Ngã tư Vũng Tàu',
        });

        expect(incidentRepository.createIncident).toHaveBeenCalledWith(expect.objectContaining({
            shipmentId: null,
            incidentType: 'traffic_jam',
            description: 'Tắc đường — báo cáo tự động',
        }));
    });

    it('TC-UNIT-IncidentService-010 — cargo damage must be attached to a trip', async () => {
        await expect(incidentService.createIncident(5, {
            incidentType: 'cargo_damage', description: 'Thùng hàng bị móp nặng',
        })).rejects.toThrow('Loại sự cố này chỉ có thể báo cáo khi đang thực hiện chuyến vận chuyển');

        expect(incidentRepository.createIncident).not.toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-011 — a vehicle breakdown can be reported even with no trip at all', async () => {
        await incidentService.createIncident(5, {
            incidentType: 'vehicle_breakdown', description: 'Xe không nổ máy được sáng nay',
        });

        expect(incidentRepository.createIncident).toHaveBeenCalledWith(
            expect.objectContaining({ shipmentId: null }),
        );
    });

    it('TC-UNIT-IncidentService-012 — rejects a trip that does not exist', async () => {
        tripRepository.getTripById.mockResolvedValue(null);

        await expect(incidentService.createIncident(5, SU_CO_HOP_LE))
            .rejects.toThrow('Chuyến vận chuyển không tồn tại');
    });

    it('TC-UNIT-IncidentService-013 — another driver cannot report an incident on this trip (SEC-DRV-002)', async () => {
        tripRepository.getTripById.mockResolvedValue({ id: 100, owner_driver_id: 9, status: 'transit' });

        await expect(incidentService.createIncident(5, SU_CO_HOP_LE))
            .rejects.toThrow('Bạn không có quyền báo sự cố cho chuyến này');

        expect(incidentRepository.createIncident).not.toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-014 — a completed trip can no longer receive incident reports', async () => {
        tripRepository.getTripById.mockResolvedValue({ id: 100, owner_driver_id: 5, status: 'completed' });

        await expect(incidentService.createIncident(5, SU_CO_HOP_LE))
            .rejects.toThrow('Chỉ có thể báo sự cố khi chuyến đang hoạt động');
    });

    it('TC-UNIT-IncidentService-015 — only one incident per type per trip, anti-spam', async () => {
        incidentRepository.getIncidentsByShipment.mockResolvedValue([
            { id: 499, incident_type: 'vehicle_breakdown' },
        ]);

        await expect(incidentService.createIncident(5, SU_CO_HOP_LE))
            .rejects.toThrow(/^DUPLICATE_TYPE:/);

        expect(incidentRepository.createIncident).not.toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-016 — a trip holding a DIFFERENT incident type still accepts the new one', async () => {
        incidentRepository.getIncidentsByShipment.mockResolvedValue([
            { id: 499, incident_type: 'cargo_damage' },
        ]);

        await incidentService.createIncident(5, SU_CO_HOP_LE);

        expect(incidentRepository.createIncident).toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-017 — off-trip: an unresolved incident of the same type blocks a new report', async () => {
        incidentRepository.getOpenIncidentsByDriverAndType.mockResolvedValue({ id: 498 });

        await expect(incidentService.createIncident(5, {
            incidentType: 'vehicle_breakdown', description: 'Xe không nổ máy được',
        })).rejects.toThrow(/^DUPLICATE_TYPE:/);
    });

    it('TC-UNIT-IncidentService-018 — exactly 3 evidence photos are still accepted (upper boundary)', async () => {
        const anh = ['https://cdn/1.jpg', 'https://cdn/2.jpg', 'https://cdn/3.jpg'];

        await incidentService.createIncident(5, SU_CO_HOP_LE, anh);

        expect(incidentRepository.addIncidentEvidence).toHaveBeenCalledTimes(3);
        expect(incidentRepository.addIncidentEvidence).toHaveBeenCalledWith(500, 'https://cdn/1.jpg');
    });

    it('TC-UNIT-IncidentService-019 — 4 photos exceed the limit and are rejected before any database write', async () => {
        const anh = ['1', '2', '3', '4'].map((n) => `https://cdn/${n}.jpg`);

        await expect(incidentService.createIncident(5, SU_CO_HOP_LE, anh))
            .rejects.toThrow('Tối đa 3 ảnh minh chứng');

        expect(incidentRepository.createIncident).not.toHaveBeenCalled();
        expect(incidentRepository.addIncidentEvidence).not.toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-020 — an incident with no photo at all is still recorded', async () => {
        await incidentService.createIncident(5, SU_CO_HOP_LE, []);

        expect(incidentRepository.createIncident).toHaveBeenCalled();
        expect(incidentRepository.addIncidentEvidence).not.toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-021 — coordinators are notified immediately (BR-DRV-023)', async () => {
        await incidentService.createIncident(5, SU_CO_HOP_LE, []);

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [30, 31],
            expect.objectContaining({ type: 'INCIDENT_REPORTED', entityId: 500 }),
            { displayMode: 'alert' },
        );
        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('coordinator',
            expect.objectContaining({ action: 'created', incidentId: 500 }));
    });

    it('TC-UNIT-IncidentService-022 — the reporting driver also receives an acknowledgement', async () => {
        await incidentService.createIncident(5, SU_CO_HOP_LE, []);

        expect(notificationService.createForUser).toHaveBeenCalledWith(
            5, expect.objectContaining({ type: 'INCIDENT_REPORTED', entityId: 500 }), { displayMode: 'silent' },
        );
    });

    it('TC-UNIT-IncidentService-023 — a traffic incident broadcasts a warning to every other driver', async () => {
        await incidentService.createIncident(5, {
            incidentType: 'traffic_jam', location: 'Ngã tư Vũng Tàu',
        });

        expect(incidentRepository.getActiveDriverIds).toHaveBeenCalledWith(5);
        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [6, 7],
            expect.objectContaining({
                type: 'TRAFFIC_ALERT',
                message: expect.stringContaining('Ngã tư Vũng Tàu'),
            }),
            { displayMode: 'traffic_alert' },
        );
    });

    it('TC-UNIT-IncidentService-024 — a NON-traffic incident broadcasts nothing to the fleet', async () => {
        await incidentService.createIncident(5, SU_CO_HOP_LE, []);

        expect(incidentRepository.getActiveDriverIds).not.toHaveBeenCalled();
        const loai = notificationService.createForUsers.mock.calls.map((c) => c[1].type);
        expect(loai).not.toContain('TRAFFIC_ALERT');
    });

    it('TC-UNIT-IncidentService-025 — a traffic warning without a location reads as an unspecified area', async () => {
        await incidentService.createIncident(5, { incidentType: 'traffic_jam', location: '   ' });

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [6, 7],
            expect.objectContaining({ message: expect.stringContaining('khu vực không xác định') }),
            expect.anything(),
        );
    });
});

describe('incidentService.updateMyIncident', () => {
    beforeEach(() => {
        incidentRepository.getIncidentById.mockResolvedValue({
            id: 500, reported_by: 5, status: 'open', shipment_id: 100,
        });
        incidentRepository.updateIncident.mockResolvedValue({ id: 500 });
    });

    it('TC-UNIT-IncidentService-026 — a driver may edit their own incident while it is still open', async () => {
        await incidentService.updateMyIncident(500, 5, {
            severityLevel: 'critical', description: '  Nổ lốp, cần cứu hộ gấp  ', location: ' Km 30 ',
        });

        expect(incidentRepository.updateIncident).toHaveBeenCalledWith(500, 5, {
            severityLevel: 'critical', description: 'Nổ lốp, cần cứu hộ gấp', location: 'Km 30',
        });
    });

    it('TC-UNIT-IncidentService-027 — rejects an empty description', async () => {
        await expect(incidentService.updateMyIncident(500, 5, { description: '   ' }))
            .rejects.toThrow('Mô tả sự cố không được để trống');

        expect(incidentRepository.getIncidentById).not.toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-028 — rejects a description shorter than 10 characters', async () => {
        await expect(incidentService.updateMyIncident(500, 5, { description: 'ngắn quá' }))
            .rejects.toThrow('Mô tả phải có ít nhất 10 ký tự');
    });

    it('TC-UNIT-IncidentService-029 — reports an error when the incident does not exist', async () => {
        incidentRepository.getIncidentById.mockResolvedValue(null);

        await expect(incidentService.updateMyIncident(500, 5, { severityLevel: 'low' }))
            .rejects.toThrow('Sự cố không tồn tại');
    });

    it('TC-UNIT-IncidentService-030 — an incident reported by someone else cannot be edited (SEC-DRV-001)', async () => {
        incidentRepository.getIncidentById.mockResolvedValue({ id: 500, reported_by: 9, status: 'open' });

        await expect(incidentService.updateMyIncident(500, 5, { severityLevel: 'low' }))
            .rejects.toThrow('Bạn không có quyền chỉnh sửa sự cố này');

        expect(incidentRepository.updateIncident).not.toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-031 — once the coordinator starts handling it, the driver can no longer edit', async () => {
        incidentRepository.getIncidentById.mockResolvedValue({ id: 500, reported_by: 5, status: 'investigating' });

        await expect(incidentService.updateMyIncident(500, 5, { severityLevel: 'low' }))
            .rejects.toThrow('Chỉ có thể chỉnh sửa sự cố đang ở trạng thái "Đang chờ"');
    });

    it('TC-UNIT-IncidentService-032 — reports an error when the repository updates nothing', async () => {
        incidentRepository.updateIncident.mockResolvedValue(null);

        await expect(incidentService.updateMyIncident(500, 5, { severityLevel: 'low' }))
            .rejects.toThrow('Không thể cập nhật sự cố');
    });

    it('TC-UNIT-IncidentService-033 — an edit notifies the coordinator again and pushes realtime', async () => {
        await incidentService.updateMyIncident(500, 5, { severityLevel: 'low' });

        expect(notificationService.createForUsers).toHaveBeenCalledWith(
            [30, 31], expect.objectContaining({ entityId: 500 }), { displayMode: 'silent' },
        );
        expect(notificationGateway.broadcastToRole).toHaveBeenCalledWith('coordinator',
            expect.objectContaining({ action: 'updated', incidentId: 500 }));
    });

    it('TC-UNIT-IncidentService-034 — omitting location leaves the stored value untouched (undefined)', async () => {
        await incidentService.updateMyIncident(500, 5, { severityLevel: 'low' });

        expect(incidentRepository.updateIncident).toHaveBeenCalledWith(500, 5, {
            severityLevel: 'low', description: null, location: undefined,
        });
    });
});

describe('incidentService.getShipmentIncidents', () => {
    it('TC-UNIT-IncidentService-035 — the owning driver can read the incident list', async () => {
        incidentRepository.getIncidentsByShipment.mockResolvedValue([{ id: 500 }]);

        expect(await incidentService.getShipmentIncidents(100, 5)).toEqual([{ id: 500 }]);
    });

    it('TC-UNIT-IncidentService-036 — another driver cannot read the incidents of this trip', async () => {
        tripRepository.getTripById.mockResolvedValue({ id: 100, owner_driver_id: 9, status: 'transit' });

        await expect(incidentService.getShipmentIncidents(100, 5))
            .rejects.toThrow('Bạn không có quyền xem sự cố của chuyến này');

        expect(incidentRepository.getIncidentsByShipment).not.toHaveBeenCalled();
    });

    it('TC-UNIT-IncidentService-037 — reports an error when the trip does not exist', async () => {
        tripRepository.getTripById.mockResolvedValue(null);

        await expect(incidentService.getShipmentIncidents(100, 5)).rejects.toThrow('Chuyến không tồn tại');
    });
});
