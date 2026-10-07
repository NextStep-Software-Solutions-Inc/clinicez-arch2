#!/usr/bin/env node
/**
 * Design token guard for patient-app.
 *
 * Counts style values that bypass the design tokens (`constants/theme.ts` +
 * `@clinicez/design-tokens`):
 *   - hex / rgb(a) color literals
 *   - numeric `fontSize` literals
 *   - numeric `borderRadius` literals (any `*Radius` except shadowRadius)
 *   - emoji / pictograph characters used as icons (use <Icon name="..." />)
 *   - raw `Alert.alert(` calls (use `dialog.alert` / `dialog.confirm` from utils/dialog:
 *     react-native-web's Alert is a no-op, so button callbacks never fire on web)
 *   - direct `MaterialSymbol` / `SFSymbol` usage (use the unified <Icon /> so web gets icons)
 *
 * Modes
 *   node scripts/check-tokens.mjs                    fail if any file is WORSE than scripts/token-baseline.json
 *   node scripts/check-tokens.mjs --strict           fail on any violation (target state)
 *   node scripts/check-tokens.mjs --update-baseline  rewrite the baseline from the current tree
 *   node scripts/check-tokens.mjs --report           print per-file counts, never fail
 *
 * The baseline only ever ratchets down: as screens are migrated their counts drop to 0
 * and cannot creep back up.
 *
 * A file can opt out with a `token-guard:ignore-file` comment (used only for files whose
 * job is to wrap the primitives, e.g. the Icon registry or the native Alert adapter).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'scripts', 'token-baseline.json');
const args = new Set(process.argv.slice(2));

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.expo',
  '.eas',
  'constants',
  'scripts',
  'assets',
  'public',
  'drizzle',
  'android',
  'ios',
  'tests',
]);
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.config\.js$/.test(entry.name)) {
      files.push(full);
    }
  }
})(root);

const RULES = {
  color: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\brgba?\(/g,
  fontSize: /\bfontSize:\s*\d+/g,
  radius: /\b(?!shadow)\w*[rR]adius:\s*[1-9]\d*/g,
  emoji: /[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2B00-\u2BFF]/g,
  alert: /\bAlert\.alert\s*\(/g,
  nativeIcon: /<\s*(?:MaterialSymbol|SFSymbol)\b/g,
};
const RULE_KEYS = Object.keys(RULES);

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const results = {};
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.includes('token-guard:ignore-file')) continue;
  const src = stripComments(raw);
  const counts = {};
  let total = 0;
  for (const [rule, re] of Object.entries(RULES)) {
    const n = (src.match(re) || []).length;
    if (n) {
      counts[rule] = n;
      total += n;
    }
  }
  if (total) results[path.relative(root, file).replace(/\\/g, '/')] = { total, ...counts };
}

const grandTotal = Object.values(results).reduce((s, r) => s + r.total, 0);

if (args.has('--update-baseline')) {
  const baseline = Object.fromEntries(Object.entries(results).map(([f, r]) => [f, r.total]));
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`Baseline written: ${Object.keys(baseline).length} files, ${grandTotal} violations.`);
  process.exit(0);
}

const rows = Object.entries(results).sort((a, b) => b[1].total - a[1].total);
for (const [file, r] of rows) {
  const detail = RULE_KEYS.filter((k) => r[k])
    .map((k) => `${k}:${r[k]}`)
    .join(' ');
  console.log(`${String(r.total).padStart(5)}  ${file}  (${detail})`);
}
console.log(`\nToken guard: ${grandTotal} violation(s) in ${rows.length} file(s).`);

if (args.has('--report')) process.exit(0);

if (args.has('--strict')) {
  process.exit(grandTotal === 0 ? 0 : 1);
}

let baseline = {};
if (fs.existsSync(baselinePath)) baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const regressions = rows.filter(([file, r]) => r.total > (baseline[file] ?? 0));
if (regressions.length) {
  console.error(
    '\nToken guard FAILED - new hardcoded values added (use theme tokens / <Icon /> / dialog):',
  );
  for (const [file, r] of regressions) {
    console.error(`  ${file}: ${r.total} (baseline ${baseline[file] ?? 0})`);
  }
  process.exit(1);
}
console.log('Token guard OK (no regressions vs baseline).');
