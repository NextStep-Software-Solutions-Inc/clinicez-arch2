// token-guard:ignore-file (native Expo build configuration colours)
import type { ExpoConfig, ConfigContext } from 'expo/config';
import * as child_process from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const EAS_PROJECT_ID = 'b73e0d31-2001-40df-b1a1-0482faebb5b1';
const BASE_ID = 'com.nextstepsoftware.clinicez.patient';

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null',
]);

function sanitizeChannelSlug(branch: string): string {
  let cleaned = branch
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/[-_.]+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');

  if (!cleaned) cleaned = 'branch';

  if (cleaned.length > 30 || branch.length > 30) {
    const hash = crypto.createHash('sha256').update(branch).digest('hex').slice(0, 7);
    cleaned = `${cleaned.slice(0, 22).replace(/[-_.]+$/, '')}-${hash}`;
  }

  return cleaned;
}

function sanitizePackageSegment(slug: string): string {
  let segment = slug
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!segment) segment = 'branch';
  return segment;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const rawTag = (
    process.env.APP_TAG ??
    process.env.GIT_TAG ??
    (process.env.GITHUB_REF?.startsWith('refs/tags/')
      ? process.env.GITHUB_REF.replace('refs/tags/', '')
      : '')
  ).trim();

  let rawBranch = (
    process.env.APP_BRANCH ??
    process.env.EAS_BUILD_GIT_COMMIT_REF ??
    process.env.GIT_BRANCH ??
    (process.env.GITHUB_REF?.startsWith('refs/heads/')
      ? process.env.GITHUB_REF.replace('refs/heads/', '')
      : '')
  ).trim();

  // If neither branch nor variant env var is set, resolve active branch from git repository
  if (!rawBranch && !process.env.APP_VARIANT) {
    try {
      const gitBranch = child_process
        .execSync('git branch --show-current', {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        .trim();
      if (gitBranch && gitBranch !== 'HEAD') {
        rawBranch = gitBranch;
      } else {
        const nameRev = child_process
          .execSync('git name-rev --name-only HEAD', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          })
          .trim();
        const cleaned = nameRev
          .replace(/^remotes\/origin\//, '')
          .replace(/^tags\//, '')
          .split('~')[0]
          .split('^')[0];
        if (cleaned && cleaned !== 'undefined') {
          rawBranch = cleaned;
        }
      }
    } catch {
      // Git unavailable
    }
  }

  const rawVariant = (
    process.env.APP_VARIANT ??
    (rawTag.startsWith('patient-app-v')
      ? 'production'
      : rawBranch
      ? ''
      : 'production')
  )
    .trim()
    .toLowerCase();

  const isProduction =
    rawTag.startsWith('patient-app-v') ||
    rawBranch.startsWith('patient-app-v') ||
    (rawVariant === 'production' &&
      (!rawBranch || rawBranch === 'production') &&
      (!rawTag || rawTag.startsWith('patient-app-v')));

  const isStaging =
    !isProduction &&
    rawVariant === 'staging';

  const isDevClient =
    !isProduction &&
    !isStaging &&
    (rawVariant === 'development' || rawBranch === 'dev-client');

  let appName = 'Clinic EZ';
  let channelName = 'production';
  let iosBundleId = BASE_ID;
  let androidPackage = BASE_ID;
  let urlScheme = 'clinicez-patient';
  let sqliteDbName = 'Clinic EZ_patient.db';
  let adaptiveIconBg = '#F0FDF9';

  if (isProduction) {
    appName = 'Clinic EZ';
    channelName = 'production';
    iosBundleId = BASE_ID;
    androidPackage = BASE_ID;
    urlScheme = 'clinicez-patient';
    sqliteDbName = 'Clinic EZ_patient.db';
    adaptiveIconBg = '#F0FDF9';
  } else if (isStaging) {
    appName = 'STG • Clinic EZ';
    channelName = 'staging';
    iosBundleId = `${BASE_ID}.staging`;
    androidPackage = `${BASE_ID}.staging`;
    urlScheme = 'clinicez-patient-staging';
    sqliteDbName = 'Clinic EZ_patient_staging.db';
    adaptiveIconBg = '#FEF3C7';
  } else if (isDevClient) {
    appName = 'DEV • Clinic EZ';
    const devSlug =
      rawBranch && rawBranch !== 'dev-client' ? sanitizeChannelSlug(rawBranch) : 'client';
    channelName = devSlug === 'client' ? 'dev-client' : `dev-${devSlug}`;
    iosBundleId = `${BASE_ID}.dev`;
    androidPackage = `${BASE_ID}.dev`;
    urlScheme = 'clinicez-patient-dev';
    sqliteDbName = 'Clinic EZ_patient_dev.db';
    adaptiveIconBg = '#EDE9FE';
  } else {
    // Arbitrary branch tier
    const branchName = rawBranch || rawVariant || 'preview';
    const channelSlug = sanitizeChannelSlug(branchName);
    const pkgSlug = sanitizePackageSegment(channelSlug);

    appName = `[${branchName}] Clinic EZ`;
    channelName = `br-${channelSlug}`;

    // Support optional shared preview provisioning fallback via env
    iosBundleId =
      process.env.IOS_BUNDLE_IDENTIFIER ??
      process.env.IOS_BUNDLE_ID ??
      (process.env.IOS_SHARED_PREVIEW_BUNDLE_ID === 'true'
        ? `${BASE_ID}.preview`
        : `${BASE_ID}.br-${channelSlug}`);
    androidPackage = `${BASE_ID}.br_${pkgSlug}`;
    urlScheme = `clinicez-patient-br-${channelSlug}`;
    sqliteDbName = `Clinic EZ_patient_br_${pkgSlug}.db`;
    adaptiveIconBg = '#DBEAFE';
  }

  // Ensure every segment of androidPackage is Java-safe
  androidPackage = androidPackage
    .split('.')
    .map((seg) => (JAVA_KEYWORDS.has(seg) ? `pkg_${seg}` : seg))
    .join('.');

  // Build-time google-services.json package verification & dynamic package cloning
  let googleServicesFile: string | undefined = undefined;
  const gsPath =
    process.env.GOOGLE_SERVICES_JSON ?? path.resolve(__dirname, 'google-services.json');
  if (fs.existsSync(gsPath)) {
    try {
      const gsContent = JSON.parse(fs.readFileSync(gsPath, 'utf8'));
      const clients = Array.isArray(gsContent.client) ? gsContent.client : [];
      const clientPackages = clients.map(
        (c: any) => c.client_info?.android_client_info?.package_name
      );
      if (clientPackages.includes(androidPackage)) {
        googleServicesFile = gsPath;
      } else if (clients.length > 0) {
        const baseClient =
          clients.find(
            (c: any) => c.client_info?.android_client_info?.package_name === BASE_ID
          ) ?? clients[0];
        const clonedClient = JSON.parse(JSON.stringify(baseClient));
        if (clonedClient.client_info?.android_client_info) {
          clonedClient.client_info.android_client_info.package_name = androidPackage;
          const generatedGsPath = path.resolve(
            __dirname,
            '.generated-google-services.json'
          );
          fs.writeFileSync(
            generatedGsPath,
            JSON.stringify({ ...gsContent, client: [...clients, clonedClient] }, null, 2),
            'utf8'
          );
          googleServicesFile = generatedGsPath;
        }
      }
    } catch {
      // Omit googleServicesFile if file is unreadable/invalid
    }
  }

  return {
    ...config,
    name: appName,
    owner: 'nextstep-software',
    slug: 'patient-app-bun-56',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    scheme: urlScheme,
    runtimeVersion: { policy: 'appVersion' },
    updates: {
      fallbackToCacheTimeout: 0,
      enabled: true,
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
      requestHeaders: {
        'expo-channel-name': channelName,
      },
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: iosBundleId,
      buildNumber: '2',
      infoPlist: {
        NSFaceIDUsageDescription: 'Clinic EZ uses Face ID to unlock your account securely.',
      },
    },
    android: {
      versionCode: 2,
      adaptiveIcon: {
        backgroundColor: adaptiveIconBg,
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      package: androidPackage,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
      backgroundColor: '#F0FDF9',
      themeColor: '#0D6963',
    },
    plugins: [
      '@clerk/expo',
      'expo-secure-store',
      'expo-local-authentication',
      'expo-updates',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 180,
          resizeMode: 'contain',
          backgroundColor: '#F0FDF9',
          dark: {
            image: './assets/splash-icon.png',
            backgroundColor: '#052E2B',
          },
        },
      ],
      [
        'expo-notifications',
        {
          color: '#0D6963',
          defaultChannel: 'default',
          sounds: [],
          enableBackgroundRemoteNotifications: true,
        },
      ],
    ],
    extra: {
      eas: { projectId: EAS_PROJECT_ID },
      appVariant:
        rawVariant ||
        (isProduction
          ? 'production'
          : isStaging
          ? 'staging'
          : isDevClient
          ? 'development'
          : 'preview'),
      appBranch: rawBranch,
      channel: channelName,
      sqliteDbName,
      dbName: sqliteDbName,
      isProduction,
    },
  };
};
