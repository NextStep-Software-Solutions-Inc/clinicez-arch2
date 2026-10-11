import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The patient app talks to patient-api only. These checks guard against the removed direct
 * clinic wiring (a per-clinic `baseUrl`, streaming attachments to the clinic) coming back.
 */

const APP_ROOT = join(import.meta.dir, '..');

const read = (relativePath: string): string => readFileSync(join(APP_ROOT, relativePath), 'utf8');

const CLINIC_WIRING_FILES = [
  'services/api/discoveryApi.ts',
  'services/discovery/discoveryService.ts',
  'services/discovery/types.ts',
  'db/schema/clinics.ts',
  'db/seedDemoData.ts',
  'navigation/screens/BookingDraft.screen.tsx',
  'navigation/screens/BookingDraft.screen.web.tsx',
];

const FORBIDDEN_TOKENS = ['baseUrl', 'base_url', 'uploadSharedFileToClinic', 'EXPO_PUBLIC_CLINIC_API_URL'];

describe('direct clinic calls are gone', () => {
  for (const file of CLINIC_WIRING_FILES) {
    test(`${file} has no clinic base URL wiring`, () => {
      const source = read(file);
      for (const token of FORBIDDEN_TOKENS) {
        expect(source.includes(token)).toBe(false);
      }
    });
  }

  test('.env.example no longer documents a clinic API URL', () => {
    expect(read('.env.example').includes('CLINIC_API_URL')).toBe(false);
  });

  test('no source file reads EXPO_PUBLIC_CLINIC_API_URL', () => {
    const offenders: string[] = [];
    const scan = (directory: string) => {
      for (const entry of readdirSync(join(APP_ROOT, directory), { withFileTypes: true })) {
        const relative = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', 'tests', '.expo', 'dist'].includes(entry.name)) continue;
          scan(relative);
        } else if (/\.(ts|tsx|js|json)$/.test(entry.name) && read(relative).includes('EXPO_PUBLIC_CLINIC_API_URL')) {
          offenders.push(relative);
        }
      }
    };
    for (const directory of ['services', 'navigation', 'components', 'hooks', 'contexts', 'db', 'utils']) {
      if (existsSync(join(APP_ROOT, directory))) scan(directory);
    }
    expect(offenders).toEqual([]);
  });

  test('a migration drops clinics.base_url', () => {
    const migration = readdirSync(join(APP_ROOT, 'drizzle')).find((name) => name.startsWith('0012_'));
    expect(migration).toBeDefined();
    expect(read(join('drizzle', migration as string))).toContain('ALTER TABLE `clinics` DROP COLUMN `base_url`');
  });

  test('the migration journal registers the base_url drop', () => {
    expect(read('drizzle/migrations.js')).toContain('m0012');
  });
});
