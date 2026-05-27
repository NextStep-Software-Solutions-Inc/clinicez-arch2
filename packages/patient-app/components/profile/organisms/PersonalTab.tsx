import type { Patient, PatientAddress, PhilhealthProfile } from "@/db/schema";
import { InfoRow } from "../atoms/InfoRow";
import { SectionCard } from "../molecules/SectionCard";

const PATIENT_TYPE_LABELS: Record<string, string> = {
	MM: "Member (MM)",
	DD: "Dependent (DD)",
};

const WALKED_IN_LABELS: Record<string, string> = {
	Y: "Yes",
	N: "No",
};

type Props = {
	patient: Patient | null;
	primaryAddress?: PatientAddress | null;
	secondaryAddress?: PatientAddress | null;
	clerkEmail?: string | null;
	philhealthProfile?: PhilhealthProfile | null;
	onEditBasic: () => void;
	onEditPrimaryAddress: () => void;
	onEditSecondaryAddress: () => void;
	onEditPhilhealth: () => void;
};

/** Personal tab: demographics, contact info, both addresses, and PhilHealth profile. */
export function PersonalTab({
	patient,
	primaryAddress,
	secondaryAddress,
	clerkEmail,
	philhealthProfile,
	onEditBasic,
	onEditPrimaryAddress,
	onEditSecondaryAddress,
	onEditPhilhealth,
}: Props) {
	return (
		<>
			{/* Demographics */}
			<SectionCard
				title="Demographics"
				icon="user"
				accentColor="#0a7ea4"
				onEdit={onEditBasic}
			>
				<InfoRow label="First Name" value={patient?.firstName} icon="type" />
				<InfoRow label="Middle Name" value={patient?.middleName} icon="type" />
				<InfoRow label="Last Name" value={patient?.lastName} icon="type" />
				<InfoRow label="Suffix" value={patient?.suffix} icon="tag" />
				<InfoRow label="Sex" value={patient?.sex} icon="user" />
				<InfoRow label="Date of Birth" value={patient?.dob} icon="calendar" />
				<InfoRow
					label="Civil Status"
					value={patient?.civilStatus}
					icon="heart"
				/>
				<InfoRow
					label="Blood Type"
					value={patient?.bloodType}
					icon="droplet"
					iconColor="#ef4444"
				/>
				<InfoRow label="Nationality" value={patient?.nationality} icon="flag" />
				<InfoRow label="Religion" value={patient?.religion} icon="book" />
			</SectionCard>

			{/* Contact & IDs */}
			<SectionCard
				title="Contact & IDs"
				icon="phone"
				accentColor="#10b981"
				onEdit={onEditBasic}
			>
				<InfoRow
					label="PhilHealth ID"
					value={patient?.philhealthId}
					icon="credit-card"
					iconColor="#10b981"
				/>
				<InfoRow
					label="Email"
					value={patient?.email ?? clerkEmail}
					icon="mail"
					iconColor="#10b981"
				/>
				<InfoRow
					label="Phone"
					value={patient?.phone}
					icon="phone"
					iconColor="#10b981"
				/>
			</SectionCard>

			{/* Primary Address */}
			<SectionCard
				title="Primary Address"
				icon="map-pin"
				accentColor="#f59e0b"
				onEdit={onEditPrimaryAddress}
			>
				<InfoRow
					label="House / Street"
					value={primaryAddress?.houseStreet}
					icon="home"
					iconColor="#f59e0b"
				/>
				<InfoRow
					label="Barangay"
					value={primaryAddress?.barangay}
					icon="map"
					iconColor="#f59e0b"
				/>
				<InfoRow
					label="City / Municipality"
					value={primaryAddress?.cityMunicipality}
					icon="map"
					iconColor="#f59e0b"
				/>
				<InfoRow
					label="Province"
					value={primaryAddress?.province}
					icon="map"
					iconColor="#f59e0b"
				/>
				<InfoRow
					label="Region"
					value={primaryAddress?.region}
					icon="map"
					iconColor="#f59e0b"
				/>
				<InfoRow
					label="ZIP Code"
					value={primaryAddress?.zipCode}
					icon="hash"
					iconColor="#f59e0b"
				/>
				<InfoRow
					label="Country"
					value={primaryAddress?.country}
					icon="globe"
					iconColor="#f59e0b"
				/>
			</SectionCard>

			{/* Secondary Address */}
			<SectionCard
				title="Secondary Address"
				icon="map-pin"
				accentColor="#8b5cf6"
				onEdit={onEditSecondaryAddress}
			>
				<InfoRow
					label="House / Street"
					value={secondaryAddress?.houseStreet}
					icon="home"
					iconColor="#8b5cf6"
				/>
				<InfoRow
					label="Barangay"
					value={secondaryAddress?.barangay}
					icon="map"
					iconColor="#8b5cf6"
				/>
				<InfoRow
					label="City / Municipality"
					value={secondaryAddress?.cityMunicipality}
					icon="map"
					iconColor="#8b5cf6"
				/>
				<InfoRow
					label="Province"
					value={secondaryAddress?.province}
					icon="map"
					iconColor="#8b5cf6"
				/>
				<InfoRow
					label="Region"
					value={secondaryAddress?.region}
					icon="map"
					iconColor="#8b5cf6"
				/>
				<InfoRow
					label="ZIP Code"
					value={secondaryAddress?.zipCode}
					icon="hash"
					iconColor="#8b5cf6"
				/>
				<InfoRow
					label="Country"
					value={secondaryAddress?.country}
					icon="globe"
					iconColor="#8b5cf6"
				/>
			</SectionCard>

			{/* PhilHealth Enrolment */}
			<SectionCard
				title="PhilHealth Enrolment"
				icon="shield"
				accentColor="#22c55e"
				onEdit={onEditPhilhealth}
			>
				<InfoRow
					label="Patient Type"
					value={
						philhealthProfile?.patientType
							? PATIENT_TYPE_LABELS[philhealthProfile.patientType]
							: undefined
					}
					icon="users"
					iconColor="#22c55e"
				/>
				<InfoRow
					label="PhilHealth PIN"
					value={patient?.philhealthId}
					icon="credit-card"
					iconColor="#22c55e"
				/>
				<InfoRow
					label="Primary Member PIN"
					value={philhealthProfile?.memPin}
					icon="user-check"
					iconColor="#22c55e"
				/>
				<InfoRow
					label="Effectivity Year"
					value={philhealthProfile?.effYear}
					icon="calendar"
					iconColor="#22c55e"
				/>
				<InfoRow
					label="Authorization Transaction Code"
					value={philhealthProfile?.atc}
					icon="key"
					iconColor="#22c55e"
				/>
				<InfoRow
					label="Walked In"
					value={
						philhealthProfile?.isWalkedIn
							? WALKED_IN_LABELS[philhealthProfile.isWalkedIn]
							: undefined
					}
					icon="log-in"
					iconColor="#22c55e"
				/>
			</SectionCard>
		</>
	);
}
