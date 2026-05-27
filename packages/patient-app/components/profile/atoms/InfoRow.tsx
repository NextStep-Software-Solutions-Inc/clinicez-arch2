import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { IconBadge } from "./IconBadge";

type Props = {
	label: string;
	value?: string | null;
	icon?: React.ComponentProps<typeof Feather>["name"];
	iconColor?: string;
};

/** A single labeled field row with an optional icon badge. */
export function InfoRow({ label, value, icon, iconColor = "#0a7ea4" }: Props) {
	return (
		<View
			style={{
				flexDirection: "row",
				alignItems: "flex-start",
				marginBottom: 10,
				gap: 10,
			}}
		>
			{icon ? (
				<IconBadge name={icon} color={iconColor} size={14} badgeSize={32} />
			) : null}
			<View style={{ flex: 1 }}>
				<ThemedText
					style={{
						fontSize: 10,
						color: "#94a3b8",
						textTransform: "uppercase",
						letterSpacing: 0.6,
						marginBottom: 1,
					}}
				>
					{label}
				</ThemedText>
				<ThemedText
					style={{ fontSize: 14, fontWeight: "500", color: "#1e293b" }}
					className="dark:text-slate-200"
				>
					{value || "—"}
				</ThemedText>
			</View>
		</View>
	);
}
