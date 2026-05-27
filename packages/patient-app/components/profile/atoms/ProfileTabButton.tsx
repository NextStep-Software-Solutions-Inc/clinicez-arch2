import { Feather } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";
import { ThemedText } from "@/components/ThemedText";

type Props = {
	id: string;
	label: string;
	icon: React.ComponentProps<typeof Feather>["name"];
	isActive: boolean;
	onPress: () => void;
};

/** A single pill-style tab button used inside ProfileTabBar. */
export function ProfileTabButton({ label, icon, isActive, onPress }: Props) {
	return (
		<TouchableOpacity
			onPress={onPress}
			style={{
				flex: 1,
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "center",
				gap: 4,
				paddingVertical: 9,
				borderRadius: 10,
				backgroundColor: isActive ? "white" : "transparent",
				shadowColor: "#000",
				shadowOffset: { width: 0, height: 1 },
				shadowOpacity: isActive ? 0.08 : 0,
				shadowRadius: 4,
				elevation: isActive ? 2 : 0,
			}}
		>
			<Feather name={icon} size={13} color={isActive ? "#0a7ea4" : "#94a3b8"} />
			<ThemedText
				style={{
					fontSize: 12,
					fontWeight: isActive ? "700" : "500",
					color: isActive ? "#0a7ea4" : "#94a3b8",
				}}
			>
				{label}
			</ThemedText>
		</TouchableOpacity>
	);
}
