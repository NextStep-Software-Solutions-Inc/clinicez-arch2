import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, TextInput } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

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

type SignInFormProps = {
	email: string;
	setEmail: (v: string) => void;
	password: string;
	setPassword: (v: string) => void;
	loading: boolean;
	onSubmit: () => void;
	onForgotPassword: () => void;
	onSwitchToSignUp: () => void;
	hideSignUpLink?: boolean;
};

export function SignInForm({
	email,
	setEmail,
	password,
	setPassword,
	loading,
	onSubmit,
	onForgotPassword,
	onSwitchToSignUp,
	hideSignUpLink,
}: SignInFormProps) {
	return (
		<ThemedView className="bg-transparent">
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

			<Pressable onPress={onForgotPassword} className="items-end mb-3 -mt-1">
				<ThemedText className="text-white/60">Forgot password?</ThemedText>
			</Pressable>

			<Pressable
				onPress={onSubmit}
				disabled={loading}
				className="bg-white rounded-2xl py-4 items-center mt-2"
			>
				{loading ? (
					<ActivityIndicator color="#1565c0" />
				) : (
					<ThemedText className="text-blue-700 font-bold text-base">
						Sign In
					</ThemedText>
				)}
			</Pressable>

			{!hideSignUpLink && (
				<Pressable
					onPress={onSwitchToSignUp}
					className="items-center mt-5 pt-4 border-t border-white/10"
				>
					<ThemedText className="text-white/60">
						New to Clinic EZ? Create an account <Feather name="arrow-right" />
					</ThemedText>
				</Pressable>
			)}
		</ThemedView>
	);
}
