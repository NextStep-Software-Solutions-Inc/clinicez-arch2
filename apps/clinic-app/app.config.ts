// token-guard:ignore-file (native Expo build configuration colours)
import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Native + web build configuration for the Clinic app.
 *
 * Nothing environment-specific is hardcoded: the EAS project id comes from `EAS_PROJECT_ID`, the build flavour from
 * `APP_VARIANT`, and the clinic server address is entered on the device at first launch (or served via the web
 * deployment's `config.json`). Plain-HTTP LAN servers are allowed by default because most clinics run an on-premise
 * server without a certificate; set `ALLOW_CLEARTEXT_LAN=false` for builds that must only talk HTTPS.
 */
const APP_VARIANT = process.env.APP_VARIANT ?? 'production';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;
const ALLOW_CLEARTEXT_LAN = (process.env.ALLOW_CLEARTEXT_LAN ?? 'true') !== 'false';

const appNames: Record<string, string> = {
  development: 'ClinicEz Clinic Dev',
  preview: 'ClinicEz Clinic Preview',
  staging: 'ClinicEz Clinic Staging',
  production: 'ClinicEz Clinic',
};

const idSuffix: Record<string, string> = {
  development: '.dev',
  preview: '.preview',
  staging: '.staging',
  production: '',
};

const BUNDLE_ID = `com.nextstepsoftware.clinicez.clinic${idSuffix[APP_VARIANT] ?? ''}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appNames[APP_VARIANT] ?? 'ClinicEz Clinic',
  slug: 'clinicez-clinic-app',
  owner: 'nextstep-software',
  version: '1.0.0',
  // Phones are portrait; tablets and the workstation layout use the full screen in any orientation.
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: 'clinicez-clinic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
    infoPlist: {
      NSFaceIDUsageDescription: 'ClinicEz uses Face ID to unlock this device when the clinic server is unreachable.',
      ITSAppUsesNonExemptEncryption: false,
      ...(ALLOW_CLEARTEXT_LAN
        ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } }
        : {}),
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundImage: './assets/android-icon-background.png',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'single',
    name: 'ClinicEz Clinical Workstation',
    shortName: 'ClinicEz',
    favicon: './assets/favicon.png',
    backgroundColor: '#F8FAFC',
    themeColor: '#0D6963',
  },
  plugins: [
    'expo-secure-store',
    'expo-sqlite',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#ffffff' },
    ],
    [
      'expo-local-authentication',
      { faceIDPermission: 'ClinicEz uses Face ID to unlock this device when the clinic server is unreachable.' },
    ],
    ['expo-build-properties', { android: { usesCleartextTraffic: ALLOW_CLEARTEXT_LAN } }],
  ],
  extra: {
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
