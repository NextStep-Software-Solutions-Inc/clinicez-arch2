import React from 'react';
import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { lightColors, darkColors } from '@clinicez/design-tokens';
import {
  ClinicEzMark,
  ClinicEzLogo,
  CLINICEZ_PRISM_PATH,
  CLINICEZ_E_PATH,
  CLINICEZ_Z_PATH,
} from '../src/components/ClinicEzLogo';

describe('Clinic EZ Layered Duo ("Facet EZ") Brand Identity in admin-web', () => {
  const adminRoot = path.resolve(__dirname, '..');

  it('renders ClinicEzMark bare variant using semantic design tokens', () => {
    const html = renderToStaticMarkup(<ClinicEzMark variant="bare" />);
    expect(html).toContain('viewBox="0 0 360 320"');
    expect(html).toContain(CLINICEZ_PRISM_PATH);
    expect(html).toContain(CLINICEZ_E_PATH);
    expect(html).toContain(CLINICEZ_Z_PATH);
    expect(html).toContain(`fill="${lightColors.primary}"`);
    expect(html).toContain(`fill="${darkColors.primary}"`);
    expect(html).toContain(`fill="${lightColors.onPrimary}"`);
  });

  it('renders ClinicEzMark squircle and inverted variants with 380x380 app icon geometry', () => {
    const squircleHtml = renderToStaticMarkup(<ClinicEzMark variant="squircle" />);
    expect(squircleHtml).toContain('viewBox="0 0 380 380"');
    expect(squircleHtml).toContain(`rx="84"`);
    expect(squircleHtml).toContain(`fill="${lightColors.primary}"`);

    const invertedHtml = renderToStaticMarkup(<ClinicEzMark variant="inverted" />);
    expect(invertedHtml).toContain('viewBox="0 0 380 380"');
    expect(invertedHtml).toContain(`fill="${lightColors.primarySubtle}"`);
  });

  it('renders ClinicEzLogo wordmark, optional Governance subtitle, and rail-collapsed mark-only state', () => {
    const fullHtml = renderToStaticMarkup(<ClinicEzLogo subtitle="Governance" />);
    expect(fullHtml).toContain('Clinic EZ');
    expect(fullHtml).toContain('Governance');

    const collapsedHtml = renderToStaticMarkup(
      <ClinicEzLogo variant="squircle" subtitle="Governance" showWordmark={false} />
    );
    expect(collapsedHtml).toContain(CLINICEZ_PRISM_PATH);
    expect(collapsedHtml).not.toContain('Clinic EZ');
    expect(collapsedHtml).not.toContain('Governance');
  });

  it('ships official Clinic EZ Layered Duo static favicon and lockup assets in public/ and index.html', () => {
    const faviconSvg = fs.readFileSync(path.join(adminRoot, 'public', 'favicon.svg'), 'utf8');
    expect(faviconSvg).toContain('viewBox="0 0 380 380"');
    expect(faviconSvg).toContain(CLINICEZ_PRISM_PATH);
    expect(faviconSvg).not.toContain('M12 2L3 7v6'); // legacy generic shield placeholder removed

    const lockupSvg = fs.readFileSync(path.join(adminRoot, 'public', 'clinic-ez_logo.svg'), 'utf8');
    expect(lockupSvg).toContain('ClinicEZ_Layered_Duo_Logo');
    expect(lockupSvg).toContain(CLINICEZ_PRISM_PATH);

    expect(fs.existsSync(path.join(adminRoot, 'public', 'favicon.ico'))).toBe(true);
    expect(fs.existsSync(path.join(adminRoot, 'public', 'apple-icon.png'))).toBe(true);

    const indexHtml = fs.readFileSync(path.join(adminRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain('href="/favicon.ico"');
    expect(indexHtml).toContain('href="/favicon.svg"');
    expect(indexHtml).toContain('href="/apple-icon.png"');
  });

  it('applies ClinicEzLogo across workstation shell, auth pages, and security gates without legacy C badge placeholders', () => {
    const brandedFiles = [
      'src/routes/_auth.tsx',
      'src/routes/sign-in.tsx',
      'src/routes/sign-up.tsx',
      'src/routes/sync-auth.tsx',
      'src/routes/invitations/$token.tsx',
      'src/routes/reset-password/$token.tsx',
      'src/components/MfaGate.tsx',
      'src/components/ClerkConfigDiagnosticScreen.tsx',
    ];

    for (const relPath of brandedFiles) {
      const src = fs.readFileSync(path.join(adminRoot, relPath), 'utf8');
      expect(src).toContain('@/components/ClinicEzLogo');
      expect(src).not.toMatch(/>\s*C\s*<\/div>/);
    }
  });

  it('enforces spaced "Clinic EZ" across all front-facing labels in src/', () => {
    const srcFiles: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          srcFiles.push(full);
        }
      }
    }
    walk(path.join(adminRoot, 'src'));

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      // Identifiers like CLINICEZ_PRISM_PATH are uppercase; unspaced mixed-case "ClinicEZ" should not appear in UI labels
      expect(content.includes('ClinicEZ')).toBe(false);
    }
  });
});
