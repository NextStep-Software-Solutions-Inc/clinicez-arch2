import { ActivityIndicator, Pressable, TextInput } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Feather } from "@expo/vector-icons";

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

type ResetPasswordFormProps = {
	email: string;
	verifyCode: string;
	setVerifyCode: (v: string) => void;
	loading: boolean;
	onSubmit: () => void;
	onResendCode: () => void;
};

export function ResetPasswordForm({
	email,
	verifyCode,
	setVerifyCode,
	loading,
	onSubmit,
	onResendCode,
}: ResetPasswordFormProps) {
	return (
		<ThemedView className="bg-transparent">
			<ThemedText className="text-white/80 text-sm text-center mb-4">
				Enter the 6-digit code sent to {email}.
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
				onPress={onSubmit}
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
			<Pressable onPress={onResendCode} className="items-center mt-4">
				<ThemedText className="text-white/60 text-sm">
					<Feather name="refresh-ccw" /> Resend code
				</ThemedText>
			</Pressable>
		</ThemedView>
	);
}

type NewPasswordFormProps = {
	newPassword: string;
	setNewPassword: (v: string) => void;
	loading: boolean;
	onSubmit: () => void;
};

export function NewPasswordForm({
	newPassword,
	setNewPassword,
	loading,
	onSubmit,
}: NewPasswordFormProps) {
	return (
		<ThemedView className="bg-transparent">
			<ThemedText className="text-white/80 text-sm text-center mb-4">
				Code verified! Now choose your new password.
			</ThemedText>
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
				onPress={onSubmit}
				disabled={loading || !newPassword}
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
		</ThemedView>
	);
}

