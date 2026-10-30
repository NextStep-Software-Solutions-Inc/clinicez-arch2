// token-guard:ignore-file (configuration testing suite)
import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

// Import the configuration generator directly from app.config.ts
import getAppConfig from '../app.config';

// Java reserved keywords that must never appear as bare segments in an Android package
const JAVA_RESERVED_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class',
  'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final',
  'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int',
  'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public',
  'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this',
  'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null',
]);

const CHANNEL_REGEX = /^[a-z\d][a-z\d._-]*$/;
const ANDROID_SEGMENT_REGEX = /^[a-z][a-z0-9_]*$/;

function evaluateConfigWithEnv(env: Record<string, string | undefined>): ExpoConfig {
  const originalEnv = { ...process.env };
  try {
    // Clear relevant env vars
    delete process.env.APP_VARIANT;
    delete process.env.APP_BRANCH;
    delete process.env.APP_TAG;
    delete process.env.GIT_TAG;
    delete process.env.EAS_BUILD_GIT_COMMIT_REF;
    delete process.env.GIT_BRANCH;
    delete process.env.GITHUB_REF;
    delete process.env.IOS_BUNDLE_IDENTIFIER;
    delete process.env.IOS_BUNDLE_ID;
    delete process.env.GOOGLE_SERVICES_JSON;
    delete process.env.SQLITE_DB_NAME;

    // Apply simulated environment
    Object.assign(process.env, env);

    const context: ConfigContext = {
      projectRoot: path.resolve(__dirname, '..'),
      staticConfig: {},
    };

    return getAppConfig(context);
  } finally {
    // Restore original environment
    for (const key of Object.keys(process.env)) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
    for (const key of Object.keys(originalEnv)) {
      process.env[key] = originalEnv[key];
    }
  }
}

