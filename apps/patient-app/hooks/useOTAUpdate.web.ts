import type { OTAUpdateInfo } from './useOTAUpdate';

export function useOTAUpdate(): OTAUpdateInfo {
  return {
    channel: 'web',
    runtimeVersion: '1.0.0',
    updateId: null,
    isAvailable: false,
    isDownloading: false,
    isDownloaded: false,
    error: null,
    isProduction: process.env.NODE_ENV === 'production',
    isNonProduction: process.env.NODE_ENV !== 'production',
    isChecking: false,
    checkForUpdate: async () => {},
    downloadAndReload: async () => {},
  };
}

export type { OTAUpdateInfo };
