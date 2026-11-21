#!/usr/bin/env node
/**
 * Design token guard for @clinicez/comms-sdk.
 * Enforces zero raw hex/rgb colors, zero numeric fontSize/borderRadius literals,
 * and zero emoji/pictograph icons across packages/comms-sdk/src.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(full);
    }
  }
})(srcDir);

const RULES = {
  color: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\brgba?\(/g,
  fontSize: /\bfontSize:\s*\d+/g,
  radius: /\b(?!shadow)\w*[rR]adius:\s*[1-9]\d*/g,
  emoji: /[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|[\u2B00-\u2BFF]/g,
};

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
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
const rows = Object.entries(results).sort((a, b) => b[1].total - a[1].total);
for (const [file, r] of rows) {
  const detail = ['color', 'fontSize', 'radius', 'emoji']
    .filter((k) => r[k])
    .map((k) => `${k}:${r[k]}`)
    .join(' ');
  console.log(`${String(r.total).padStart(5)}  ${file}  (${detail})`);
}
console.log(`Comms SDK token guard: ${grandTotal} violation(s) across ${files.length} source file(s).`);
process.exit(grandTotal === 0 ? 0 : 1);
