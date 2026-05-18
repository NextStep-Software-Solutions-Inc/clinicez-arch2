import "../../global.css";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { Image, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import RoundedButton from "../../components/RoundedButton";

type WelcomeScreenProps = {
	onNext: () => void;
	onBack?: () => void;
	onExit?: () => void;
	onSignIn?: () => void;
};

export default function WelcomeScreen({
	onNext,
	onSignIn,
}: WelcomeScreenProps) {
	const version = Constants.expoConfig?.version || "1.0.0";

	return (
		<LinearGradient
			colors={["#0f2027", "#1565c0", "#0ea5e9"]}
			start={{ x: 0.15, y: 0 }}
			end={{ x: 0.85, y: 1 }}
			style={{ flex: 1 }}
		>
			<SafeAreaView style={{ flex: 1 }}>
				<View className="flex-1 w-full max-w-[420px] mx-auto px-6 justify-between">
					{/* Hero section */}
					<View className="flex-1 items-center justify-center gap-y-6">
						{/* Logo container */}
						<View
							style={{
								width: 100,
								height: 100,
								borderRadius: 28,
								backgroundColor: "rgba(255,255,255,0.15)",
								alignItems: "center",
								justifyContent: "center",
								shadowColor: "#000",
								shadowOffset: { width: 0, height: 8 },
								shadowOpacity: 0.3,
								shadowRadius: 16,
								elevation: 12,
							}}
						>
							<Image
								source={require("../../assets/images/icon.png")}
								style={{ width: 68, height: 68, resizeMode: "contain" }}
							/>
						</View>

						{/* Title */}
						<View className="items-center gap-y-3">
							<ThemedText
								style={{
									fontSize: 42,
									fontWeight: "800",
									color: "#ffffff",
									textAlign: "center",
									letterSpacing: -1,
									lineHeight: 48,
								}}
							>
								ClinicEZ
							</ThemedText>
							<ThemedText
								style={{
									fontSize: 17,
									color: "rgba(255,255,255,0.78)",
									textAlign: "center",
									lineHeight: 26,
									paddingHorizontal: 8,
								}}
							>
								Your health, your clinics, your appointments — all in one place.
							</ThemedText>
						</View>
					</View>

					{/* CTA buttons */}
					<View className="w-full gap-y-3 mb-2">
						<RoundedButton
							onPress={onNext}
							color="bg-white"
							rippleColor="#bfdbfe"
						>
							<ThemedText
								style={{
									color: "#1565c0",
									fontWeight: "700",
									fontSize: 17,
									letterSpacing: 0.2,
								}}
							>
								Get Started
							</ThemedText>
						</RoundedButton>

						{onSignIn && (
							<RoundedButton
								onPress={onSignIn}
								color="bg-transparent"
								rippleColor="rgba(255,255,255,0.15)"
								className="border border-white/50"
							>
								<ThemedText
									style={{
										color: "rgba(255,255,255,0.9)",
										fontWeight: "600",
										fontSize: 17,
									}}
								>
									Sign In
								</ThemedText>
							</RoundedButton>
						)}
					</View>

					{/* Version */}
					<ThemedText
						style={{
							fontSize: 12,
							color: "rgba(255,255,255,0.4)",
							textAlign: "center",
							marginBottom: 8,
							marginTop: 12,
						}}
					>
						v{version}
					</ThemedText>
				</View>
			</SafeAreaView>
		</LinearGradient>
	);
}
