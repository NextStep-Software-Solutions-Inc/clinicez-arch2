import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('Zero Hardcoded Defaults & Mocks Guardrail (apps/admin-web/src)', () => {
  const srcRoot = path.resolve(__dirname, '..', 'src');
  const sourceFiles = collectSourceFiles(srcRoot);

  const prohibitedPatterns: { label: string; literal: string }[] = [
    { label: 'DEFAULT_BANK_ACCOUNTS mock array', literal: 'DEFAULT_BANK_ACCOUNTS' },
    { label: 'DEFAULT_PERMISSION_DEFINITIONS mock array', literal: 'DEFAULT_PERMISSION_DEFINITIONS' },
    { label: 'syntheticEvents fake dashboard feed', literal: 'syntheticEvents' },
    { label: 'Nextstep Software Corporation hardcoded bank holder', literal: 'Nextstep Software Corporation' },
    { label: '0012-3456-7890 fake bank account number', literal: '0012-3456-7890' },
    { label: '4321-8765-09 fake BPI account number', literal: '4321-8765-09' },
    { label: '0917-123-3974 fake e-wallet number', literal: '0917-123-3974' },
    { label: '000-123-456-000 fake BIR TIN', literal: '000-123-456-000' },
    { label: 'CLINICEZ-ENTITLEMENTS-AUTH-KEY-P256 fake authority key', literal: 'CLINICEZ-ENTITLEMENTS-AUTH-KEY-P256' },
    { label: 'clinicez-vault-prod fake storage bucket', literal: 'clinicez-vault-prod' },
    { label: 'governance@clinicez.com fake sender email', literal: 'governance@clinicez.com' },
    { label: '+63 (02) 8123-4567 fake hotline', literal: '+63 (02) 8123-4567' },
    { label: 'Clinic EZ Editorial Team hardcoded author default', literal: 'Clinic EZ Editorial Team' },
    { label: '# New Practice Advisory hardcoded markdown template', literal: '# New Practice Advisory' },
    { label: 'http://localhost:5000 hardcoded API origin', literal: 'http://localhost:5000' },
    { label: 'http://localhost:3001 hardcoded admin origin', literal: 'http://localhost:3001' },
    { label: 'http://localhost:3000 hardcoded portal origin', literal: 'http://localhost:3000' },
    { label: 'clinicez.com hardcoded production domain', literal: 'clinicez.com' },
  ];

  it('scans all source files in apps/admin-web/src', () => {
    expect(sourceFiles.length).toBeGreaterThan(25);
  });

  for (const rule of prohibitedPatterns) {
    it(`contains zero occurrences of ${rule.label}`, () => {
      const offenders: string[] = [];
      for (const file of sourceFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes(rule.literal)) {
          offenders.push(path.relative(srcRoot, file));
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
