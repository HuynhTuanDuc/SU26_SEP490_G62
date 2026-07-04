import React from 'react';
import { render, screen, fireEvent, waitFor } from './test-utils';
import { router } from 'expo-router';

import { TripPoolScreen } from '@/features/trips/trip-pool-screen';
import { useTripPool } from '@/hooks/use-trip-pool';
import { useActiveTrip } from '@/hooks/use-active-trip';
import { useClaimTrip } from '@/hooks/use-claim-trip';
import { useConfirm, useToast } from '@/providers/ui-provider';
import type { TripPoolItem } from '@/types/trip';

jest.mock('@/hooks/use-trip-pool');
jest.mock('@/hooks/use-active-trip');
jest.mock('@/hooks/use-claim-trip');
jest.mock('@/providers/ui-provider', () => ({
    UIProvider: ({ children }: { children: React.ReactNode }) => children,
    useToast: jest.fn(),
    useConfirm: jest.fn(),
}));

const mockUseTripPool   = useTripPool as jest.Mock;
const mockUseActiveTrip = useActiveTrip as jest.Mock;
const mockUseClaimTrip  = useClaimTrip as jest.Mock;
const mockUseConfirm    = useConfirm as jest.Mock;
const mockUseToast      = useToast as jest.Mock;

function makeTrip(overrides: Partial<TripPoolItem> = {}): TripPoolItem {
    return {
        shipment_id: 10,
        order_id: 501,
        shipment_index: 1,
        total_order_legs: 1,
        cargo_name: 'Hàng khô',
        order_notes: null,
        payment_type: 'cash',
        pickup_address: 'Kho A',
        delivery_address: 'Kho B',
        cargo_weight_kg: '500',
        estimated_price: '500000',
        notes: null,
        created_at: new Date().toISOString(),
        vehicle_group_id: 1,
        vehicle_group_name: '5m2',
        max_load_weight_kg: '2500',
        ...overrides,
    } as TripPoolItem;
}

