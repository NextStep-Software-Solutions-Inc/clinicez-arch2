import type { Feather } from "@expo/vector-icons";
import type {
	HealthDeclaration,
	HealthDeclarationCategory,
	PatientImmunization,
	PatientMenstrualHistory,
	PatientSocialHistory,
} from "@/db/schema";
import { InfoRow } from "../atoms/InfoRow";
import { HealthCategoryCard } from "../molecules/HealthCategoryCard";
import { SectionCard } from "../molecules/SectionCard";

type CategoryMeta = {
	label: string;
	icon: React.ComponentProps<typeof Feather>["name"];
	color: string;
};

const CATEGORIES: Record<HealthDeclarationCategory, CategoryMeta> = {
	allergy: { label: "Allergies", icon: "alert-circle", color: "#ef4444" },
	disability: { label: "Disabilities", icon: "shield", color: "#8b5cf6" },
	illness: { label: "Illnesses", icon: "thermometer", color: "#f59e0b" },
	chronic_condition: {
		label: "Chronic Conditions",
		icon: "heart",
		color: "#dc2626",
	},
	current_medication: {
		label: "Current Medications",
		icon: "package",
		color: "#3b82f6",
	},
	past_surgery: {
		label: "Surgical History",
		icon: "scissors",
		color: "#14b8a6",
	},
	family_history: {
		label: "Family History",
		icon: "users",
		color: "#10b981",
	},
	immunization: {
		label: "Immunizations",
		icon: "check-circle",
		color: "#06b6d4",
	},
	lifestyle_habit: {
		label: "Lifestyle & Habits",
		icon: "coffee",
		color: "#84cc16",
	},
};

const MEDICAL_CATS: HealthDeclarationCategory[] = [
	"allergy",
	"disability",
	"illness",
	"chronic_condition",
	"current_medication",
	"past_surgery",
	"immunization",
];

const FAMILY_CATS: HealthDeclarationCategory[] = ["family_history"];
const SOCIAL_CATS: HealthDeclarationCategory[] = ["lifestyle_habit"];

const YN_LABELS: Record<string, string> = {
	Y: "Yes",
	N: "No",
	X: "Quit",
};

type Props = {
	declarations: HealthDeclaration[];
	onAdd: (category: HealthDeclarationCategory) => void;
	onDelete: (id: string, patientId: string) => void;
	patientId: string;
	socialHistory?: PatientSocialHistory | null;
	immunization?: PatientImmunization | null;
	menstrualHistory?: PatientMenstrualHistory | null;
	patientSex?: string | null;
	onEditSocialHistory: () => void;
	onEditImmunization: () => void;
	onEditMenstrualHistory: () => void;
};

