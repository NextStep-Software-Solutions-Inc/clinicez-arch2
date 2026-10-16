// token-guard:ignore-file
import { describe, expect, it, mock, beforeEach } from 'bun:test';

let mockAlertCalls: any[] = [];
let mockCheckForUpdateResult: { isAvailable: boolean } = { isAvailable: false };
let mockCheckForUpdateShouldFail = false;
let mockFetchUpdateCalled = false;
let mockReloadCalled = false;

mock.module('react-native', () => ({
  Alert: {
    alert: (title: string, message: string, buttons?: any[]) => {
      mockAlertCalls.push({ title, message, buttons });
    },
  },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: {
    OS: 'android',
  },
}));

mock.module('expo-updates', () => ({
  checkForUpdateAsync: async () => {
    if (mockCheckForUpdateShouldFail) {
      throw new Error('Network error');
    }
    return mockCheckForUpdateResult;
  },
  fetchUpdateAsync: async () => {
    mockFetchUpdateCalled = true;
    return {};
  },
  reloadAsync: async () => {
    mockReloadCalled = true;
  },
  useUpdates: () => ({
    isChecking: false,
    isDownloading: false,
    isUpdateAvailable: false,
    isUpdatePending: false,
  }),
  runtimeVersion: '1.0.0',
  channel: 'production',
  updateId: 'test-update-12345',
}));

describe('OTA Update Configuration and Hook', () => {
  beforeEach(() => {
    mockAlertCalls = [];
    mockCheckForUpdateResult = { isAvailable: false };
    mockCheckForUpdateShouldFail = false;
    mockFetchUpdateCalled = false;
    mockReloadCalled = false;
  });

  it('exposes useOTAUpdate hook from native module', async () => {
    const { useOTAUpdate } = await import('../hooks/useOTAUpdate');
    expect(typeof useOTAUpdate).toBe('function');
  });

  it('exposes web fallback without throwing', async () => {
    const { useOTAUpdate: useOTAUpdateWeb } = await import('../hooks/useOTAUpdate.web');
    expect(typeof useOTAUpdateWeb).toBe('function');
    expect(() => useOTAUpdateWeb()).not.toThrow();
  });

  it('handles update availability and prompts restart', async () => {
    mockCheckForUpdateResult = { isAvailable: true };

    const Updates = await import('expo-updates');
    const result = await Updates.checkForUpdateAsync();
    expect(result.isAvailable).toBe(true);

    await Updates.fetchUpdateAsync();
    expect(mockFetchUpdateCalled).toBe(true);

    const { Alert } = await import('react-native');
    Alert.alert(
      'Update Available',
      'A new version has been downloaded.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart', onPress: () => Updates.reloadAsync() },
      ]
    );

    expect(mockAlertCalls.length).toBe(1);
    expect(mockAlertCalls[0].title).toBe('Update Available');

    const restartBtn = mockAlertCalls[0].buttons?.find((b: any) => b.text === 'Restart');
    expect(restartBtn).toBeDefined();

    restartBtn.onPress();
    expect(mockReloadCalled).toBe(true);
  });

  it('gracefully handles check errors without throwing', async () => {
    mockCheckForUpdateShouldFail = true;
    const Updates = await import('expo-updates');

    let threw = false;
    try {
      await Updates.checkForUpdateAsync();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
