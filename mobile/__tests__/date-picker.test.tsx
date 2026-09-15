/**
 * DatePicker trên mobile — hai chỗ dùng: ô ngày sinh (DateInputField) và form đăng ký nghỉ.
 *
 * Android không có picker inline: <DateTimePicker> ở đó là dialog, tự mở lại mỗi khi prop
 * onChange đổi, và bấm Huỷ VẪN gọi onChange (type 'dismissed') kèm chính `value` cũ.
 * Spinner iOS thì chỉ bắn onChange khi người dùng cuộn.
 */
import React from 'react';
import { Platform } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

import { render, screen, fireEvent, act } from './test-utils';
import { DateInputField } from '@/components/date-input-field';
import { LeaveScreen } from '@/features/driver/leave-screen';

// Picker giả: một View giữ nguyên mọi prop, để test bắn onChange giống phía native
jest.mock('@react-native-community/datetimepicker', () => {
    const React = require('react');
    const { View } = require('react-native');
    return {
        __esModule: true,
        default: (props: object) => React.createElement(View, { ...props, testID: 'date-picker' }),
        DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
    };
});

jest.mock('@/hooks/use-leave', () => ({
    useLeave: () => ({
        leaves: [], summary: null, days: [], statusLabels: {},
        isLoading: false, error: null, reload: jest.fn(),
    }),
    useCreateLeave: () => ({ isSubmitting: false, error: null, submit: jest.fn() }),
    useDeleteLeave: () => ({ isDeleting: false, remove: jest.fn() }),
}));

const mockOpen = DateTimePickerAndroid.open as jest.Mock;

const asPlatform = (os: 'ios' | 'android') =>
    jest.replaceProperty(Platform, 'OS', os as typeof Platform.OS);

const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('DateInputField (ngày sinh)', () => {
    it('Android: bấm Huỷ trên ô trống không ghi ngày mặc định 01-01-2000', async () => {
        asPlatform('android');
        const onChange = jest.fn();
        await render(<DateInputField value="" onChange={onChange} />);

        await fireEvent.press(screen.getByLabelText('Chọn ngày'));
        await fireEvent(screen.getByTestId('date-picker'), 'onChange', { type: 'dismissed' }, new Date(2000, 0, 1));

        expect(onChange).not.toHaveBeenCalled();
        expect(screen.queryByTestId('date-picker')).toBeNull();
        expect(screen.getByPlaceholderText('DD-MM-YYYY').props.value).toBe('');
    });

    it('Android: chọn ngày thì ghi YYYY-MM-DD và hiện DD-MM-YYYY', async () => {
        asPlatform('android');
        const onChange = jest.fn();
        await render(<DateInputField value="" onChange={onChange} />);

        await fireEvent.press(screen.getByLabelText('Chọn ngày'));
        await fireEvent(screen.getByTestId('date-picker'), 'onChange', { type: 'set' }, new Date(1990, 4, 15));

        expect(onChange).toHaveBeenCalledWith('1990-05-15');
        expect(screen.getByPlaceholderText('DD-MM-YYYY').props.value).toBe('15-05-1990');
        expect(screen.queryByTestId('date-picker')).toBeNull();
    });

    it('iOS: mở spinner rồi bấm Xác nhận ngay vẫn ghi ngày đang hiện', async () => {
        asPlatform('ios');
        const onChange = jest.fn();
        await render(<DateInputField value="" onChange={onChange} />);

        await fireEvent.press(screen.getByLabelText('Chọn ngày'));
        await fireEvent.press(screen.getByText('Xác nhận'));

        expect(onChange).toHaveBeenCalledWith('2000-01-01');
        expect(screen.getByPlaceholderText('DD-MM-YYYY').props.value).toBe('01-01-2000');
        expect(screen.queryByTestId('date-picker')).toBeNull();
    });

    it('iOS: ngày gõ tay ở tương lai không lọt qua nút Xác nhận', async () => {
        asPlatform('ios');
        const onChange = jest.fn();
        await render(<DateInputField value="" onChange={onChange} />);

        await fireEvent.changeText(screen.getByPlaceholderText('DD-MM-YYYY'), '01012099');
        expect(screen.getByText('Ngày sinh không được ở tương lai')).toBeTruthy();

        await fireEvent.press(screen.getByLabelText('Chọn ngày'));
        await fireEvent.press(screen.getByText('Xác nhận'));

        expect(onChange).toHaveBeenLastCalledWith(todayIso());
    });
});

describe('LeaveScreen — form đăng ký nghỉ', () => {
    it('Android: mở form, gõ lý do, chọn loại nghỉ đều không bật dialog; chỉ mở khi bấm ô ngày', async () => {
        asPlatform('android');
        await render(<LeaveScreen />);

        await fireEvent.press(screen.getByText('+ Đăng ký nghỉ'));
        expect(screen.queryByTestId('date-picker')).toBeNull();

        await fireEvent.changeText(screen.getByPlaceholderText('Kết hôn, tang lễ, nghỉ lễ Quốc khánh...'), 'Việc riêng');
        await fireEvent.press(screen.getByText('Có lương'));
        expect(mockOpen).not.toHaveBeenCalled();

        await fireEvent.press(screen.getByLabelText('Chọn ngày nghỉ'));
        expect(mockOpen).toHaveBeenCalledTimes(1);
        const { onChange } = mockOpen.mock.calls[0][0];

        // Huỷ: native vẫn gọi onChange kèm một ngày — không được nhận
        await act(async () => onChange({ type: 'dismissed' }, new Date(2031, 0, 2)));
        expect(screen.queryByText('02/01/2031')).toBeNull();

        await act(async () => onChange({ type: 'set' }, new Date(2031, 0, 2)));
        expect(screen.getByText('02/01/2031')).toBeTruthy();

        // Render lại sau khi chọn không được mở dialog lần nữa
        expect(mockOpen).toHaveBeenCalledTimes(1);
    });

    it('iOS: vẫn là spinner inline trong form', async () => {
        asPlatform('ios');
        await render(<LeaveScreen />);

        await fireEvent.press(screen.getByText('+ Đăng ký nghỉ'));

        expect(screen.getByTestId('date-picker')).toBeTruthy();
        expect(screen.queryByLabelText('Chọn ngày nghỉ')).toBeNull();
    });
});
