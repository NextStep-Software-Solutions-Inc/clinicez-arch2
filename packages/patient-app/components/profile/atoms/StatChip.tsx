import { Feather } from "@expo/vector-icons";
import { View } from "react-native";
import { ThemedText } from "@/components/ThemedText";

type Props = {
	label: string;
	value?: string | null;
	icon: React.ComponentProps<typeof Feather>["name"];
	color: string;
};

/** A compact vertical chip showing an icon, a value, and a sub-label. */
export function StatChip({ label, value, icon, color }: Props) {
	return (
		<View
			style={{
				backgroundColor: `${color}12`,
				borderRadius: 12,
				paddingHorizontal: 12,
				paddingVertical: 9,
				alignItems: "center",
				minWidth: 78,
				borderWidth: 1,
				borderColor: `${color}22`,
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
				style={{ fontSize: 10, color: "#94a3b8", textAlign: "center" }}
			>
				{label}
			</ThemedText>
		</View>
	);
}
