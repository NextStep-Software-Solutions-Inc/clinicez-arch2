import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { randomUUID } from 'expo-crypto';
import { storage } from '@utils/storage';
import { resolveDeviceId, summarizeUserAgent } from './deviceLabel';

const DEVICE_ID_KEY = 'DEVICE_ID';

/**
 * Stable per-install identifier shared by device-session registration and the "This device" marker.
 * `storage` is SecureStore on native and localStorage on web.
 */
export function getOrCreateDeviceId(): Promise<string> {
    return resolveDeviceId(
        {
            get: () => storage.getItemAsync(DEVICE_ID_KEY),
            set: (id) => storage.setItemAsync(DEVICE_ID_KEY, id),
        },
        randomUUID,
    );
}

/** Device id when this install already has one; never creates it. */
export function getStoredDeviceId(): Promise<string | null> {
    return storage.getItemAsync(DEVICE_ID_KEY);
}

/** Human-readable label shown in the "My devices" list. */
export function getDeviceLabel(): string {
    if (Platform.OS === 'web') {
        return summarizeUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent);
    }
    return Device.deviceName ?? Device.modelName ?? Platform.OS;
}
