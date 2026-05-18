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
import { useAuthStore } from "@/stores/authStore";
import migrations from "../drizzle/migrations";
import OnboardingFlow from "../screens/onboarding/OnboardingFlow";
import PinScreen from "../screens/PinScreen";

const DEBUG_ALWAYS_SHOW_ONBOARDING = false;

export default function RootLayout() {
	const colorScheme = useColorScheme();
	const { status, bootstrap, completeOnboarding } = useAuthStore();
	const [dbReady, setDbReady] = useState(false);

	const [loaded] = useFonts({
		"SF-Pro": require("../assets/fonts/SF-Pro.ttf"),
	});

	useEffect(() => {
		async function init() {
			await migrate(db, migrations);
			await pruneAuditLogs();
			if (DEBUG_ALWAYS_SHOW_ONBOARDING) {
				useAuthStore.setState({ status: "onboarding" });
				setDbReady(true);
				return;
			}
			await bootstrap();
			setDbReady(true);
		}
		init().catch(console.error);
	}, [bootstrap]);

	if (!loaded || !dbReady || status === "loading") {
		return null;
	}

	// Onboarding — rendered outside the Stack (same pattern as before)
	if (status === "onboarding") {
		return (
			<GestureHandlerRootView style={{ flex: 1 }}>
				<ThemeProvider
					value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
				>
					<OnboardingFlow onFinish={completeOnboarding} />
					<StatusBar style="auto" />
				</ThemeProvider>
			</GestureHandlerRootView>
		);
	}

	// Auth gate — PIN setup, locked, or biometrics offer
	if (
		status === "setup_pin" ||
		status === "locked" ||
		status === "biometrics_offer"
	) {
		return (
			<GestureHandlerRootView style={{ flex: 1 }}>
				<ThemeProvider
					value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
				>
					<PinScreen />
					<StatusBar style="auto" />
				</ThemeProvider>
			</GestureHandlerRootView>
		);
	}

	// Authenticated — full app
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<ClinicProvider>
				<ThemeProvider
					value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
				>
					<Stack>
						<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
						<Stack.Screen name="+not-found" />
					</Stack>
					<StatusBar style="auto" />
				</ThemeProvider>
			</ClinicProvider>
		</GestureHandlerRootView>
	);
}
