/**
 * Màn bảo dưỡng: số tiền tài xế khai phải giữ NGUYÊN từng đồng qua mọi bước — gõ vào,
 * lưu lên máy chủ, tải ảnh hóa đơn, và hiện lại sau khi danh sách được tải lại.
 *
 * Máy chủ trả `cost` dạng chuỗi NUMERIC(12,2) ("1234567.00") — test giả lập đúng như vậy.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from './test-utils';

import { MaintenanceScreen } from '@/features/driver/maintenance-screen';
import { maintenanceService } from '@/services/maintenance-service';

type Rec = Record<string, unknown>;

// Bản ghi phía máy chủ — reload() đọc lại từ đây, như app thật gọi GET /maintenance.
let mockServer: Rec[] = [];

jest.mock('@/hooks/use-maintenance', () => {
    const ReactLib = require('react');
    return {
        useMaintenance: () => {
            const [records, setRecords] = ReactLib.useState(() => mockServer.map((r: Rec) => ({ ...r })));
            const reload = ReactLib.useCallback(async () => {
                setRecords(mockServer.map((r: Rec) => ({ ...r })));
            }, []);
            return { records, isLoading: false, error: null, reload };
        },
    };
});

// Camera giả: mở ra là "chụp" và dùng ảnh ngay.
jest.mock('@/features/trips/components/camera-modal', () => {
    const ReactLib = require('react');
    return {
        CameraModal: ({ visible, onCapture }: { visible: boolean; onCapture: (uri: string) => void }) => {
            ReactLib.useEffect(() => { if (visible) onCapture('file:///hoa-don.jpg'); }, [visible]);
            return null;
        },
    };
});

jest.mock('@/services/maintenance-service', () => ({
    maintenanceService: {
        saveCost: jest.fn(),
        uploadBill: jest.fn(),
        removePhoto: jest.fn(),
        complete: jest.fn(),
    },
}));

const mockService = maintenanceService as jest.Mocked<typeof maintenanceService>;

const openRecord = (overrides: Rec = {}): Rec => ({
    id: 1, vehicle_id: 7, plate_number: '51C-123.45', brand: null, model: null,
    maintenance_type: 'scheduled', description: 'Thay nhớt', cost: null,
    maintenance_date: '2026-09-18', next_due_date: null, status: 'open',
    bill_pics: [], request_pics: [], started_at: '2026-09-18T01:00:00Z', completed_at: null,
    created_by: 1, request_reason: null, reject_reason: null,
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockServer = [openRecord()];
    mockService.saveCost.mockImplementation(async (_vehicleId: number, cost: number) => {
        // NUMERIC(12,2) đi qua node-pg thành chuỗi có hai số lẻ.
        mockServer[0].cost = `${cost}.00`;
        return { maintenanceRecordId: 1, cost };
    });
    mockService.uploadBill.mockImplementation(async () => {
        mockServer[0].bill_pics = [...(mockServer[0].bill_pics as string[]), 'https://cdn/hd.jpg'];
        return { maintenanceRecordId: 1, bill_pics: mockServer[0].bill_pics as string[], request_pics: [] };
    });
});

describe('MaintenanceScreen — số tiền khai giữ nguyên từng đồng', () => {
    it.each([
        ['1234567', '1.234.567', 1_234_567],
        ['455550', '455.550', 455_550],
        ['1.999.999', '1.999.999', 1_999_999],
    ])('gõ %s → lưu đúng %s sau khi tải ảnh', async (typed, shown, value) => {
        await render(<MaintenanceScreen />);

        await fireEvent.changeText(screen.getByPlaceholderText('Nhập số tiền (VND)'), typed);
        await fireEvent.press(screen.getByText('Thêm ảnh'));

        await waitFor(() => expect(mockService.uploadBill).toHaveBeenCalledTimes(1));
        expect(mockService.saveCost).toHaveBeenCalledWith(7, value);
        expect(screen.getByPlaceholderText('Nhập số tiền (VND)').props.value).toBe(shown);
    });

    it('mở lại màn hình sau khi đã lưu: ô số tiền hiện đúng số máy chủ trả về', async () => {
        mockServer = [openRecord({ cost: '1234567.00' })];

        await render(<MaintenanceScreen />);

        expect(screen.getByPlaceholderText('Nhập số tiền (VND)').props.value).toBe('1.234.567');
    });
});
