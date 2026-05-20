import { useState } from "react";
import { Pressable } from "react-native";
import { AuthStepHeader } from "@/components/auth/AuthStepHeader";
import { SignInForm } from "@/components/auth/SignInForm";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

type Mode = "signUp" | "signIn";

type Props = {
	mode: Mode;
	email: string;
	setEmail: (v: string) => void;
	loading: boolean;
	showModeToggle: boolean;
	onSwitchMode: (mode: Mode) => void;
	onSignUp: (email: string, password: string, firstName: string) => void;
	onSignIn: (email: string, password: string) => void;
	onForgotPassword: () => void;
};

export function AuthFormStep({
	mode,
	email,
	setEmail,
	loading,
	showModeToggle,
	onSwitchMode,
	onSignUp,
	onSignIn,
	onForgotPassword,
}: Props) {
	const [firstName, setFirstName] = useState("");
	const [password, setPassword] = useState("");

	const title = mode === "signUp" ? "Create Account" : "Welcome Back";
	const subtitle =
		mode === "signUp"
			? "Sign up to get started with ClinicEZ"
			: "Sign in to continue your health journey";

	function handleSwitchMode(next: Mode) {
		setFirstName("");
		setPassword("");
		setEmail("");
		onSwitchMode(next);
	}

	return (
		<>
			<AuthStepHeader title={title} subtitle={subtitle} />

			{showModeToggle && (
				<ThemedView className="flex-row bg-white/10 rounded-xl p-1 mb-6">
					<Pressable
						onPress={() => handleSwitchMode("signUp")}
						style={{
							flex: 1,
							paddingVertical: 10,
							borderRadius: 10,
							backgroundColor:
								mode === "signUp" ? "rgba(255,255,255,0.18)" : "transparent",
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
						onPress={() => handleSwitchMode("signIn")}
						style={{
							flex: 1,
							paddingVertical: 10,
							borderRadius: 10,
							backgroundColor:
								mode === "signIn" ? "rgba(255,255,255,0.18)" : "transparent",
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

			{mode === "signUp" ? (
				<SignUpForm
					firstName={firstName}
					setFirstName={setFirstName}
					email={email}
					setEmail={setEmail}
					password={password}
					setPassword={setPassword}
					loading={loading}
					onSubmit={() => onSignUp(email, password, firstName)}
					onSwitchToSignIn={() => handleSwitchMode("signIn")}
				/>
			) : (
				<SignInForm
					email={email}
					setEmail={setEmail}
					password={password}
					setPassword={setPassword}
					loading={loading}
					onSubmit={() => onSignIn(email, password)}
					onForgotPassword={onForgotPassword}
					onSwitchToSignUp={() => handleSwitchMode("signUp")}
				/>
			)}
		</>
	);
}
