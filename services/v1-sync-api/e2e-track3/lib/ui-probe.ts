import { existsSync } from "node:fs";
import type { E2EConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { assertNonProductionTargetUrl, assertZeroPhi } from "./guardrails.ts";

export const CHROME_EXECUTABLE_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const REQUIRED_ZERO_JARGON_LABELS = [
  "File Storage",
  "Both Copies",
  "Clinic Files Only",
  "Patient Files Only",
  "All Sources",
  "Primary Storage Only",
  "Encrypted & Saved",
  "External Link (Kept As-Is)",
  "Unavailable (Kept As-Is)",
  "Needs Access (Kept As-Is)",
  "Transfer Failed",
  "Pending",
  "Retry Failed",
] as const;

export const FORBIDDEN_UI_JARGON_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "CMK", regex: /\bCMK\b/ },
  { label: "PMK", regex: /\bPMK\b/ },
  { label: "DEK", regex: /\bDEK\b/ },
  { label: ".cez extension", regex: /\.cez\b/i },
  { label: "SKIPPED_LEGACY_UNSUPPORTED", regex: /\bSKIPPED_LEGACY_UNSUPPORTED\b/ },
  { label: "SKIPPED_DEAD_LINK", regex: /\bSKIPPED_DEAD_LINK\b/ },
  { label: "SKIPPED_AUTH_REQUIRED", regex: /\bSKIPPED_AUTH_REQUIRED\b/ },
  { label: "SKIPPED_EMPTY_BLOB", regex: /\bSKIPPED_EMPTY_BLOB\b/ },
  { label: "NXDOMAIN", regex: /\bNXDOMAIN\b/i },
  { label: "RecordAttachments", regex: /\bRecordAttachments\b/ },
  { label: "file_records", regex: /\bfile_records\b/ },
  { label: "sync_storage_objects", regex: /\bsync_storage_objects\b/ },
  { label: "R2 technical acronym", regex: /\bR2\b/ },
  { label: "HTML Interstitial", regex: /HTML Interstitial/i },
  { label: "Unspaced ClinicEZ brand", regex: /\bClinicEZ\b/ },
];

export interface ChromeDomProbeResult {
  httpStatus: number;
  dom: string;
  hasClinicEzBrand: boolean;
  hasViteErrorOverlay: boolean;
  authGateRendered: boolean;
  hasFileStorageText: boolean;
}

export interface UiModuleAuditResult {
  fetchedPaths: string[];
  combinedUiCopyStrings: string[];
  missingRequiredLabels: string[];
  jargonViolations: Array<{ file: string; label: string; excerpt: string }>;
  uiPrimitiveViolations: Array<{ file: string; issue: string }>;
}

const ADMIN_WEB_TRACK3_MODULE_PATHS = [
  "/src/routes/v1-sync.tsx",
  "/src/services/v1Sync.service.ts",
  "/src/components/v1-sync/v1SyncHelpers.ts",
  "/src/components/v1-sync/ConnectionsRosterView.tsx",
  "/src/components/v1-sync/ConnectionHealthStrip.tsx",
  "/src/components/v1-sync/ConnectionActionDeck.tsx",
  "/src/components/v1-sync/LiveImportProgressCard.tsx",
  "/src/components/v1-sync/ConnectionDataSections.tsx",
  "/src/components/v1-sync/CreateConnectionForm.tsx",
  "/src/components/v1-sync/EditConnectionModal.tsx",
  "/src/components/v1-sync/ConnectionModals.tsx",
] as const;

