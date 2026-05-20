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

type ForgotPasswordFormProps = {
	email: string;
	setEmail: (v: string) => void;
	loading: boolean;
	onSubmit: () => void;
	onBack: () => void;
};

export function ForgotPasswordForm({
	email,
	setEmail,
	loading,
	onSubmit,
	onBack,
}: ForgotPasswordFormProps) {
	return (
		<ThemedView className="bg-transparent">
			<ThemedText className="text-white/80 text-sm text-center mb-6">
				Enter your email and we'll send a reset code.
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
				onPress={onSubmit}
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
			<Pressable onPress={onBack} className="items-center mt-4">
				<ThemedText className="text-white/60">
					<Feather name="arrow-left" /> Back to sign in
				</ThemedText>
			</Pressable>
		</ThemedView>
	);
}
