import type { Feather } from "@expo/vector-icons";
import type { HealthDeclaration, HealthDeclarationCategory } from "@/db/schema";
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

type Props = {
	declarations: HealthDeclaration[];
	onAdd: (category: HealthDeclarationCategory) => void;
	onDelete: (id: string, patientId: string) => void;
	patientId: string;
};

/** Medical tab: health declarations grouped into three themed section cards. */
export function MedicalTab({
	declarations,
	onAdd,
	onDelete,
	patientId,
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
			{renderGroup("Social History", "coffee", "#84cc16", SOCIAL_CATS)}
		</>
	);
}