export function probeChromeDom(
  config: E2EConfig = loadConfig(),
  routePath = "/v1-sync",
): ChromeDomProbeResult {
  assertNonProductionTargetUrl(config.adminWebUrl, "ADMIN_WEB_URL");
  const targetUrl = `${config.adminWebUrl}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;

  if (!existsSync(CHROME_EXECUTABLE_PATH)) {
    throw new Error(`Google Chrome executable not found at ${CHROME_EXECUTABLE_PATH}`);
  }

  const proc = Bun.spawnSync({
    cmd: [
      CHROME_EXECUTABLE_PATH,
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--virtual-time-budget=4000",
      "--dump-dom",
      targetUrl,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });

  const dom = Buffer.from(proc.stdout).toString("utf8");
  assertZeroPhi(dom, "Chrome headless DOM dump");

  return {
    httpStatus: proc.exitCode === 0 ? 200 : 500,
    dom,
    hasClinicEzBrand: dom.includes("Clinic EZ"),
    hasViteErrorOverlay: dom.includes("vite-error-overlay") || dom.includes("Failed to resolve import"),
    authGateRendered: dom.includes("Authentication Required"),
    hasFileStorageText: dom.includes("File Storage"),
  };
}

function stripJsComments(js: string): string {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\])\/\/[^\n]*/g, "$1 ");
}

const UI_PROP_KEY_PATTERN =
  "(?:[\"']aria-label[\"']|\\b(?:children|label|title|subtitle|description|placeholder|emptyMessage|helperText|badgeLabel|heading|text|chipLabel|statusLabel|header|caption|tooltip|ctaLabel|ariaLabel|badge|stateLabel|sub)\\b)";

function extractBalancedChildrenArrayTopLevel(js: string): {
  literals: string[];
  identifiers: string[];
} {
  const literals: string[] = [];
  const identifiers: string[] = [];
  const startRegex = /\bchildren\s*:\s*\[/g;
  let m: RegExpExecArray | null;

  while ((m = startRegex.exec(js)) !== null) {
    let idx = m.index + m[0].length;
    let bracketDepth = 1;
    let braceDepth = 0;
    let parenDepth = 0;
    let inQuote: string | null = null;
    let topLevelBuffer = "";

    while (idx < js.length && bracketDepth > 0) {
      const ch = js[idx]!;
      const prev = idx > 0 ? js[idx - 1] : "";

      if (inQuote) {
        if (bracketDepth === 1 && braceDepth === 0 && parenDepth === 0) {
          topLevelBuffer += ch;
        }
        if (ch === inQuote && prev !== "\\") {
          inQuote = null;
        }
        idx++;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        inQuote = ch;
        if (bracketDepth === 1 && braceDepth === 0 && parenDepth === 0) {
          topLevelBuffer += ch;
        }
        idx++;
        continue;
      }

      if (ch === "[") bracketDepth++;
      else if (ch === "]") {
        bracketDepth--;
        if (bracketDepth === 0) break;
      } else if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
      else if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);

      if (bracketDepth === 1 && braceDepth === 0 && parenDepth === 0) {
        topLevelBuffer += ch;
      } else if (ch === "," || ch === "[" || ch === "{") {
        topLevelBuffer += " ";
      }
      idx++;
    }

    const litRegex = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
    let litMatch: RegExpExecArray | null;
    while ((litMatch = litRegex.exec(topLevelBuffer)) !== null) {
      if (litMatch[2]) literals.push(litMatch[2]);
    }

    const strippedLiterals = topLevelBuffer.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, " ");
    const identRegex = /\b([a-zA-Z_$][\w$]*)\b/g;
    let idMatch: RegExpExecArray | null;
    while ((idMatch = identRegex.exec(strippedLiterals)) !== null) {
      const id = idMatch[1];
      if (id && id !== "null" && id !== "undefined" && id !== "true" && id !== "false") {
        identifiers.push(id);
      }
    }
  }

  return { literals, identifiers };
}

/**
 * Extracts user-facing UI strings from Vite-compiled JSX/TSX JavaScript output:
 * - `children: "..."`, `children: \`...\``, balanced `children: [...]` string/template literals & bound vars
 * - `label: "..."`, `title: "..."`, `subtitle: "..."`, `description: "..."`, `"aria-label": "..."`,
 *   `placeholder: "..."`, `emptyMessage: "..."`, `helperText: "..."`, `badge: "..."`, `stateLabel: "..."`, `sub: "..."`
 * - `return "..."` / `return \`...\`` inside UI helper modules (`v1SyncHelpers.ts` / `components/v1-sync/*`)
 * - True `? "..." : "..."` ternary UI text (never matching object property `value: "SKIPPED_..."`)
 * - Variable/template declarations bound to UI props or `toast.*(...)`
 */
export function extractUserFacingUiStrings(compiledModuleJs: string, isServiceFile: boolean): string[] {
  const results: string[] = [];
  const withoutComments = stripJsComments(compiledModuleJs);

  if (!isServiceFile) {
    const uiPropRegex = new RegExp(
      `${UI_PROP_KEY_PATTERN}\\s*:\\s*(["'\`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`,
      "g",
    );
    let match: RegExpExecArray | null;
    while ((match = uiPropRegex.exec(withoutComments)) !== null) {
      if (match[2]) results.push(match[2]);
    }

    // Balanced children: [...] scanner
    const childrenScan = extractBalancedChildrenArrayTopLevel(withoutComments);
    results.push(...childrenScan.literals);

    // Capture return "..." / return `...` strings inside UI helper functions
    const returnStrRegex = /\breturn\s+(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
    while ((match = returnStrRegex.exec(withoutComments)) !== null) {
      if (match[2]) results.push(match[2]);
    }

    // True ternary UI text only (never object property `value: "..."`)
    const ternaryTrueRegex = /(?<!\.)\?(?!\.)\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
    while ((match = ternaryTrueRegex.exec(withoutComments)) !== null) {
      if (match[2]) results.push(match[2]);
    }
    const ternaryFalseRegex = /(?<!\.)\?(?!\.)[^;{}?:]{1,160}:\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
    while ((match = ternaryFalseRegex.exec(withoutComments)) !== null) {
      if (match[2]) results.push(match[2]);
    }

    // Resolve variable-bound and template strings passed into UI props or children
    const uiBoundVars = new Set<string>(childrenScan.identifiers);
    const propIdentRegex = new RegExp(`${UI_PROP_KEY_PATTERN}\\s*:\\s*([a-zA-Z_$][\\w$]*)\\b`, "g");
    while ((match = propIdentRegex.exec(withoutComments)) !== null) {
      if (match[1]) uiBoundVars.add(match[1]);
    }
    const ternaryIdentRegex = new RegExp(
      `${UI_PROP_KEY_PATTERN}\\s*:\\s*[^;{},\n]+\\?(?!\\.)\\s*([a-zA-Z_$][\\w$]*)\\s*:\\s*([a-zA-Z_$][\\w$]*)`,
      "g",
    );
    while ((match = ternaryIdentRegex.exec(withoutComments)) !== null) {
      if (match[1]) uiBoundVars.add(match[1]);
      if (match[2]) uiBoundVars.add(match[2]);
    }

    // Capture toast.*(...) user-facing notification literals
    const toastRegex = /\btoast\.(?:success|error|info|warning)\(([^;]{1,300})\)/g;
    while ((match = toastRegex.exec(withoutComments)) !== null) {
      const arg = match[1] ?? "";
      const strRegex = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
      let strMatch: RegExpExecArray | null;
      while ((strMatch = strRegex.exec(arg)) !== null) {
        if (strMatch[2]) results.push(strMatch[2]);
      }
    }

    // Map local variable declarations and resolve UI-bound variables transitively
    const varDecls = new Map<string, string>();
    const declRegex = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*([^;]{1,600})/g;
    while ((match = declRegex.exec(withoutComments)) !== null) {
      const name = match[1];
      const expr = match[2];
      if (name && expr && !varDecls.has(name)) {
        varDecls.set(name, expr);
      }
    }

    const visitedVars = new Set<string>();
    const queue = Array.from(uiBoundVars);
    while (queue.length > 0) {
      const varName = queue.shift()!;
      if (visitedVars.has(varName)) continue;
      visitedVars.add(varName);
      const expr = varDecls.get(varName);
      if (!expr) continue;

      const cleanedExpr = expr
        .replace(/\bvalue\s*:\s*(["'`])(?:\\.|(?!\1)[^\\])*\1/g, " ")
        .replace(/(?:===|!==|==|!=|\bcase)\s*(["'`])(?:\\.|(?!\1)[^\\])*\1/g, " ");

      const strRegex = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
      let strMatch: RegExpExecArray | null;
      while ((strMatch = strRegex.exec(cleanedExpr)) !== null) {
        if (strMatch[2]) results.push(strMatch[2]);
      }

      const refRegex = /\b([a-zA-Z_$][\w$]*)\b/g;
      let refMatch: RegExpExecArray | null;
      while ((refMatch = refRegex.exec(cleanedExpr.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, " "))) !== null) {
        const refId = refMatch[1];
        if (refId && varDecls.has(refId) && !visitedVars.has(refId)) {
          queue.push(refId);
        }
      }
    }
  }

  return results;
}

export function findUiPrimitiveViolations(
  file: string,
  compiledModuleJs: string,
): Array<{ file: string; issue: string }> {
  const violations: Array<{ file: string; issue: string }> = [];
  const cleaned = stripJsComments(compiledModuleJs);

  if (/\b(?:jsxDEV|jsx|jsxs|_jsx|_jsxs|createElement)\(\s*["']button["']/.test(cleaned)) {
    violations.push({ file, issue: "Raw <button> JSX element detected" });
  }
  if (/\b(?:jsxDEV|jsx|jsxs|_jsx|_jsxs|createElement)\(\s*["']select["']/.test(cleaned)) {
    violations.push({ file, issue: "Raw <select> JSX element detected" });
  }
  if (/(?:\brole|["']role["'])\s*:\s*["']tab["']/.test(cleaned)) {
    violations.push({ file, issue: 'Raw role="tab" detected' });
  }

  const propHex = cleaned.match(
    /\b(?:color|background|backgroundColor|borderColor|borderTopColor|borderRightColor|borderBottomColor|borderLeftColor|outlineColor|fill|stroke|stopColor|floodColor|lightingColor)\s*:\s*["'`]#[0-9a-fA-F]{3,8}\b["'`]/,
  );
  if (propHex) {
    violations.push({ file, issue: `Hardcoded hex color in prop: ${propHex[0]}` });
  }

  const twHex = cleaned.match(/\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/);
  if (twHex) {
    violations.push({ file, issue: `Hardcoded hex color in Tailwind arbitrary class: ${twHex[0]}` });
  }

  return violations;
}

export async function auditAdminWebTrack3Copy(
  config: E2EConfig = loadConfig(),
): Promise<UiModuleAuditResult> {
  assertNonProductionTargetUrl(config.adminWebUrl, "ADMIN_WEB_URL");

  const fetchedPaths: string[] = [];
  const combinedUiCopyStrings: string[] = [];
  const jargonViolations: Array<{ file: string; label: string; excerpt: string }> = [];
  const uiPrimitiveViolations: Array<{ file: string; issue: string }> = [];

  for (const modPath of ADMIN_WEB_TRACK3_MODULE_PATHS) {
    const res = await fetch(`${config.adminWebUrl}${modPath}`);
    if (!res.ok) {
      throw new Error(`Vite module fetch failed for ${modPath}: HTTP ${res.status}`);
    }
    const js = await res.text();
    assertZeroPhi(js, `Vite module ${modPath}`);
    fetchedPaths.push(modPath);

    // Check unspaced ClinicEZ brand across all served UI strings & code
    const isService = modPath.endsWith("v1Sync.service.ts");
    const uiStrings = extractUserFacingUiStrings(js, isService);
    combinedUiCopyStrings.push(...uiStrings);

    for (const uiStr of uiStrings) {
      for (const rule of FORBIDDEN_UI_JARGON_PATTERNS) {
        if (rule.regex.test(uiStr)) {
          jargonViolations.push({
            file: modPath,
            label: rule.label,
            excerpt: uiStr.slice(0, 100),
          });
        }
      }
    }

    // Check UI primitive & design token rules in compiled JSX calls
    if (!isService && !modPath.endsWith("v1SyncHelpers.ts")) {
      uiPrimitiveViolations.push(...findUiPrimitiveViolations(modPath, js));
    }
  }

  const joinedUiText = combinedUiCopyStrings.join("\n");
  const missingRequiredLabels = REQUIRED_ZERO_JARGON_LABELS.filter(
    (label) => !joinedUiText.includes(label),
  );

  return {
    fetchedPaths,
    combinedUiCopyStrings,
    missingRequiredLabels,
    jargonViolations,
    uiPrimitiveViolations,
  };
}
