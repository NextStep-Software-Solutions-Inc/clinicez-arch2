import { Feather } from "@expo/vector-icons";
import { format } from "date-fns/format";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";
import dummyHealth from "@/screens/HealthScreenData";
import { HealthSectionModal } from "../../components/HealthSectionModal";

type ClinicVisitItem = (typeof dummyHealth.hospitalVisits)[number];

export default function ClinicVisitsSection() {
	const [selectedItem, setSelectedItem] = useState<ClinicVisitItem | null>(
		null,
	);

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
					className="text-base font-bold mb-2 tracking-tight"
					style={{ color: Colors.light.tint }}
				>
					<Feather name="map-pin" size={16} color={Colors.light.tint} /> Clinic
					Visits
				</ThemedText>
				<ThemedView
					style={{
						borderLeftWidth: 2,
						borderLeftColor: `${Colors.light.tint}55`,
						paddingLeft: 10,
					}}
				>
					{dummyHealth.hospitalVisits.map((visit: ClinicVisitItem) => (
						<TouchableOpacity
							key={visit.id}
							onPress={() => setSelectedItem(visit)}
						>
							<ThemedView style={{ marginBottom: 12, position: "relative" }}>
								<View
									style={{
										position: "absolute",
										left: -16,
										top: 6,
										width: 10,
										height: 10,
										borderRadius: 5,
										backgroundColor: Colors.light.tint,
										justifyContent: "center",
										alignItems: "center",
									}}
								>
									<Feather name="map-pin" size={7} color="#fff" />
								</View>
								<ThemedText
									style={{
										fontSize: 12,
										color: Colors.light.tint,
										fontWeight: "bold",
										marginBottom: 2,
									}}
								>
									{format(visit.date, "MMMM d, yyyy, hh:mm a")}
								</ThemedText>
								<ThemedText
									style={{ fontSize: 12, color: "#444", marginBottom: 2 }}
								>
									{visit.reason}
								</ThemedText>
							</ThemedView>
						</TouchableOpacity>
					))}
				</ThemedView>
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
							Clinic Visit
						</ThemedText>
						<ThemedText
							style={{ fontSize: 15, color: "#444", marginBottom: 4 }}
						>
							<Feather name="calendar" size={14} color={Colors.light.tint} />{" "}
							{format(selectedItem.date, "MMMM d, yyyy, hh:mm a")}
						</ThemedText>
						<ThemedText
							style={{ fontSize: 15, color: "#444", marginBottom: 4 }}
						>
							<Feather name="info" size={14} color={Colors.light.tint} />{" "}
							{selectedItem.reason}
						</ThemedText>
					</>
				) : null}
			</HealthSectionModal>
		</>
	);
}
