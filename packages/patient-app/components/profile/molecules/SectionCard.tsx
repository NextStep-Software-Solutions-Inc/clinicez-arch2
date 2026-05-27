import { Feather } from "@expo/vector-icons";
import { TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { IconBadge } from "../atoms/IconBadge";

type Props = {
	title: string;
	subtitle?: string;
	icon?: React.ComponentProps<typeof Feather>["name"];
	accentColor?: string;
	onEdit?: () => void;
	children: React.ReactNode;
};

/**
 * Card with a coloured left-border accent, a header row (icon + title +
 * optional edit button) and a content area. Supports dark mode via inline
 * style overrides passed from the parent when needed.
 */
export function SectionCard({
	title,
	subtitle,
	icon,
	accentColor = "#0a7ea4",
	onEdit,
	children,
}: Props) {
	return (
		<View
			style={{
				backgroundColor: "white",
				borderRadius: 16,
				marginBottom: 12,
				shadowColor: "#000",
				shadowOffset: { width: 0, height: 2 },
				shadowOpacity: 0.06,
				shadowRadius: 8,
				elevation: 3,
				overflow: "hidden",
			}}
		>
			{/* Header */}
			<View
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "space-between",
					paddingHorizontal: 16,
					paddingVertical: 12,
					borderBottomWidth: 1,
					borderBottomColor: "#f1f5f9",
					borderLeftWidth: 4,
					borderLeftColor: accentColor,
				}}
			>
				<View
					style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
				>
					{icon ? (
						<IconBadge name={icon} color={accentColor} size={14} badgeSize={28} />
					) : null}
					<View style={{ flex: 1 }}>
						<ThemedText
							style={{ fontSize: 14, fontWeight: "700", color: "#1e293b" }}
							className="dark:text-slate-100"
						>
							{title}
						</ThemedText>
						{subtitle ? (
							<ThemedText
								style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}
							>
								{subtitle}
							</ThemedText>
						) : null}
					</View>
				</View>
				{onEdit ? (
					<TouchableOpacity
						onPress={onEdit}
						hitSlop={10}
						style={{
							backgroundColor: `${accentColor}18`,
							borderRadius: 8,
							padding: 6,
						}}
					>
						<Feather name="edit-2" size={13} color={accentColor} />
					</TouchableOpacity>
				) : null}
			</View>

			{/* Body */}
			<View style={{ padding: 16 }}>{children}</View>
		</View>
	);
}
