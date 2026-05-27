import { Feather } from "@expo/vector-icons";
import { Alert, TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";

type Props = {
	id: string;
	description: string;
	detail?: string | null;
	onsetDate?: string | null;
	treatingPhysician?: string | null;
	notes?: string | null;
	accentColor: string;
	onDelete: () => void;
};

/** A single health-declaration record row with a destructive delete action. */
export function HealthDeclarationItem({
	description,
	detail,
	onsetDate,
	treatingPhysician,
	notes,
	accentColor,
	onDelete,
}: Props) {
	function confirmDelete() {
		Alert.alert("Remove", `Remove "${description}"?`, [
			{ text: "Cancel", style: "cancel" },
			{ text: "Remove", style: "destructive", onPress: onDelete },
		]);
	}

	return (
		<View
			style={{
				marginBottom: 8,
				padding: 10,
				borderRadius: 10,
				backgroundColor: "#f8fafc",
				borderLeftWidth: 3,
				borderLeftColor: accentColor,
			}}
		>
			<View
				style={{
					flexDirection: "row",
					alignItems: "flex-start",
					justifyContent: "space-between",
				}}
			>
				<ThemedText
					style={{
						fontSize: 13,
						fontWeight: "600",
						color: "#1e293b",
						flex: 1,
						marginRight: 8,
					}}
					className="dark:text-slate-100"
				>
					{description}
				</ThemedText>
				<TouchableOpacity hitSlop={10} onPress={confirmDelete}>
					<Feather name="trash-2" size={13} color="#ef4444" />
				</TouchableOpacity>
			</View>
			{detail ? (
				<ThemedText style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
					{detail}
				</ThemedText>
			) : null}
			{onsetDate ? (
				<ThemedText style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
					Since {onsetDate}
				</ThemedText>
			) : null}
			{treatingPhysician ? (
				<ThemedText style={{ fontSize: 11, color: "#94a3b8" }}>
					{treatingPhysician}
				</ThemedText>
			) : null}
			{notes ? (
				<ThemedText
					style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}
				>
					{notes}
				</ThemedText>
			) : null}
		</View>
	);
}