describe('R4: Expo Config Deterministic Branching & Side-by-Side Coexistence', () => {
  describe('Suite 1: Acceptance Criteria 4-Environment Determinism', () => {
    it('evaluating app.config.ts across 4 canonical environments produces 4 mutually distinct bundle IDs, packages, schemes, names, and channels', () => {
      // 1. Production
      const prod = evaluateConfigWithEnv({ APP_VARIANT: 'production' });

      // 2. Explicit Staging
      const stg = evaluateConfigWithEnv({ APP_VARIANT: 'staging' });

      // 3. Dev client on feature branch
      const dev = evaluateConfigWithEnv({
        APP_VARIANT: 'development',
        APP_BRANCH: 'feat/Auth_Check',
      });

      // 4. Standalone feature branch build
      const feat = evaluateConfigWithEnv({
        APP_BRANCH: 'feat/Offline_Sync',
      });

      const configs = [prod, stg, dev, feat];

      // Extract properties
      const bundleIds = configs.map((c) => c.ios?.bundleIdentifier);
      const packages = configs.map((c) => c.android?.package);
      const schemes = configs.map((c) => c.scheme);
      const names = configs.map((c) => c.name);
      const channels = configs.map(
        (c) =>
          (c.updates?.requestHeaders as Record<string, string> | undefined)?.[
            'expo-channel-name'
          ]
      );
      const dbNames = configs.map((c) => c.extra?.sqliteDbName);

      // Verify mutual distinctness across all 4 environments (Set size must be 4)
      expect(new Set(bundleIds).size).toBe(4);
      expect(new Set(packages).size).toBe(4);
      expect(new Set(schemes).size).toBe(4);
      expect(new Set(names).size).toBe(4);
      expect(new Set(channels).size).toBe(4);
      expect(new Set(dbNames).size).toBe(4);

      // Specific assertions for Environment 1: Production
      expect(prod.ios?.bundleIdentifier).toBe('com.nextstepsoftware.clinicez.patient');
      expect(prod.android?.package).toBe('com.nextstepsoftware.clinicez.patient');
      expect(prod.scheme).toBe('clinicez-patient');
      expect(prod.name).toBe('Clinic EZ');
      expect((prod.updates?.requestHeaders as any)?.['expo-channel-name']).toBe('production');
      expect(prod.extra?.sqliteDbName).toBe('Clinic EZ_patient.db');

      // Specific assertions for Environment 2: Explicit Staging
      expect(stg.ios?.bundleIdentifier).toBe(
        'com.nextstepsoftware.clinicez.patient.staging'
      );
      expect(stg.android?.package).toBe('com.nextstepsoftware.clinicez.patient.staging');
      expect(stg.scheme).toBe('clinicez-patient-staging');
      expect(stg.name).toBe('STG • Clinic EZ');
      expect((stg.updates?.requestHeaders as any)?.['expo-channel-name']).toBe('staging');
      expect(stg.extra?.sqliteDbName).toBe('Clinic EZ_patient_staging.db');

      // Specific assertions for Environment 3: Dev Client
      expect(dev.ios?.bundleIdentifier).toBe('com.nextstepsoftware.clinicez.patient.dev');
      expect(dev.android?.package).toBe('com.nextstepsoftware.clinicez.patient.dev');
      expect(dev.scheme).toBe('clinicez-patient-dev');
      expect(dev.name).toBe('DEV • Clinic EZ');
      expect((dev.updates?.requestHeaders as any)?.['expo-channel-name']).toBe(
        'dev-feat-auth-check'
      );
      expect(dev.extra?.sqliteDbName).toBe('Clinic EZ_patient_dev.db');

      // Specific assertions for Environment 4: Feature Branch
      expect(feat.ios?.bundleIdentifier).toBe(
        'com.nextstepsoftware.clinicez.patient.br-feat-offline-sync'
      );
      expect(feat.android?.package).toBe(
        'com.nextstepsoftware.clinicez.patient.br_feat_offline_sync'
      );
      expect(feat.scheme).toBe('clinicez-patient-br-feat-offline-sync');
      expect(feat.name).toBe('[feat/Offline_Sync] Clinic EZ');
      expect((feat.updates?.requestHeaders as any)?.['expo-channel-name']).toBe(
        'br-feat-offline-sync'
      );
      expect(feat.extra?.sqliteDbName).toBe(
        'Clinic EZ_patient_br_feat_offline_sync.db'
      );
    });

    it('development-standalone produces a non-dev-client standalone build on br-development that coexists side-by-side with dev-client', () => {
      const devStandalone = evaluateConfigWithEnv({
        APP_VARIANT: 'development-standalone',
        APP_BRANCH: 'development',
      });
      const devClient = evaluateConfigWithEnv({
        APP_VARIANT: 'development',
        APP_BRANCH: 'development',
      });

      expect(devStandalone.name).toBe('[development] Clinic EZ');
      expect(devStandalone.ios?.bundleIdentifier).toBe(
        'com.nextstepsoftware.clinicez.patient.br-development'
      );
      expect(devStandalone.android?.package).toBe(
        'com.nextstepsoftware.clinicez.patient.br_development'
      );
      expect(devStandalone.scheme).toBe('clinicez-patient-br-development');
      expect((devStandalone.updates?.requestHeaders as any)?.['expo-channel-name']).toBe(
        'br-development'
      );
      expect(devStandalone.extra?.sqliteDbName).toBe(
        'Clinic EZ_patient_br_development.db'
      );

      // Must never collide with manual dev-client on the same device
      expect(devStandalone.ios?.bundleIdentifier).not.toBe(devClient.ios?.bundleIdentifier);
      expect(devStandalone.android?.package).not.toBe(devClient.android?.package);
      expect(devStandalone.scheme).not.toBe(devClient.scheme);
      expect((devStandalone.updates?.requestHeaders as any)?.['expo-channel-name']).not.toBe(
        (devClient.updates?.requestHeaders as any)?.['expo-channel-name']
      );
      expect(devStandalone.extra?.sqliteDbName).not.toBe(devClient.extra?.sqliteDbName);
    });

    it('main branch is treated as a standard branch (not hardcoded staging), receiving its own isolated updates and build configuration', () => {
      const main = evaluateConfigWithEnv({ APP_BRANCH: 'main' });
      expect(main.name).toBe('[main] Clinic EZ');
      expect(main.ios?.bundleIdentifier).toBe('com.nextstepsoftware.clinicez.patient.br-main');
      expect(main.android?.package).toBe('com.nextstepsoftware.clinicez.patient.br_main');
      expect(main.scheme).toBe('clinicez-patient-br-main');
      expect((main.updates?.requestHeaders as any)?.['expo-channel-name']).toBe('br-main');
      expect(main.extra?.sqliteDbName).toBe('Clinic EZ_patient_br_main.db');
      expect(main.extra?.isProduction).toBe(false);
    });
  });

  describe('Suite 2: Regex & Segment Grammar Conformance', () => {
    const testEnvironments = [
      { APP_VARIANT: 'production' },
      { APP_BRANCH: 'main' },
      { APP_VARIANT: 'development', APP_BRANCH: 'feat/Auth_Check' },
      { APP_BRANCH: 'feat/Offline_Sync' },
      { APP_BRANCH: 'preview' },
      { APP_BRANCH: 'fix/issue-102_login.v2' },
      { APP_BRANCH: 'feat/3d-biometrics' },
    ];

    it('every resolved channel name strictly satisfies /^[a-z\\d][a-z\\d._-]*$/', () => {
      for (const env of testEnvironments) {
        const config = evaluateConfigWithEnv(env);
        const channel = (config.updates?.requestHeaders as any)?.['expo-channel-name'];
        expect(typeof channel).toBe('string');
        expect(channel).toMatch(CHANNEL_REGEX);
      }
    });

    it('every Android package segment strictly satisfies /^[a-z][a-z0-9_]*$/ and contains no hyphens', () => {
      for (const env of testEnvironments) {
        const config = evaluateConfigWithEnv(env);
        const pkg = config.android?.package;
        expect(typeof pkg).toBe('string');
        expect(pkg).not.toContain('-'); // Hyphens are strictly illegal in Java packages

        const segments = pkg!.split('.');
        expect(segments.length).toBeGreaterThanOrEqual(4); // com.nextstepsoftware.clinicez.patient...

        for (const segment of segments) {
          expect(segment).toMatch(ANDROID_SEGMENT_REGEX);
        }
      }
    });
  });

  describe('Suite 3: Java Reserved Keyword Immunization', () => {
    const keywords = [
      'default',
      'switch',
      'package',
      'class',
      'enum',
      'interface',
      'native',
      'return',
      'void',
    ];

    for (const kw of keywords) {
      it(`branch named "${kw}" produces safe, non-reserved Android package segments`, () => {
        const config = evaluateConfigWithEnv({ APP_BRANCH: kw });
        const pkg = config.android?.package!;
        const segments = pkg.split('.');

        for (const segment of segments) {
          expect(segment).toMatch(ANDROID_SEGMENT_REGEX);
          // Segment must NOT be a bare Java keyword
          expect(JAVA_RESERVED_KEYWORDS.has(segment)).toBe(false);
        }

        // Must prefix branch segment with br_
        expect(pkg).toContain(`.br_${kw}`);
      });

      it(`nested branch named "feat/${kw}" does not introduce keyword segments`, () => {
        const config = evaluateConfigWithEnv({ APP_BRANCH: `feat/${kw}` });
        const pkg = config.android?.package!;
        const segments = pkg.split('.');

        for (const segment of segments) {
          expect(segment).toMatch(ANDROID_SEGMENT_REGEX);
          expect(JAVA_RESERVED_KEYWORDS.has(segment)).toBe(false);
        }
      });
    }
  });

  describe('Suite 4: Sanitization of Uppercase, Slashes, and Special Symbols', () => {
    it('normalizes uppercase characters to lowercase', () => {
      const config = evaluateConfigWithEnv({ APP_BRANCH: 'Feature/PATIENT-Auth_Check' });
      const channel = (config.updates?.requestHeaders as any)?.['expo-channel-name'];
      const pkg = config.android?.package!;

      expect(channel).toBe('br-feature-patient-auth-check');
      expect(pkg).toBe('com.nextstepsoftware.clinicez.patient.br_feature_patient_auth_check');
      expect(channel).toMatch(CHANNEL_REGEX);
      expect(pkg).toMatch(/^[a-z][a-z0-9_.]*$/);
    });

    it('sanitizes multiple nested slashes into valid delimiters', () => {
      const config = evaluateConfigWithEnv({
        APP_BRANCH: 'team/mobile/patient/fix-login-flow',
      });
      const channel = (config.updates?.requestHeaders as any)?.['expo-channel-name'];
      const pkg = config.android?.package!;

      expect(channel).not.toContain('/');
      expect(pkg).not.toContain('/');
      expect(channel).toMatch(CHANNEL_REGEX);
      for (const seg of pkg.split('.')) {
        expect(seg).toMatch(ANDROID_SEGMENT_REGEX);
      }
    });

    it('strips or replaces illegal punctuation characters (@, #, $, %, ^, &, *)', () => {
      const config = evaluateConfigWithEnv({ APP_BRANCH: 'feat/#42@clinic$sync!' });
      const channel = (config.updates?.requestHeaders as any)?.['expo-channel-name'];
      const pkg = config.android?.package!;

      expect(channel).toMatch(CHANNEL_REGEX);
      for (const seg of pkg.split('.')) {
        expect(seg).toMatch(ANDROID_SEGMENT_REGEX);
      }
    });
  });

  describe('Suite 5: Length Capping & Collision Safety (>40 Characters)', () => {
    it('safely truncates long branch names with collision resistance', () => {
      const longBranchA =
        'feat/patient-appointment-reschedule-teleconsult-room-readiness-offline-sync-v1';
      const longBranchB =
        'feat/patient-appointment-reschedule-teleconsult-room-readiness-offline-sync-v2';

      expect(longBranchA.length).toBeGreaterThan(40);
      expect(longBranchB.length).toBeGreaterThan(40);

      const configA = evaluateConfigWithEnv({ APP_BRANCH: longBranchA });
      const configB = evaluateConfigWithEnv({ APP_BRANCH: longBranchB });

      const channelA = (configA.updates?.requestHeaders as any)?.['expo-channel-name'];
      const channelB = (configB.updates?.requestHeaders as any)?.['expo-channel-name'];

      const pkgA = configA.android?.package!;
      const pkgB = configB.android?.package!;

      // Channel must be <= 40 chars
      expect(channelA.length).toBeLessThanOrEqual(40);
      expect(channelB.length).toBeLessThanOrEqual(40);

      // Distinctness guarantee: Branch A and Branch B must NEVER collide
      expect(channelA).not.toBe(channelB);
      expect(pkgA).not.toBe(pkgB);

      // Both must still satisfy regexes
      expect(channelA).toMatch(CHANNEL_REGEX);
      expect(channelB).toMatch(CHANNEL_REGEX);
      for (const seg of pkgA.split('.')) expect(seg).toMatch(ANDROID_SEGMENT_REGEX);
      for (const seg of pkgB.split('.')) expect(seg).toMatch(ANDROID_SEGMENT_REGEX);
    });
  });

  describe('Suite 6: Scoped Release Tags & Tag Routing', () => {
    it('scoped patient-app-v* tags map directly to production', () => {
      const config = evaluateConfigWithEnv({ APP_TAG: 'patient-app-v1.4.2' });
      expect(config.ios?.bundleIdentifier).toBe('com.nextstepsoftware.clinicez.patient');
      expect(config.android?.package).toBe('com.nextstepsoftware.clinicez.patient');
      expect((config.updates?.requestHeaders as any)?.['expo-channel-name']).toBe('production');
      expect(config.name).toBe('Clinic EZ');
      expect(config.extra?.isProduction).toBe(true);
    });

    it('unrelated tags (clinic-app-v*) do not map patient app to production', () => {
      const config = evaluateConfigWithEnv({
        APP_TAG: 'clinic-app-v1.4.2',
        APP_BRANCH: 'feat/test',
      });
      expect((config.updates?.requestHeaders as any)?.['expo-channel-name']).not.toBe(
        'production'
      );
      expect(config.extra?.isProduction).toBe(false);
    });
  });

  describe('Suite 7: Database Isolation, Workflows & EAS Safety Invariants', () => {
    it('allocates isolated SQLite database filenames across environments', () => {
      const prod = evaluateConfigWithEnv({ APP_VARIANT: 'production' });
      const stg = evaluateConfigWithEnv({ APP_VARIANT: 'staging' });
      const dev = evaluateConfigWithEnv({ APP_VARIANT: 'development' });
      const branch = evaluateConfigWithEnv({ APP_BRANCH: 'feat/Offline_Sync' });
      const main = evaluateConfigWithEnv({ APP_BRANCH: 'main' });

      const dbProd = prod.extra?.sqliteDbName;
      const dbStg = stg.extra?.sqliteDbName;
      const dbDev = dev.extra?.sqliteDbName;
      const dbBranch = branch.extra?.sqliteDbName;
      const dbMain = main.extra?.sqliteDbName;

      expect(dbProd).toBe('Clinic EZ_patient.db');
      expect(dbStg).toBe('Clinic EZ_patient_staging.db');
      expect(dbDev).toBe('Clinic EZ_patient_dev.db');
      expect(dbBranch).toBe('Clinic EZ_patient_br_feat_offline_sync.db');
      expect(dbMain).toBe('Clinic EZ_patient_br_main.db');

      expect(new Set([dbProd, dbStg, dbDev, dbBranch, dbMain]).size).toBe(5);
    });

    it('exports channel, branch, and variant in extra config for in-app display', () => {
      const config = evaluateConfigWithEnv({
        APP_BRANCH: 'feat/Offline_Sync',
      });

      expect(config.extra?.channel).toBe('br-feat-offline-sync');
      expect(config.extra?.appBranch).toBe('feat/Offline_Sync');
      expect(config.extra?.isProduction).toBe(false);
    });

    it('verifies EAS workflows do not trigger on wildcard tags and scope correctly', () => {
      const patientOtaProd = fs.readFileSync(
        path.resolve(__dirname, '../.eas/workflows/ota-production.yml'),
        'utf8'
      );
      const clinicOtaProd = fs.readFileSync(
        path.resolve(__dirname, '../../clinic-app/.eas/workflows/ota-production.yml'),
        'utf8'
      );

      // Must NOT contain wildcard tag trigger
      expect(patientOtaProd).not.toContain("- '*'");
      expect(clinicOtaProd).not.toContain("- '*'");

      // Must be scoped to respective app tags
      expect(patientOtaProd).toContain('patient-app-v*');
      expect(clinicOtaProd).toContain('clinic-app-v*');
    });

    it('verifies apps/patient-app/.easignore does not exclude drizzle/ or bun.lock', () => {
      const patientEasIgnore = fs.readFileSync(
        path.resolve(__dirname, '../.easignore'),
        'utf8'
      );

      // Must NOT exclude drizzle/ as a drop pattern
      const lines = patientEasIgnore.split('\n').map((l) => l.trim());
      expect(lines.includes('drizzle/')).toBe(false);
      expect(lines.includes('bun.lock')).toBe(false);
    });

    it('verifies root .easignore exists and excludes services/', () => {
      const rootEasIgnorePath = path.resolve(__dirname, '../../../.easignore');
      expect(fs.existsSync(rootEasIgnorePath)).toBe(true);

      const rootEasIgnore = fs.readFileSync(rootEasIgnorePath, 'utf8');
      expect(rootEasIgnore).toContain('services/');
      expect(rootEasIgnore).toContain('!bun.lock');
    });
  });
});
