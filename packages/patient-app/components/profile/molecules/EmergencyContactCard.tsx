import { Feather } from "@expo/vector-icons";
import { TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import type { EmergencyContact } from "@/db/schema";
import { EmptyState } from "../atoms/EmptyState";
import { InfoRow } from "../atoms/InfoRow";

type Props = {
	label: string;
	contact?: EmergencyContact | null;
	onEdit: () => void;
};

/** Displays one emergency contact (primary or secondary) with an edit button. */
export function EmergencyContactCard({ label, contact, onEdit }: Props) {
	return (
		<View style={{ marginBottom: 4 }}>
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 8,
				}}
			>
				<ThemedText
					style={{ fontSize: 13, fontWeight: "700", color: "#0a7ea4" }}
				>
					{label}
				</ThemedText>
				<TouchableOpacity
					onPress={onEdit}
					hitSlop={10}
					style={{
						backgroundColor: "#0a7ea415",
						borderRadius: 8,
						padding: 5,
					}}
				>
					<Feather name="edit-2" size={13} color="#0a7ea4" />
				</TouchableOpacity>
			</View>

			{contact ? (
				<View>
					<InfoRow
						label="Name"
						value={contact.name}
						icon="user"
					/>
					<InfoRow
						label="Relationship"
						value={contact.relationship}
						icon="link"
					/>
					<InfoRow
						label="Phone"
						value={contact.phone}
						icon="phone"
					/>
					<InfoRow
						label="Email"
						value={contact.email}
						icon="mail"
					/>
					<InfoRow
						label="Address"
						value={contact.address}
						icon="map-pin"
					/>
				</View>
			) : (
				<EmptyState message="Not set. Tap edit to add." />
			)}
		</View>
	);
}