describe('TripPoolScreen', () => {
    const showToast = jest.fn();
    const showConfirm = jest.fn();
    const claim = jest.fn();
    const refresh = jest.fn();
    const removeShipment = jest.fn();
    const goToPage = jest.fn();
    const setGroupFilter = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockUseToast.mockReturnValue({ showToast });
        mockUseConfirm.mockReturnValue({ showConfirm });
        mockUseClaimTrip.mockReturnValue({ claim, isLoading: false });
        mockUseActiveTrip.mockReturnValue({ trip: null, isLoading: false, error: null, refresh: jest.fn() });
        mockUseTripPool.mockReturnValue({
            trips: [makeTrip()],
            vehicleGroups: [],
            total: 1,
            page: 1,
            totalPages: 1,
            groupFilter: null,
            setGroupFilter,
            isLoading: false,
            refresh,
            goToPage,
            removeShipment,
        });
    });

    it('G62-FE-91: hiển thị skeleton khi đang tải và chưa có chuyến nào', async () => {
        mockUseTripPool.mockReturnValue({
            trips: [], vehicleGroups: [], total: 0, page: 1, totalPages: 1,
            groupFilter: null, setGroupFilter, isLoading: true, refresh, goToPage, removeShipment,
        });

        await render(<TripPoolScreen />);

        expect(screen.queryByText('Chưa có chuyến nào')).toBeNull();
    });

    it('G62-FE-92: hiển thị "Chưa có chuyến nào" khi danh sách rỗng và không lọc', async () => {
        mockUseTripPool.mockReturnValue({
            trips: [], vehicleGroups: [], total: 0, page: 1, totalPages: 1,
            groupFilter: null, setGroupFilter, isLoading: false, refresh, goToPage, removeShipment,
        });

        await render(<TripPoolScreen />);

        expect(screen.getByText('Chưa có chuyến nào')).toBeTruthy();
    });

    it('G62-FE-93: hiển thị "Không có đơn cho nhóm xe này" khi rỗng và có lọc nhóm xe', async () => {
        mockUseTripPool.mockReturnValue({
            trips: [], vehicleGroups: [], total: 0, page: 1, totalPages: 1,
            groupFilter: 1, setGroupFilter, isLoading: false, refresh, goToPage, removeShipment,
        });

        await render(<TripPoolScreen />);

        expect(screen.getByText('Không có đơn cho nhóm xe này')).toBeTruthy();
    });

    it('G62-FE-94: hiển thị banner cảnh báo khi driver đang có active trip', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: { id: 5 }, isLoading: false, error: null, refresh: jest.fn() });

        await render(<TripPoolScreen />);

        expect(screen.getByText('Bạn đang có chuyến đang thực hiện')).toBeTruthy();
    });

    it('G62-FE-95: khi đang có active trip, nút chuyển thành "Đang có đơn hàng" và bị vô hiệu hoá (BR-006)', async () => {
        mockUseActiveTrip.mockReturnValue({ trip: { id: 5 }, isLoading: false, error: null, refresh: jest.fn() });

        await render(<TripPoolScreen />);
        await fireEvent.press(screen.getByText('Đang có đơn hàng'));

        // Nút claim bị vô hiệu hoá ở tầng UI (onPress=undefined) nên bấm không có tác dụng gì
        expect(showToast).not.toHaveBeenCalled();
        expect(showConfirm).not.toHaveBeenCalled();
        expect(claim).not.toHaveBeenCalled();
    });

    it('G62-FE-96: bấm "Nhận đơn hàng" và huỷ confirm → KHÔNG gọi claim()', async () => {
        showConfirm.mockResolvedValue(false);

        await render(<TripPoolScreen />);
        await fireEvent.press(screen.getByText('Nhận đơn hàng'));
        await waitFor(() => expect(showConfirm).toHaveBeenCalled());

        expect(claim).not.toHaveBeenCalled();
    });

    it('G62-FE-97: claim thành công (BR-005) → toast success + điều hướng /active-trip', async () => {
        showConfirm.mockResolvedValue(true);
        claim.mockResolvedValue({ ok: true, trip: { id: 10 } });

        await render(<TripPoolScreen />);
        await fireEvent.press(screen.getByText('Nhận đơn hàng'));

        await waitFor(() => expect(claim).toHaveBeenCalledWith(10));
        expect(removeShipment).toHaveBeenCalledWith(10);
        expect(showToast).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'success' }),
        );
        expect(router.replace).toHaveBeenCalledWith('/active-trip');
    });

    it('G62-FE-98: claim thất bại vì cùng đơn hàng (sameOrder) (BR-008) → toast warning + refresh, KHÔNG điều hướng', async () => {
        showConfirm.mockResolvedValue(true);
        claim.mockResolvedValue({ ok: false, sameOrder: true, message: 'Bạn đã có một chuyến trong đơn hàng này rồi' });

        await render(<TripPoolScreen />);
        await fireEvent.press(screen.getByText('Nhận đơn hàng'));

        await waitFor(() => expect(claim).toHaveBeenCalled());
        expect(showToast).toHaveBeenCalledWith({ type: 'warning', message: 'Bạn đã có một chuyến trong đơn hàng này rồi' });
        expect(refresh).toHaveBeenCalledWith(false);
        expect(router.replace).not.toHaveBeenCalled();
    });

    it('G62-FE-99: claim thất bại vì đã bị tài xế khác nhận (BR-007) → toast warning + refresh', async () => {
        showConfirm.mockResolvedValue(true);
        claim.mockResolvedValue({ ok: false, alreadyClaimed: true, message: 'ALREADY_CLAIMED' });

        await render(<TripPoolScreen />);
        await fireEvent.press(screen.getByText('Nhận đơn hàng'));

        await waitFor(() => expect(claim).toHaveBeenCalled());
        expect(showToast).toHaveBeenCalledWith({ type: 'warning', message: 'Chuyến này đã được tài xế khác nhận' });
        expect(refresh).toHaveBeenCalledWith(false);
    });

    it('G62-FE-100: claim thất bại vì lỗi khác → toast error + refresh', async () => {
        showConfirm.mockResolvedValue(true);
        claim.mockResolvedValue({ ok: false, message: 'Lỗi hệ thống' });

        await render(<TripPoolScreen />);
        await fireEvent.press(screen.getByText('Nhận đơn hàng'));

        await waitFor(() => expect(claim).toHaveBeenCalled());
        expect(showToast).toHaveBeenCalledWith({ type: 'error', message: 'Lỗi hệ thống' });
        expect(refresh).toHaveBeenCalledWith(false);
    });

    it('G62-FE-101: kéo để làm mới (pull-to-refresh) gọi refresh(true)', async () => {
        const result = await render(<TripPoolScreen />);
        const [scrollView] = result.container.queryAll((inst) => inst.props.refreshControl !== undefined);
        const { refreshControl } = scrollView.props;
        await refreshControl.props.onRefresh();

        expect(refresh).toHaveBeenCalledWith(true);
    });
});
