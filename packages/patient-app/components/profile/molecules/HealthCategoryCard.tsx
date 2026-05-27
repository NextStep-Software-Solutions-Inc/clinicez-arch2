import { Feather } from "@expo/vector-icons";
import { TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import type { HealthDeclaration } from "@/db/schema";
import { EmptyState } from "../atoms/EmptyState";
import { IconBadge } from "../atoms/IconBadge";
import { HealthDeclarationItem } from "./HealthDeclarationItem";

type Props = {
	label: string;
	icon: React.ComponentProps<typeof Feather>["name"];
	color: string;
	items: HealthDeclaration[];
	onAdd: () => void;
	onDelete: (id: string) => void;
};

/**
 * Expandable card grouping health declarations by category.
 * Header shows the category icon + label + an "add" button.
 */
export function HealthCategoryCard({
	label,
	icon,
	color,
	items,
	onAdd,
	onDelete,
}: Props) {
	return (
		<View
			style={{
				marginBottom: 10,
				borderRadius: 12,
				backgroundColor: "#f8fafc",
				borderWidth: 1,
				borderColor: "#e2e8f0",
				overflow: "hidden",
			}}
		>
			{/* Category header */}
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "space-between",
					paddingHorizontal: 12,
					paddingVertical: 10,
					backgroundColor: `${color}0d`,
					borderBottomWidth: items.length > 0 ? 1 : 0,
					borderBottomColor: "#e2e8f0",
				}}
			>
				<View
					style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
				>
					<IconBadge name={icon} color={color} size={13} badgeSize={26} />
					<ThemedText
						style={{ fontSize: 13, fontWeight: "600", color: "#334155" }}
						className="dark:text-slate-200"
					>
						{label}
					</ThemedText>
					{items.length > 0 ? (
						<View
							style={{
								backgroundColor: color,
								borderRadius: 10,
								paddingHorizontal: 6,
								paddingVertical: 1,
								minWidth: 20,
								alignItems: "center",
							}}
						>
							<ThemedText
								style={{ fontSize: 10, color: "white", fontWeight: "700" }}
							>
								{items.length}
							</ThemedText>
						</View>
					) : null}
				</View>
				<TouchableOpacity
					onPress={onAdd}
					hitSlop={10}
					style={{
						backgroundColor: `${color}20`,
						borderRadius: 8,
						padding: 5,
					}}
				>
					<Feather name="plus" size={14} color={color} />
				</TouchableOpacity>
			</View>

			{/* Items */}
			{items.length > 0 ? (
				<View style={{ padding: 10, gap: 0 }}>
					{items.map((item) => (
						<HealthDeclarationItem
							key={item.id}
							id={item.id}
							description={item.description}
							detail={item.detail}
							onsetDate={item.onsetDate}
							treatingPhysician={item.treatingPhysician}
							notes={item.notes}
							accentColor={color}
							onDelete={() => onDelete(item.id)}
						/>
					))}
				</View>
			) : (
				<View style={{ padding: 12 }}>
					<EmptyState message="No records yet. Tap + to add." />
				</View>
			)}
		</View>
	);
}
