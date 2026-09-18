import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from './test-utils';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { launchCameraAsync, requestCameraPermissionsAsync } from 'expo-image-picker';

import { ReceiptDetailScreen } from '@/features/trips/receipt-detail-screen';
import { tripService } from '@/services/trip-service';
import type { DriverReceiptDetail, CompanyInfo } from '@/types/trip';

jest.mock('expo-image-picker', () => ({
    launchImageLibraryAsync: jest.fn(),
    launchCameraAsync: jest.fn(),
    requestCameraPermissionsAsync: jest.fn(),
    MediaTypeOptions: { Images: 'Images' },
}));
jest.mock('@/services/trip-service');

const mockTripService = tripService as jest.Mocked<typeof tripService>;
const mockUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const mockLaunchCamera = launchCameraAsync as jest.Mock;
const mockRequestCameraPerm = requestCameraPermissionsAsync as jest.Mock;

// Alert.alert giả lập: tự động bấm nút "Đồng ý"/"OK" cuối cùng trong danh sách buttons
function autoConfirmAlert() {
    jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
        const confirmBtn = buttons?.find((b) => b.text !== 'Huỷ' && b.text !== 'Hủy' && b.text !== 'cancel');
        confirmBtn?.onPress?.();
    });
}

const companyInfo: CompanyInfo = {
    company_name: 'ABC Logistics', hotline: '1900', bank_name: 'Vietcombank',
    bank_account_number: '0011002233', bank_account_name: 'CTY ABC', bank_qr_url: 'https://qr.png',
};

function makeReceipt(overrides: Partial<DriverReceiptDetail> = {}): DriverReceiptDetail {
    return {
        orr_id: 5, shipment_receipt_id: 77, request_status: 'approved', payment_type: null,
        amount: '500000', total_expenses: '0', collected_at: new Date().toISOString(),
        notes: null, rejection_reason: null, order_id: 501,
        cargo_name: 'Hàng khô', customer_name: 'Nguyễn Văn A', customer_company: null, customer_phone: '0900000000',
        shipment_id: 10,
        order_payment_type: 'cash', customer_id: 1, cargo_weight_kg: null,
        customer_address: null, actual_distance_km: null, estimated_distance_km: null,
        actual_price: null, estimated_price: '500000', driver_name: 'Tài A', driver_phone: null,
        plate_number: '29A-12345', coordinator_name: 'Điều phối B',
        has_driver_debt: false, has_customer_debt: false,
        pickup_address: 'Kho A', delivery_address: 'Kho B', expenses: [],
        ...overrides,
    } as DriverReceiptDetail;
}

