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

type SignUpFormProps = {
	firstName: string;
	setFirstName: (v: string) => void;
	email: string;
	setEmail: (v: string) => void;
	password: string;
	setPassword: (v: string) => void;
	loading: boolean;
	onSubmit: () => void;
	onSwitchToSignIn: () => void;
};

export function SignUpForm({
	firstName,
	setFirstName,
	email,
	setEmail,
	password,
	setPassword,
	loading,
	onSubmit,
	onSwitchToSignIn,
}: SignUpFormProps) {
	return (
		<ThemedView className="bg-transparent">
			<TextInput
				style={INPUT_STYLE}
				placeholder="First name"
				placeholderTextColor="rgba(255,255,255,0.45)"
				value={firstName}
				onChangeText={setFirstName}
				autoCapitalize="words"
				autoComplete="given-name"
			/>
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

			<Pressable
				onPress={onSubmit}
				disabled={loading}
				className="bg-white rounded-2xl py-4 items-center mt-2"
			>
				{loading ? (
					<ActivityIndicator color="#1565c0" />
				) : (
					<ThemedText className="text-blue-700 font-bold text-base">
						Create Account
					</ThemedText>
				)}
			</Pressable>

			<Pressable onPress={onSwitchToSignIn} className="items-center mt-5">
				<ThemedText className="text-white/60">
					Already have an account? Sign in <Feather name="arrow-right" />
				</ThemedText>
			</Pressable>
		</ThemedView>
	);
}
