import { getSetting } from './runtimeConfig';

export function getCommsApiBaseUrl(): string {
  const commsUrl = getSetting('EXPO_PUBLIC_COMMS_API_URL') || process.env.EXPO_PUBLIC_COMMS_API_URL;
  if (commsUrl && commsUrl.trim()) {
    return commsUrl.trim().replace(/\/+$/, '');
  }
  throw new Error('EXPO_PUBLIC_COMMS_API_URL is required and must be configured in environment variables or runtime settings.');
}
