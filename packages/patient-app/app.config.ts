// Prefer types from '@expo/config' which exports the runtime config types used by
// the Expo tooling. If those types are not available in the environment, the
// compile-time cost is small and we fallback to `any` via `as any` when needed.
import type { ConfigContext, ExpoConfig } from "@expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
	const variant = (
		process.env.APP_VARIANT ||
		process.env.EAS_BUILD_PROFILE ||
		"development"
	).toLowerCase();
	const pretty =
		variant === "production"
			? ""
			: ` (${variant[0].toUpperCase()}${variant.slice(1)})`;

	const baseName = "Clinic EZ : Patient App";
	return {
		...config,
		name: `${baseName}${pretty}`,
		slug: "clinicez-patient-app",
		version: "1.0.1",
		orientation: "portrait",
		icon: "./assets/images/icon.png",
		scheme: "clinicezpatientapp",
		userInterfaceStyle: "automatic",
		ios: {
			supportsTablet: true,
			bundleIdentifier: "com.nextstepsoftware.clinicez.patient",
			icon: {
				light: "./assets/images/ios-icon-default.png",
				dark: "./assets/images/ios-icon-dark.png",
				tinted: "./assets/images/ios-icon-tinted.png",
			},
		},
		android: {
			adaptiveIcon: {
				foregroundImage: "./assets/images/android-icon-foreground.png",
				backgroundColor: "#ffffff",
				monochromeImage: "./assets/images/android-icon-monochrome.png",
				backgroundImage: "./assets/images/android-icon-background.png",
			},
			package: "com.nextstepsoftware.clinicez.patient",
			versionCode: 2,
		},
		web: {
			bundler: "metro",
			output: "static",
			favicon: "./assets/images/favicon.png",
		},
		plugins: [
			"expo-router",
			"expo-secure-store",
			"expo-sqlite",
			"@clerk/expo",
			[
				"expo-splash-screen",
				{
					image: "./assets/images/splash-icon.png",
					resizeMode: "contain",
					backgroundColor: "#ffffff",
				},
			],
		],
		experiments: {
			typedRoutes: true,
		},
		extra: {
			router: {},
			eas: { projectId: "972b1787-7d02-4820-ae35-9a11457d2b8a" },
		},
		runtimeVersion: { policy: "appVersion" },
		updates: {
			fallbackToCacheTimeout: 0,
			enabled: true,
			url: "https://u.expo.dev/972b1787-7d02-4820-ae35-9a11457d2b8a",
		},
	};
};
