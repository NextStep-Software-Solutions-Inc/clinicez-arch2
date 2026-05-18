import "../../global.css";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, SafeAreaView, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import type { Clinic } from "@/db/schema";

const GRADIENT: readonly [string, string, string] = [
	"#0f2027",
	"#0d3b2e",
	"#065f46",
];

type ConfirmScreenProps = {
	clinic: Clinic;
	onContinue: () => void;
};

export default function ConfirmScreen({
	clinic,
	onContinue,
}: ConfirmScreenProps) {
	return (
		<LinearGradient colors={GRADIENT} style={{ flex: 1 }}>
			<SafeAreaView style={{ flex: 1 }}>
				<View
					style={{
						flex: 1,
						alignItems: "center",
						justifyContent: "center",
						padding: 32,
					}}
				>
					<MaterialCommunityIcons
						name="check-circle"
						size={96}
						color="#4ade80"
						style={{ marginBottom: 28 }}
					/>

					<ThemedText
						style={{
							color: "#4ade80",
							fontSize: 30,
							fontWeight: "800",
							textAlign: "center",
							marginBottom: 12,
						}}
					>
						You're All Set!
					</ThemedText>

					<ThemedView className="bg-white/10 rounded-2xl px-6 py-4 mb-8 w-full items-center">
						<ThemedText className="text-white/60 text-xs mb-1">
							Connected to
						</ThemedText>
						<ThemedText
							style={{
								color: "#ffffff",
								fontSize: 20,
								fontWeight: "700",
								textAlign: "center",
							}}
						>
							{clinic.name}
						</ThemedText>
					</ThemedView>

					<ThemedText className="text-white/60 text-sm text-center mb-10 leading-6">
						Your clinic is connected. You can now view appointments, access
						records, and stay in touch with your care team.
					</ThemedText>

					<Pressable
						onPress={onContinue}
						style={{
							backgroundColor: "#ffffff",
							borderRadius: 16,
							paddingVertical: 16,
							paddingHorizontal: 48,
							alignItems: "center",
							width: "100%",
						}}
					>
						<ThemedText
							style={{ color: "#065f46", fontWeight: "700", fontSize: 16 }}
						>
							Continue to App
						</ThemedText>
					</Pressable>
				</View>
			</SafeAreaView>
		</LinearGradient>
	);
}
