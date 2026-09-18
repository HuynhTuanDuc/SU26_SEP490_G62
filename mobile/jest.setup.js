// Mock các native module không chạy được trong Jest (không có native runtime)

jest.mock('expo-secure-store', () => ({
    getItemAsync:    jest.fn(),
    setItemAsync:    jest.fn(),
    deleteItemAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
    router:                 { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useLocalSearchParams:   jest.fn(() => ({})),
    useRouter:              jest.fn(() => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() })),
    Link:                   ({ children }) => children,
}));

jest.mock('expo-constants', () => ({
    default: { expoConfig: { extra: {} } },
}));

jest.mock('expo-camera', () => ({
    CameraView:          'CameraView',
    useCameraPermissions: jest.fn(() => [{ granted: false }, jest.fn()]),
}));

jest.mock('expo-image-picker', () => ({
    launchImageLibraryAsync: jest.fn(),
    launchCameraAsync:       jest.fn(),
    MediaTypeOptions:        { Images: 'Images' },
}));

jest.mock('expo-location', () => ({
    requestForegroundPermissionsAsync: jest.fn(() => ({ status: 'granted' })),
    getCurrentPositionAsync:           jest.fn(() => ({ coords: { latitude: 0, longitude: 0 } })),
}));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

// lucide-react-native phát hành ESM (.mjs) mà Jest không biến đổi, nên mọi test màn hình
// có icon lucide đều không chạy nổi ("Unexpected token export"). Icon chỉ là hình vẽ —
// thay bằng thành phần rỗng mang đúng tên icon.
jest.mock('lucide-react-native', () => new Proxy({}, {
    get: (_, name) => (name === '__esModule' ? false : () => null),
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
    SafeAreaProvider:  ({ children }) => children,
    SafeAreaView:      ({ children }) => children,
}));

// Silence React warnings trong test output
console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Warning:')) return;
    process.stderr.write(args.join(' ') + '\n');
};

// ─── Offline: netinfo / file-system / async-storage ──────────────────────────

jest.mock('@react-native-community/netinfo', () => ({
    __esModule: true,
    default: {
        addEventListener: jest.fn(() => jest.fn()),
        fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true, type: 'wifi' })),
    },
}));

jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///doc/',
    makeDirectoryAsync: jest.fn(() => Promise.resolve()),
    copyAsync:          jest.fn(() => Promise.resolve()),
    deleteAsync:        jest.fn(() => Promise.resolve()),
}));

// AsyncStorage giả lập bằng Map — đủ để kiểm tra logic lưu/đọc/xoá
jest.mock('@react-native-async-storage/async-storage', () => {
    const kho = new Map();
    return {
        __esModule: true,
        default: {
            getItem:      jest.fn((k) => Promise.resolve(kho.has(k) ? kho.get(k) : null)),
            setItem:      jest.fn((k, v) => { kho.set(k, v); return Promise.resolve(); }),
            removeItem:   jest.fn((k) => { kho.delete(k); return Promise.resolve(); }),
            getAllKeys:   jest.fn(() => Promise.resolve([...kho.keys()])),
            multiRemove:  jest.fn((ks) => { ks.forEach((k) => kho.delete(k)); return Promise.resolve(); }),
            __kho: kho,
        },
    };
});
