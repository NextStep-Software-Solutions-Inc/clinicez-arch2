#!/usr/bin/env bun
/**
 * Generates Clinic EZ "Layered Duo" (Facet EZ) launcher icons, Android adaptive icon layers,
 * splash screen emblems, Apple touch icons, and favicons across all web & mobile apps
 * using @clinicez/design-tokens.
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('../node_modules/.bun/sharp@0.34.5/node_modules/sharp');

const ROOT = path.resolve(import.meta.dir, '..');

const PRISM_PATH =
  'm297.42,102.89L154.27,10.61c-41.58-26.8-96.78-.05-101.5,49.2l-14.92,155.7c-4.72,49.25,44.4,86,90.31,67.58l158.07-63.42c49.74-19.96,56.23-87.73,11.19-116.77Z';
const E_PATH =
  'm86.16,150.56c1.13,22.55,18.28,33.42,38.83,32.79,15.06-.46,23.7-3.29,31.27-6.55l3.79,13.26c-6.55,3.04-18.41,7.46-36.95,8.03-33.02,1.01-54.18-19.14-55.09-48.98-.91-29.63,17.56-55.05,49.88-56.04,36.72-1.12,46.33,29.64,46.85,46.68.12,3.79-.05,6.55-.47,8.41l-78.11,2.39Zm60.15-15.41c-.12-8.61-4.74-29.53-29.44-28.77-21.27.65-29.55,18.26-30.87,30.62l60.31-1.85Z';
const Z_PATH =
  'm178.04,183.03l48.05-59.35c4.9-5.93,9.08-10.62,14.4-16.44v-.41s-60.63,1.86-60.63,1.86l-.46-15.01,84.12-2.58.21,11.65-47.45,58.77c-4.64,5.66-8.95,10.89-13.99,16.22v.41s64.89-1.99,64.89-1.99l.46,15.01-89.27,2.73-.33-10.88Z';

function buildIconSvg({ variant = 'staff', rounded = false }) {
  const isPatient = variant === 'patient';
  const rx = rounded ? '84' : '0';

  const bgDefs = isPatient
    ? `<linearGradient id="bg" x1="0" y1="0" x2="380" y2="380" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="55%" stop-color="#F0FDF9"/>
        <stop offset="100%" stop-color="#D9FAF1"/>
      </linearGradient>`
    : `<linearGradient id="bg" x1="0" y1="0" x2="380" y2="380" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#12907F"/>
        <stop offset="55%" stop-color="#0D6963"/>
        <stop offset="100%" stop-color="#031C1A"/>
      </linearGradient>`;

  const backPrism = '#34C3A6';
  const frontPrism = isPatient ? '#0D6963' : '#FFFFFF';
  const ezFill = isPatient ? '#FFFFFF' : '#0D6963';
  const borderRect =
    isPatient && rounded
      ? `<rect x="8" y="8" width="364" height="364" rx="76" fill="none" stroke="#A8EEDC" stroke-width="8"/>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 380">
    <defs>${bgDefs}</defs>
    <rect width="380" height="380" rx="${rx}" fill="url(#bg)"/>
    ${borderRect}
    <g transform="translate(52, 62) scale(0.92) rotate(6 160 145)">
      <path fill="${backPrism}" d="${PRISM_PATH}"/>
    </g>
    <g transform="translate(26, 42) scale(0.92)">
      <path fill="${frontPrism}" d="${PRISM_PATH}"/>
      <path fill="${ezFill}" d="${E_PATH}"/>
      <path fill="${ezFill}" d="${Z_PATH}"/>
    </g>
  </svg>`;
}

function buildAdaptiveBgSvg(variant = 'staff') {
  const isPatient = variant === 'patient';
  const bgDefs = isPatient
    ? `<linearGradient id="bg" x1="0" y1="0" x2="380" y2="380" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="55%" stop-color="#F0FDF9"/>
        <stop offset="100%" stop-color="#D9FAF1"/>
      </linearGradient>`
    : `<linearGradient id="bg" x1="0" y1="0" x2="380" y2="380" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#12907F"/>
        <stop offset="55%" stop-color="#0D6963"/>
        <stop offset="100%" stop-color="#031C1A"/>
      </linearGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 380">
    <defs>${bgDefs}</defs>
    <rect width="380" height="380" fill="url(#bg)"/>
  </svg>`;
}

function buildAdaptiveFgSvg(variant = 'staff') {
  const isPatient = variant === 'patient';
  const backPrism = '#34C3A6';
  const frontPrism = isPatient ? '#0D6963' : '#FFFFFF';
  const ezFill = isPatient ? '#FFFFFF' : '#0D6963';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 380">
    <g transform="translate(55, 58) scale(0.70)">
      <g transform="translate(52, 62) scale(0.92) rotate(6 160 145)">
        <path fill="${backPrism}" d="${PRISM_PATH}"/>
      </g>
      <g transform="translate(26, 42) scale(0.92)">
        <path fill="${frontPrism}" d="${PRISM_PATH}"/>
        <path fill="${ezFill}" d="${E_PATH}"/>
        <path fill="${ezFill}" d="${Z_PATH}"/>
      </g>
    </g>
  </svg>`;
}

function buildAdaptiveMonoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 380">
    <g transform="translate(55, 58) scale(0.70)">
      <g transform="translate(52, 62) scale(0.92) rotate(6 160 145)">
        <path fill="#FFFFFF" fill-opacity="0.4" d="${PRISM_PATH}"/>
      </g>
      <g transform="translate(26, 42) scale(0.92)">
        <path fill="#FFFFFF" fill-rule="evenodd" d="${PRISM_PATH} ${E_PATH} ${Z_PATH}"/>
      </g>
    </g>
  </svg>`;
}

function buildSplashSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 380">
    <g transform="translate(55, 58) scale(0.70)">
      <g transform="translate(52, 62) scale(0.92) rotate(6 160 145)">
        <path fill="#34C3A6" d="${PRISM_PATH}"/>
      </g>
      <g transform="translate(26, 42) scale(0.92)">
        <path fill="#0D6963" d="${PRISM_PATH}"/>
        <path fill="#FFFFFF" d="${E_PATH}"/>
        <path fill="#FFFFFF" d="${Z_PATH}"/>
      </g>
    </g>
  </svg>`;
}

async function renderPng(svgString, size, outPath, opaque = false) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  let pipeline = sharp(Buffer.from(svgString)).resize(size, size);
  if (opaque) {
    pipeline = pipeline.removeAlpha();
  }
  await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
  console.log(`Generated ${path.relative(ROOT, outPath)} (${size}x${size})`);
}

async function renderIco(svgString, sizes, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const pngBuffers = await Promise.all(
    sizes.map((s) => sharp(Buffer.from(svgString)).resize(s, s).png({ compressionLevel: 9 }).toBuffer())
  );

  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO type = 1
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let dataOffset = 6 + count * 16;

  for (let i = 0; i < count; i++) {
    const size = sizes[i];
    const buf = pngBuffers[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    dirEntries.push(entry);
    dataOffset += buf.length;
  }

  const icoBuffer = Buffer.concat([header, ...dirEntries, ...pngBuffers]);
  fs.writeFileSync(outPath, icoBuffer);
  console.log(`Generated ${path.relative(ROOT, outPath)} (${sizes.join(', ')}px ICO)`);
}

async function generateExpoAppAssets(appName, variant) {
  const assetsDir = path.join(ROOT, 'apps', appName, 'assets');
  await renderPng(buildIconSvg({ variant, rounded: false }), 1024, path.join(assetsDir, 'icon.png'), true);
  await renderPng(buildAdaptiveBgSvg(variant), 1024, path.join(assetsDir, 'android-icon-background.png'), true);
  await renderPng(buildAdaptiveFgSvg(variant), 1024, path.join(assetsDir, 'android-icon-foreground.png'), false);
  await renderPng(buildAdaptiveMonoSvg(), 1024, path.join(assetsDir, 'android-icon-monochrome.png'), false);
  await renderPng(buildSplashSvg(), 1024, path.join(assetsDir, 'splash-icon.png'), false);
  await renderPng(buildIconSvg({ variant, rounded: true }), 96, path.join(assetsDir, 'favicon.png'), false);
}

async function main() {
  // 1. Clinic App & Role Workstation Apps (Staff / Primary Teal Variant)
  for (const appName of ['clinic-app', 'laboratory-app', 'pharmacy-app', 'cashier-app']) {
    await generateExpoAppAssets(appName, 'staff');
  }

  // 2. Patient App (Light Inverted Variant)
  await generateExpoAppAssets('patient-app', 'patient');

  // 3. Portal Web App Router Favicon & Apple Touch Icon
  const portalAppDir = path.join(ROOT, 'apps', 'portal-web', 'src', 'app');
  await renderIco(buildIconSvg({ variant: 'staff', rounded: true }), [16, 32, 48], path.join(portalAppDir, 'favicon.ico'));
  await renderPng(buildIconSvg({ variant: 'staff', rounded: false }), 180, path.join(portalAppDir, 'apple-icon.png'), true);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
