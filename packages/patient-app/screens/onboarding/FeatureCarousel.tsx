import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Dimensions, FlatList, type ViewToken } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import RoundedButton from "../../components/RoundedButton";

type Feature = {
	id: string;
	icon: { name: string; color: string };
	title: string;
	description: string;
};

type FeatureCarouselProps = {
	onNext: () => void;
	onBack?: () => void;
};

const features: Feature[] = [
	{
		id: "feature-1",
		icon: { name: "hospital-building", color: "#2563eb" },
		title: "Your Clinic, Anywhere",
		description:
			"Connect to your clinic, book appointments, and access care from your phone.",
	},
	{
		id: "feature-2",
		icon: { name: "account-heart", color: "#059669" },
		title: "Personal Health",
		description:
			"View your health records, prescriptions, and lab results securely.",
	},
	{
		id: "feature-3",
		icon: { name: "calendar-check", color: "#f59e42" },
		title: "Easy Scheduling",
		description: "Book, reschedule, and get reminders for your appointments.",
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
			if (info.viewableItems && info.viewableItems.length > 0) {
				setCurrentIndex(info.viewableItems[0].index ?? 0);
			}
		},
	);

	const scrollToIndex = (index: number) => {
		flatListRef.current?.scrollToIndex({ index, animated: true });
	};

	return (
		<ThemedView className="flex-1 bg-white dark:bg-slate-900">
			{/* Tracking dots at the very top, in safe area */}
			<SafeAreaView edges={["top"]}>
				<ThemedView className="flex-row justify-center items-center mt-8 mb-4">
					{features.map((feature, idx) => (
						<ThemedView
							key={feature.id}
							className={
								`mx-1 w-2 h-2 rounded-full ` +
								(currentIndex === idx ? "bg-blue-600" : "bg-slate-300")
							}
							style={{ opacity: currentIndex === idx ? 1 : 0.5 }}
						/>
					))}
				</ThemedView>
			</SafeAreaView>
			{/* Centered feature card in available space */}
			<ThemedView className="flex-1 items-center justify-center">
				<ThemedView className="items-center w-full">
					<FlatList
						ref={flatListRef}
						data={features}
						horizontal
						pagingEnabled
						showsHorizontalScrollIndicator={false}
						keyExtractor={(item) => item.title}
						renderItem={({ item }) => (
							<ThemedView
								style={{ width: Dimensions.get("window").width }}
								className="flex-1 items-center justify-center p-8"
							>
								<ThemedView className="bg-white dark:bg-slate-900 rounded-3xl py-10 px-6 shadow-md items-center mb-8 w-full max-w-xl justify-center">
									<MaterialCommunityIcons
										name={
											item.icon
												.name as keyof typeof MaterialCommunityIcons.glyphMap
										}
										size={96}
										color={item.icon.color}
										style={{ marginBottom: 24 }}
									/>
									<ThemedText className="text-4xl font-extrabold text-slate-900 dark:text-slate-100 mb-6 text-center">
										{item.title}
									</ThemedText>
									<ThemedText className="text-xl text-[#4a5568] dark:text-slate-300 text-center leading-8">
										{item.description}
									</ThemedText>
								</ThemedView>
							</ThemedView>
						)}
						onViewableItemsChanged={handleViewableItemsChanged.current}
						viewabilityConfig={{ viewAreaCoveragePercentThreshold: 60 }}
					/>
				</ThemedView>
			</ThemedView>

			{/* Navigation/CTA pinned to very bottom, spaced left/right, icon and text, balanced size */}
			<ThemedView className="flex-row justify-between items-end px-12 mb-12">
				<ThemedView className="flex-1 items-start">
					{currentIndex > 0 ? (
						<RoundedButton
							onPress={() => scrollToIndex(currentIndex - 1)}
							color="bg-white dark:bg-slate-900"
							rippleColor="#e2e8f0"
							className="py-2 px-2 flex-row items-center"
						>
							<MaterialCommunityIcons
								name="chevron-left"
								size={28}
								color="#2563eb"
								style={{ marginRight: 4 }}
							/>
							<ThemedText className="text-blue-600 font-extrabold text-lg">
								Back
							</ThemedText>
						</RoundedButton>
					) : (
						onBack && (
							<RoundedButton
								onPress={onBack}
								color="bg-white dark:bg-slate-900 "
								rippleColor="#e2e8f0"
								className="py-2 px-2 flex-row items-center"
							>
								<MaterialCommunityIcons
									name="close-circle"
									size={24}
									color="#ef4444"
									style={{ marginRight: 4 }}
								/>
								<ThemedText className="text-red-500 font-extrabold text-lg">
									Exit
								</ThemedText>
							</RoundedButton>
						)
					)}
				</ThemedView>
				<ThemedView className="flex-1 items-end">
					{currentIndex < features.length - 1 ? (
						<RoundedButton
							onPress={() => scrollToIndex(currentIndex + 1)}
							color="bg-white dark:bg-slate-900"
							rippleColor="#e2e8f0"
							className="py-2 px-2 flex-row items-center"
						>
							<ThemedText className="text-blue-600 font-extrabold text-lg">
								Next
							</ThemedText>
							<MaterialCommunityIcons
								name="chevron-right"
								size={28}
								color="#2563eb"
								style={{ marginLeft: 4 }}
							/>
						</RoundedButton>
					) : (
						<RoundedButton
							onPress={onNext}
							color="bg-white dark:bg-slate-900"
							rippleColor="#e2e8f0"
							className="py-2 px-2 flex-row items-center"
						>
							<ThemedText className="text-cyan-600 font-extrabold text-lg">
								Get Started
							</ThemedText>
							<MaterialCommunityIcons
								name="check-circle"
								size={28}
								color="#06b6d4"
								style={{ marginLeft: 4 }}
							/>
						</RoundedButton>
					)}
				</ThemedView>
			</ThemedView>
		</ThemedView>
	);
}
