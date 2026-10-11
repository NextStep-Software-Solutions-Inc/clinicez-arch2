export interface DeviceIdStore {
    get: () => Promise<string | null>;
    set: (id: string) => Promise<void>;
}

/** Returns the stored device id, creating and persisting one on first use. */
export async function resolveDeviceId(store: DeviceIdStore, generate: () => string): Promise<string> {
    const existing = await store.get();
    if (existing) return existing;
    const created = generate();
    await store.set(created);
    return created;
}

const FALLBACK_BROWSER_LABEL = 'Web browser';

function detectBrowser(userAgent: string): string | null {
    if (/Edg(e|A|iOS)?\//.test(userAgent)) return 'Edge';
    if (/OPR\/|Opera/.test(userAgent)) return 'Opera';
    if (/Firefox\/|FxiOS\//.test(userAgent)) return 'Firefox';
    if (/Chrome\/|CriOS\//.test(userAgent)) return 'Chrome';
    if (/Safari\//.test(userAgent)) return 'Safari';
    return null;
}

function detectOperatingSystem(userAgent: string): string | null {
    if (/Windows/.test(userAgent)) return 'Windows';
    if (/Android/.test(userAgent)) return 'Android';
    if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS';
    if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS';
    if (/CrOS/.test(userAgent)) return 'ChromeOS';
    if (/Linux|X11/.test(userAgent)) return 'Linux';
    return null;
}

/** Short, human label for a browser session, e.g. `Chrome on Windows`. */
export function summarizeUserAgent(userAgent: string): string {
    const browser = detectBrowser(userAgent);
    const system = detectOperatingSystem(userAgent);
    if (browser && system) return `${browser} on ${system}`;
    return browser ?? system ?? FALLBACK_BROWSER_LABEL;
}
