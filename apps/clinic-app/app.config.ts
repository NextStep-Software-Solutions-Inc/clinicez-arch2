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
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? "031bb39b-fac2-413c-8e6b-a777f9acabdf";
const ALLOW_CLEARTEXT_LAN = (process.env.ALLOW_CLEARTEXT_LAN ?? 'true') !== 'false';

const appNames: Record<string, string> = {
  development: 'Clinic EZ Clinic Dev',
  'development-standalone': '[development] Clinic EZ Clinic',
  preview: 'Clinic EZ Clinic Preview',
  staging: 'Clinic EZ Clinic Staging',
  production: 'Clinic EZ Clinic',
};

const iosIdSuffix: Record<string, string> = {
  development: '.dev',
  'development-standalone': '.br-development',
  preview: '.preview',
  staging: '.staging',
  production: '',
};

const androidIdSuffix: Record<string, string> = {
  development: '.dev',
  'development-standalone': '.br_development',
  preview: '.preview',
  staging: '.staging',
  production: '',
};

const urlSchemes: Record<string, string> = {
  development: 'clinicez-clinic-dev',
  'development-standalone': 'clinicez-clinic-br-development',
  preview: 'clinicez-clinic-preview',
  staging: 'clinicez-clinic-staging',
  production: 'clinicez-clinic',
};

const channelNames: Record<string, string> = {
  development: 'development',
  'development-standalone': 'br-development',
  preview: 'preview',
  staging: 'staging',
  production: 'production',
};

const IOS_BUNDLE_ID = `com.nextstepsoftware.clinicez.clinic${iosIdSuffix[APP_VARIANT] ?? ''}`;
const ANDROID_PACKAGE = `com.nextstepsoftware.clinicez.clinic${androidIdSuffix[APP_VARIANT] ?? ''}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appNames[APP_VARIANT] ?? 'Clinic EZ Clinic',
  slug: 'clinicez-clinic-app',
  owner: 'nextstep-software',
  version: '1.0.0',
  // Phones are portrait; tablets and the workstation layout use the full screen in any orientation.
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  scheme: urlSchemes[APP_VARIANT] ?? 'clinicez-clinic',
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    fallbackToCacheTimeout: 0,
    enabled: true,
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    requestHeaders: {
      'expo-channel-name': channelNames[APP_VARIANT] ?? 'production',
    },
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: IOS_BUNDLE_ID,
    infoPlist: {
      NSFaceIDUsageDescription: 'Clinic EZ uses Face ID to unlock this device when the clinic server is unreachable.',
      ITSAppUsesNonExemptEncryption: false,
      ...(ALLOW_CLEARTEXT_LAN
        ? { NSAppTransportSecurity: { NSAllowsLocalNetworking: true } }
        : {}),
    },
  },
  android: {
    package: ANDROID_PACKAGE,
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
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