describe('ReceiptDetailScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTripService.recordReceiptCollection.mockReset();
        mockTripService.resubmitReceiptRequest.mockReset();
        mockUseLocalSearchParams.mockReturnValue({ orrId: '5' });
        mockTripService.getCompanyInfo.mockResolvedValue({ info: companyInfo } as any);
        mockRequestCameraPerm.mockResolvedValue({ status: 'granted' });
        mockLaunchCamera.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://proof.jpg' }] });
    });

    afterEach(async () => {
        await cleanup();
    });

    it('G62-FE-154: hiển thị lỗi khi không tìm thấy phiếu thu', async () => {
        mockTripService.getDriverReceiptDetail.mockRejectedValue(new Error('Không tìm thấy phiếu thu'));

        await render(<ReceiptDetailScreen />);

        await waitFor(() => expect(screen.getByText('Không tìm thấy phiếu thu')).toBeTruthy());
    });

    it('G62-FE-155: request_status=rejected → hiện banner từ chối + lý do + nút gửi lại', async () => {
        mockTripService.getDriverReceiptDetail.mockResolvedValue({
            receipt: makeReceipt({ request_status: 'rejected', rejection_reason: 'Ảnh không rõ ràng' }),
        } as any);

        await render(<ReceiptDetailScreen />);

        await waitFor(() => expect(screen.getByText('Yêu cầu đã bị từ chối')).toBeTruthy());
        expect(screen.getByText('Ảnh không rõ ràng')).toBeTruthy();
    });

    it('G62-FE-156: gửi lại yêu cầu sau khi bị từ chối → gọi resubmitReceiptRequest(orrId, note)', async () => {
        mockTripService.getDriverReceiptDetail.mockResolvedValue({
            receipt: makeReceipt({ request_status: 'rejected', rejection_reason: 'Sai số tiền' }),
        } as any);
        mockTripService.resubmitReceiptRequest.mockResolvedValue({} as any);

        await render(<ReceiptDetailScreen />);
        await waitFor(() => screen.getByText('Yêu cầu đã bị từ chối'));

        await fireEvent.changeText(
            screen.getByPlaceholderText('Giải thích thay đổi hoặc bổ sung thông tin...'),
            'Đã chỉnh lại số tiền',
        );
        await fireEvent.press(screen.getByText('Gửi lại yêu cầu tạo phiếu thu'));

        await waitFor(() => expect(mockTripService.resubmitReceiptRequest).toHaveBeenCalledWith(5, 'Đã chỉnh lại số tiền'));
    });

    it('G62-FE-157: request_status=approved & payment_type=null → hiện đủ 3 nút thanh toán (BR-018)', async () => {
        mockTripService.getDriverReceiptDetail.mockResolvedValue({ receipt: makeReceipt() } as any);

        await render(<ReceiptDetailScreen />);

        await waitFor(() => expect(screen.getByText('Khách chuyển khoản về công ty')).toBeTruthy());
        expect(screen.getByText('Khách trả tiền mặt cho tài')).toBeTruthy();
        expect(screen.getByText('Khách nợ (chưa thanh toán)')).toBeTruthy();
    });

    it('G62-FE-158: đã ghi nhận bank_transfer → hiện banner đã ghi nhận, ẨN 3 nút thanh toán', async () => {
        mockTripService.getDriverReceiptDetail.mockResolvedValue({
            receipt: makeReceipt({ payment_type: 'bank_transfer' }),
        } as any);

        await render(<ReceiptDetailScreen />);

        await waitFor(() => expect(screen.getByText('Chuyển khoản về công ty — đã ghi nhận')).toBeTruthy());
        expect(screen.queryByText('Khách chuyển khoản về công ty')).toBeNull();
    });

    it('G62-FE-159: đã ghi nhận cash_collected còn nợ → banner cảnh báo công nợ', async () => {
        mockTripService.getDriverReceiptDetail.mockResolvedValue({
            receipt: makeReceipt({ payment_type: 'cash_collected', has_driver_debt: true }),
        } as any);

        await render(<ReceiptDetailScreen />);

        await waitFor(() => expect(screen.getByText('Bạn đang có công nợ từ chuyến này')).toBeTruthy());
    });

    it('G62-FE-160: chọn "bank_transfer" → nút Xác nhận vô hiệu khi chưa có ảnh xác minh', async () => {
        mockTripService.getDriverReceiptDetail.mockResolvedValue({ receipt: makeReceipt() } as any);

        await render(<ReceiptDetailScreen />);
        await waitFor(() => screen.getByText('Khách chuyển khoản về công ty'));
        await fireEvent.press(screen.getByText('Khách chuyển khoản về công ty'));
        await fireEvent.press(screen.getByText('Xác nhận'));

        expect(mockTripService.recordReceiptCollection).not.toHaveBeenCalled();
    });

    it('G62-FE-161: chọn bank_transfer + chụp ảnh xác minh → xác nhận gọi recordReceiptCollection', async () => {
        autoConfirmAlert();
        mockTripService.getDriverReceiptDetail.mockResolvedValue({ receipt: makeReceipt() } as any);
        mockTripService.recordReceiptCollection.mockResolvedValue({} as any);

        await render(<ReceiptDetailScreen />);
        await waitFor(() => screen.getByText('Khách chuyển khoản về công ty'));
        await fireEvent.press(screen.getByText('Khách chuyển khoản về công ty'));
        await fireEvent.press(screen.getByText('Chụp ảnh xác minh'));
        await fireEvent.press(screen.getByText('Xác nhận'));

        await waitFor(() => expect(mockTripService.recordReceiptCollection).toHaveBeenCalled());
        const [targetId, formData] = mockTripService.recordReceiptCollection.mock.calls[0];
        // PHẢI là orr_id (5), KHÔNG phải shipment_receipt_id (77): hai bảng dùng sequence
        // độc lập cùng START WITH 100000 nên trùng số được — gửi sr.id khiến BE tra nhầm.
        expect(targetId).toBe(5);
        expect((formData as FormData).get('payment_type')).toBe('bank_transfer');
    });

    it('G62-FE-162a: mở form "cash_collected" → số tiền được tự điền sẵn bằng tổng dự kiến (cước + chi phí)', async () => {
        mockTripService.getDriverReceiptDetail.mockResolvedValue({
            receipt: makeReceipt({ amount: '500000', expenses: [{ id: 1, expense_type: 'fuel', amount: '50000', description: null, expense_date: '', created_at: '', receipt_urls: [] }] }),
        } as any);

        await render(<ReceiptDetailScreen />);
        await waitFor(() => screen.getByText('Khách trả tiền mặt cho tài'));
        await fireEvent.press(screen.getByText('Khách trả tiền mặt cho tài'));

        expect(screen.getByPlaceholderText('0').props.value).toBe('550.000');
    });

    it('G62-FE-162b: chọn "cash_collected", xoá số tiền về 0 → nút Xác nhận vô hiệu (không gọi API khi bấm)', async () => {
        mockTripService.getDriverReceiptDetail.mockResolvedValue({ receipt: makeReceipt() } as any);

        await render(<ReceiptDetailScreen />);
        await waitFor(() => screen.getByText('Khách trả tiền mặt cho tài'));
        await fireEvent.press(screen.getByText('Khách trả tiền mặt cho tài'));
        await fireEvent.changeText(screen.getByPlaceholderText('0'), '0');
        await fireEvent.press(screen.getByText('Chụp ảnh xác minh'));
        await fireEvent.press(screen.getByText('Xác nhận'));

        expect(mockTripService.recordReceiptCollection).not.toHaveBeenCalled();
    });

    it('G62-FE-163: cash_collected đủ số tiền + ảnh → xác nhận tạo công nợ driver (TH2)', async () => {
        autoConfirmAlert();
        mockTripService.getDriverReceiptDetail.mockResolvedValue({ receipt: makeReceipt() } as any);
        mockTripService.recordReceiptCollection.mockResolvedValue({} as any);

        await render(<ReceiptDetailScreen />);
        await waitFor(() => screen.getByText('Khách trả tiền mặt cho tài'));
        await fireEvent.press(screen.getByText('Khách trả tiền mặt cho tài'));
        await fireEvent.changeText(screen.getByPlaceholderText('0'), '500000');
        await fireEvent.press(screen.getByText('Chụp ảnh xác minh'));
        await fireEvent.press(screen.getByText('Xác nhận'));

        await waitFor(() => expect(mockTripService.recordReceiptCollection).toHaveBeenCalled());
        const [, formData] = mockTripService.recordReceiptCollection.mock.calls[0];
        expect((formData as FormData).get('payment_type')).toBe('cash_collected');
    });

    it('G62-FE-164: chọn "client_credit" → KHÔNG cần ảnh/số tiền, xác nhận tạo công nợ khách (TH3)', async () => {
        autoConfirmAlert();
        mockTripService.getDriverReceiptDetail.mockResolvedValue({ receipt: makeReceipt() } as any);
        mockTripService.recordReceiptCollection.mockResolvedValue({} as any);

        await render(<ReceiptDetailScreen />);
        await waitFor(() => screen.getByText('Khách nợ (chưa thanh toán)'));
        await fireEvent.press(screen.getByText('Khách nợ (chưa thanh toán)'));
        await fireEvent.press(screen.getByText('Xác nhận'));

        await waitFor(() => expect(mockTripService.recordReceiptCollection).toHaveBeenCalled());
        const [, formData] = mockTripService.recordReceiptCollection.mock.calls[0];
        expect((formData as FormData).get('payment_type')).toBe('client_credit');
    });

    it('G62-FE-166: server báo "đã được ghi nhận" nhưng phiếu reload vẫn trống → báo lỗi thật, không nuốt', async () => {
        autoConfirmAlert();
        // Phiếu vẫn payment_type=null cả trước lẫn sau khi reload → server khớp nhầm bản ghi
        mockTripService.getDriverReceiptDetail.mockResolvedValue({ receipt: makeReceipt() } as any);
        mockTripService.recordReceiptCollection.mockRejectedValue(
            new Error('Phiếu thu đã được ghi nhận thanh toán rồi'),
        );

        await render(<ReceiptDetailScreen />);
        await waitFor(() => screen.getByText('Khách nợ (chưa thanh toán)'));
        await fireEvent.press(screen.getByText('Khách nợ (chưa thanh toán)'));
        await fireEvent.press(screen.getByText('Xác nhận'));

        await waitFor(() => {
            const titles = (Alert.alert as jest.Mock).mock.calls.map((c) => c[0]);
            expect(titles).toContain('Không ghi nhận được');
        });
        const titles = (Alert.alert as jest.Mock).mock.calls.map((c) => c[0]);
        expect(titles).not.toContain('Đã ghi nhận trước đó');
    });

    it('G62-FE-167: server báo "đã được ghi nhận" và phiếu reload đã có payment_type → thông báo hiền lành', async () => {
        autoConfirmAlert();
        mockTripService.getDriverReceiptDetail
            .mockResolvedValueOnce({ receipt: makeReceipt() } as any)
            .mockResolvedValue({ receipt: makeReceipt({ payment_type: 'client_credit' }) } as any);
        mockTripService.recordReceiptCollection.mockRejectedValue(
            new Error('Phiếu thu đã được ghi nhận thanh toán rồi'),
        );

        await render(<ReceiptDetailScreen />);
        await waitFor(() => screen.getByText('Khách nợ (chưa thanh toán)'));
        await fireEvent.press(screen.getByText('Khách nợ (chưa thanh toán)'));
        await fireEvent.press(screen.getByText('Xác nhận'));

        await waitFor(() => {
            const titles = (Alert.alert as jest.Mock).mock.calls.map((c) => c[0]);
            expect(titles).toContain('Đã ghi nhận trước đó');
        });
    });

    it('G62-FE-165: luôn hiển thị QR ngân hàng công ty khi có bank_qr_url', async () => {
        mockTripService.getDriverReceiptDetail.mockResolvedValue({ receipt: makeReceipt() } as any);

        await render(<ReceiptDetailScreen />);

        await waitFor(() => expect(screen.getByText('QR chuyển khoản công ty')).toBeTruthy());
    });
    it('sửa chi phí: ô số tiền hiện đúng số đã khai và gửi lên đúng từng đồng, không làm tròn', async () => {
        // API trả số tiền dạng NUMERIC ("150000.00"). Trước đây ô sửa hiện nguyên chuỗi đó
        // và gửi nguyên văn thứ tài xế gõ — gõ "45.5" (ý 45,5 nghìn) thì máy chủ làm tròn 46đ.
        mockTripService.getDriverReceiptDetail.mockResolvedValue({
            receipt: makeReceipt({
                request_status: 'rejected', rejection_reason: 'Sai số tiền',
                expenses: [{ id: 9, expense_type: 'toll', amount: '150000.00', status: 'pending', description: null, expense_date: '', created_at: '', receipt_urls: [] }],
            }),
        } as any);
        mockTripService.updateExpense.mockResolvedValue({} as any);

        await render(<ReceiptDetailScreen />);
        await waitFor(() => screen.getByLabelText('Sửa chi phí'));
        await fireEvent.press(screen.getByLabelText('Sửa chi phí'));

        const input = screen.getByPlaceholderText('Nhập số tiền');
        expect(input.props.value).toBe('150.000');

        await fireEvent.changeText(input, '155.555');
        await fireEvent.press(screen.getByText('Lưu thay đổi'));

        await waitFor(() => expect(mockTripService.updateExpense).toHaveBeenCalledTimes(1));
        const [, formData] = mockTripService.updateExpense.mock.calls[0];
        expect((formData as FormData).get('amount')).toBe('155555');
    });
});
