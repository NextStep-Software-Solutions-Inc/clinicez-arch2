// token-guard:ignore-file (native Expo build configuration colours)
import type { ExpoConfig, ConfigContext } from 'expo/config';
import * as child_process from 'node:child_process';
import * as crypto from 'node:crypto';

/**
 * Native + web build configuration for the Clinic app.
 *
 * Dynamic 2-tier branching architecture:
 * 1. Independent branch builds: for any git branch (development, main, feat/*, fix/*).
 *    Produces isolated bundle IDs, Android packages, URL schemes, and channels.
 * 2. Production: strictly scoped to release tags (clinic-app-v*) or explicit APP_VARIANT=production.
 * Dev client is strictly manual via workflow_dispatch (APP_VARIANT=development).
 */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? '031bb39b-fac2-413c-8e6b-a777f9acabdf';
const BASE_ID = 'com.nextstepsoftware.clinicez.clinic';
const ALLOW_CLEARTEXT_LAN = (process.env.ALLOW_CLEARTEXT_LAN ?? 'true') !== 'false';

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
    (rawTag.startsWith('clinic-app-v')
      ? 'production'
      : rawBranch
      ? ''
      : 'production')
  )
    .trim()
    .toLowerCase();

  const isProduction =
    rawTag.startsWith('clinic-app-v') ||
    rawBranch.startsWith('clinic-app-v') ||
    (rawVariant === 'production' &&
      (!rawBranch || rawBranch === 'production') &&
      (!rawTag || rawTag.startsWith('clinic-app-v')));

  const isStaging =
    !isProduction &&
    rawVariant === 'staging';

  const isDevClient =
    !isProduction &&
    !isStaging &&
    (rawVariant === 'development' || rawBranch === 'dev-client');

  let appName = 'Clinic EZ Clinic';
  let channelName = 'production';
  let iosBundleId = BASE_ID;
  let androidPackage = BASE_ID;
  let urlScheme = 'clinicez-clinic';

  if (isProduction) {
    appName = 'Clinic EZ Clinic';
    channelName = 'production';
    iosBundleId = BASE_ID;
    androidPackage = BASE_ID;
    urlScheme = 'clinicez-clinic';
  } else if (isStaging) {
    appName = 'STG • Clinic EZ Clinic';
    channelName = 'staging';
    iosBundleId = `${BASE_ID}.staging`;
    androidPackage = `${BASE_ID}.staging`;
    urlScheme = 'clinicez-clinic-staging';
  } else if (isDevClient) {
    appName = 'DEV • Clinic EZ Clinic';
    const devSlug =
      rawBranch && rawBranch !== 'dev-client' ? sanitizeChannelSlug(rawBranch) : 'client';
    channelName = devSlug === 'client' ? 'dev-client' : `dev-${devSlug}`;
    iosBundleId = `${BASE_ID}.dev`;
    androidPackage = `${BASE_ID}.dev`;
    urlScheme = 'clinicez-clinic-dev';
  } else {
    // Independent branch build (development, main, feat/*, fix/*, any arbitrary branch)
    const branchName = rawBranch || rawVariant || 'branch';
    const channelSlug = sanitizeChannelSlug(branchName);
    const pkgSlug = sanitizePackageSegment(channelSlug);

    appName = `[${branchName}] Clinic EZ Clinic`;
    channelName = `br-${channelSlug}`;
    iosBundleId = `${BASE_ID}.br-${channelSlug}`;
    androidPackage = `${BASE_ID}.br_${pkgSlug}`;
    urlScheme = `clinicez-clinic-br-${channelSlug}`;
  }

  // Ensure every segment of androidPackage is Java-safe
  androidPackage = androidPackage
    .split('.')
    .map((seg) => (JAVA_KEYWORDS.has(seg) ? `pkg_${seg}` : seg))
    .join('.');

  return {
    ...config,
    name: appName,
    slug: 'clinicez-clinic-app',
    owner: 'nextstep-software',
    version: '1.0.0',
    // Phones are portrait; tablets and the workstation layout use the full screen in any orientation.
    orientation: 'default',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
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
        NSFaceIDUsageDescription: 'Clinic EZ uses Face ID to unlock this device when the clinic server is unreachable.',
        ITSAppUsesNonExemptEncryption: false,
        ...(ALLOW_CLEARTEXT_LAN
          ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } }
          : {}),
      },
    },
    android: {
      package: androidPackage,
      versionCode: 2,
      adaptiveIcon: {
        backgroundImage: './assets/android-icon-background.png',
        foregroundImage: './assets/android-icon-foreground.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.CAMERA',
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
        'android.permission.VIBRATE',
      ],
    },
    web: {
      bundler: 'metro',
      output: 'single',
      name: 'Clinic EZ Clinical Workstation',
      shortName: 'Clinic EZ',
      favicon: './assets/favicon.png',
      backgroundColor: '#F8FAFC',
      themeColor: '#0D6963',
    },
    plugins: [
      'expo-secure-store',
      'expo-sqlite',
      'expo-updates',
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 180,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            image: './assets/splash-icon.png',
            backgroundColor: '#052E2B',
          },
        },
      ],
      [
        'expo-local-authentication',
        { faceIDPermission: 'Clinic EZ uses Face ID to unlock this device when the clinic server is unreachable.' },
      ],
      ['expo-build-properties', { android: { usesCleartextTraffic: ALLOW_CLEARTEXT_LAN } }],
    ],
    extra: {
      eas: { projectId: EAS_PROJECT_ID },
      appVariant: isProduction ? 'production' : isDevClient ? 'development' : 'branch',
      appBranch: rawBranch,
      channel: channelName,
      isProduction,
    },
  };
};
