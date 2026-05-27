import "../../global.css";
import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useClerkAuthFlow } from "@/hooks/useClerkAuthFlow";
import { AuthFormStep } from "./steps/AuthFormStep";
import { CodeVerifiedStep } from "./steps/CodeVerifiedStep";
import { ForgotPasswordStep } from "./steps/ForgotPasswordStep";
import { NewPasswordStep } from "./steps/NewPasswordStep";
import { ResetPasswordStep } from "./steps/ResetPasswordStep";
import { VerifyEmailStep } from "./steps/VerifyEmailStep";

type Props = {
	onNext: () => void;
	onBack: () => void;
	initialMode?: "signUp" | "signIn";
};

const GRADIENT: readonly [string, string, string] = [
	"#0f2027",
	"#1565c0",
	"#0ea5e9",
];

export default function ClerkAuthScreen({
	onNext,
	onBack,
	initialMode,
}: Props) {
	const { isSignedIn } = useAuth();
	const auth = useClerkAuthFlow(onNext, initialMode);
	const [email, setEmail] = useState("");
	const [verifyCode, setVerifyCode] = useState("");

	useEffect(() => {
		if (isSignedIn) onNext();
	}, [isSignedIn, onNext]);

	function handleBackPress() {
		auth.resetError();
		switch (auth.step) {
			case "forgotPassword":
				auth.setStep("form");
				break;
			case "resetPassword":
				auth.setStep("forgotPassword");
				break;
			case "codeVerified":
				setVerifyCode("");
				auth.setStep("resetPassword");
				break;
			case "enterNewPassword":
				auth.setStep("codeVerified");
				break;
			case "verify":
				setVerifyCode("");
				auth.setStep("form");
				break;
			default:
				onBack();
		}
	}

	function renderStep() {
		switch (auth.step) {
			case "form":
				return (
					<AuthFormStep
						mode={auth.mode}
						email={email}
						setEmail={setEmail}
						loading={auth.loading}
						showModeToggle={!initialMode}
						onSwitchMode={auth.switchMode}
						onSignUp={(e, p, f) => auth.handleSignUp(e, p, f)}
						onSignIn={(e, p) => auth.handleSignIn(e, p)}
						onForgotPassword={() => {
							auth.resetError();
							auth.setStep("forgotPassword");
						}}
					/>
				);
			case "verify":
				setVerifyCode("");
				auth.setStep("form");
				return (
					<VerifyEmailStep
						email={email}
						verifyCode={verifyCode}
						setVerifyCode={setVerifyCode}
						loading={auth.loading}
						onSubmit={() =>
							auth.mode === "signUp"
								? auth.handleVerifySignUp(verifyCode)
								: auth.handleVerifySignIn(verifyCode)
						}
						onChangeEmail={handleBackPress}
					/>
				);
			case "forgotPassword":
				return (
					<ForgotPasswordStep
						email={email}
						setEmail={setEmail}
						loading={auth.loading}
						onSubmit={() => auth.handleForgotPassword(email)}
						onBack={handleBackPress}
					/>
				);
			case "resetPassword":
				return (
					<ResetPasswordStep
						email={email}
						verifyCode={verifyCode}
						setVerifyCode={setVerifyCode}
						loading={auth.loading}
						onSubmit={() => auth.handleVerifyResetCode(verifyCode)}
						onResendCode={() => {
							setVerifyCode("");
							auth.resetError();
							auth.setStep("forgotPassword");
						}}
					/>
				);
			case "codeVerified":
				return (
					<CodeVerifiedStep onNext={() => auth.setStep("enterNewPassword")} />
				);
			case "enterNewPassword":
				return (
					<NewPasswordStep
						loading={auth.loading}
						onSubmit={(newPassword) =>
							auth.handleSubmitNewPassword(newPassword)
						}
					/>
				);
			default:
				return null;
		}
	}

	return (
		<>
			<StatusBar style="light" />
			<LinearGradient colors={GRADIENT} style={{ flex: 1 }}>
				<SafeAreaView style={{ flex: 1 }}>
					<KeyboardAvoidingView
						style={{ flex: 1 }}
						behavior={Platform.OS === "ios" ? "padding" : "height"}
					>
						{auth.step !== "form" && (
							<Pressable
								onPress={handleBackPress}
								className="px-1"
								hitSlop={16}
							>
								<ThemedText className="text-white/70 text-lg font-medium ml-4">
									<Feather name="arrow-left" size={16} color="white" /> Back
								</ThemedText>
							</Pressable>
						)}

						<ScrollView
							contentContainerStyle={{
								flexGrow: 1,
								padding: 24,
								justifyContent: "center",
							}}
							keyboardShouldPersistTaps="handled"
						>
							{auth.errorMsg && (
								<ThemedView className="bg-red-500/20 border border-red-400/40 rounded-xl px-4 py-3 mb-4">
									<ThemedText className="text-red-200 text-sm">
										{auth.errorMsg}
									</ThemedText>
								</ThemedView>
							)}

							{renderStep()}
						</ScrollView>
					</KeyboardAvoidingView>
				</SafeAreaView>
			</LinearGradient>
		</>
	);
}
