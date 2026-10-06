import type { ExpoConfig, ConfigContext } from 'expo/config';

const EAS_PROJECT_ID = 'b73e0d31-2001-40df-b1a1-0482faebb5b1';
const APP_VARIANT = process.env.APP_VARIANT ?? 'production';

const appNames: Record<string, string> = {
    development: 'Clinic EZ Patient Dev',
    preview: 'Clinic EZ Patient Preview',
    staging: 'Clinic EZ Patient Staging',
    production: 'Clinic EZ Patient',
};


export default ({ config }: ConfigContext): ExpoConfig =>
({
    ...config,
    name: appNames[APP_VARIANT] ?? 'Clinic EZ',
    owner: 'nextstep-software',
    slug: 'PatientAppFE',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    runtimeVersion: { policy: 'appVersion' },
    updates: {
        fallbackToCacheTimeout: 0,
        enabled: true,
        url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
    ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.nextstepsoftware.Clinic EZ.patient',
        infoPlist: {
            NSFaceIDUsageDescription: 'Clinic EZ uses Face ID to unlock your account securely.',
        },
    },
    android: {
        adaptiveIcon: {
            backgroundColor: '#E6F4FE',
            foregroundImage: './assets/android-icon-foreground.png',
            backgroundImage: './assets/android-icon-background.png',
            monochromeImage: './assets/android-icon-monochrome.png',
        },
        predictiveBackGestureEnabled: false,
        package: 'com.nextstepsoftware.Clinic EZ.patient',
        // ⬇ Place your google-services.json at the project root before running
        //   an EAS build or `expo run:android` on a physical device.
        //   Without this file push tokens will not be issued on Android.
        googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    },
    web: {
        favicon: './assets/favicon.png',
        bundler: 'metro',
    },
    plugins: [
        '@clerk/expo',
        'expo-secure-store',
        'expo-local-authentication',
        'expo-updates',
        [
            'expo-notifications',
            {
                // Replace with a real 96×96 white-on-transparent PNG before releasing.
                // The file must exist at build time or the build will fail.
                // icon: './assets/notification-icon.png',
                color: '#3B82F6',
                defaultChannel: 'default',
                sounds: [],
                // Enables background push delivery on iOS (content-available: 1).
                // Required for the BACKGROUND_NOTIFICATION_TASK to fire.
                enableBackgroundRemoteNotifications: true,
            },
        ],
    ],
    extra: {
        eas: { projectId: EAS_PROJECT_ID },
    },
});
