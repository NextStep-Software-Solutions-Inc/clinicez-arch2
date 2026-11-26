import type { E2EConfig } from "./config.ts";
import { loadConfig } from "./config.ts";

export class GuardrailViolationError extends Error {
  constructor(message: string) {
    super(`GUARDRAIL_ABORT: ${message}`);
    this.name = "GuardrailViolationError";
  }
}

export const FORBIDDEN_HOST_FRAGMENTS = [
  "neon.tech",
  "lucky-hall-22094621",
  "clinicez.com",
  "clinicez.ph",
  "clinicez.net",
  "r2.cloudflarestorage.com",
  "amazonaws.com",
  "azure.com",
] as const;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);
const CONTAINER_CALLBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "host.docker.internal"]);

export function assertLocalHost(hostname: string, label: string, allowContainerCallback = false): void {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    throw new GuardrailViolationError(`${label} has an empty hostname.`);
  }

  for (const fragment of FORBIDDEN_HOST_FRAGMENTS) {
    if (normalized.includes(fragment)) {
      throw new GuardrailViolationError(
        `${label} references forbidden non-local/production host fragment "${fragment}" (${normalized}).`,
      );
    }
  }

  const allowedSet = allowContainerCallback ? CONTAINER_CALLBACK_HOSTS : LOOPBACK_HOSTS;
  if (!allowedSet.has(normalized)) {
    throw new GuardrailViolationError(
      `${label} must target a local loopback host (${Array.from(allowedSet).join(", ")}), got "${normalized}".`,
    );
  }
}

export function assertNonProductionTargetUrl(
  rawUrl: string,
  label: string,
  allowContainerCallback = false,
): URL {
  if (!rawUrl || !rawUrl.trim()) {
    throw new GuardrailViolationError(`${label} cannot be empty.`);
  }

  const lowered = rawUrl.toLowerCase();
  for (const fragment of FORBIDDEN_HOST_FRAGMENTS) {
    if (lowered.includes(fragment)) {
      throw new GuardrailViolationError(
        `${label} contains forbidden non-local/production target "${fragment}".`,
      );
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new GuardrailViolationError(`${label} is not a valid URL: "${redactSecrets(rawUrl)}".`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new GuardrailViolationError(`${label} must use http/https, got "${parsed.protocol}".`);
  }

  assertLocalHost(parsed.hostname, label, allowContainerCallback);
  return parsed;
}

export function assertNonProductionConnectionString(connStr: string, label: string): void {
  const trimmed = connStr.trim();
  if (!trimmed) return;

  const lowered = trimmed.toLowerCase();
  let decodedLower = lowered;
  try {
    decodedLower = decodeURIComponent(trimmed).toLowerCase();
  } catch {
    decodedLower = lowered;
  }

  for (const fragment of FORBIDDEN_HOST_FRAGMENTS) {
    if (lowered.includes(fragment) || decodedLower.includes(fragment)) {
      throw new GuardrailViolationError(
        `${label} references forbidden remote database/host fragment "${fragment}".`,
      );
    }
  }

  // Extract Host=... from ADO.NET/Npgsql/libpq style or postgres:// URL
  if (lowered.startsWith("postgres://") || lowered.startsWith("postgresql://")) {
    const parsed = new URL(trimmed);
    const hostsFromAuthority = parsed.hostname
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    const hostsFromQuery: string[] = [];
    for (const [paramKey, paramVal] of parsed.searchParams.entries()) {
      const lowerParam = paramKey.toLowerCase();
      if (lowerParam === "host" || lowerParam === "hostaddr") {
        for (const h of paramVal.split(",")) {
          if (h.trim()) hostsFromQuery.push(h.trim());
        }
      }
    }

    if (hostsFromAuthority.length === 0 && hostsFromQuery.length === 0) {
      assertLocalHost("", label, false);
    }
    for (const h of hostsFromAuthority) {
      assertLocalHost(h, label, false);
    }
    for (const h of hostsFromQuery) {
      assertLocalHost(h, `${label} (?host=)`, false);
    }
    return;
  }

  for (const match of trimmed.matchAll(
    /(?:^|[;\s])\s*(?:host|hostaddr|server)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^;\s]+))/gi,
  )) {
    const rawHosts = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    for (const hostPart of rawHosts.split(",")) {
      const h = hostPart.trim();
      if (h) {
        assertLocalHost(h, label, false);
      }
    }
  }
}

