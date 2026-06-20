import { apiClient } from '@/lib/api-client';
import type {
    CreateIncidentResponse,
    IncidentDetailResponse,
    IncidentListResponse,
    IncidentSeverity,
    IncidentType,
} from '@/types/incident';

export type CreateIncidentPayload = {
    shipmentId?: number | null;
    incidentType: IncidentType;
    severityLevel: IncidentSeverity;
    description: string;
    location?: string;
    imageUris: string[];
};

export type UpdateIncidentPayload = {
    severityLevel?: IncidentSeverity;
    description?: string;
    location?: string | null;
};

export const incidentService = {
    createIncident: (payload: CreateIncidentPayload): Promise<CreateIncidentResponse> => {
        const formData = new FormData();
        if (payload.shipmentId) {
            formData.append('shipmentId', String(payload.shipmentId));
        }
        formData.append('incidentType',  payload.incidentType);
        formData.append('severityLevel', payload.severityLevel);
        formData.append('description',   payload.description);
        if (payload.location?.trim()) {
            formData.append('location', payload.location.trim());
        }

        payload.imageUris.forEach((uri) => {
            const filename = uri.split('/').pop() ?? 'incident.jpg';
            const ext      = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
            const mimeMap: Record<string, string> = {
                jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
            };
            formData.append('images', {
                uri,
                name: filename,
                type: mimeMap[ext] ?? 'image/jpeg',
            } as unknown as Blob);
        });

        return apiClient.postForm<CreateIncidentResponse>('/api/incidents', formData);
    },

    updateIncident: (id: number, payload: UpdateIncidentPayload): Promise<IncidentDetailResponse> =>
        apiClient.patch<IncidentDetailResponse>(`/api/incidents/${id}`, payload),

    getMyIncidents: (page = 1, limit = 20): Promise<IncidentListResponse> =>
        apiClient.get<IncidentListResponse>(`/api/incidents/my?page=${page}&limit=${limit}`),

    getIncidentDetail: (id: number): Promise<IncidentDetailResponse> =>
        apiClient.get<IncidentDetailResponse>(`/api/incidents/${id}`),

    getShipmentIncidents: (shipmentId: number): Promise<{ incidents: import('@/types/incident').Incident[] }> =>
        apiClient.get(`/api/incidents/shipment/${shipmentId}`),

    getCounts: (): Promise<{ open_count: number; closed_count: number }> =>
        apiClient.get('/api/incidents/my/counts'),
};
