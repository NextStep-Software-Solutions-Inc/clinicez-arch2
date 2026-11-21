#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const args = new Set(process.argv.slice(2));

const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        walk(full);
      }
    } else if (/\.(tsx|jsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
}
walk(srcDir);

const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const PALETTE_IMPORT_REGEX = /from\s+['"][^'"]*palette(\.ts)?['"]/g;

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
}

let totalViolations = 0;
const fileViolations = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('token-guard:ignore-file')) continue;
  const stripped = stripComments(content);

  const hexMatches = stripped.match(HEX_COLOR_REGEX) || [];
  const paletteMatches = stripped.match(PALETTE_IMPORT_REGEX) || [];
  const count = hexMatches.length + paletteMatches.length;

  if (count > 0) {
    totalViolations += count;
    fileViolations.push({
      file: path.relative(root, file).replace(/\\/g, '/'),
      hex: hexMatches.length,
      palette: paletteMatches.length,
      total: count,
    });
  }
}

if (fileViolations.length > 0) {
  console.error(`\n❌ Token guard detected ${totalViolations} violation(s) in ${fileViolations.length} file(s):`);
  for (const v of fileViolations) {
    console.error(`  - ${v.file}: ${v.hex} hex literal(s), ${v.palette} direct palette import(s)`);
  }
} else {
  console.log(`\n✅ Token guard passed: 0 hardcoded hex colors and 0 direct palette imports across ${files.length} UI files.`);
}

if (args.has('--strict') || !args.has('--report')) {
  process.exit(totalViolations === 0 ? 0 : 1);
}
process.exit(0);
