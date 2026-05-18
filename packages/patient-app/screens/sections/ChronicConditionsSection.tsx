import { Feather } from "@expo/vector-icons";
import { format } from "date-fns/format";
import { useState } from "react";
import { TouchableOpacity } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";
import dummyHealth from "@/screens/HealthScreenData";
import { HealthSectionModal } from "../../components/HealthSectionModal";

type ChronicConditionItem = (typeof dummyHealth.chronicConditions)[number];

export default function ChronicConditionsSection() {
	const [selectedItem, setSelectedItem] = useState<ChronicConditionItem | null>(
		null,
	);

	return (
		<>
			<ThemedView
				className="bg-white dark:bg-neutral-900 rounded-xl py-4 px-3 mb-3 self-center shadow-md w-full"
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
					<Feather name="alert-circle" size={15} color={Colors.light.tint} />{" "}
					Chronic Conditions
				</ThemedText>
				{dummyHealth.chronicConditions.map((cond: ChronicConditionItem) => (
					<TouchableOpacity key={cond.id} onPress={() => setSelectedItem(cond)}>
						{/* <ThemedView style={{ marginBottom: 8, backgroundColor: Colors.light.tint + '11', borderRadius: 8, padding: 8 }}> */}
						<ThemedView className="mb-2 bg-slate-100 dark:bg-neutral-800 rounded-lg py-2 px-2">
							<ThemedText
								className="text-base font-semibold"
								style={{ color: Colors.light.tint }}
							>
								<Feather
									name="check-circle"
									size={12}
									color={Colors.light.tint}
									style={{ marginRight: 4 }}
								/>{" "}
								{cond.name}
							</ThemedText>
							<ThemedText className="text-sm text-slate-500 dark:text-neutral-300">
								<Feather name="calendar" size={10} color={Colors.light.tint} />{" "}
								{format(cond.diagnosed, "MMMM d, yyyy")}
							</ThemedText>
							<ThemedText className="text-sm text-slate-500 dark:text-neutral-300">
								<Feather name="user" size={10} color={Colors.light.tint} />{" "}
								{cond.doctor}
							</ThemedText>
							<ThemedText
								className="text-sm text-slate-500 dark:text-neutral-300"
								numberOfLines={2}
								ellipsizeMode="tail"
							>
								<Feather name="info" size={9} color={Colors.light.tint} />{" "}
								{cond.notes}
							</ThemedText>
						</ThemedView>
					</TouchableOpacity>
				))}
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
							{selectedItem.name}
						</ThemedText>
						<ThemedText
							style={{ fontSize: 15, color: "#444", marginBottom: 4 }}
						>
							<Feather name="calendar" size={14} color={Colors.light.tint} />{" "}
							{format(selectedItem.diagnosed, "MMMM d, yyyy")}
						</ThemedText>
						<ThemedText
							style={{ fontSize: 15, color: "#444", marginBottom: 4 }}
						>
							<Feather name="user" size={14} color={Colors.light.tint} />{" "}
							{selectedItem.doctor}
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
