import { Feather } from "@expo/vector-icons";
import { format } from "date-fns/format";
import { useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";
import { HealthSectionModal } from "../../components/HealthSectionModal";
import dummyHealth from "../HealthScreenData";

type LabResultItem = (typeof dummyHealth.labs)[number];

export default function LaboratoryResultsSection() {
	const [selectedItem, setSelectedItem] = useState<LabResultItem | null>(null);

	return (
		<>
			<ThemedView
				className="bg-white dark:bg-neutral-900 rounded-lg py-4 px-3 mb-4 self-center shadow-lg w-full"
				style={{
					shadowColor: Colors.light.tint,
					shadowOpacity: 0.1,
					shadowRadius: 8,
					elevation: 1,
				}}
			>
				<ThemedText
					style={{
						fontSize: 14,
						fontWeight: "bold",
						color: Colors.light.tint,
						marginBottom: 8,
						letterSpacing: 0.2,
					}}
				>
					<Feather name="activity" size={16} color={Colors.light.tint} />{" "}
					Laboratory Results
				</ThemedText>
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					style={{ marginBottom: 4 }}
				>
					{dummyHealth.labs.map((lab: LabResultItem) => (
						<TouchableOpacity key={lab.id} onPress={() => setSelectedItem(lab)}>
							<ThemedView
								className="mb-2 bg-slate-100 dark:bg-neutral-800 rounded-lg py-2 px-2"
								style={{
									minWidth: 120,
									maxWidth: 180,
									height: 80,
									marginRight: 10,
									alignItems: "flex-start",
									justifyContent: "center",
									shadowColor: Colors.light.tint,
									shadowOpacity: 0.07,
									shadowRadius: 3,
									elevation: 1,
									borderLeftWidth: 4,
									borderLeftColor:
										lab.result === "Normal" ? "#059669" : "#e11d48",
								}}
							>
								<View
									style={{
										flexDirection: "row",
										alignItems: "center",
										marginBottom: 4,
										flexWrap: "wrap",
										maxWidth: 110,
									}}
								>
									<Feather
										name="activity"
										size={14}
										color={Colors.light.tint}
										style={{ marginRight: 4 }}
									/>
									<ThemedText
										style={{
											fontSize: 13,
											color: Colors.light.tint,
											fontWeight: "bold",
											letterSpacing: 0.1,
											flexShrink: 1,
											flexWrap: "wrap",
											maxWidth: 90,
										}}
										numberOfLines={2}
										ellipsizeMode="tail"
									>
										{lab.test}
									</ThemedText>
								</View>
								<ThemedText
									style={{
										fontSize: 12,
										color: "#444",
										marginBottom: 1,
										flexWrap: "wrap",
										maxWidth: 110,
									}}
									numberOfLines={2}
									ellipsizeMode="tail"
								>
									<Feather
										name="calendar"
										size={10}
										color={Colors.light.tint}
									/>{" "}
									{format(lab.date, "MMMM d, yyyy")}
								</ThemedText>
								<ThemedText
									style={{
										fontSize: 12,
										color: lab.result === "Normal" ? "#059669" : "#e11d48",
										fontWeight: "bold",
										flexWrap: "wrap",
										maxWidth: 110,
									}}
									numberOfLines={2}
									ellipsizeMode="tail"
								>
									{lab.result}
								</ThemedText>
							</ThemedView>
						</TouchableOpacity>
					))}
				</ScrollView>
			</ThemedView>
			<HealthSectionModal
				visible={!!selectedItem}
				onClose={() => setSelectedItem(null)}
			>
				{selectedItem ? (
					<>
						<ThemedText
							style={{
								fontSize: 18,
								fontWeight: "bold",
								color: Colors.light.tint,
								marginBottom: 8,
							}}
						>
							{selectedItem.test}
						</ThemedText>
						<ThemedText
							style={{ fontSize: 15, color: "#444", marginBottom: 4 }}
						>
							<Feather name="calendar" size={14} color={Colors.light.tint} />{" "}
							{format(selectedItem.date, "MMMM d, yyyy")}
						</ThemedText>
						<ThemedText
							style={{
								fontSize: 15,
								color: selectedItem.result === "Normal" ? "#059669" : "#e11d48",
								fontWeight: "bold",
								marginBottom: 4,
							}}
						>
							Result: {selectedItem.result}
						</ThemedText>
					</>
				) : null}
			</HealthSectionModal>
		</>
	);
}
