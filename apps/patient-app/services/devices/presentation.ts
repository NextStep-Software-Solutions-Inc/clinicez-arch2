import type { DeviceSessionDto } from '../api/sessionsApi';

export interface DeviceSessionRow extends DeviceSessionDto {
    isCurrentDevice: boolean;
}

/**
 * Flags the session that belongs to this physical device. Matching is by the stable
 * device id; when this device has no id yet, no row is flagged.
 */
export function markCurrentDevice(
    sessions: readonly DeviceSessionDto[],
    currentDeviceId: string | null,
): DeviceSessionRow[] {
    return sessions.map((session) => ({
        ...session,
        isCurrentDevice: currentDeviceId !== null && session.deviceId === currentDeviceId,
    }));
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Short relative "last active" text, e.g. "Just now", "5 min ago", "3 days ago". */
export function formatLastActive(iso: string, now: Date = new Date()): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return 'Unknown';
    const elapsed = Math.max(0, now.getTime() - then);
    if (elapsed < MINUTE_MS) return 'Just now';
    if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)} min ago`;
    if (elapsed < DAY_MS) {
        const hours = Math.floor(elapsed / HOUR_MS);
        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    const days = Math.floor(elapsed / DAY_MS);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
