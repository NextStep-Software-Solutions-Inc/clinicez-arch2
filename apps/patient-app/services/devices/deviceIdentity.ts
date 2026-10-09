import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { randomUUID } from 'expo-crypto';
import { storage } from '@utils/storage';

const DEVICE_ID_KEY = 'DEVICE_ID';

/** Stable per-install identifier shared by device-session registration and the "This device" marker. */
export async function getOrCreateDeviceId(): Promise<string> {
    const existing = await storage.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = randomUUID();
    await storage.setItemAsync(DEVICE_ID_KEY, created);
    return created;
}

/** Device id when this install already has one; never creates it. */
export function getStoredDeviceId(): Promise<string | null> {
    return storage.getItemAsync(DEVICE_ID_KEY);
}

/** Human-readable label shown in the "My devices" list. */
export function getDeviceLabel(): string {
    return Device.deviceName ?? Device.modelName ?? Platform.OS;
}
