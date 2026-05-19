import { ClerkProvider, useAuth, useUser } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
	DarkTheme,
	DefaultTheme,
	ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ClinicProvider } from "../components/ClinicContext";
import "react-native-reanimated";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { db, pruneAuditLogs } from "@/db";
import { useColorScheme } from "@/hooks/useColorScheme";
import {
	getAppConfigIssues,
	getClerkPublishableKey,
} from "@/services/appConfig";
import { seedPatientFromClerk } from "@/services/patientService";
import { useAuthStore } from "@/stores/authStore";
import migrations from "../drizzle/migrations";
import ConfigErrorScreen from "@/screens/system/ConfigErrorScreen";
import OnboardingFlow from "../screens/onboarding/OnboardingFlow";
import PinScreen from "../screens/PinScreen";

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
	const { isSignedIn, isLoaded: clerkLoaded } = useAuth();
	const { user: clerkUser } = useUser();
	const { status, bootstrap, completeOnboarding, storeUserIdentity } =
		useAuthStore();
	const [dbReady, setDbReady] = useState(false);
	const [startupError, setStartupError] = useState<string | null>(null);

	const [loaded, fontLoadError] = useFonts({
		"SF-Pro": require("../assets/fonts/SF-Pro.ttf"),
	});

	useEffect(() => {
		async function init() {
			await migrate(db, migrations);
			await pruneAuditLogs();
			await bootstrap();
			setDbReady(true);
		}
		init().catch((error) => {
			console.error(error);
			setStartupError(getErrorMessage(error));
		});
	}, [bootstrap]);

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
			<GestureHandlerRootView style={{ flex: 1 }}>
				<ConfigErrorScreen configIssues={APP_CONFIG_ISSUES} />
			</GestureHandlerRootView>
		);
	}

	return (
		<ClerkProvider
			publishableKey={CLERK_PUBLISHABLE_KEY!}
			tokenCache={tokenCache}
		>
			<GestureHandlerRootView style={{ flex: 1 }}>
				<AppContent />
			</GestureHandlerRootView>
		</ClerkProvider>
	);
}