/** Medical tab: health declarations + structured PhilHealth clinical data. */
export function MedicalTab({
	declarations,
	onAdd,
	onDelete,
	patientId,
	socialHistory,
	immunization,
	menstrualHistory,
	patientSex,
	onEditSocialHistory,
	onEditImmunization,
	onEditMenstrualHistory,
}: Props) {
	function renderGroup(
		title: string,
		icon: React.ComponentProps<typeof Feather>["name"],
		accentColor: string,
		cats: HealthDeclarationCategory[],
	) {
		return (
			<SectionCard title={title} icon={icon} accentColor={accentColor}>
				{cats.map((cat) => {
					const meta = CATEGORIES[cat];
					const items = declarations.filter((d) => d.category === cat);
					return (
						<HealthCategoryCard
							key={cat}
							label={meta.label}
							icon={meta.icon}
							color={meta.color}
							items={items}
							onAdd={() => onAdd(cat)}
							onDelete={(id) => onDelete(id, patientId)}
						/>
					);
				})}
			</SectionCard>
		);
	}

	return (
		<>
			{renderGroup("Medical History", "activity", "#0a7ea4", MEDICAL_CATS)}
			{renderGroup("Family History", "users", "#10b981", FAMILY_CATS)}

			{/* Structured Social / Personal History (PhilHealth SOCHIST) */}
			<SectionCard
				title="Social / Personal History"
				icon="coffee"
				accentColor="#84cc16"
				onEdit={onEditSocialHistory}
			>
				<InfoRow
					label="Smoker"
					value={
						socialHistory?.isSmoker
							? YN_LABELS[socialHistory.isSmoker]
							: undefined
					}
					icon="wind"
					iconColor="#84cc16"
				/>
				<InfoRow
					label="Cigarette Packs / Year"
					value={socialHistory?.noCigpk?.toString()}
					icon="box"
					iconColor="#84cc16"
				/>
				<InfoRow
					label="Alcohol Drinker"
					value={
						socialHistory?.isAdrinker
							? YN_LABELS[socialHistory.isAdrinker]
							: undefined
					}
					icon="droplet"
					iconColor="#84cc16"
				/>
				<InfoRow
					label="Bottles / Day"
					value={socialHistory?.noBottles?.toString()}
					icon="box"
					iconColor="#84cc16"
				/>
				<InfoRow
					label="Illicit Drug User"
					value={
						socialHistory?.illDrugUser
							? YN_LABELS[socialHistory.illDrugUser]
							: undefined
					}
					icon="alert-triangle"
					iconColor="#ef4444"
				/>
				<InfoRow
					label="Sexually Active"
					value={
						socialHistory?.isSexuallyActive
							? YN_LABELS[socialHistory.isSexuallyActive]
							: undefined
					}
					icon="heart"
					iconColor="#84cc16"
				/>
			</SectionCard>

			{/* Immunization Record (PhilHealth IMMUNIZATION) */}
			<SectionCard
				title="Immunization Record"
				subtitle="PhilHealth vaccination program record"
				icon="check-circle"
				accentColor="#06b6d4"
				onEdit={onEditImmunization}
			>
				<InfoRow
					label="Child Vaccines"
					value={immunization?.childImmcode}
					icon="check-circle"
					iconColor="#06b6d4"
				/>
				<InfoRow
					label="Young Women Vaccines"
					value={immunization?.youngwImmcode}
					icon="check-circle"
					iconColor="#06b6d4"
				/>
				<InfoRow
					label="Pregnancy Vaccines"
					value={immunization?.pregwImmcode}
					icon="check-circle"
					iconColor="#06b6d4"
				/>
				<InfoRow
					label="Senior / Elderly Vaccines"
					value={immunization?.elderlyImmcode}
					icon="check-circle"
					iconColor="#06b6d4"
				/>
				<InfoRow
					label="Other Vaccines / Immunizations"
					value={immunization?.otherImm}
					icon="plus-circle"
					iconColor="#06b6d4"
				/>
			</SectionCard>

			{/* Menstrual History — female patients only (PhilHealth MENSHIST) */}
			{(patientSex === "Female" || menstrualHistory) && (
				<SectionCard
					title="Menstrual History"
					icon="activity"
					accentColor="#ec4899"
					onEdit={onEditMenstrualHistory}
				>
					<InfoRow
						label="Age at Menarche"
						value={menstrualHistory?.menarchePeriod?.toString()}
						icon="calendar"
						iconColor="#ec4899"
					/>
					<InfoRow
						label="Last Menstrual Period"
						value={menstrualHistory?.lastMensPeriod}
						icon="calendar"
						iconColor="#ec4899"
					/>
					<InfoRow
						label="Period Duration (days)"
						value={menstrualHistory?.periodDuration?.toString()}
						icon="clock"
						iconColor="#ec4899"
					/>
					<InfoRow
						label="Cycle Interval (days)"
						value={menstrualHistory?.mensInterval?.toString()}
						icon="refresh-cw"
						iconColor="#ec4899"
					/>
					<InfoRow
						label="Pads / Day"
						value={menstrualHistory?.padsPerDay?.toString()}
						icon="layers"
						iconColor="#ec4899"
					/>
					<InfoRow
						label="Age at First Sexual Intercourse"
						value={menstrualHistory?.onsetSexIc?.toString()}
						icon="user"
						iconColor="#ec4899"
					/>
					<InfoRow
						label="Birth Control Method"
						value={menstrualHistory?.birthCtrlMethod}
						icon="shield"
						iconColor="#ec4899"
					/>
					<InfoRow
						label="Menopause"
						value={
							menstrualHistory?.isMenopause
								? YN_LABELS[menstrualHistory.isMenopause]
								: undefined
						}
						icon="sun"
						iconColor="#ec4899"
					/>
					<InfoRow
						label="Age at Menopause"
						value={menstrualHistory?.menopauseAge?.toString()}
						icon="calendar"
						iconColor="#ec4899"
					/>
				</SectionCard>
			)}

			{renderGroup("Lifestyle & Habits", "coffee", "#84cc16", SOCIAL_CATS)}
		</>
	);
}
