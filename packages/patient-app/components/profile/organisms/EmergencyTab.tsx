import { View } from "react-native";
import type { EmergencyContact } from "@/db/schema";
import { EmergencyContactCard } from "../molecules/EmergencyContactCard";
import { SectionCard } from "../molecules/SectionCard";

type Props = {
	primaryContact?: EmergencyContact | null;
	secondaryContact?: EmergencyContact | null;
	onEditPrimary: () => void;
	onEditSecondary: () => void;
};

/** Emergency tab: primary and secondary emergency contacts. */
export function EmergencyTab({
	primaryContact,
	secondaryContact,
	onEditPrimary,
	onEditSecondary,
}: Props) {
	return (
		<SectionCard
			title="Emergency Contacts"
			icon="phone"
			accentColor="#ef4444"
		>
			<EmergencyContactCard
				label="Primary Contact"
				contact={primaryContact}
				onEdit={onEditPrimary}
			/>
			<View
				style={{
					height: 1,
					backgroundColor: "#e2e8f0",
					marginVertical: 14,
				}}
			/>
			<EmergencyContactCard
				label="Secondary Contact"
				contact={secondaryContact}
				onEdit={onEditSecondary}
			/>
		</SectionCard>
	);
}
