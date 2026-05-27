import "../global.css";
import { useClerk, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
	Alert,
	Modal,
	Pressable,
	ScrollView,
	Switch,
	TextInput,
	TouchableOpacity,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useColorScheme } from "@/hooks/useColorScheme";
import { audit } from "@/services/auditLogger";
import {
	createPin,
	verifyPin as verifySensitivePin,
} from "@/services/authService";
import {
	StorageKey,
	secureDel,
	secureGet,
	secureSet,
} from "@/services/secureStorage";
import { useAuthStore } from "@/stores/authStore";

const PIN_LENGTH = 6;

function PasswordInput({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	const scheme = useColorScheme();
	return (
		<ThemedView className="mb-3 bg-transparent">
			<ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-1">
				{label}
			</ThemedText>
			<TextInput
				value={value}
				onChangeText={onChange}
				secureTextEntry
				autoCapitalize="none"
				autoCorrect={false}
				style={{
					borderWidth: 1,
					borderColor: scheme === "dark" ? "#475569" : "#e2e8f0",
					borderRadius: 10,
					paddingHorizontal: 12,
					paddingVertical: 10,
					fontSize: 14,
					color: scheme === "dark" ? "#f1f5f9" : "#1e293b",
					backgroundColor: scheme === "dark" ? "#0f172a" : "#f8fafc",
				}}
			/>
		</ThemedView>
	);
}

function PinInput({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	const scheme = useColorScheme();
	return (
		<ThemedView className="mb-3 bg-transparent">
			<ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-1">
				{label}
			</ThemedText>
			<TextInput
				value={value}
				onChangeText={(text) =>
					onChange(text.replace(/[^0-9]/g, "").slice(0, PIN_LENGTH))
				}
				secureTextEntry
				keyboardType="number-pad"
				maxLength={PIN_LENGTH}
				style={{
					borderWidth: 1,
					borderColor: scheme === "dark" ? "#475569" : "#e2e8f0",
					borderRadius: 10,
					paddingHorizontal: 12,
					paddingVertical: 10,
					fontSize: 14,
					color: scheme === "dark" ? "#f1f5f9" : "#1e293b",
					backgroundColor: scheme === "dark" ? "#0f172a" : "#f8fafc",
				}}
			/>
		</ThemedView>
	);
}

function SecurityRow({
	label,
	description,
	onPress,
}: {
	label: string;
	description: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			className="px-4 py-4 active:opacity-60 border-b border-slate-200 dark:border-slate-700"
		>
			<ThemedText className="text-base font-medium text-slate-800 dark:text-slate-100">
				{label}
			</ThemedText>
			<ThemedText className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
				{description}
			</ThemedText>
		</Pressable>
	);
}

export default function SettingsScreen() {
	const { signOut } = useClerk();
	const { user } = useUser();
	const {
		lock,
		biometricsAvailable,
		biometricsEnabled,
		biometricType,
		enableBiometrics,
		disableBiometrics,
	} = useAuthStore();
	const [debugAlwaysOnboard, setDebugAlwaysOnboard] = useState(false);
	const [passwordModalVisible, setPasswordModalVisible] = useState(false);
	const [changePinModalVisible, setChangePinModalVisible] = useState(false);
	const [pinPromptVisible, setPinPromptVisible] = useState(false);
	const [pinPromptValue, setPinPromptValue] = useState("");
	const [pinPromptError, setPinPromptError] = useState<string | null>(null);
	const [pinPromptActionLabel, setPinPromptActionLabel] = useState("");
	const pendingSecurityActionRef = useRef<(() => Promise<void>) | null>(null);

	const [passwordForm, setPasswordForm] = useState({
		currentPassword: "",
		newPassword: "",
		confirmPassword: "",
	});
	const [changePinForm, setChangePinForm] = useState({
		newPin: "",
		confirmNewPin: "",
	});

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

	function requirePinForAction(
		actionLabel: string,
		action: () => Promise<void>,
	) {
		pendingSecurityActionRef.current = action;
		setPinPromptActionLabel(actionLabel);
		setPinPromptValue("");
		setPinPromptError(null);
		setPinPromptVisible(true);
	}

	async function confirmSecurityPin() {
		if (pinPromptValue.length !== PIN_LENGTH) {
			setPinPromptError("PIN must be 6 digits.");
			return;
		}

		const ok = await verifySensitivePin(pinPromptValue, 1);
		if (!ok) {
			audit.warn("SECURITY", "SETTINGS_PIN_CONFIRM_FAILED", {
				action: pinPromptActionLabel,
			});
			setPinPromptError("Incorrect PIN.");
			return;
		}

		audit.info("SECURITY", "SETTINGS_PIN_CONFIRM_SUCCESS", {
			action: pinPromptActionLabel,
		});

		setPinPromptVisible(false);
		setPinPromptValue("");
		setPinPromptError(null);

		try {
			await pendingSecurityActionRef.current?.();
		} catch (error) {
			Alert.alert(
				"Action Failed",
				error instanceof Error
					? error.message
					: "Unable to apply security change.",
			);
		}
	}

	function submitPasswordUpdate() {
		if (!passwordForm.currentPassword || !passwordForm.newPassword) {
			Alert.alert("Missing Fields", "Current and new password are required.");
			return;
		}

		if (passwordForm.newPassword !== passwordForm.confirmPassword) {
			Alert.alert(
				"Password Mismatch",
				"New password and confirmation must match.",
			);
			return;
		}

		if (passwordForm.newPassword.length < 8) {
			Alert.alert(
				"Weak Password",
				"New password must be at least 8 characters.",
			);
			return;
		}

		requirePinForAction("update password", async () => {
			if (!user) {
				throw new Error("User session is unavailable.");
			}

			const maybeUpdatePassword = (
				user as unknown as {
					updatePassword?: (params: {
						currentPassword: string;
						newPassword: string;
					}) => Promise<void>;
				}
			).updatePassword;

			if (!maybeUpdatePassword) {
				throw new Error("Password update is unavailable in this build.");
			}

			await maybeUpdatePassword({
				currentPassword: passwordForm.currentPassword,
				newPassword: passwordForm.newPassword,
			});
			audit.info("SECURITY", "PASSWORD_UPDATED_FROM_SETTINGS");

			setPasswordModalVisible(false);
			setPasswordForm({
				currentPassword: "",
				newPassword: "",
				confirmPassword: "",
			});
			Alert.alert(
				"Password Updated",
				"Your password was updated successfully.",
			);
		});
	}

	function submitPinChange() {
		if (changePinForm.newPin.length !== PIN_LENGTH) {
			Alert.alert("Invalid PIN", "New PIN must be exactly 6 digits.");
			return;
		}

		if (changePinForm.newPin !== changePinForm.confirmNewPin) {
			Alert.alert("PIN Mismatch", "PIN and confirmation must match.");
			return;
		}

		requirePinForAction("change PIN", async () => {
			await createPin(changePinForm.newPin);
			audit.info("SECURITY", "PIN_UPDATED_FROM_SETTINGS");
			setChangePinModalVisible(false);
			setChangePinForm({ newPin: "", confirmNewPin: "" });
			Alert.alert("PIN Updated", "Your PIN was changed successfully.");
		});
	}

	return (
		<>
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

				{/* Security section */}
				<ThemedView className="mx-4 mt-6 mb-2">
					<ThemedText className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 px-1">
						Security
					</ThemedText>
				</ThemedView>
				<ThemedView className="mx-4 rounded-2xl bg-slate-50 dark:bg-slate-800 overflow-hidden">
					<SecurityRow
						label="Update Password"
						description="Change your account password using current credentials"
						onPress={() => setPasswordModalVisible(true)}
					/>
					<SecurityRow
						label="Change PIN"
						description="Set a new 6-digit app unlock PIN"
						onPress={() => setChangePinModalVisible(true)}
					/>
					<ThemedView className="flex-row items-center justify-between px-4 py-4 bg-transparent">
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
									{biometricsAvailable
										? `Unlock the app with ${biometricType === "face" ? "Face ID" : "your fingerprint"}`
										: "Biometrics unavailable on this device"}
								</ThemedText>
							</ThemedView>
						</ThemedView>
						<Switch
							value={biometricsEnabled}
							disabled={!biometricsAvailable}
							onValueChange={(val) => {
								requirePinForAction(
									val ? "enable biometrics" : "disable biometrics",
									async () => {
										if (val) {
											await enableBiometrics();
											audit.info(
												"SECURITY",
												"BIOMETRICS_ENABLED_FROM_SETTINGS",
											);
										} else {
											await disableBiometrics();
											audit.info(
												"SECURITY",
												"BIOMETRICS_DISABLED_FROM_SETTINGS",
											);
										}
									},
								);
							}}
							trackColor={{ false: "#d1d5db", true: "#0a7ea4" }}
							thumbColor={biometricsEnabled ? "#fff" : "#f3f4f6"}
						/>
					</ThemedView>
				</ThemedView>

				{/* Account section */}
				<ThemedView className="mx-4 mt-6 mb-2">
					<ThemedText className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1 px-1">
						Account
					</ThemedText>
				</ThemedView>
				<ThemedView className="mx-4 mb-8 rounded-2xl bg-slate-50 dark:bg-slate-800 overflow-hidden">
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

			<Modal
				visible={pinPromptVisible}
				transparent
				animationType="fade"
				onRequestClose={() => setPinPromptVisible(false)}
			>
				<ThemedView className="flex-1 bg-black/45 items-center justify-center px-6">
					<ThemedView className="w-full rounded-2xl bg-white dark:bg-slate-800 p-5">
						<ThemedText className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
							Confirm PIN
						</ThemedText>
						<ThemedText className="text-sm text-slate-500 dark:text-slate-400 mb-4">
							Enter your PIN to {pinPromptActionLabel}.
						</ThemedText>

						<PinInput
							label="Current PIN"
							value={pinPromptValue}
							onChange={setPinPromptValue}
						/>

						{pinPromptError ? (
							<ThemedText className="text-xs text-red-500 mb-3">
								{pinPromptError}
							</ThemedText>
						) : null}

						<ThemedView className="flex-row items-center justify-end gap-2 bg-transparent">
							<TouchableOpacity
								onPress={() => setPinPromptVisible(false)}
								className="px-4 py-2 rounded-lg"
							>
								<ThemedText className="text-slate-500 dark:text-slate-400 font-semibold">
									Cancel
								</ThemedText>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={confirmSecurityPin}
								className="px-4 py-2 rounded-lg bg-blue-600"
							>
								<ThemedText className="text-white font-semibold">
									Confirm
								</ThemedText>
							</TouchableOpacity>
						</ThemedView>
					</ThemedView>
				</ThemedView>
			</Modal>

			<Modal
				visible={passwordModalVisible}
				transparent
				animationType="slide"
				onRequestClose={() => setPasswordModalVisible(false)}
			>
				<ThemedView className="flex-1 bg-black/45 justify-end">
					<ThemedView className="rounded-t-3xl bg-white dark:bg-slate-800 p-5 pb-8">
						<ThemedText className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
							Update Password
						</ThemedText>

						<PasswordInput
							label="Current Password"
							value={passwordForm.currentPassword}
							onChange={(v) =>
								setPasswordForm((prev) => ({ ...prev, currentPassword: v }))
							}
						/>
						<PasswordInput
							label="New Password"
							value={passwordForm.newPassword}
							onChange={(v) =>
								setPasswordForm((prev) => ({ ...prev, newPassword: v }))
							}
						/>
						<PasswordInput
							label="Confirm New Password"
							value={passwordForm.confirmPassword}
							onChange={(v) =>
								setPasswordForm((prev) => ({ ...prev, confirmPassword: v }))
							}
						/>

						<ThemedView className="flex-row items-center justify-end gap-2 mt-2 bg-transparent">
							<TouchableOpacity
								onPress={() => setPasswordModalVisible(false)}
								className="px-4 py-2 rounded-lg"
							>
								<ThemedText className="text-slate-500 dark:text-slate-400 font-semibold">
									Cancel
								</ThemedText>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={submitPasswordUpdate}
								className="px-4 py-2 rounded-lg bg-blue-600"
							>
								<ThemedText className="text-white font-semibold">
									Update
								</ThemedText>
							</TouchableOpacity>
						</ThemedView>
					</ThemedView>
				</ThemedView>
			</Modal>

			<Modal
				visible={changePinModalVisible}
				transparent
				animationType="slide"
				onRequestClose={() => setChangePinModalVisible(false)}
			>
				<ThemedView className="flex-1 bg-black/45 justify-end">
					<ThemedView className="rounded-t-3xl bg-white dark:bg-slate-800 p-5 pb-8">
						<ThemedText className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
							Change PIN
						</ThemedText>
						<ThemedText className="text-sm text-slate-500 dark:text-slate-400 mb-4">
							Enter a new 6-digit PIN. You will confirm your current PIN before
							applying.
						</ThemedText>

						<PinInput
							label="New PIN"
							value={changePinForm.newPin}
							onChange={(v) =>
								setChangePinForm((prev) => ({ ...prev, newPin: v }))
							}
						/>
						<PinInput
							label="Confirm New PIN"
							value={changePinForm.confirmNewPin}
							onChange={(v) =>
								setChangePinForm((prev) => ({ ...prev, confirmNewPin: v }))
							}
						/>

						<ThemedView className="flex-row items-center justify-end gap-2 mt-2 bg-transparent">
							<TouchableOpacity
								onPress={() => setChangePinModalVisible(false)}
								className="px-4 py-2 rounded-lg"
							>
								<ThemedText className="text-slate-500 dark:text-slate-400 font-semibold">
									Cancel
								</ThemedText>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={submitPinChange}
								className="px-4 py-2 rounded-lg bg-blue-600"
							>
								<ThemedText className="text-white font-semibold">
									Change PIN
								</ThemedText>
							</TouchableOpacity>
						</ThemedView>
					</ThemedView>
				</ThemedView>
			</Modal>
		</>
	);
}
