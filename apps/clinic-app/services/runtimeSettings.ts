/**
 * The deployment settings the clinic app understands. They are the same `EXPO_PUBLIC_*` names on every deployment:
 * Vercel/EAS inline them at build time, and the on-premise container publishes the very same names in `/config.json`
 * at start-up, so there is one set of variables and one meaning for each. No React Native imports (unit-testable).
 */
export const SETTING_NAMES = [
  'EXPO_PUBLIC_CLINIC_API_URL',
  'EXPO_PUBLIC_BASE_DOMAIN',
  'EXPO_PUBLIC_SERVICE_SUBDOMAIN',
  'EXPO_PUBLIC_SERVICE_SUBDOMAINS',
  'EXPO_PUBLIC_API_URL_TEMPLATE',
  'EXPO_PUBLIC_PORTAL_URL',
  'EXPO_PUBLIC_STORAGE_PUBLIC_URL',
  'EXPO_PUBLIC_OFFLINE_GRACE_HOURS',
] as const;

export type SettingName = (typeof SETTING_NAMES)[number];
export type SettingValues = Partial<Record<SettingName, string>>;

function clean(value: unknown): string | undefined {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value : '';
  const trimmed = text.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Keeps only the known setting names from a runtime `config.json`; anything else (or blank) is ignored. */
export function parseRuntimeSettings(json: unknown): SettingValues {
  const out: SettingValues = {};
  if (!json || typeof json !== 'object') return out;
  const record = json as Record<string, unknown>;
  for (const name of SETTING_NAMES) {
    const value = clean(record[name]);
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** A runtime value (on-prem `config.json`) wins over the build-time value (Vercel/EAS); blank counts as unset. */
export function pickSetting(runtime: SettingValues, build: SettingValues, name: SettingName): string | undefined {
  return clean(runtime[name]) ?? clean(build[name]);
}