import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const KEY = 'remember_email';

export function useRememberMe() {
    const [savedEmail, setSavedEmail] = useState('');
    const [remember,   setRemember]   = useState(false);

    useEffect(() => {
        SecureStore.getItemAsync(KEY).then((val) => {
            if (val) { setSavedEmail(val); setRemember(true); }
        });
    }, []);

    const persist = async (email: string, checked: boolean) => {
        if (checked && email.trim()) {
            await SecureStore.setItemAsync(KEY, email.trim());
        } else {
            await SecureStore.deleteItemAsync(KEY).catch(() => {});
        }
    };

    return { savedEmail, remember, setRemember, persist };
}
