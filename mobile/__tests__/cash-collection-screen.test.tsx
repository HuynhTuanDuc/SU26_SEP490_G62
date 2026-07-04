import React from 'react';
import { render, screen, fireEvent, waitFor } from './test-utils';
import { Alert } from 'react-native';

import { CashCollectionScreen } from '@/features/driver/cash-collection-screen';
import { useCashCollection, useCreateCollection } from '@/hooks/use-cash-collection';
import type { CashCollection, CollectionSummary } from '@/services/cash-collection-service';

jest.mock('@/hooks/use-cash-collection');
jest.mock('@/features/trips/components/camera-modal', () => ({
    CameraModal: ({ onCapture }: { onCapture: (uri: string) => void }) => {
        const { Pressable, Text } = require('react-native');
        return (
            <Pressable onPress={() => onCapture('file://fake-receipt.jpg')}>
                <Text>__mock_capture__</Text>
            </Pressable>
        );
    },
}));

const mockUseCashCollection  = useCashCollection as jest.Mock;
const mockUseCreateCollection = useCreateCollection as jest.Mock;

function makeSummary(overrides: Partial<CollectionSummary> = {}): CollectionSummary {
    return {
        pending_count: '0', pending_amount: '0',
        confirmed_count: '0', confirmed_amount: '0',
        rejected_count: '0', converted_count: '0',
        ...overrides,
    } as CollectionSummary;
}

function makeCollection(overrides: Partial<CashCollection> = {}): CashCollection {
    return {
        id: 1, amount: '500000', payment_method: 'cash', status: 'pending',
        notes: null, receipt_url: 'url', collected_at: new Date().toISOString(),
        confirmed_at: null, reject_reason: null, debt_id: null,
        shipment_id: 10, trip_code: 'TRP-10', cargo_name: 'Hàng khô',
        ...overrides,
    } as CashCollection;
}

describe('CashCollectionScreen', () => {
    const reload = jest.fn();
    const submit = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(Alert, 'alert').mockImplementation(() => {});
        mockUseCashCollection.mockReturnValue({ collections: [], summary: makeSummary(), isLoading: false, error: null, reload });
        mockUseCreateCollection.mockReturnValue({ isSubmitting: false, error: null, submit });
    });

    it('G62-FE-120: hiển thị "Chưa có lần báo thu hộ nào" khi danh sách rỗng', async () => {
        await render(<CashCollectionScreen />);

        expect(screen.getByText('Chưa có lần báo thu hộ nào')).toBeTruthy();
    });

    it('G62-FE-121: nhóm các khoản thu hộ theo trạng thái, chỉ hiện nhóm có dữ liệu', async () => {
        mockUseCashCollection.mockReturnValue({
            collections: [makeCollection({ id: 1, status: 'pending' }), makeCollection({ id: 2, status: 'confirmed' })],
            summary: makeSummary(), isLoading: false, error: null, reload,
        });

        await render(<CashCollectionScreen />);

        expect(screen.getByText('Chờ xác nhận (1)')).toBeTruthy();
        expect(screen.getByText('Đã xác nhận (1)')).toBeTruthy();
        expect(screen.queryByText(/Bị từ chối/)).toBeNull();
    });

    it('G62-FE-122: bấm "Báo thu hộ" (FAB) mở modal tạo mới', async () => {
        await render(<CashCollectionScreen />);
        await fireEvent.press(screen.getByText('Báo thu hộ'));

        expect(screen.getByText('Số tiền thu hộ (₫)')).toBeTruthy();
    });

    it('G62-FE-123: gửi form thiếu ảnh biên lai → Alert cảnh báo BR-018, KHÔNG gọi submit()', async () => {
        await render(<CashCollectionScreen />);
        await fireEvent.press(screen.getByText('Báo thu hộ'));

        const input = screen.getByPlaceholderText('Nhập số tiền khách trả...');
        await fireEvent.changeText(input, '500000');
        await fireEvent.press(screen.getAllByText('Báo thu hộ')[1]); // nút submit trong modal

        expect(Alert.alert).toHaveBeenCalledWith('Thiếu ảnh biên lai', expect.stringContaining('BR-018'));
        expect(submit).not.toHaveBeenCalled();
    });

    it('G62-FE-124: nhập số tiền = 0 → Alert lỗi, KHÔNG gọi submit()', async () => {
        await render(<CashCollectionScreen />);
        await fireEvent.press(screen.getByText('Báo thu hộ'));
        await fireEvent.press(screen.getAllByText('Báo thu hộ')[1]);

        expect(Alert.alert).toHaveBeenCalledWith('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
        expect(submit).not.toHaveBeenCalled();
    });

    it('G62-FE-125: chụp ảnh biên lai rồi gửi → gọi submit() với đầy đủ thông tin (BR-018)', async () => {
        submit.mockResolvedValue(true);

        await render(<CashCollectionScreen />);
        await fireEvent.press(screen.getByText('Báo thu hộ'));

        const input = screen.getByPlaceholderText('Nhập số tiền khách trả...');
        await fireEvent.changeText(input, '500000');

        await fireEvent.press(screen.getByText('Chụp ảnh biên lai'));
        await fireEvent.press(screen.getByText('__mock_capture__'));

        await fireEvent.press(screen.getAllByText('Báo thu hộ')[1]);

        await waitFor(() => expect(submit).toHaveBeenCalled());
        expect(submit).toHaveBeenCalledWith({
            amount: 500000,
            paymentMethod: 'cash',
            notes: undefined,
            receiptUri: 'file://fake-receipt.jpg',
        });
    });

    it('G62-FE-126: chọn hình thức "Chuyển khoản" thay vì mặc định "Tiền mặt"', async () => {
        submit.mockResolvedValue(true);

        await render(<CashCollectionScreen />);
        await fireEvent.press(screen.getByText('Báo thu hộ'));
        await fireEvent.press(screen.getByText('Chuyển khoản'));

        const input = screen.getByPlaceholderText('Nhập số tiền khách trả...');
        await fireEvent.changeText(input, '300000');
        await fireEvent.press(screen.getByText('Chụp ảnh biên lai'));
        await fireEvent.press(screen.getByText('__mock_capture__'));
        await fireEvent.press(screen.getAllByText('Báo thu hộ')[1]);

        await waitFor(() => expect(submit).toHaveBeenCalledWith(
            expect.objectContaining({ paymentMethod: 'bank_transfer' }),
        ));
    });

    it('G62-FE-127: hiển thị lý do từ chối trên card khi status=rejected', async () => {
        mockUseCashCollection.mockReturnValue({
            collections: [makeCollection({ id: 3, status: 'rejected', reject_reason: 'Ảnh không rõ số tiền' })],
            summary: makeSummary(), isLoading: false, error: null, reload,
        });

        await render(<CashCollectionScreen />);

        expect(screen.getByText(/Lý do từ chối: Ảnh không rõ số tiền/)).toBeTruthy();
    });

    it('G62-FE-128: gọi reload() khi mount', async () => {
        await render(<CashCollectionScreen />);

        expect(reload).toHaveBeenCalledTimes(1);
    });
});
