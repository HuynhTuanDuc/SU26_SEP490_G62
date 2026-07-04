import React from 'react';
import { render, screen, fireEvent, waitFor } from './test-utils';
import { router } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';

import { ActiveTripScreen } from '@/features/trips/active-trip-screen';
import { useActiveTrip } from '@/hooks/use-active-trip';
import { useTripLifecycle } from '@/hooks/use-trip-lifecycle';
import { useCompletionProof } from '@/hooks/use-completion-proof';
import { useLoadingProof } from '@/hooks/use-loading-proof';
import { useReturnComplete } from '@/hooks/use-return-complete';
import { useReleaseTrip } from '@/hooks/use-release-trip';
import { useShipmentExpenses } from '@/hooks/use-shipment-expenses';
import { useToast, useAppAlert, useConfirm } from '@/providers/ui-provider';
import { tripService } from '@/services/trip-service';
import type { ActiveTrip } from '@/types/trip';

jest.mock('@/hooks/use-active-trip');
jest.mock('@/hooks/use-trip-lifecycle');
jest.mock('@/hooks/use-completion-proof');
jest.mock('@/hooks/use-loading-proof');
jest.mock('@/hooks/use-return-complete');
jest.mock('@/hooks/use-release-trip');
jest.mock('@/hooks/use-shipment-expenses');
jest.mock('@/services/trip-service');
jest.mock('@/providers/ui-provider', () => ({
    UIProvider: ({ children }: { children: React.ReactNode }) => children,
    useToast: jest.fn(),
    useAppAlert: jest.fn(),
    useConfirm: jest.fn(),
}));
jest.mock('@/features/trips/components/camera-modal', () => ({
    CameraModal: ({ visible, onCapture }: { visible: boolean; onCapture: (uri: string) => void }) => {
        if (!visible) return null;
        const { Pressable, Text } = require('react-native');
        return (
            <Pressable onPress={() => onCapture('file://fake-proof.jpg')}>
                <Text>__mock_capture__</Text>
            </Pressable>
        );
    },
}));

const mockUseActiveTrip       = useActiveTrip as jest.Mock;
const mockUseTripLifecycle    = useTripLifecycle as jest.Mock;
const mockUseCompletionProof  = useCompletionProof as jest.Mock;
const mockUseLoadingProof     = useLoadingProof as jest.Mock;
const mockUseReturnComplete   = useReturnComplete as jest.Mock;
const mockUseReleaseTrip      = useReleaseTrip as jest.Mock;
const mockUseShipmentExpenses = useShipmentExpenses as jest.Mock;
const mockUseToast            = useToast as jest.Mock;
const mockUseAppAlert         = useAppAlert as jest.Mock;
const mockUseConfirm          = useConfirm as jest.Mock;
const mockUseCameraPermissions = useCameraPermissions as jest.Mock;
const mockTripService         = tripService as jest.Mocked<typeof tripService>;

function makeTrip(overrides: Partial<ActiveTrip> = {}): ActiveTrip {
    return {
        id: 10, order_id: 501, shipment_index: 1,
        pickup_address: 'Kho A', delivery_address: 'Kho B',
        cargo_weight_kg: '500', estimated_price: '500000', actual_price: null,
        status: 'claimed', notes: null, version: 1,
        claimed_at: new Date().toISOString(), picking_at: null, transit_at: null,
        arrived_at: null, completed_at: null,
        cargo_name: 'Hàng khô', order_notes: null, order_payment_type: 'cash',
        is_final_shipment: true, max_shipment_index: 1, stops: [],
        ...overrides,
    } as ActiveTrip;
}

