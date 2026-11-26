import { describe, expect, it } from 'bun:test';
import {
  dismissLegacyWelcomeBanner,
  getLegacyWelcomeBannerState,
  markLegacyWelcomeBannerPending,
  shouldShowLegacyRecordsLinkedBanner,
  type LegacyBannerStorageAdapter,
} from '../services/home/legacyWelcomeBanner';

function createMemoryStore(): LegacyBannerStorageAdapter {
  const map = new Map<string, string>();
  return {
    getItemAsync: async (key) => map.get(key) ?? null,
    setItemAsync: async (key, value) => {
      map.set(key, value);
    },
    deleteItemAsync: async (key) => {
      map.delete(key);
    },
  };
}

describe('Phase 1E Legacy Records Linked one-time welcome banner', () => {
  it('hides banner when patientId is missing or user is not reclaimed', () => {
    expect(
      shouldShowLegacyRecordsLinkedBanner({
        patientId: null,
        isLegacyAccountReclaimed: true,
        isPendingFromAuth: true,
        isDismissed: false,
      }),
    ).toBe(false);

    expect(
      shouldShowLegacyRecordsLinkedBanner({
        patientId: 'pat-normal-1',
        isLegacyAccountReclaimed: false,
        isPendingFromAuth: false,
        isDismissed: false,
      }),
    ).toBe(false);
  });

  it('shows once when reclaimed via AuthContext or HomeDashboard, then stays dismissed permanently', async () => {
    const store = createMemoryStore();
    const patientId = 'pat-legacy-42';

    await markLegacyWelcomeBannerPending(patientId, store);
    const stateBefore = await getLegacyWelcomeBannerState(patientId, store);
    expect(stateBefore).toEqual({ isPending: true, isDismissed: false });

    expect(
      shouldShowLegacyRecordsLinkedBanner({
        patientId,
        isLegacyAccountReclaimed: true,
        isPendingFromAuth: stateBefore.isPending,
        isDismissed: stateBefore.isDismissed,
      }),
    ).toBe(true);

    // Dismissing permanently suppresses future display even if markPending or dashboard flag re-fires
    await dismissLegacyWelcomeBanner(patientId, store);
    await markLegacyWelcomeBannerPending(patientId, store);

    const stateAfter = await getLegacyWelcomeBannerState(patientId, store);
    expect(stateAfter).toEqual({ isPending: false, isDismissed: true });

    expect(
      shouldShowLegacyRecordsLinkedBanner({
        patientId,
        isLegacyAccountReclaimed: true,
        isPendingFromAuth: stateAfter.isPending,
        isDismissed: stateAfter.isDismissed,
      }),
    ).toBe(false);
  });
});