export function assertNonProductionEnvironment(
  config: E2EConfig = loadConfig(),
  env: Record<string, string | undefined> = process.env,
): void {
  assertNonProductionTargetUrl(config.v1SyncUrl, "V1_SYNC_URL");
  assertNonProductionTargetUrl(config.adminWebUrl, "ADMIN_WEB_URL");
  assertNonProductionTargetUrl(config.minioEndpoint, "MINIO_ENDPOINT");
  assertNonProductionTargetUrl(
    config.mockOriginContainerUrl,
    "E2E_MOCK_ORIGIN_CONTAINER_URL",
    true,
  );
  assertLocalHost(config.pgHost, "PG_HOST");

  // Also scan any PostgreSQL / connection string / service URL / override env vars
  for (const [key, val] of Object.entries(env)) {
    if (!val || !val.trim()) continue;
    const upper = key.toUpperCase();
    if (upper === "PGHOST" || upper === "PG_HOST" || upper === "PGHOSTADDR") {
      assertLocalHost(val, key, false);
    } else if (
      upper.startsWith("TRACK3STORAGE__") &&
      upper.endsWith("__ACCOUNTID")
    ) {
      throw new GuardrailViolationError(
        `${key} must remain empty in non-production E2E environments (resolves to Cloudflare R2).`,
      );
    } else if (upper.startsWith("TRACK3_") && upper.endsWith("_ACCOUNT_ID")) {
      throw new GuardrailViolationError(
        `${key} must remain empty in non-production E2E environments (resolves to Cloudflare R2).`,
      );
    } else if (
      upper.includes("CONNECTIONSTRING") ||
      upper.includes("CONNECTION_STRING") ||
      upper.startsWith("CONNECTIONSTRINGS__") ||
      upper.includes("DATABASE_URL") ||
      upper.includes("POSTGRES_URL") ||
      upper.includes("POSTGRESQL_URL") ||
      upper === "DB_DSN" ||
      upper === "PG_DSN" ||
      upper.endsWith("_DSN")
    ) {
      assertNonProductionConnectionString(val, key);
    } else if (
      upper === "E2E_MOCK_ORIGIN_CONTAINER_URL" ||
      upper.endsWith("__SERVICEURL") ||
      upper.endsWith("_SERVICE_URL") ||
      upper.endsWith("ORIGINOVERRIDE") ||
      upper.endsWith("_ORIGIN_OVERRIDE")
    ) {
      assertNonProductionTargetUrl(val, key, true);
    } else if (
      upper === "V1_SYNC_URL" ||
      upper === "ADMIN_WEB_URL" ||
      upper === "MINIO_ENDPOINT" ||
      upper === "S3_ENDPOINT" ||
      upper === "PORTALAPI__BASEURL" ||
      upper.endsWith("__BASEURL") ||
      upper.endsWith("_BASEURL") ||
      upper.endsWith("_BASE_URL") ||
      upper.endsWith("_URL")
    ) {
      assertNonProductionTargetUrl(val, key, false);
    } else if (upper.startsWith("V1SYNC__") || upper.startsWith("TRACK3STORAGE__")) {
      const t = val.trim();
      if (/^https?:\/\//i.test(t)) {
        assertNonProductionTargetUrl(t, key, true);
      } else if (/^(?:postgres|postgresql):\/\//i.test(t) || /(?:^|[;\s])(?:host|hostaddr|server)\s*=/i.test(t)) {
        assertNonProductionConnectionString(t, key);
      }
    }
  }
}

const PHI_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "non-synthetic email address",
    pattern: /[a-z0-9._%+-]+@(?!synthetic\.e2e\.invalid\b)[a-z0-9.-]+\.[a-z]{2,}/i,
  },
  {
    name: "Philippine mobile phone",
    pattern: /(?<![0-9a-fA-F_-])(?:\+63[\s.-]?9\d{2}|(?<![-])09\d{2})[\s.-]?\d{3}[\s.-]?\d{4}(?![0-9a-fA-F-])/,
  },
  {
    name: "US SSN identifier",
    pattern: /(?<![0-9a-fA-F-])\b\d{3}-\d{2}-\d{4}\b(?![0-9a-fA-F-])/,
  },
  {
    name: "Azure SAS signature parameter",
    pattern: /[?&](?:sig|sv|se|sp|sr)=[^&\s]+/i,
  },
  {
    name: "JWT Bearer token",
    pattern: /\bBearer\s+eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i,
  },
  {
    name: "PhilHealth/SSS/TIN dashed identifier",
    pattern: /\b\d{2}-\d{9}-\d\b/,
  },
  {
    name: "street address",
    pattern: /\b\d{1,5}\s+[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3}\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Barangay|Brgy)\b\.?(?:\s*,\s*[A-Z][a-z]{2,})?/,
  },
  {
    name: "labeled real patient name",
    pattern: /\bPatient(?:\s*:\s*|\s+)(?!(?:Synthetic|E2E|Test|Mock|Demo|Sample|Azure|Google|Clinic|Drive|Storage|Portal|Accounts?|Files?|Records?|Data|Sync|Directory|Copy|Copies|Only|Cloud|DB|Plane|Profile|Identity|Identities|Cohort|Attachments?|R2|IDs?|Encrypted|Deleted|Deceased|With|Without|Belonging|In|For|To|And|Or|Track|Auto|Dry|Full|Final|Local|Non)\b)[A-Z][a-z]{1,20}\s+(?!(?:Only|Files?|Accounts?|Records?|Data|Sync|Directory|Copy|Copies|Payload|Binary|Encryption|Blob|Drive|Storage|Portal|Clinic|Track|Run|Mode|Scope|Check|Test|Migration|Summary|Card)\b)[A-Z][a-z]{1,20}\b/,
  },
];

export function assertZeroPhi(text: string, context = "output"): void {
  if (!text) return;
  for (const check of PHI_PATTERNS) {
    if (check.pattern.test(text)) {
      throw new GuardrailViolationError(
        `Zero-PHI violation in ${context}: detected ${check.name}.`,
      );
    }
  }
}

export function redactSecrets(input: string): string {
  return input
    .replace(/([?&](?:sig|sv|se|sp|sr|token|key|secret)=)[^&\s"']+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .replace(/(Password\s*=\s*)[^;\s"']+/gi, "$1[REDACTED]")
    .replace(/(X-V1-Sync-Admin-Key:\s*)[^\s"']+/gi, "$1[REDACTED]");
}
