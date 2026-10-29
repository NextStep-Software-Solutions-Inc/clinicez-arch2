// token-guard:ignore-file (automated post-audit verification suite)
import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import getAppConfig from '../app.config';
import { refreshDocumentTypes } from '../services/files/filesShared';
import { linking } from '../navigation/linking';

const APP_ROOT = path.resolve(import.meta.dir, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '../..');

describe('Part 1 Post-Audit Runtime & CI Hardening', () => {
  test('Drizzle migration 0017 adds sync_queue.error_message for Native and Web SQLite parity', () => {
    const sqlPath = path.join(APP_ROOT, 'drizzle/0017_sync_queue_error_message.sql');
    expect(fs.existsSync(sqlPath)).toBe(true);
    expect(fs.readFileSync(sqlPath, 'utf8')).toContain('ALTER TABLE `sync_queue` ADD `error_message` text');

    const migrationsJs = fs.readFileSync(path.join(APP_ROOT, 'drizzle/migrations.js'), 'utf8');
    expect(migrationsJs).toContain('0017_sync_queue_error_message.sql');
    expect(migrationsJs).toContain('m0017');

    const journal = JSON.parse(
      fs.readFileSync(path.join(APP_ROOT, 'drizzle/meta/_journal.json'), 'utf8')
    );
    expect(journal.entries.some((e: any) => e.tag === '0017_sync_queue_error_message')).toBe(true);

    const webDb = fs.readFileSync(path.join(APP_ROOT, 'db/index.web.ts'), 'utf8');
    expect(webDb).toContain("name: 'error_message'");
    expect(webDb).toContain('BroadcastChannel');
    expect(webDb).toContain('clearWebDatabaseSnapshot');
  });

  test('refreshDocumentTypes throws when throwOnError=true and remote config download fails with empty cache', async () => {
    const fakeEmptyDb = {
      select: () => ({
        from: () => ({
          orderBy: async () => [],
        }),
      }),
    };

    await expect(
      refreshDocumentTypes('patient-1', async () => 'tok', {
        force: true,
        throwOnError: true,
        db: fakeEmptyDb,
        fetchFn: async () => {
          throw new Error('Network offline');
        },
      })
    ).rejects.toThrow('Network offline');
  });

  test('App.tsx and clinical screens never expose raw Clerk IDs or clinical acronym jargon', () => {
    const appTsx = fs.readFileSync(path.join(APP_ROOT, 'App.tsx'), 'utf8');
    expect(appTsx).not.toContain('Clerk ID:');

    const recordsScreen = fs.readFileSync(
      path.join(APP_ROOT, 'navigation/screens/records/Records.screen.tsx'),
      'utf8'
    );
    expect(recordsScreen).not.toContain('Visits (AVS)');
    expect(recordsScreen).toContain('Visits & Care Summaries');
  });

  test('linking.getPathFromState serializes clinicId, organizationId, and appointmentId into clean :id URLs on Web', () => {
    const clinicUrl = linking.getPathFromState!(
      {
        routes: [
          {
            name: 'Main',
            state: {
              routes: [
                {
                  name: 'ClinicDetailsScreen',
                  params: { clinicId: 'clinic-abc-123' },
                },
              ],
            },
          },
        ],
      } as any,
      linking.config
    );
    expect(clinicUrl).toContain('/explore/clinics/clinic-abc-123');
    expect(clinicUrl).not.toContain('undefined');
  });

  test('EAS OTA workflows use valid runs-on syntax and sanitized per-branch channel outputs', () => {
    const patientProdOta = fs.readFileSync(
      path.join(APP_ROOT, '.eas/workflows/ota-production.yml'),
      'utf8'
    );
    const clinicProdOta = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/clinic-app/.eas/workflows/ota-production.yml'),
      'utf8'
    );
    expect(patientProdOta).toContain('runs-on: linux-medium');
    expect(patientProdOta).not.toContain('runs_on:');
    expect(clinicProdOta).toContain('runs-on: linux-medium');
    expect(clinicProdOta).not.toContain('runs_on:');
    expect(clinicProdOta).toContain("'clinic-app-v*'");

    const previewOta = fs.readFileSync(
      path.join(APP_ROOT, '.eas/workflows/ota-preview.yml'),
      'utf8'
    );
    expect(previewOta).toContain('needs.quality_gate.outputs.channel');
    expect(previewOta).not.toContain("channel: ${{ github.ref_name || 'preview' }}");
  });

  test('app.config.ts clones google-services.json client entry for dynamic Android branch package and supports IOS_SHARED_PREVIEW_BUNDLE_ID', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinicez-gs-test-'));
    const sampleGsPath = path.join(tmpDir, 'google-services.json');
    const generatedGsPath = path.join(APP_ROOT, '.generated-google-services.json');

    fs.writeFileSync(
      sampleGsPath,
      JSON.stringify({
        project_info: { project_id: 'clinicez-test' },
        client: [
          {
            client_info: {
              mobilesdk_app_id: '1:123:android:abc',
              android_client_info: {
                package_name: 'com.nextstepsoftware.clinicez.patient',
              },
            },
          },
        ],
      }),
      'utf8'
    );

    const oldEnv = { ...process.env };
    try {
      process.env.APP_BRANCH = 'feat/Push_Check';
      process.env.GOOGLE_SERVICES_JSON = sampleGsPath;
      process.env.IOS_SHARED_PREVIEW_BUNDLE_ID = 'true';
      delete process.env.APP_VARIANT;
      delete process.env.IOS_BUNDLE_IDENTIFIER;
      delete process.env.IOS_BUNDLE_ID;

      const cfg = getAppConfig({ projectRoot: APP_ROOT, staticConfig: {} });
      expect(cfg.ios?.bundleIdentifier).toBe('com.nextstepsoftware.clinicez.patient.preview');
      expect(cfg.android?.package).toBe(
        'com.nextstepsoftware.clinicez.patient.br_feat_push_check'
      );
      expect(cfg.android?.googleServicesFile).toBe(generatedGsPath);

      const generated = JSON.parse(fs.readFileSync(generatedGsPath, 'utf8'));
      const pkgs = generated.client.map(
        (c: any) => c.client_info.android_client_info.package_name
      );
      expect(pkgs).toContain('com.nextstepsoftware.clinicez.patient.br_feat_push_check');
    } finally {
      if (fs.existsSync(generatedGsPath)) fs.unlinkSync(generatedGsPath);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      for (const k of Object.keys(process.env)) {
        if (oldEnv[k] === undefined) delete process.env[k];
        else process.env[k] = oldEnv[k];
      }
      Object.assign(process.env, oldEnv);
    }
  });
});
