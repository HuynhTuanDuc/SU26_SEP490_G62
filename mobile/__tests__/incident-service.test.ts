import { incidentService } from '@/services/incident-service';
import { apiClient }        from '@/lib/api-client';

jest.mock('@/lib/api-client');

const mockApi = apiClient as jest.Mocked<typeof apiClient>;

describe('incidentService', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('createIncident', () => {
        it('G62-FE-45: POST /api/incidents multipart với ảnh → incident được tạo', async () => {
            mockApi.postForm = jest.fn().mockResolvedValue({ incident: { id: 1 } });

            const result = await incidentService.createIncident({
                shipmentId:    5,
                incidentType:  'vehicle_breakdown',
                severityLevel: 'high',
                description:   'Xe hỏng giữa đường',
                imageUris:     ['file://photo.jpg'],
            });

            expect(mockApi.postForm).toHaveBeenCalledWith('/api/incidents', expect.any(FormData));
            expect(result.incident.id).toBe(1);
        });

        it('G62-FE-46: imageUris=[] → formData KHÔNG append trường "images"', async () => {
            mockApi.postForm = jest.fn().mockResolvedValue({ incident: { id: 2 } });

            const appendSpy = jest.spyOn(FormData.prototype, 'append');

            await incidentService.createIncident({
                shipmentId:    5,
                incidentType:  'traffic_jam',
                severityLevel: 'low',
                description:   'Thử nghiệm',
                imageUris:     [],
            });

            const appendedKeys = appendSpy.mock.calls.map(c => c[0]);
            expect(appendedKeys).not.toContain('images');

            appendSpy.mockRestore();
        });
    });

    describe('updateIncident', () => {
        it('G62-FE-47: updateIncident(3, payload) → PATCH /api/incidents/3', async () => {
            mockApi.patch = jest.fn().mockResolvedValue({ incident: { id: 3 } });

            await incidentService.updateIncident(3, { severityLevel: 'low', description: 'Cập nhật' });

            expect(mockApi.patch).toHaveBeenCalledWith(
                '/api/incidents/3',
                { severityLevel: 'low', description: 'Cập nhật' },
            );
        });
    });

    describe('getMyIncidents', () => {
        it('G62-FE-48: getMyIncidents() → GET /api/incidents/my?page=1&limit=20', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ incidents: [{ id: 1 }], total: 1 });

            const result = await incidentService.getMyIncidents();

            expect(mockApi.get).toHaveBeenCalledWith('/api/incidents/my?page=1&limit=20');
            expect(Array.isArray(result.incidents)).toBe(true);
        });
    });

    describe('getIncidentDetail', () => {
        it('G62-FE-49: getIncidentDetail(3) → GET /api/incidents/3', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ incident: { id: 3, status: 'open' } });

            const result = await incidentService.getIncidentDetail(3);

            expect(mockApi.get).toHaveBeenCalledWith('/api/incidents/3');
            expect(result.incident.id).toBe(3);
        });
    });

    describe('getCounts', () => {
        it('G62-FE-50: getCounts() → GET /api/incidents/my/counts', async () => {
            mockApi.get = jest.fn().mockResolvedValue({ open_count: 2, closed_count: 5 });

            const result = await incidentService.getCounts();

            expect(mockApi.get).toHaveBeenCalledWith('/api/incidents/my/counts');
            expect(result.open_count).toBe(2);
            expect(result.closed_count).toBe(5);
        });
    });
});
