import "../global.css";
import { useClerk } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Switch } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import {
	StorageKey,
	secureDel,
	secureGet,
	secureSet,
} from "@/services/secureStorage";
import { useAuthStore } from "@/stores/authStore";

export default function SettingsScreen() {
	const { signOut } = useClerk();
	const {
		lock,
		biometricsAvailable,
		biometricsEnabled,
		biometricType,
		enableBiometrics,
		disableBiometrics,
	} = useAuthStore();
	const [debugAlwaysOnboard, setDebugAlwaysOnboard] = useState(false);

	useEffect(() => {
		secureGet(StorageKey.DEBUG_ALWAYS_ONBOARD).then((val) => {
			setDebugAlwaysOnboard(val === "true");
		});
	}, []);

	async function toggleDebug(value: boolean) {
		setDebugAlwaysOnboard(value);
		if (value) {
			await secureSet(StorageKey.DEBUG_ALWAYS_ONBOARD, "true");
		} else {
			await secureDel(StorageKey.DEBUG_ALWAYS_ONBOARD);
		}
	}

	function handleSignOut() {
		Alert.alert("Sign Out", "Are you sure you want to sign out?", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Sign Out",
				style: "destructive",
				onPress: async () => {
					await signOut();
					lock();
				},
			},
		]);
	}

	return (
		<ScrollView className="flex-1 bg-white dark:bg-slate-900">
			{/* DEBUG section */}
			<ThemedView className="mx-4 mt-6 mb-2">
				<ThemedText className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 px-1">
					Debug
				</ThemedText>
			</ThemedView>
			<ThemedView className="mx-4 rounded-2xl bg-slate-50 dark:bg-slate-800 overflow-hidden">
				<ThemedView className="flex-row items-center justify-between px-4 py-4">
					<ThemedView className="flex-1 pr-4 bg-transparent">
						<ThemedText className="text-base font-medium text-slate-800 dark:text-slate-100">
							Always show onboarding on startup
						</ThemedText>
						<ThemedText className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
							Forces onboarding flow every time the app opens
						</ThemedText>
					</ThemedView>
					<Switch
						value={debugAlwaysOnboard}
						onValueChange={toggleDebug}
						trackColor={{ false: "#d1d5db", true: "#3b82f6" }}
						thumbColor={debugAlwaysOnboard ? "#1d4ed8" : "#f3f4f6"}
					/>
				</ThemedView>
			</ThemedView>

			{/* Security section — only shown when device supports biometrics */}
			{biometricsAvailable && (
				<>
					<ThemedView className="mx-4 mt-6 mb-2">
						<ThemedText className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 px-1">
							Security
						</ThemedText>
					</ThemedView>
					<ThemedView className="mx-4 rounded-2xl bg-slate-50 dark:bg-slate-800 overflow-hidden">
						<ThemedView className="flex-row items-center justify-between px-4 py-4">
							<ThemedView className="flex-row items-center flex-1 pr-4 bg-transparent">
								<Feather
									name={biometricType === "face" ? "aperture" : "shield"}
									size={20}
									color="#0a7ea4"
								/>
								<ThemedView className="ml-3 bg-transparent">
									<ThemedText className="text-base font-medium text-slate-800 dark:text-slate-100">
										{biometricType === "face" ? "Face ID" : "Fingerprint"}
									</ThemedText>
									<ThemedText className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
										Unlock the app with{" "}
										{biometricType === "face" ? "Face ID" : "your fingerprint"}
									</ThemedText>
								</ThemedView>
							</ThemedView>
							<Switch
								value={biometricsEnabled}
								onValueChange={async (val) => {
									if (val) await enableBiometrics();
									else await disableBiometrics();
								}}
								trackColor={{ false: "#d1d5db", true: "#0a7ea4" }}
								thumbColor={biometricsEnabled ? "#fff" : "#f3f4f6"}
							/>
						</ThemedView>
					</ThemedView>
				</>
			)}

			{/* Account section */}
			<ThemedView className="mx-4 mt-6 mb-2">
				<ThemedText className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 px-1">
					Account
				</ThemedText>
			</ThemedView>
			<ThemedView className="mx-4 rounded-2xl bg-slate-50 dark:bg-slate-800 overflow-hidden">
				<Pressable
					onPress={handleSignOut}
					className="px-4 py-4 active:opacity-60"
					android_ripple={{ color: "#fee2e2" }}
				>
					<ThemedText className="text-base font-medium text-red-500">
						Sign Out
					</ThemedText>
				</Pressable>
			</ThemedView>
		</ScrollView>
	);
}
