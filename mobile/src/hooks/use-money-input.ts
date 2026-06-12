import { useCallback, useState } from 'react';

type UseMoneyInputResult = {
    displayValue: string;
    rawValue: number;
    onChangeText: (text: string) => void;
    clear: () => void;
    setValue: (n: number) => void;
};

function parseInitial(initial: number | string): string {
    if (initial === '' || initial === null || initial === undefined) return '';
    const n = Math.floor(Number(initial));
    return n > 0 ? n.toLocaleString('vi-VN') : '';
}

export function useMoneyInput(initial: number | string = ''): UseMoneyInputResult {
    const [displayValue, setDisplayValue] = useState(() => parseInitial(initial));

    const rawValue = Number(displayValue.replace(/[^0-9]/g, '') || '0');

    const onChangeText = useCallback((text: string) => {
        const digits = text.replace(/[^0-9]/g, '');
        setDisplayValue(digits ? Number(digits).toLocaleString('vi-VN') : '');
    }, []);

    const clear = useCallback(() => setDisplayValue(''), []);

    const setValue = useCallback((n: number) => {
        setDisplayValue(n > 0 ? n.toLocaleString('vi-VN') : '');
    }, []);

    return { displayValue, rawValue, onChangeText, clear, setValue };
}
