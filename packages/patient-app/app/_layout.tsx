import { ClerkProvider, useAuth, useUser } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider,
} from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ClinicProvider } from "../components/ClinicContext";
import "react-native-reanimated";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { db, pruneAuditLogs } from "@/db";
import { useColorScheme } from "@/hooks/useColorScheme";
import ConfigErrorScreen from "@/screens/system/ConfigErrorScreen";
import {
	getAppConfigIssues,
	getClerkPublishableKey,
} from "@/services/appConfig";
import { seedPatientFromClerk } from "@/services/patientService";
import { useAuthStore } from "@/stores/authStore";
import migrations from "../drizzle/migrations";
import OnboardingFlow from "../screens/onboarding/OnboardingFlow";
import PinScreen from "../screens/PinScreen";

SplashScreen.setOptions({
	duration: 500, // Minimum duration to show the splash screen (in milliseconds)
	fade: true, // Whether to fade out the splash screen when hiding
});

const APP_CONFIG_ISSUES = getAppConfigIssues();
const CLERK_PUBLISHABLE_KEY = getClerkPublishableKey();

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function AppContent() {
	const colorScheme = useColorScheme();
	const {
		isSignedIn,
		isLoaded: clerkLoaded,
		signOut: clerkSignOut,
	} = useAuth();
	const { user: clerkUser } = useUser();
	const {
		status,
		bootstrap,
		completeOnboarding,
		storeUserIdentity,
		signOut: resetAuthSession,
	} = useAuthStore();
	const [dbReady, setDbReady] = useState(false);
	const [startupError, setStartupError] = useState<string | null>(null);
	const [startupTimeout, setStartupTimeout] = useState(false);

	const [loaded, fontLoadError] = useFonts({
		"SF-Pro": require("../assets/fonts/SF-Pro.ttf"),
		"SpaceMono-Regular": require("../assets/fonts/SpaceMono-Regular.ttf"),
	});

	useEffect(() => {
		async function init() {
			try {
				const timeoutId = setTimeout(() => {
					console.warn("App startup timeout after 15 seconds");
					setStartupTimeout(true);
					SplashScreen.hideAsync().catch(console.error);
				}, 15000);

				await migrate(db, migrations);
				await pruneAuditLogs();
				await bootstrap();
				setDbReady(true);
				clearTimeout(timeoutId);
			} catch (error) {
				console.error("[STARTUP_ERROR]", error);
				setStartupError(getErrorMessage(error));
				SplashScreen.hideAsync().catch(console.error);
			}
		}
		init();
	}, [bootstrap]);

	// Hide splash screen once DB and fonts are ready
	useEffect(() => {
		if (loaded && dbReady) {
			SplashScreen.hideAsync().catch(console.error);
		}
	}, [loaded, dbReady]);

	// Fallback: hide splash if Clerk is loaded but app state not ready
	useEffect(() => {
		if (clerkLoaded && startupTimeout) {
			SplashScreen.hideAsync().catch(console.error);
		}
	}, [clerkLoaded, startupTimeout]);

	// Seed patient row and persist identity as soon as Clerk user is available and DB is ready
	useEffect(() => {
		if (dbReady && isSignedIn && clerkUser) {
			seedPatientFromClerk({
				id: clerkUser.id,
				firstName: clerkUser.firstName,
				lastName: clerkUser.lastName,
				primaryEmailAddress: clerkUser.primaryEmailAddress ?? null,
				imageUrl: clerkUser.imageUrl ?? null,
			}).catch(console.error);

			const name =
				[clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
				null;
			const email = clerkUser.primaryEmailAddress?.emailAddress ?? null;
			const avatarUrl = clerkUser.imageUrl ?? null;
			storeUserIdentity({
				clerkId: clerkUser.id,
				name,
				email,
				avatarUrl,
			}).catch(console.error);
		}
	}, [dbReady, isSignedIn, clerkUser, storeUserIdentity]);

	// If Clerk session is no longer valid, force local sign-out so the user can log in again.
	useEffect(() => {
		if (!clerkLoaded || isSignedIn) return;
		if (status === "loading" || status === "onboarding") return;
		resetAuthSession(clerkSignOut).catch((error) => {
			console.error("[AUTH_SIGNOUT_FALLBACK]", error);
		});
	}, [clerkLoaded, isSignedIn, status, resetAuthSession, clerkSignOut]);

	if (startupError || fontLoadError) {
		return (
			<ConfigErrorScreen
				runtimeErrors={[
					...(startupError ? [startupError] : []),
					...(fontLoadError ? [getErrorMessage(fontLoadError)] : []),
				]}
			/>
		);
	}

	if (startupTimeout) {
		return (
			<ConfigErrorScreen
				runtimeErrors={[
					"App startup timed out. This usually means:",
					"1. Check if Metro bundler is running (pnpm start)",
					"2. Check device logs: adb logcat or Xcode console",
					"3. Check network connectivity to Metro",
					`\nDebug: loaded=${loaded}, dbReady=${dbReady}, status=${status}, clerkLoaded=${clerkLoaded}`,
				]}
			/>
		);
	}

	if (!loaded || !dbReady || status === "loading" || !clerkLoaded) {
		return null;
	}

	if (status === "onboarding") {
		return (
			<ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
				<OnboardingFlow onFinish={completeOnboarding} />
				<StatusBar style="auto" />
			</ThemeProvider>
		);
	}

	if (
		status === "setup_pin" ||
		status === "locked" ||
		status === "biometrics_offer"
	) {
		return (
			<ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
				<PinScreen />
				<StatusBar style="auto" />
			</ThemeProvider>
		);
	}

	return (
		<ClinicProvider>
			<ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
				<Stack>
					<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
					<Stack.Screen name="+not-found" />
					<Stack.Screen name="settings" options={{ title: "Settings" }} />
				</Stack>
				<StatusBar style="auto" />
			</ThemeProvider>
		</ClinicProvider>
	);
}

export default function RootLayout() {
	if (APP_CONFIG_ISSUES.length > 0) {
		return (
			<SafeAreaProvider>
				<GestureHandlerRootView className="flex-1">
					<ConfigErrorScreen configIssues={APP_CONFIG_ISSUES} />
				</GestureHandlerRootView>
			</SafeAreaProvider>
		);
	}

	return (
		<SafeAreaProvider>
			<ClerkProvider
				publishableKey={CLERK_PUBLISHABLE_KEY ?? ""}
				tokenCache={tokenCache}
			>
				<GestureHandlerRootView className="flex-1">
					<AppContent />
				</GestureHandlerRootView>
			</ClerkProvider>
		</SafeAreaProvider>
	);
}
