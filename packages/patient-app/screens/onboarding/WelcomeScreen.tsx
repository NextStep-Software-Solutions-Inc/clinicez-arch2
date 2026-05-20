import "../../global.css";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
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
				{/* Decorative background blobs */}
				<ThemedView
					style={{
						position: "absolute",
						top: 0,
						right: 0,
						bottom: 0,
						left: 0,
						overflow: "hidden",
					}}
				>
					<ThemedView
						style={{
							position: "absolute",
							width: 340,
							height: 340,
							borderRadius: 170,
							backgroundColor: "rgba(14,165,233,0.13)",
							top: -110,
							right: -90,
						}}
					/>
					<ThemedView
						style={{
							position: "absolute",
							width: 230,
							height: 230,
							borderRadius: 115,
							backgroundColor: "rgba(255,255,255,0.05)",
							bottom: 110,
							left: -70,
						}}
					/>
				</ThemedView>
				<ThemedView className="flex-1 w-full max-w-[420px] mx-auto px-6 justify-between">
					{/* Hero section */}
					<ThemedView className="flex-1 items-center justify-center gap-y-5">
						{/* Logo with ambient glow */}
						<ThemedView
							className="items-center justify-center"
							style={{ marginTop: -24 }}
						>
							{/* Glow disc */}
							<ThemedView
								style={{
									position: "absolute",
									width: 200,
									height: 200,
									borderRadius: 100,
									backgroundColor: "#ffffff",
									elevation: 10,
								}}
							/>
							<Image
								source={require("../../assets/images/ios-icon-default.png")}
								style={{
									width: 150,
									height: 150,
									resizeMode: "contain",
								}}
							/>
						</ThemedView>
						{/* Tagline */}
						<ThemedText
							style={{
								fontSize: 18,
								fontWeight: "500",
								color: "rgba(255,255,255,0.85)",
								textAlign: "center",
								lineHeight: 28,
								paddingHorizontal: 8,
								marginTop: 20,
							}}
						>
							{
								"Your health, your clinics,\nyour appointments — all in one place."
							}
						</ThemedText>
					</ThemedView>

					{/* CTA buttons */}
					<ThemedView className="w-full gap-y-1 mb-2">
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
							<TouchableOpacity
								onPress={onSignIn}
								activeOpacity={0.7}
								style={{ alignItems: "center", paddingVertical: 14 }}
							>
								<ThemedText
									style={{
										color: "rgba(255,255,255,0.6)",
										fontWeight: "500",
										fontSize: 15,
									}}
								>
									Already have an account?{" "}
									<ThemedText
										style={{
											color: "rgba(255,255,255,0.9)",
											fontWeight: "700",
											fontSize: 15,
											textDecorationLine: "underline",
										}}
									>
										Sign In
									</ThemedText>
								</ThemedText>
							</TouchableOpacity>
						)}
					</ThemedView>

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
				</ThemedView>
			</SafeAreaView>
		</LinearGradient>
	);
}
