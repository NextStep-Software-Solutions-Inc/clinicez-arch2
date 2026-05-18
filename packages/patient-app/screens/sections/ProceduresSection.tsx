import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";
import dummyHealth from "@/screens/HealthScreenData";
import { HealthSectionModal } from "../../components/HealthSectionModal";

type ProcedureItem = (typeof dummyHealth.procedures)[number];

export default function ProceduresSection() {
	const [selectedItem, setSelectedItem] = useState<ProcedureItem | null>(null);

	return (
		<>
			<ThemedView
				className="bg-white dark:bg-neutral-900 rounded-lg p-4 mb-4 self-center shadow-md w-full"
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
					<Feather name="tool" size={16} color={Colors.light.tint} /> Procedures
				</ThemedText>
				<ThemedView
					style={{
						borderLeftWidth: 2,
						borderLeftColor: `${Colors.light.tint}44`,
						paddingLeft: 10,
					}}
				>
					{dummyHealth.procedures.map((proc: ProcedureItem) => (
						<TouchableOpacity
							key={proc.id}
							onPress={() => setSelectedItem(proc)}
						>
							<ThemedView style={{ marginBottom: 12, position: "relative" }}>
								<View
									style={{
										position: "absolute",
										left: -16,
										top: 8,
										width: 10,
										height: 10,
										borderRadius: 5,
										backgroundColor: Colors.light.tint,
										justifyContent: "center",
										alignItems: "center",
									}}
								>
									<Feather name="tool" size={7} color="#fff" />
								</View>
								<ThemedText
									style={{
										fontSize: 14,
										color: Colors.light.tint,
										fontWeight: "bold",
										marginBottom: 1,
									}}
								>
									{proc.year}: {proc.procedure}
								</ThemedText>
								<ThemedText
									style={{ fontSize: 13, color: "#444", marginBottom: 1 }}
								>
									<Feather name="user" size={11} color={Colors.light.tint} />{" "}
									{proc.doctor}
								</ThemedText>
								<ThemedText
									style={{ fontSize: 12, color: "#888", marginBottom: 1 }}
								>
									<Feather name="map-pin" size={10} color={Colors.light.tint} />{" "}
									{proc.location}
								</ThemedText>
								<ThemedText style={{ fontSize: 12, color: "#888" }}>
									<Feather name="info" size={10} color={Colors.light.tint} />{" "}
									{proc.notes}
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
							{selectedItem.procedure}
						</ThemedText>
						<ThemedText
							style={{ fontSize: 15, color: "#444", marginBottom: 4 }}
						>
							<Feather name="calendar" size={14} color={Colors.light.tint} />{" "}
							{selectedItem.year}
						</ThemedText>
						<ThemedText
							style={{ fontSize: 15, color: "#444", marginBottom: 4 }}
						>
							<Feather name="user" size={14} color={Colors.light.tint} />{" "}
							{selectedItem.doctor}
						</ThemedText>
						<ThemedText
							style={{ fontSize: 14, color: "#888", marginBottom: 4 }}
						>
							<Feather name="map-pin" size={14} color={Colors.light.tint} />{" "}
							{selectedItem.location}
						</ThemedText>
						<ThemedText
							style={{ fontSize: 14, color: "#888", marginBottom: 10 }}
						>
							<Feather name="info" size={14} color={Colors.light.tint} />{" "}
							{selectedItem.notes}
						</ThemedText>
					</>
				) : null}
			</HealthSectionModal>
		</>
	);
}
