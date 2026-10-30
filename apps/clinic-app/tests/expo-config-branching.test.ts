// token-guard:ignore-file (configuration testing suite)
import { describe, expect, it } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

import getAppConfig from '../app.config';

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
    delete process.env.APP_VARIANT;
    delete process.env.APP_BRANCH;
    delete process.env.APP_TAG;
    delete process.env.GIT_TAG;
    delete process.env.EAS_BUILD_GIT_COMMIT_REF;
    delete process.env.GIT_BRANCH;
    delete process.env.GITHUB_REF;
    delete process.env.IOS_BUNDLE_IDENTIFIER;
    delete process.env.IOS_BUNDLE_ID;

    Object.assign(process.env, env);

    const context: ConfigContext = {
      projectRoot: path.resolve(__dirname, '..'),
      staticConfig: {},
    };

    return getAppConfig(context);
  } finally {
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

describe('Clinic App: 2-Tier Dynamic Branching Architecture', () => {
  describe('Suite 1: Branch Isolation & Coexistence', () => {
    it('produces isolated bundle IDs, packages, schemes, names, and channels across variants', () => {
      const prod = evaluateConfigWithEnv({ APP_VARIANT: 'production' });
      const dev = evaluateConfigWithEnv({ APP_VARIANT: 'development' });
      const branch1 = evaluateConfigWithEnv({ APP_BRANCH: 'development' });
      const branch2 = evaluateConfigWithEnv({ APP_BRANCH: 'main' });
      const feat = evaluateConfigWithEnv({ APP_BRANCH: 'feat/Consult_V2' });

      // Production
      expect(prod.name).toBe('Clinic EZ Clinic');
      expect(prod.android?.package).toBe('com.nextstepsoftware.clinicez.clinic');
      expect(prod.ios?.bundleIdentifier).toBe('com.nextstepsoftware.clinicez.clinic');
      expect(prod.scheme).toBe('clinicez-clinic');
      expect((prod.updates?.requestHeaders as any)?.['expo-channel-name']).toBe('production');

      // Dev-Client
      expect(dev.name).toBe('DEV • Clinic EZ Clinic');
      expect(dev.android?.package).toBe('com.nextstepsoftware.clinicez.clinic.dev');
      expect(dev.ios?.bundleIdentifier).toBe('com.nextstepsoftware.clinicez.clinic.dev');
      expect(dev.scheme).toBe('clinicez-clinic-dev');

      // Development branch (independent branch build)
      expect(branch1.name).toBe('[development] Clinic EZ Clinic');
      expect(branch1.android?.package).toBe('com.nextstepsoftware.clinicez.clinic.br_development');
      expect(branch1.ios?.bundleIdentifier).toBe('com.nextstepsoftware.clinicez.clinic.br-development');
      expect(branch1.scheme).toBe('clinicez-clinic-br-development');
      expect((branch1.updates?.requestHeaders as any)?.['expo-channel-name']).toBe('br-development');

      // Main branch (independent branch build)
      expect(branch2.name).toBe('[main] Clinic EZ Clinic');
      expect(branch2.android?.package).toBe('com.nextstepsoftware.clinicez.clinic.br_main');
      expect(branch2.ios?.bundleIdentifier).toBe('com.nextstepsoftware.clinicez.clinic.br-main');
      expect(branch2.scheme).toBe('clinicez-clinic-br-main');
      expect((branch2.updates?.requestHeaders as any)?.['expo-channel-name']).toBe('br-main');

      // Feature branch
      expect(feat.name).toBe('[feat/Consult_V2] Clinic EZ Clinic');
      expect(feat.android?.package).toBe('com.nextstepsoftware.clinicez.clinic.br_feat_consult_v2');
      expect(feat.ios?.bundleIdentifier).toBe('com.nextstepsoftware.clinicez.clinic.br-feat-consult-v2');
      expect(feat.scheme).toBe('clinicez-clinic-br-feat-consult-v2');
      expect((feat.updates?.requestHeaders as any)?.['expo-channel-name']).toBe('br-feat-consult-v2');
    });

    it('scoped clinic-app-v* tags map directly to production', () => {
      const config = evaluateConfigWithEnv({ APP_TAG: 'clinic-app-v1.4.2' });
      expect(config.name).toBe('Clinic EZ Clinic');
      expect(config.android?.package).toBe('com.nextstepsoftware.clinicez.clinic');
      expect((config.updates?.requestHeaders as any)?.['expo-channel-name']).toBe('production');
      expect(config.extra?.isProduction).toBe(true);
    });

    it('unrelated tags (patient-app-v*) do not map clinic app to production', () => {
      const config = evaluateConfigWithEnv({
        APP_TAG: 'patient-app-v1.4.2',
        APP_BRANCH: 'feat/test',
      });
      expect((config.updates?.requestHeaders as any)?.['expo-channel-name']).not.toBe('production');
      expect(config.extra?.isProduction).toBe(false);
    });
  });

  describe('Suite 2: Regex & Segment Grammar Conformance', () => {
    const testEnvironments = [
      { APP_VARIANT: 'production' },
      { APP_BRANCH: 'main' },
      { APP_BRANCH: 'development' },
      { APP_BRANCH: 'feat/3d-consultation' },
      { APP_BRANCH: 'fix/rx-dispense.v2' },
      { APP_BRANCH: 'default' },
      { APP_BRANCH: 'package' },
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
        expect(pkg).not.toContain('-');

        const segments = pkg!.split('.');
        expect(segments.length).toBeGreaterThanOrEqual(4);

        for (const segment of segments) {
          expect(segment).toMatch(ANDROID_SEGMENT_REGEX);
        }
      }
    });

    it('sanitizes bare Java keywords in branch segments', () => {
      const config = evaluateConfigWithEnv({ APP_BRANCH: 'default' });
      const pkg = config.android?.package!;
      for (const segment of pkg.split('.')) {
        expect(JAVA_RESERVED_KEYWORDS.has(segment)).toBe(false);
      }
    });
  });

  describe('Suite 3: EAS Workflows File Verification', () => {
    it('verifies clinic-app EAS workflows exist and are configured for 2-tier architecture', () => {
      const otaPreviewPath = path.resolve(__dirname, '../.eas/workflows/ota-preview.yml');
      const otaProdPath = path.resolve(__dirname, '../.eas/workflows/ota-production.yml');

      expect(fs.existsSync(otaPreviewPath)).toBe(true);
      expect(fs.existsSync(otaProdPath)).toBe(true);

      const otaPreview = fs.readFileSync(otaPreviewPath, 'utf8');
      const otaProd = fs.readFileSync(otaProdPath, 'utf8');

      // ota-preview triggers on all branches
      expect(otaPreview).toContain("- '**'");
      expect(otaPreview).not.toContain("!main");
      expect(otaPreview).not.toContain("!development");

      // ota-production triggers strictly on clinic-app-v* tags
      expect(otaProd).toContain('clinic-app-v*');
      expect(otaProd).not.toContain("- '*'");
    });

    it('verifies redundant workflows are removed', () => {
      const otaDevPath = path.resolve(__dirname, '../.eas/workflows/ota-development.yml');
      const otaStagingPath = path.resolve(__dirname, '../.eas/workflows/ota-staging.yml');

      expect(fs.existsSync(otaDevPath)).toBe(false);
      expect(fs.existsSync(otaStagingPath)).toBe(false);
    });
  });
});
