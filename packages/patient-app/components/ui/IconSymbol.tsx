import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
	SymbolView,
	type SymbolViewProps,
	type SymbolWeight,
} from "expo-symbols";
import {
	type OpaqueColorValue,
	Platform,
	type StyleProp,
	type ViewStyle,
} from "react-native";

/**
 * Maps SF Symbol names (iOS) to MaterialIcons names (Android/Web).
 * Extend this map as new icon names are used in the app.
 */
const SF_TO_MATERIAL: Partial<
	Record<
		SymbolViewProps["name"],
		React.ComponentProps<typeof MaterialIcons>["name"]
	>
> = {
	"chevron.right": "chevron-right",
	"house.fill": "home",
	"paperplane.fill": "send",
	"person.crop.circle": "person",
};

export type IconSymbolName = keyof typeof SF_TO_MATERIAL;

export function IconSymbol({
	name,
	size = 24,
	color,
	style,
	weight = "regular",
}: {
	name: IconSymbolName;
	size?: number;
	color: string | OpaqueColorValue;
	style?: StyleProp<ViewStyle>;
	weight?: SymbolWeight;
}) {
	if (Platform.OS === "ios") {
		return (
			<SymbolView
				weight={weight}
				tintColor={color as string}
				resizeMode="scaleAspectFit"
				name={name as SymbolViewProps["name"]}
				style={[{ width: size, height: size }, style]}
			/>
		);
	}

	return (
		<MaterialIcons
			color={color as string}
			size={size}
			name={SF_TO_MATERIAL[name] ?? "help-outline"}
			// MaterialIcons style prop is typed as TextStyle; cast ViewStyle safely
			style={style}
		/>
	);
}
