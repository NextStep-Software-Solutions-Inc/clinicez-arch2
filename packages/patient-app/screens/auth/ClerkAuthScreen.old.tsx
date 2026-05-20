import "../../global.css";
import { useAuth, useSignIn, useSignUp } from "@clerk/expo";
import { LinearGradient } from "expo-linear-gradient";

type ClerkError = { longMessage?: string | null; message?: string | null };

import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

type Props = {
	onNext: () => void;
	onBack: () => void;
	initialMode?: Mode;
};

type Mode = "signUp" | "signIn";
type Step = "form" | "verify" | "forgotPassword" | "resetPassword";

const GRADIENT: readonly [string, string, string] = [
	"#0f2027",
	"#1565c0",
	"#0ea5e9",
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

export default function ClerkAuthScreen({
	onNext,
	onBack,
	initialMode,
}: Props) {
	const { isSignedIn } = useAuth();
	const { signUp } = useSignUp();
	const { signIn } = useSignIn();

	const [mode, setMode] = useState<Mode>(initialMode ?? "signUp");
	const [step, setStep] = useState<Step>("form");
	const [firstName, setFirstName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [verifyCode, setVerifyCode] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	// Auto-skip if already signed in (debug re-runs of onboarding)
	useEffect(() => {
		if (isSignedIn) {
			onNext();
		}
	}, [isSignedIn, onNext]);

	function handleBackPress() {
		if (step === "forgotPassword") {
			setStep("form");
			setErrorMsg(null);
		} else if (step === "resetPassword") {
			setStep("forgotPassword");
			setErrorMsg(null);
		} else if (step === "verify") {
			setStep("form");
			setVerifyCode("");
			setErrorMsg(null);
		} else {
			onBack();
		}
	}

	function switchMode(next: Mode) {
		setMode(next);
		setStep("form");
		setErrorMsg(null);
		setVerifyCode("");
	}

	// ── Sign-up ──────────────────────────────────────────────────────────────

	async function handleSignUp() {
		if (!signUp) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error } = await signUp.password({
				emailAddress: email,
				password,
				firstName: firstName || undefined,
			});
			if (error) {
				setErrorMsg(clerkMsg(error));
				return;
			}
			const { error: sendError } = await signUp.verifications.sendEmailCode();
			if (sendError) {
				setErrorMsg(clerkMsg(sendError));
				return;
			}
			setStep("verify");
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	}

	async function handleVerifySignUp() {
		if (!signUp) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error } = await signUp.verifications.verifyEmailCode({
				code: verifyCode,
			});
			if (error) {
				setErrorMsg(clerkMsg(error));
				return;
			}
			if (signUp.status === "complete") {
				const { error: finalError } = await signUp.finalize({
					navigate: () => {
						onNext();
					},
				});
				if (finalError) setErrorMsg(clerkMsg(finalError));
			} else {
				setErrorMsg("Verification incomplete. Please try again.");
			}
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	}

	// ── Sign-in ──────────────────────────────────────────────────────────────

	async function handleSignIn() {
		if (!signIn) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error } = await signIn.password({ identifier: email, password });
			if (error) {
				setErrorMsg(clerkMsg(error));
				return;
			}
			if (signIn.status === "complete") {
				const { error: finalError } = await signIn.finalize({
					navigate: () => {
						onNext();
					},
				});
				if (finalError) setErrorMsg(clerkMsg(finalError));
			} else if (signIn.status === "needs_second_factor") {
				const { error: mfaError } = await signIn.mfa.sendEmailCode();
				if (mfaError) {
					setErrorMsg(clerkMsg(mfaError));
					return;
				}
				setStep("verify");
			} else {
				setErrorMsg(
					"Sign-in requires additional verification. Please try again.",
				);
			}
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	}

	async function handleVerifySignIn() {
		if (!signIn) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error } = await signIn.mfa.verifyEmailCode({ code: verifyCode });
			if (error) {
				setErrorMsg(clerkMsg(error));
				return;
			}
			if (signIn.status === "complete") {
				const { error: finalError } = await signIn.finalize({
					navigate: () => {
						onNext();
					},
				});
				if (finalError) setErrorMsg(clerkMsg(finalError));
			} else {
				setErrorMsg("Invalid code. Please try again.");
			}
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	}

	// ── Forgot / reset password ───────────────────────────────────────────────

	async function handleForgotPassword() {
		if (!signIn) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error: createError } = await signIn.create({ identifier: email });
			if (createError) {
				setErrorMsg(clerkMsg(createError));
				return;
			}
			const { error: sendError } =
				await signIn.resetPasswordEmailCode.sendCode();
			if (sendError) {
				setErrorMsg(clerkMsg(sendError));
				return;
			}
			setStep("resetPassword");
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	}

	async function handleResetPassword() {
		if (!signIn) return;
		setLoading(true);
		setErrorMsg(null);
		try {
			const { error: verifyError } =
				await signIn.resetPasswordEmailCode.verifyCode({
					code: verifyCode,
				});
			if (verifyError) {
				setErrorMsg(clerkMsg(verifyError));
				return;
			}
			const { error: submitError } =
				await signIn.resetPasswordEmailCode.submitPassword({
					password: newPassword,
				});
			if (submitError) {
				setErrorMsg(clerkMsg(submitError));
				return;
			}
			if (signIn.status === "complete") {
				const { error: finalError } = await signIn.finalize({
					navigate: () => {
						onNext();
					},
				});
				if (finalError) setErrorMsg(clerkMsg(finalError));
			} else {
				setErrorMsg("Password reset incomplete. Please try again.");
			}
		} catch (e: unknown) {
			setErrorMsg(unknownMsg(e));
		} finally {
			setLoading(false);
		}
	}

	const title =
		step === "forgotPassword" || step === "resetPassword"
			? "Reset Password"
			: mode === "signUp"
				? "Create Account"
				: "Welcome Back";
	const subtitle =
		step === "forgotPassword"
			? "We'll send a reset code to your email"
			: step === "resetPassword"
				? "Check your email for the verification code"
				: mode === "signUp"
					? "Sign up to get started with ClinicEZ"
					: "Sign in to continue your health journey";

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
						<Pressable
							onPress={handleBackPress}
							className="absolute top-2 left-0 py-2 px-1"
							hitSlop={16}
						>
							<ThemedText className="text-white/70 text-lg font-medium ml-4">
								<Feather name="arrow-left" size={16} color="white" /> Back
							</ThemedText>
						</Pressable>

						<ThemedView className="bg-transparent items-center mb-8 mt-8">
							<ThemedText className="text-white text-3xl font-extrabold tracking-tight mb-2">
								{title}
							</ThemedText>
							<ThemedText className="text-white/70 text-sm text-center">
								{subtitle}
							</ThemedText>
						</ThemedView>

						{/* Mode toggle — only shown when mode is not locked by a specific path */}
						{step === "form" && !initialMode && (
							<ThemedView className="flex-row bg-white/10 rounded-xl p-1 mb-6">
								<Pressable
									onPress={() => switchMode("signUp")}
									style={{
										flex: 1,
										paddingVertical: 10,
										borderRadius: 10,
										backgroundColor:
											mode === "signUp"
												? "rgba(255,255,255,0.18)"
												: "transparent",
										alignItems: "center",
									}}
								>
									<ThemedText
										className={`text-sm font-semibold ${mode === "signUp" ? "text-white" : "text-white/50"}`}
									>
										Sign Up
									</ThemedText>
								</Pressable>
								<Pressable
									onPress={() => switchMode("signIn")}
									style={{
										flex: 1,
										paddingVertical: 10,
										borderRadius: 10,
										backgroundColor:
											mode === "signIn"
												? "rgba(255,255,255,0.18)"
												: "transparent",
										alignItems: "center",
									}}
								>
									<ThemedText
										className={`text-sm font-semibold ${mode === "signIn" ? "text-white" : "text-white/50"}`}
									>
										Sign In
									</ThemedText>
								</Pressable>
							</ThemedView>
						)}

						{errorMsg && (
							<ThemedView className="bg-red-500/20 border border-red-400/40 rounded-xl px-4 py-3 mb-4">
								<ThemedText className="text-red-200 text-sm">
									{errorMsg}
								</ThemedText>
							</ThemedView>
						)}

						{step === "form" && (
							<ThemedView className="bg-transparent">
								{mode === "signUp" && (
									<TextInput
										style={INPUT_STYLE}
										placeholder="First name"
										placeholderTextColor="rgba(255,255,255,0.45)"
										value={firstName}
										onChangeText={setFirstName}
										autoCapitalize="words"
										autoComplete="given-name"
									/>
								)}
								<TextInput
									style={INPUT_STYLE}
									placeholder="Email address"
									placeholderTextColor="rgba(255,255,255,0.45)"
									value={email}
									onChangeText={setEmail}
									keyboardType="email-address"
									autoCapitalize="none"
									autoComplete="email"
								/>
								<TextInput
									style={INPUT_STYLE}
									placeholder="Password"
									placeholderTextColor="rgba(255,255,255,0.45)"
									value={password}
									onChangeText={setPassword}
									secureTextEntry
									autoComplete="password"
								/>

								{/* Forgot password link — sign-in only */}
								{mode === "signIn" && (
									<Pressable
										onPress={() => {
											setErrorMsg(null);
											setStep("forgotPassword");
										}}
										className="items-end mb-3 -mt-1"
									>
										<ThemedText className="text-white/60 text-sm">
											Forgot password?
										</ThemedText>
									</Pressable>
								)}

								<Pressable
									onPress={mode === "signUp" ? handleSignUp : handleSignIn}
									disabled={loading}
									className="bg-white rounded-2xl py-4 items-center mt-2"
								>
									{loading ? (
										<ActivityIndicator color="#1565c0" />
									) : (
										<ThemedText className="text-blue-700 font-bold text-base">
											{mode === "signUp" ? "Create Account" : "Sign In"}
										</ThemedText>
									)}
								</Pressable>

								{/* Switch path links */}
								{mode === "signIn" ? (
									<Pressable
										onPress={onBack}
										className="items-center mt-5 pt-4 border-t border-white/10"
									>
										<ThemedText className="text-white/60 text-sm">
											New to ClinicEZ? Create an account →
										</ThemedText>
									</Pressable>
								) : initialMode ? (
									<Pressable onPress={onBack} className="items-center mt-5">
										<ThemedText className="text-white/60 text-sm">
											Already have an account? Sign in →
										</ThemedText>
									</Pressable>
								) : null}
							</ThemedView>
						)}

						{step === "verify" && (
							<ThemedView className="bg-transparent">
								<ThemedText className="text-white/80 text-sm text-center mb-4">
									Enter the 6-digit code we sent to {email}
								</ThemedText>
								<TextInput
									style={{
										...INPUT_STYLE,
										textAlign: "center",
										fontSize: 24,
										letterSpacing: 8,
									}}
									placeholder="000000"
									placeholderTextColor="rgba(255,255,255,0.35)"
									value={verifyCode}
									onChangeText={setVerifyCode}
									keyboardType="number-pad"
									maxLength={6}
								/>
								<Pressable
									onPress={
										mode === "signUp" ? handleVerifySignUp : handleVerifySignIn
									}
									disabled={loading || verifyCode.length < 6}
									className="bg-white rounded-2xl py-4 items-center mt-2"
								>
									{loading ? (
										<ActivityIndicator color="#1565c0" />
									) : (
										<ThemedText className="text-blue-700 font-bold text-base">
											Verify Code
										</ThemedText>
									)}
								</Pressable>
								<Pressable
									onPress={() => {
										setStep("form");
										setVerifyCode("");
										setErrorMsg(null);
									}}
									className="items-center mt-4"
								>
									<ThemedText className="text-white/60 text-sm">
										← Change email
									</ThemedText>
								</Pressable>
							</ThemedView>
						)}

						{/* ── Forgot password ──────────────────────────────── */}
						{step === "forgotPassword" && (
							<ThemedView className="bg-transparent">
								<ThemedText className="text-white/80 text-sm text-center mb-6">
									Enter your email and we’ll send a reset code.
								</ThemedText>
								<TextInput
									style={INPUT_STYLE}
									placeholder="Email address"
									placeholderTextColor="rgba(255,255,255,0.45)"
									value={email}
									onChangeText={setEmail}
									keyboardType="email-address"
									autoCapitalize="none"
									autoComplete="email"
								/>
								<Pressable
									onPress={handleForgotPassword}
									disabled={loading || !email}
									className="bg-white rounded-2xl py-4 items-center mt-2"
								>
									{loading ? (
										<ActivityIndicator color="#1565c0" />
									) : (
										<ThemedText className="text-blue-700 font-bold text-base">
											Send Reset Code
										</ThemedText>
									)}
								</Pressable>
								<Pressable
									onPress={() => {
										setStep("form");
										setErrorMsg(null);
									}}
									className="items-center mt-4"
								>
									<ThemedText className="text-white/60 text-sm">
										← Back to sign in
									</ThemedText>
								</Pressable>
							</ThemedView>
						)}

						{/* ── Reset password ───────────────────────────────── */}
						{step === "resetPassword" && (
							<ThemedView className="bg-transparent">
								<ThemedText className="text-white/80 text-sm text-center mb-4">
									Enter the 6-digit code sent to {email} and choose a new
									password.
								</ThemedText>
								<TextInput
									style={{
										...INPUT_STYLE,
										textAlign: "center",
										fontSize: 24,
										letterSpacing: 8,
									}}
									placeholder="000000"
									placeholderTextColor="rgba(255,255,255,0.35)"
									value={verifyCode}
									onChangeText={setVerifyCode}
									keyboardType="number-pad"
									maxLength={6}
								/>
								<TextInput
									style={INPUT_STYLE}
									placeholder="New password"
									placeholderTextColor="rgba(255,255,255,0.45)"
									value={newPassword}
									onChangeText={setNewPassword}
									secureTextEntry
									autoComplete="new-password"
								/>
								<Pressable
									onPress={handleResetPassword}
									disabled={loading || verifyCode.length < 6 || !newPassword}
									className="bg-white rounded-2xl py-4 items-center mt-2"
								>
									{loading ? (
										<ActivityIndicator color="#1565c0" />
									) : (
										<ThemedText className="text-blue-700 font-bold text-base">
											Reset Password
										</ThemedText>
									)}
								</Pressable>
								<Pressable
									onPress={() => {
										setVerifyCode("");
										setNewPassword("");
										setErrorMsg(null);
										setStep("forgotPassword");
									}}
									className="items-center mt-4"
								>
									<ThemedText className="text-white/60 text-sm">
										← Resend code
									</ThemedText>
								</Pressable>
							</ThemedView>
						)}
					</ScrollView>
				</KeyboardAvoidingView>
			</SafeAreaView>
		</LinearGradient>
	);
}

function clerkMsg(error: ClerkError): string {
	return error.longMessage ?? error.message ?? "An error occurred.";
}

function unknownMsg(e: unknown): string {
	if (e instanceof Error) return e.message;
	return "Something went wrong. Please try again.";
}
