import "../../global.css";
import { useAuth } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NewPasswordForm, ResetPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ForgotPasswordForm } from "@/components/auth/RequestPasswordResetForm";
import { SignInForm } from "@/components/auth/SignInForm";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { VerifyCodeForm } from "@/components/auth/VerifyCodeForm";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useClerkAuthFlow } from "@/hooks/useClerkAuthFlow";

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
	const auth = useClerkAuthFlow(onNext);

	const [firstName, setFirstName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [verifyCode, setVerifyCode] = useState("");
	const [newPassword, setNewPassword] = useState("");

	// Auto-skip if already signed in (debug re-runs of onboarding)
	useEffect(() => {
		if (isSignedIn) {
			onNext();
		}
	}, [isSignedIn, onNext]);

	function handleBackPress() {
		if (auth.step === "forgotPassword") {
			auth.setStep("form");
			auth.resetError();
		} else if (auth.step === "resetPassword") {
			auth.setStep("forgotPassword");
			auth.resetError();
		} else if (auth.step === "enterNewPassword") {
			auth.setStep("resetPassword");
			setVerifyCode("");
			auth.resetError();
		} else if (auth.step === "verify") {
			auth.setStep("form");
			setVerifyCode("");
			auth.resetError();
		} else {
			onBack();
		}
	}

	const title =
		auth.step === "forgotPassword" ||
		auth.step === "resetPassword" ||
		auth.step === "enterNewPassword"
			? "Reset Password"
			: auth.mode === "signUp"
				? "Create Account"
				: "Welcome Back";

	const subtitle =
		auth.step === "forgotPassword"
			? "We'll send a reset code to your email"
			: auth.step === "resetPassword"
				? "Check your email for the verification code"
				: auth.step === "enterNewPassword"
					? "Almost there — set your new password"
					: auth.mode === "signUp"
						? "Sign up to get started with ClinicEZ"
						: "Sign in to continue your health journey";

	return (
		<LinearGradient colors={GRADIENT} style={{ flex: 1 }}>
			<SafeAreaView style={{ flex: 1 }}>
				<KeyboardAvoidingView
					style={{ flex: 1 }}
					behavior={Platform.OS === "ios" ? "padding" : "height"}
				>
					{(auth.step === "forgotPassword" ||
						auth.step === "resetPassword" ||					auth.step === "enterNewPassword" ||						auth.step === "verify") && (
						<Pressable onPress={handleBackPress} className="px-1" hitSlop={16}>
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
						{/* Header */}
						<ThemedView className="bg-transparent items-center mb-8 mt-8">
							<ThemedText className="text-white text-3xl font-extrabold tracking-tight mb-2">
								{title}
							</ThemedText>
							<ThemedText className="text-white/70 text-sm text-center">
								{subtitle}
							</ThemedText>
						</ThemedView>

						{/* Mode toggle — only shown when mode is not locked by a specific path */}
						{auth.step === "form" && !initialMode && (
							<ThemedView className="flex-row bg-white/10 rounded-xl p-1 mb-6">
								<Pressable
									onPress={() => auth.switchMode("signUp")}
									style={{
										flex: 1,
										paddingVertical: 10,
										borderRadius: 10,
										backgroundColor:
											auth.mode === "signUp"
												? "rgba(255,255,255,0.18)"
												: "transparent",
										alignItems: "center",
									}}
								>
									<ThemedText
										className={`text-sm font-semibold ${auth.mode === "signUp" ? "text-white" : "text-white/50"}`}
									>
										Sign Up
									</ThemedText>
								</Pressable>
								<Pressable
									onPress={() => auth.switchMode("signIn")}
									style={{
										flex: 1,
										paddingVertical: 10,
										borderRadius: 10,
										backgroundColor:
											auth.mode === "signIn"
												? "rgba(255,255,255,0.18)"
												: "transparent",
										alignItems: "center",
									}}
								>
									<ThemedText
										className={`text-sm font-semibold ${auth.mode === "signIn" ? "text-white" : "text-white/50"}`}
									>
										Sign In
									</ThemedText>
								</Pressable>
							</ThemedView>
						)}

						{/* Error message */}
						{auth.errorMsg && (
							<ThemedView className="bg-red-500/20 border border-red-400/40 rounded-xl px-4 py-3 mb-4">
								<ThemedText className="text-red-200 text-sm">
									{auth.errorMsg}
								</ThemedText>
							</ThemedView>
						)}

						{/* Form rendering by step */}
						{auth.step === "form" && auth.mode === "signUp" && (
							<SignUpForm
								firstName={firstName}
								setFirstName={setFirstName}
								email={email}
								setEmail={setEmail}
								password={password}
								setPassword={setPassword}
								loading={auth.loading}
								onSubmit={() => auth.handleSignUp(email, password, firstName)}
								onSwitchToSignIn={() => {
									auth.switchMode("signIn");
									setFirstName("");
									setEmail("");
									setPassword("");
								}}
							/>
						)}

						{auth.step === "form" && auth.mode === "signIn" && (
							<SignInForm
								email={email}
								setEmail={setEmail}
								password={password}
								setPassword={setPassword}
								loading={auth.loading}
								onSubmit={() => auth.handleSignIn(email, password)}
								onForgotPassword={() => {
									auth.setStep("forgotPassword");
									auth.resetError();
								}}
								onSwitchToSignUp={() => {
									auth.switchMode("signUp");
									setEmail("");
									setPassword("");
								}}
							/>
						)}

						{auth.step === "verify" && (
							<VerifyCodeForm
								email={email}
								verifyCode={verifyCode}
								setVerifyCode={setVerifyCode}
								loading={auth.loading}
								onSubmit={() =>
									auth.mode === "signUp"
										? auth.handleVerifySignUp(verifyCode)
										: auth.handleVerifySignIn(verifyCode)
								}
								onChangeEmail={() => {
									auth.setStep("form");
									setVerifyCode("");
									auth.resetError();
								}}
							/>
						)}

						{auth.step === "forgotPassword" && (
							<ForgotPasswordForm
								email={email}
								setEmail={setEmail}
								loading={auth.loading}
								onSubmit={() => auth.handleForgotPassword(email)}
								onBack={() => {
									auth.setStep("form");
									auth.resetError();
								}}
							/>
						)}

						{auth.step === "resetPassword" && (
							<ResetPasswordForm
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
						)}

						{auth.step === "enterNewPassword" && (
							<NewPasswordForm
								newPassword={newPassword}
								setNewPassword={setNewPassword}
								loading={auth.loading}
								onSubmit={() => auth.handleSubmitNewPassword(newPassword)}
							/>
						)}
					</ScrollView>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</LinearGradient>
	);
}
