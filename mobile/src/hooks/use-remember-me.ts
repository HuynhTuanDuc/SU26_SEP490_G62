import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'remember_email';

export function useRememberMe() {
    const [savedEmail, setSavedEmail] = useState('');
    const [remember,   setRemember]   = useState(false);

    // useEffect(() => {
    //     SecureStore.getItemAsync(KEY).then((val) => {
    //         if (val) { setSavedEmail(val); setRemember(true); }
    //     });
    // }, []);

    useEffect(() => {
    const load = async () => {
      const val =
        Platform.OS === 'web'
          ? localStorage.getItem(KEY)
          : await SecureStore.getItemAsync(KEY);

      if (val) {
        setSavedEmail(val);
        setRemember(true);
      }
    };

    load();
  }, []);

    // const persist = async (email: string, checked: boolean) => {
    //     if (checked && email.trim()) {
    //         await SecureStore.setItemAsync(KEY, email.trim());
    //     } else {
    //         await SecureStore.deleteItemAsync(KEY).catch(() => {});
    //     }
    // };

    const persist = async (email: string, checked: boolean) => {
    if (checked && email.trim()) {
      if (Platform.OS === 'web') {
        localStorage.setItem(KEY, email.trim());
      } else {
        await SecureStore.setItemAsync(KEY, email.trim());
      }
    } else {
      if (Platform.OS === 'web') {
        localStorage.removeItem(KEY);
      } else {
        await SecureStore.deleteItemAsync(KEY);
      }
    }
  };

    return { savedEmail, remember, setRemember, persist };
}
