import { Feather } from "@expo/vector-icons";
import { View } from "react-native";

type Props = {
	name: React.ComponentProps<typeof Feather>["name"];
	color: string;
	size?: number;
	badgeSize?: number;
};

/** A Feather icon centered in a soft-tinted rounded square. */
export function IconBadge({ name, color, size = 14, badgeSize = 28 }: Props) {
	return (
		<View
			style={{
				width: badgeSize,
				height: badgeSize,
				borderRadius: badgeSize * 0.35,
				backgroundColor: `${color}20`,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Feather name={name} size={size} color={color} />
		</View>
	);
}
