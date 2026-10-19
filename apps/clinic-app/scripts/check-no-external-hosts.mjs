#!/usr/bin/env node
/**
 * CI gate: the clinic app must work on a clinic LAN with no internet, and must not carry clinical lists that belong
 * in the PhilHealth Catalog. Fails the build when source code contains
 *   - an absolute http(s) URL or a localhost address (servers are configured at runtime, never hardcoded), or
 *   - one of the hardcoded clinical constants that the catalog replaced.
 *
 * Comments are ignored; template placeholders such as `http://${raw}` are not hosts. Run from apps/clinic-app.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SOURCE_DIRS = ['components', 'constants', 'context', 'navigation', 'services', 'utils'];
const SOURCE_FILES = ['App.tsx', 'index.ts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const FORBIDDEN_CONSTANTS = [
  'STATUTORY_SYMPTOMS',
  'YAKAP_GAMOT_QUICK_PICKS',
  'YAKAP_LAB_CODE_MAP',
  'COMMON_ICD10',
  'COMMON_LAB_TESTS',
  'COMMON_PHARMACIES',
  'STATUTORY_YAKAP_DIAGNOSTICS',
];

const URL_PATTERN = /https?:\/\/(?!\$\{)(?!www\.w3\.org\/)[^\s'"`)]+/i;
const LOCAL_PATTERN = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(full.slice(full.lastIndexOf('.')))) yield full;
  }
}

function stripComments(source) {
  // Keeps line numbers: block comments are blanked line by line, line comments cut at `//` outside of strings.
  let inBlock = false;
  return source.split('\n').map((line) => {
    let out = '';
    for (let i = 0; i < line.length; i++) {
      if (inBlock) {
        if (line[i] === '*' && line[i + 1] === '/') {
          inBlock = false;
          i++;
        }
        continue;
      }
      if (line[i] === '/' && line[i + 1] === '*') {
        inBlock = true;
        i++;
        continue;
      }
      if (line[i] === '/' && line[i + 1] === '/' && line[i - 1] !== ':') break;
      out += line[i];
    }
    return out;
  });
}

const files = [
  ...SOURCE_DIRS.flatMap((dir) => [...walk(join(root, dir))]),
  ...SOURCE_FILES.map((file) => join(root, file)),
];

const problems = [];
for (const file of files) {
  const lines = stripComments(readFileSync(file, 'utf8'));
  lines.forEach((line, index) => {
    const where = `${relative(root, file).split(sep).join('/')}:${index + 1}`;
    if (URL_PATTERN.test(line)) problems.push(`${where}  hardcoded URL: ${line.trim()}`);
    else if (LOCAL_PATTERN.test(line)) problems.push(`${where}  hardcoded local address: ${line.trim()}`);
    for (const name of FORBIDDEN_CONSTANTS) {
      if (line.includes(name)) problems.push(`${where}  ${name} was replaced by the PhilHealth Catalog`);
    }
  });
}

if (problems.length > 0) {
  console.error(`Host/catalog gate: ${problems.length} problem(s)\n` + problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Host/catalog gate OK (${files.length} files scanned).`);
