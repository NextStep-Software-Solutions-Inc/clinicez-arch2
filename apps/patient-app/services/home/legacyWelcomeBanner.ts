import { storage as SecureStore } from '../../utils/storage';

const PENDING_PREFIX = 'legacy_records_linked_pending_';
const DISMISSED_PREFIX = 'legacy_records_linked_dismissed_';

export interface LegacyBannerVisibilityInput {
  patientId: string | null | undefined;
  isLegacyAccountReclaimed?: boolean | null;
  isPendingFromAuth?: boolean;
  isDismissed?: boolean;
}

export interface LegacyBannerStorageAdapter {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
}

/**
 * Pure visibility rule for the one-time "Existing ClinicEZ Records Linked" welcome banner.
 * Shows once when a legacy account has been automatically reclaimed via verified Clerk email,
 * and stays permanently hidden once the patient dismisses it.
 */
export function shouldShowLegacyRecordsLinkedBanner({
  patientId,
  isLegacyAccountReclaimed,
  isPendingFromAuth,
  isDismissed,
}: LegacyBannerVisibilityInput): boolean {
  if (!patientId || !patientId.trim()) return false;
  if (isDismissed) return false;
  return Boolean(isPendingFromAuth || isLegacyAccountReclaimed);
}

export async function markLegacyWelcomeBannerPending(
  patientId: string,
  store: LegacyBannerStorageAdapter = SecureStore,
): Promise<void> {
  if (!patientId || !patientId.trim()) return;
  const dismissed = await store.getItemAsync(`${DISMISSED_PREFIX}${patientId}`).catch(() => null);
  if (dismissed === 'true') return;
  await store.setItemAsync(`${PENDING_PREFIX}${patientId}`, 'true').catch(() => {});
}

export async function getLegacyWelcomeBannerState(
  patientId: string | null | undefined,
  store: LegacyBannerStorageAdapter = SecureStore,
): Promise<{ isPending: boolean; isDismissed: boolean }> {
  if (!patientId || !patientId.trim()) {
    return { isPending: false, isDismissed: false };
  }

  const [pendingRaw, dismissedRaw] = await Promise.all([
    store.getItemAsync(`${PENDING_PREFIX}${patientId}`).catch(() => null),
    store.getItemAsync(`${DISMISSED_PREFIX}${patientId}`).catch(() => null),
  ]);

  const isDismissed = dismissedRaw === 'true';
  return {
    isPending: !isDismissed && pendingRaw === 'true',
    isDismissed,
  };
}

export async function dismissLegacyWelcomeBanner(
  patientId: string,
  store: LegacyBannerStorageAdapter = SecureStore,
): Promise<void> {
  if (!patientId || !patientId.trim()) return;
  await Promise.all([
    store.setItemAsync(`${DISMISSED_PREFIX}${patientId}`, 'true').catch(() => {}),
    store.deleteItemAsync(`${PENDING_PREFIX}${patientId}`).catch(() => {}),
  ]);
}