describe('ActiveTripScreen', () => {
    const refresh = jest.fn();
    const advance = jest.fn();
    const completeWithProof = jest.fn();
    const submitLoadingProof = jest.fn();
    const completeReturn = jest.fn();
    const releaseTrip = jest.fn();
    const loadExpenses = jest.fn();
    const showToast = jest.fn();
    const showAlert = jest.fn();
    const showConfirm = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockUseToast.mockReturnValue({ showToast });
        mockUseAppAlert.mockReturnValue({ showAlert });
        mockUseConfirm.mockReturnValue({ showConfirm });
        mockUseCameraPermissions.mockReturnValue([{ granted: true }, jest.fn()]);
        mockUseTripLifecycle.mockReturnValue({ isLoading: false, advance });
        mockUseCompletionProof.mockReturnValue({ isUploading: false, completeWithProof });
        mockUseLoadingProof.mockReturnValue({ isUploading: false, submitLoadingProof });
        mockUseReturnComplete.mockReturnValue({ isUploading: false, completeReturn });
        mockUseReleaseTrip.mockReturnValue({ isLoading: false, releaseTrip });
        mockUseShipmentExpenses.mockReturnValue({ expenses: [], load: loadExpenses });
        mockUseActiveTrip.mockReturnValue({ trip: makeTrip(), isLoading: false, error: null, refresh });
    });

    it('G62-FE-138: hiển thị skeleton khi đang tải, không crash', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: null, isLoading: true, error: null, refresh });

        await render(<ActiveTripScreen />);

        expect(screen.getByText('Chuyến hiện tại')).toBeTruthy();
    });

    it('G62-FE-139: không có active trip → hiển thị thông báo + link về Trip Pool', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: null, isLoading: false, error: null, refresh });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('→ Xem danh sách chuyến'));

        expect(screen.getByText('Bạn chưa có chuyến nào đang hoạt động.')).toBeTruthy();
        expect(router.push).toHaveBeenCalledWith('/trip-pool');
    });

    it('G62-FE-140: trạng thái claimed → hiển thị nút "Bắt đầu lấy hàng", bấm gọi advance() (BR-009)', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: makeTrip({ status: 'claimed' }), isLoading: false, error: null, refresh });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Bắt đầu lấy hàng'));

        expect(advance).toHaveBeenCalledWith(10, 'picking');
    });

    it('G62-FE-141: trạng thái picking không có stop → nút "Xác nhận đã lấy hàng" bị vô hiệu khi chưa có ảnh (BR-013)', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: makeTrip({ status: 'picking' }), isLoading: false, error: null, refresh });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Xác nhận đã lấy hàng'));

        expect(submitLoadingProof).not.toHaveBeenCalled();
    });

    it('G62-FE-142: chụp ảnh lấy hàng rồi xác nhận → gọi submitLoadingProof(tripId, uri) (BR-013)', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: makeTrip({ status: 'picking' }), isLoading: false, error: null, refresh });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Ảnh lấy hàng'));
        await fireEvent.press(screen.getByText('__mock_capture__'));
        await fireEvent.press(screen.getByText('Xác nhận đã lấy hàng'));

        expect(submitLoadingProof).toHaveBeenCalledWith(10, 'file://fake-proof.jpg');
    });

    it('G62-FE-143: trạng thái arrived không có stop → nút "Hoàn thành chuyến" bị vô hiệu khi chưa có ảnh (BR-015)', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: makeTrip({ status: 'arrived' }), isLoading: false, error: null, refresh });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Hoàn thành chuyến'));

        expect(completeWithProof).not.toHaveBeenCalled();
    });

    it('G62-FE-144: chụp ảnh giao hàng rồi xác nhận → gọi completeWithProof(tripId, uri) (BR-015)', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: makeTrip({ status: 'arrived' }), isLoading: false, error: null, refresh });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Ảnh xác nhận giao hàng'));
        await fireEvent.press(screen.getByText('__mock_capture__'));
        await fireEvent.press(screen.getByText('Hoàn thành chuyến'));

        expect(completeWithProof).toHaveBeenCalledWith(10, 'file://fake-proof.jpg');
    });

    it('G62-FE-145: sau khi hoàn thành trip → điều hướng sang /receipt-request kèm đủ tham số', async () => {
        mockUseCompletionProof.mockImplementation((onSuccess: () => void) => ({
            isUploading: false,
            completeWithProof: async () => onSuccess(),
        }));
        mockUseActiveTrip.mockReturnValue({ trip: makeTrip({ status: 'arrived' }), isLoading: false, error: null, refresh });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Ảnh xác nhận giao hàng'));
        await fireEvent.press(screen.getByText('__mock_capture__'));
        await fireEvent.press(screen.getByText('Hoàn thành chuyến'));

        await waitFor(() => expect(router.replace).toHaveBeenCalledWith(
            expect.objectContaining({ pathname: '/receipt-request' }),
        ));
    });

    it('G62-FE-146: đơn hàng nhiều tài, chuyến cuối + payment_type=cash + completed → nhãn "Yêu cầu tạo phiếu thu" (BR-008B)', async () => {
        mockUseActiveTrip.mockReturnValue({
            trip: makeTrip({ status: 'completed', is_final_shipment: true, order_payment_type: 'cash' }),
            isLoading: false, error: null, refresh,
        });

        await render(<ActiveTripScreen />);

        expect(screen.getByText('Yêu cầu tạo phiếu thu')).toBeTruthy();
    });

    it('G62-FE-147: không phải chuyến cuối/không phải cash + completed → chỉ nhãn "Nhập km thực tế" (BR-008A)', async () => {
        mockUseActiveTrip.mockReturnValue({
            trip: makeTrip({ status: 'completed', is_final_shipment: false, order_payment_type: 'cash' }),
            isLoading: false, error: null, refresh,
        });

        await render(<ActiveTripScreen />);

        expect(screen.getByText('Nhập km thực tế')).toBeTruthy();
        expect(screen.queryByText('Yêu cầu tạo phiếu thu')).toBeNull();
    });

    it('G62-FE-148: nhiều pickup stop đã hoàn thành (picking) → hiện nút "Bắt đầu vận chuyển" không cần chụp lại ảnh', async () => {
        mockUseActiveTrip.mockReturnValue({
            trip: makeTrip({
                status: 'picking',
                stops: [
                    { id: 1, stop_type: 'pickup', stop_index: 1, address: 'A', completed_at: new Date().toISOString(), arrived_at: new Date().toISOString(), contact_name: null, contact_phone: null } as any,
                ],
            }),
            isLoading: false, error: null, refresh,
        });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Bắt đầu vận chuyển'));

        await waitFor(() => expect(mockTripService.submitLoadingProof).toHaveBeenCalledWith(10, expect.any(FormData)));
    });

    it('G62-FE-149: trạng thái arrived → hiện nút "Thất bại", xác nhận thì gọi advance(id, "failed")', async () => {
        showConfirm.mockResolvedValue(true);
        mockUseActiveTrip.mockReturnValue({ trip: makeTrip({ status: 'arrived' }), isLoading: false, error: null, refresh });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Thất bại'));

        await waitFor(() => expect(showConfirm).toHaveBeenCalled());
        expect(advance).toHaveBeenCalledWith(10, 'failed');
    });

    it('G62-FE-150: trạng thái claimed → hiện nút "Hủy chuyến", xác nhận gọi releaseTrip(id, reason)', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: makeTrip({ status: 'claimed' }), isLoading: false, error: null, refresh });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Hủy chuyến'));
        await fireEvent.press(screen.getByText('Xác nhận hủy chuyến'));

        expect(releaseTrip).toHaveBeenCalledWith(10, undefined);
    });

    it('G62-FE-151: bấm "Báo sự cố" điều hướng sang /report-incident kèm shipmentId', async () => {
        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Báo sự cố'));

        expect(router.push).toHaveBeenCalledWith({ pathname: '/report-incident', params: { shipmentId: '10' } });
    });

    it('G62-FE-152: trạng thái returning → xác nhận hoàn hàng không bắt buộc ảnh, gọi completeReturn', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: makeTrip({ status: 'returning' }), isLoading: false, error: null, refresh });

        await render(<ActiveTripScreen />);
        await fireEvent.press(screen.getByText('Xác nhận hoàn hàng'));

        expect(completeReturn).toHaveBeenCalledWith(10, undefined);
    });

    it('G62-FE-153: gọi loadExpenses() khi mount', async () => {
        await render(<ActiveTripScreen />);

        expect(loadExpenses).toHaveBeenCalledTimes(1);
    });
});
