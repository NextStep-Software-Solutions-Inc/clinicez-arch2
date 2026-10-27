#!/usr/bin/env node
/**
 * CI gate: @clinicez/comms-sdk must work on an on-premise LAN with zero hardcoded external URLs
 * or localhost addresses. All hub/API/relay URLs must be injected at runtime.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
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

const files = [...walk(join(root, 'src'))];
const problems = [];
for (const file of files) {
  const lines = stripComments(readFileSync(file, 'utf8'));
  lines.forEach((line, index) => {
    const where = `${relative(root, file).split(sep).join('/')}:${index + 1}`;
    if (URL_PATTERN.test(line)) problems.push(`${where}  hardcoded URL: ${line.trim()}`);
    else if (LOCAL_PATTERN.test(line)) problems.push(`${where}  hardcoded local address: ${line.trim()}`);
  });
}

if (problems.length > 0) {
  console.error(`Comms SDK host gate: ${problems.length} problem(s)\n` + problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
console.log(`Comms SDK host gate OK (${files.length} files scanned).`);
