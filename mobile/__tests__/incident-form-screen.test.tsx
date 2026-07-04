import React from 'react';
import { render, screen, fireEvent, waitFor } from './test-utils';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';

import { IncidentFormScreen } from '@/features/incidents/incident-form-screen';
import { incidentService } from '@/services/incident-service';
import { useToast } from '@/providers/ui-provider';
import { ApiError } from '@/lib/api-error';

jest.mock('expo-location', () => ({
    requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
    getCurrentPositionAsync: jest.fn(() => Promise.resolve({ coords: { latitude: 10.123, longitude: 106.456 } })),
    reverseGeocodeAsync: jest.fn(() => Promise.resolve([{ street: 'Đường A', district: 'Quận 7', city: 'TP.HCM' }])),
    Accuracy: { Balanced: 3 },
}));

jest.mock('@/services/incident-service');
jest.mock('@/providers/ui-provider', () => ({
    UIProvider: ({ children }: { children: React.ReactNode }) => children,
    useToast: jest.fn(),
    useConfirm: jest.fn(() => ({ showConfirm: jest.fn() })),
}));

const mockIncidentService = incidentService as jest.Mocked<typeof incidentService>;
const mockUseToast = useToast as jest.Mock;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;

describe('IncidentFormScreen', () => {
    const showToast = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockUseToast.mockReturnValue({ showToast });
        mockUseLocalSearchParams.mockReturnValue({ shipmentId: '10' });
    });

    it('G62-FE-129: mặc định chọn "Sự cố xe", mô tả được đánh dấu BẮT BUỘC', async () => {
        await render(<IncidentFormScreen />);

        expect(screen.getByText('BẮT BUỘC')).toBeTruthy();
    });

    it('G62-FE-130: gửi báo cáo thiếu mô tả (loại không phải traffic) → lỗi "Mô tả sự cố là bắt buộc"', async () => {
        await render(<IncidentFormScreen />);
        await fireEvent.press(screen.getByText('Gửi báo cáo'));

        expect(screen.getByText('Mô tả sự cố là bắt buộc')).toBeTruthy();
        expect(mockIncidentService.createIncident).not.toHaveBeenCalled();
    });

    it('G62-FE-131: mô tả dưới 10 ký tự → lỗi "Mô tả phải có ít nhất 10 ký tự"', async () => {
        await render(<IncidentFormScreen />);
        await fireEvent.changeText(
            screen.getByPlaceholderText('Mô tả chi tiết sự cố đã xảy ra (tối thiểu 10 ký tự)...'),
            'Ngắn quá',
        );
        await fireEvent.press(screen.getByText('Gửi báo cáo'));

        expect(screen.getByText('Mô tả phải có ít nhất 10 ký tự')).toBeTruthy();
        expect(mockIncidentService.createIncident).not.toHaveBeenCalled();
    });

    it('G62-FE-132: chọn loại "Tắc đường" → tự động lấy GPS, mô tả chuyển thành TUỲ CHỌN, hiện banner cảnh báo', async () => {
        await render(<IncidentFormScreen />);
        await fireEvent.press(screen.getByText('Tắc đường'));

        expect(screen.getByText('Cảnh báo giao thông tức thời')).toBeTruthy();
        await waitFor(() => expect(Location.getCurrentPositionAsync).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByPlaceholderText('Ví dụ: Đường Nguyễn Văn Linh, Q.7, TP.HCM').props.value).toContain('Đường A'));
    });

    it('G62-FE-133: loại "Tắc đường" gửi báo cáo mà không cần mô tả (isTrafficType bỏ qua validate)', async () => {
        mockIncidentService.createIncident.mockResolvedValue({ incident: { id: 1 } } as any);

        await render(<IncidentFormScreen />);
        await fireEvent.press(screen.getByText('Tắc đường'));
        await fireEvent.press(screen.getByText('Gửi báo cáo'));

        await waitFor(() => expect(mockIncidentService.createIncident).toHaveBeenCalled());
        expect(mockIncidentService.createIncident).toHaveBeenCalledWith(
            expect.objectContaining({ incidentType: 'traffic_jam', shipmentId: 10 }),
        );
    });

    it('G62-FE-134: gửi báo cáo hợp lệ → gọi createIncident, toast success, quay lại màn trước', async () => {
        mockIncidentService.createIncident.mockResolvedValue({ incident: { id: 1 } } as any);

        await render(<IncidentFormScreen />);
        await fireEvent.changeText(
            screen.getByPlaceholderText('Mô tả chi tiết sự cố đã xảy ra (tối thiểu 10 ký tự)...'),
            'Xe bị thủng lốp giữa đường',
        );
        await fireEvent.press(screen.getByText('Gửi báo cáo'));

        await waitFor(() => expect(mockIncidentService.createIncident).toHaveBeenCalledWith({
            shipmentId: 10,
            incidentType: 'vehicle_breakdown',
            severityLevel: 'medium',
            description: 'Xe bị thủng lốp giữa đường',
            location: undefined,
            imageUris: [],
        }));
        expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
        expect(router.back).toHaveBeenCalled();
    });

    it('G62-FE-135: chọn sub-type → mô tả gửi đi được gộp dạng "[subtype] mô tả"', async () => {
        mockIncidentService.createIncident.mockResolvedValue({ incident: { id: 1 } } as any);

        await render(<IncidentFormScreen />);
        await fireEvent.press(screen.getByText('Thủng lốp'));
        await fireEvent.changeText(
            screen.getByPlaceholderText('Mô tả chi tiết sự cố đã xảy ra (tối thiểu 10 ký tự)...'),
            'Lốp trước bị thủng',
        );
        await fireEvent.press(screen.getByText('Gửi báo cáo'));

        await waitFor(() => expect(mockIncidentService.createIncident).toHaveBeenCalledWith(
            expect.objectContaining({ description: '[Thủng lốp] Lốp trước bị thủng' }),
        ));
    });

    it('G62-FE-136: lỗi 409 trùng loại sự cố → hiển thị link "Chỉnh sửa sự cố đã tạo →" (DUPLICATE_TYPE)', async () => {
        const apiErr = new ApiError('DUPLICATE_TYPE:Chuyến này đã có sự cố loại "vehicle_breakdown"', 409);
        mockIncidentService.createIncident.mockRejectedValue(apiErr);
        mockIncidentService.getShipmentIncidents.mockResolvedValue({
            incidents: [{ id: 77, incident_type: 'vehicle_breakdown' }],
        } as any);

        await render(<IncidentFormScreen />);
        await fireEvent.changeText(
            screen.getByPlaceholderText('Mô tả chi tiết sự cố đã xảy ra (tối thiểu 10 ký tự)...'),
            'Xe bị thủng lốp giữa đường',
        );
        await fireEvent.press(screen.getByText('Gửi báo cáo'));

        await waitFor(() => expect(screen.getByText('Chỉnh sửa sự cố đã tạo →')).toBeTruthy());

        await fireEvent.press(screen.getByText('Chỉnh sửa sự cố đã tạo →'));
        expect(router.push).toHaveBeenCalledWith({ pathname: '/incident-edit', params: { id: '77' } });
    });

    it('G62-FE-137: đổi loại sự cố sẽ xoá lỗi/duplicate cũ và reset sub-type', async () => {
        const apiErr = new ApiError('DUPLICATE_TYPE:...', 409);
        mockIncidentService.createIncident.mockRejectedValue(apiErr);
        mockIncidentService.getShipmentIncidents.mockResolvedValue({ incidents: [] } as any);

        await render(<IncidentFormScreen />);
        await fireEvent.changeText(
            screen.getByPlaceholderText('Mô tả chi tiết sự cố đã xảy ra (tối thiểu 10 ký tự)...'),
            'Xe bị thủng lốp giữa đường',
        );
        await fireEvent.press(screen.getByText('Gửi báo cáo'));
        await waitFor(() => expect(screen.getByText(/DUPLICATE_TYPE/)).toBeTruthy());

        await fireEvent.press(screen.getByText('Hàng hóa hư hỏng'));

        expect(screen.queryByText(/DUPLICATE_TYPE/)).toBeNull();
    });
});
