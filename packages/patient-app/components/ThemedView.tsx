import { View, type ViewProps } from "react-native";
import { useThemeColor } from "@/hooks/useThemeColor";

export type ThemedViewProps = ViewProps & {
	lightColor?: string;
	darkColor?: string;
	className?: string;
};

export function ThemedView({
	style,
	lightColor,
	darkColor,
	className,
	...otherProps
}: ThemedViewProps) {
	// Only set backgroundColor if lightColor or darkColor is provided
	const hasCustomBg = !!lightColor || !!darkColor;
	const backgroundColor = useThemeColor(
		{ light: lightColor, dark: darkColor },
		"background",
	);

	return (
		<View
			style={hasCustomBg ? [{ backgroundColor }, style] : style}
			className={className}
			{...otherProps}
		/>
	);
}
