import "../../global.css";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	SafeAreaView,
	ScrollView,
	TextInput,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import type { Clinic } from "@/db/schema";
import {
	joinClinicByInviteCode,
	joinClinicManually,
} from "@/services/clinicService";

const GRADIENT: readonly [string, string, string] = [
	"#0f2027",
	"#1a237e",
	"#283593",
];

const INPUT_STYLE = {
	backgroundColor: "rgba(255,255,255,0.12)",
	borderColor: "rgba(255,255,255,0.28)",
	borderWidth: 1,
	borderRadius: 12,
	paddingHorizontal: 16,
	paddingVertical: 13,
	color: "#fff",
	fontSize: 16,
	marginBottom: 12,
};

type Tab = "code" | "manual";

type JoinClinicScreenProps = {
	onJoin: (clinic: Clinic) => void;
	onBack?: () => void;
	onExit?: () => void;
};

export default function JoinClinicScreen({
	onJoin,
	onBack,
	onExit,
}: JoinClinicScreenProps) {
	const [tab, setTab] = useState<Tab>("code");

	const [inviteCode, setInviteCode] = useState("");

	const [clinicName, setClinicName] = useState("");
	const [clinicUrl, setClinicUrl] = useState("");
	const [manualCode, setManualCode] = useState("");

	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const canSubmit =
		!loading &&
		(tab === "code"
			? inviteCode.trim().length > 0
			: clinicName.trim().length > 0 && clinicUrl.trim().length > 0);

	async function handleJoin() {
		setErrorMsg(null);
		setLoading(true);
		try {
			let clinic: Clinic;
			if (tab === "code") {
				if (!inviteCode.trim()) {
					setErrorMsg("Please enter an invite code.");
					return;
				}
				clinic = await joinClinicByInviteCode(inviteCode.trim());
			} else {
				if (!clinicName.trim()) {
					setErrorMsg("Please enter the clinic name.");
					return;
				}
				if (!clinicUrl.trim()) {
					setErrorMsg("Please enter the clinic URL.");
					return;
				}
				clinic = await joinClinicManually(
					clinicName,
					clinicUrl,
					manualCode || undefined,
				);
			}
			onJoin(clinic);
		} catch (e: unknown) {
			setErrorMsg(e instanceof Error ? e.message : "Something went wrong.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<LinearGradient colors={GRADIENT} style={{ flex: 1 }}>
			<SafeAreaView style={{ flex: 1 }}>
				<KeyboardAvoidingView
					style={{ flex: 1 }}
					behavior={Platform.OS === "ios" ? "padding" : "height"}
				>
					<ScrollView
						contentContainerStyle={{
							flexGrow: 1,
							padding: 24,
							justifyContent: "center",
						}}
						keyboardShouldPersistTaps="handled"
					>
						{/* Nav row */}
						<ThemedView className="bg-transparent flex-row justify-between items-center mb-8">
							{onBack ? (
								<Pressable onPress={onBack} hitSlop={16}>
									<ThemedText className="text-white/70 text-sm font-medium">
										← Back
									</ThemedText>
								</Pressable>
							) : (
								<ThemedView className="bg-transparent" />
							)}
							{onExit ? (
								<Pressable onPress={onExit} hitSlop={16}>
									<ThemedText className="text-white/50 text-sm">
										Exit
									</ThemedText>
								</Pressable>
							) : (
								<ThemedView className="bg-transparent" />
							)}
						</ThemedView>

						{/* Header */}
						<ThemedView className="bg-transparent items-center mb-8">
							<ThemedText className="text-white text-3xl font-extrabold tracking-tight mb-2">
								Join Your Clinic
							</ThemedText>
							<ThemedText className="text-white/70 text-sm text-center">
								Connect to your clinic to access appointments, records, and
								more.
							</ThemedText>
						</ThemedView>

						{/* Tab toggle */}
						<ThemedView className="flex-row bg-white/10 rounded-xl p-1 mb-6">
							<Pressable
								onPress={() => {
									setTab("code");
									setErrorMsg(null);
								}}
								style={{
									flex: 1,
									paddingVertical: 10,
									borderRadius: 10,
									backgroundColor:
										tab === "code" ? "rgba(255,255,255,0.18)" : "transparent",
									alignItems: "center",
								}}
							>
								<ThemedText className="text-white text-sm font-semibold">
									Invite Code
								</ThemedText>
							</Pressable>
							<Pressable
								onPress={() => {
									setTab("manual");
									setErrorMsg(null);
								}}
								style={{
									flex: 1,
									paddingVertical: 10,
									borderRadius: 10,
									backgroundColor:
										tab === "manual" ? "rgba(255,255,255,0.18)" : "transparent",
									alignItems: "center",
								}}
							>
								<ThemedText className="text-white text-sm font-semibold">
									Manual Setup
								</ThemedText>
							</Pressable>
						</ThemedView>

						{/* Error */}
						{errorMsg && (
							<ThemedView className="bg-red-500/20 border border-red-400/40 rounded-xl px-4 py-3 mb-4">
								<ThemedText className="text-red-200 text-sm">
									{errorMsg}
								</ThemedText>
							</ThemedView>
						)}

						{/* Invite code tab */}
						{tab === "code" && (
							<ThemedView className="bg-transparent">
								<ThemedText className="text-white/60 text-xs mb-2 ml-1">
									Invite Code
								</ThemedText>
								<TextInput
									style={INPUT_STYLE}
									placeholder="e.g. CLINIC-XYZ123"
									placeholderTextColor="rgba(255,255,255,0.35)"
									value={inviteCode}
									onChangeText={setInviteCode}
									autoCapitalize="characters"
									autoCorrect={false}
								/>
								<ThemedText className="text-white/40 text-xs text-center mt-1 mb-4">
									Your clinic's staff can provide your invite code.
								</ThemedText>
							</ThemedView>
						)}

						{/* Manual setup tab */}
						{tab === "manual" && (
							<ThemedView className="bg-transparent">
								<ThemedText className="text-white/60 text-xs mb-2 ml-1">
									Clinic Name
								</ThemedText>
								<TextInput
									style={INPUT_STYLE}
									placeholder="e.g. Sunrise Medical Clinic"
									placeholderTextColor="rgba(255,255,255,0.35)"
									value={clinicName}
									onChangeText={setClinicName}
									autoCapitalize="words"
								/>
								<ThemedText className="text-white/60 text-xs mb-2 ml-1">
									Clinic Backend URL
								</ThemedText>
								<TextInput
									style={INPUT_STYLE}
									placeholder="https://clinic.example.com"
									placeholderTextColor="rgba(255,255,255,0.35)"
									value={clinicUrl}
									onChangeText={setClinicUrl}
									autoCapitalize="none"
									autoCorrect={false}
									keyboardType="url"
								/>
								<ThemedText className="text-white/60 text-xs mb-2 ml-1">
									Invite Code (optional)
								</ThemedText>
								<TextInput
									style={INPUT_STYLE}
									placeholder="Optional"
									placeholderTextColor="rgba(255,255,255,0.35)"
									value={manualCode}
									onChangeText={setManualCode}
									autoCapitalize="characters"
									autoCorrect={false}
								/>
							</ThemedView>
						)}

						{/* Join button */}
						<Pressable
							onPress={handleJoin}
							disabled={!canSubmit}
							style={{
								backgroundColor: canSubmit
									? "#ffffff"
									: "rgba(255,255,255,0.3)",
								borderRadius: 16,
								paddingVertical: 16,
								alignItems: "center",
								marginTop: 8,
							}}
						>
							{loading ? (
								<ActivityIndicator color="#1a237e" />
							) : (
								<ThemedText
									style={{
										color: canSubmit ? "#1a237e" : "rgba(255,255,255,0.5)",
										fontWeight: "700",
										fontSize: 16,
									}}
								>
									Join Clinic
								</ThemedText>
							)}
						</Pressable>
					</ScrollView>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</LinearGradient>
	);
}
