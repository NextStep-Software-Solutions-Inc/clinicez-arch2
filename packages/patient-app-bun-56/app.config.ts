import type { ExpoConfig, ConfigContext } from 'expo/config';

const EAS_PROJECT_ID = 'b73e0d31-2001-40df-b1a1-0482faebb5b1';
const APP_VARIANT = process.env.APP_VARIANT ?? 'production';

const appNames: Record<string, string> = {
    development: 'Clinic EZ Dev',
    preview: 'Clinic EZ Preview',
    staging: 'Clinic EZ Staging',
    production: 'Clinic EZ',
};

export default ({ config }: ConfigContext): ExpoConfig => ({
    ...config,
    name: appNames[APP_VARIANT] ?? 'ClinicEZ',
    owner: 'nextstep-software',
    slug: 'patient-app-bun-56',
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
        infoPlist: {
            NSFaceIDUsageDescription: 'ClinicEZ uses Face ID to unlock your account securely.',
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
        package: 'com.wacanam.patientappbun56',
    },
    web: {
        favicon: './assets/favicon.png',
    },
    plugins: [
        '@clerk/expo',
        'expo-secure-store',
        'expo-local-authentication',
        'expo-updates',
    ],
    extra: {
        eas: { projectId: EAS_PROJECT_ID },
    },
});
