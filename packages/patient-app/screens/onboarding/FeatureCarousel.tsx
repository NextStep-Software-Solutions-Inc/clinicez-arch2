import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRef, useState } from "react";
import {
	Dimensions,
	FlatList,
	Pressable,
	View,
	type ViewToken,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import RoundedButton from "../../components/RoundedButton";

type Feature = {
	id: string;
	icon: keyof typeof MaterialCommunityIcons.glyphMap;
	title: string;
	description: string;
	gradient: readonly [string, string, string];
};

type FeatureCarouselProps = {
	onNext: () => void;
	onBack?: () => void;
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const features: Feature[] = [
	{
		id: "feature-1",
		icon: "shield-cross",
		title: "Your Health Hub",
		description:
			"All your clinics, records, and care — unified in one secure place.",
		gradient: ["#1e3a5f", "#1d4ed8", "#60a5fa"],
	},
	{
		id: "feature-2",
		icon: "heart-pulse",
		title: "Stay In the Know",
		description:
			"View lab results, prescriptions, and health history anytime, anywhere.",
		gradient: ["#064e3b", "#0d9488", "#34d399"],
	},
	{
		id: "feature-3",
		icon: "calendar-check",
		title: "Book in Seconds",
		description:
			"Schedule appointments, get reminders, and never miss your care.",
		gradient: ["#2e1065", "#6d28d9", "#a78bfa"],
	},
];

export default function FeatureCarousel({
	onNext,
	onBack,
}: FeatureCarouselProps) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const flatListRef = useRef<FlatList>(null);

	const handleViewableItemsChanged = useRef(
		(info: { viewableItems: ViewToken<Feature>[] }) => {
			if (info.viewableItems.length > 0) {
				setCurrentIndex(info.viewableItems[0].index ?? 0);
			}
		},
	);

	const scrollToIndex = (index: number) => {
		flatListRef.current?.scrollToIndex({ index, animated: true });
	};

	const isFirst = currentIndex === 0;
	const isLast = currentIndex === features.length - 1;

	return (
		<View style={{ flex: 1 }}>
			<FlatList
				ref={flatListRef}
				data={features}
				horizontal
				pagingEnabled
				showsHorizontalScrollIndicator={false}
				keyExtractor={(item) => item.id}
				onViewableItemsChanged={handleViewableItemsChanged.current}
				viewabilityConfig={{ viewAreaCoveragePercentThreshold: 60 }}
				scrollEnabled
				renderItem={({ item }) => (
					<LinearGradient
						colors={item.gradient}
						start={{ x: 0.15, y: 0 }}
						end={{ x: 0.85, y: 1 }}
						style={{ width: SCREEN_WIDTH, flex: 1 }}
					>
						<SafeAreaView style={{ flex: 1 }}>
							{/* Dots */}
							<View
								style={{
									flexDirection: "row",
									justifyContent: "center",
									alignItems: "center",
									marginTop: 20,
									marginBottom: 8,
									gap: 6,
								}}
							>
								{features.map((_, idx) => (
									<View
										key={`dot-${
											// biome-ignore lint/suspicious/noArrayIndexKey: stable indices
											idx
										}`}
										style={{
											height: 8,
											width: currentIndex === idx ? 24 : 8,
											borderRadius: 4,
											backgroundColor:
												currentIndex === idx
													? "#ffffff"
													: "rgba(255,255,255,0.35)",
										}}
									/>
								))}
							</View>

							{/* Icon + text */}
							<View
								style={{
									flex: 1,
									alignItems: "center",
									justifyContent: "center",
									paddingHorizontal: 32,
									gap: 28,
								}}
							>
								{/* Icon bubble */}
								<View
									style={{
										width: 140,
										height: 140,
										borderRadius: 40,
										backgroundColor: "rgba(255,255,255,0.15)",
										alignItems: "center",
										justifyContent: "center",
										shadowColor: "#000",
										shadowOffset: { width: 0, height: 8 },
										shadowOpacity: 0.25,
										shadowRadius: 20,
										elevation: 10,
									}}
								>
									<MaterialCommunityIcons
										name={item.icon}
										size={80}
										color="#ffffff"
									/>
								</View>

								{/* Text */}
								<View style={{ alignItems: "center", gap: 14 }}>
									<ThemedText
										style={{
											fontSize: 34,
											fontWeight: "800",
											color: "#ffffff",
											textAlign: "center",
											letterSpacing: -0.5,
											lineHeight: 40,
										}}
									>
										{item.title}
									</ThemedText>
									<ThemedText
										style={{
											fontSize: 17,
											color: "rgba(255,255,255,0.78)",
											textAlign: "center",
											lineHeight: 26,
										}}
									>
										{item.description}
									</ThemedText>
								</View>
							</View>

							{/* Navigation */}
							<View
								style={{
									paddingHorizontal: 24,
									paddingBottom: 16,
									gap: 12,
								}}
							>
								{isLast && (
									<RoundedButton
										onPress={onNext}
										color="bg-white"
										rippleColor="rgba(255,255,255,0.4)"
									>
										<ThemedText
											style={{
												color: item.gradient[1],
												fontWeight: "700",
												fontSize: 17,
											}}
										>
											Continue
										</ThemedText>
									</RoundedButton>
								)}

								<View
									style={{
										flexDirection: "row",
										justifyContent: "space-between",
										alignItems: "center",
									}}
								>
									{/* Back / Exit */}
									<Pressable
										onPress={
											isFirst ? onBack : () => scrollToIndex(currentIndex - 1)
										}
										style={({ pressed }) => ({
											flexDirection: "row",
											alignItems: "center",
											gap: 4,
											padding: 8,
											borderRadius: 12,
											opacity: pressed ? 0.6 : 1,
										})}
									>
										<MaterialCommunityIcons
											name={isFirst ? "close" : "chevron-left"}
											size={24}
											color="rgba(255,255,255,0.85)"
										/>
										<ThemedText
											style={{
												color: "rgba(255,255,255,0.85)",
												fontWeight: "600",
												fontSize: 15,
											}}
										>
											{isFirst ? "Exit" : "Back"}
										</ThemedText>
									</Pressable>

									{/* Next */}
									{!isLast && (
										<Pressable
											onPress={() => scrollToIndex(currentIndex + 1)}
											style={({ pressed }) => ({
												flexDirection: "row",
												alignItems: "center",
												gap: 4,
												padding: 8,
												borderRadius: 12,
												opacity: pressed ? 0.6 : 1,
											})}
										>
											<ThemedText
												style={{
													color: "rgba(255,255,255,0.85)",
													fontWeight: "600",
													fontSize: 15,
												}}
											>
												Next
											</ThemedText>
											<MaterialCommunityIcons
												name="chevron-right"
												size={24}
												color="rgba(255,255,255,0.85)"
											/>
										</Pressable>
									)}
								</View>
							</View>
						</SafeAreaView>
					</LinearGradient>
				)}
			/>
		</View>
	);
}
