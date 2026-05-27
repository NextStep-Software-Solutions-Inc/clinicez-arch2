import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useColorScheme } from "@/hooks/useColorScheme";

type Props = {
	label: string;
	value?: string | null;
	icon: React.ComponentProps<typeof Feather>["name"];
	color: string;
};

/** A compact vertical chip showing an icon, a value, and a sub-label. */
export function StatChip({ label, value, icon, color }: Props) {
	const scheme = useColorScheme();
	const isDark = scheme === "dark";
	return (
		<View
			style={{
				backgroundColor: isDark ? `${color}45` : `${color}12`,
				borderRadius: 12,
				paddingHorizontal: 12,
				paddingVertical: 9,
				alignItems: "center",
				minWidth: 78,
				borderWidth: 1,
				borderColor: isDark ? `${color}80` : `${color}22`,
			}}
		>
			<Feather
				name={icon}
				size={15}
				color={color}
				style={{ marginBottom: 3 }}
			/>
			<ThemedText
				style={{
					fontSize: 13,
					fontWeight: "700",
					color,
					marginBottom: 1,
					textAlign: "center",
				}}
			>
				{value || "—"}
			</ThemedText>
			<ThemedText
				style={{
					fontSize: 10,
					color: "#94a3b8",
					textAlign: "center",
				}}
			>
				{label}
			</ThemedText>
		</View>
	);
}
