import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { BottomTabBarButtonProps } from "expo-router/js-tabs";
import { PlatformPressable } from "expo-router/react-navigation";
import { StyleSheet, View } from "react-native";

export function ElevatedCenterTab({
	style,
	...props
}: BottomTabBarButtonProps) {
	return (
		<PlatformPressable
			{...props}
			style={styles.wrapper}
			onPressIn={(ev) => {
				if (process.env.EXPO_OS === "ios") {
					Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
				}
				props.onPressIn?.(ev);
			}}
		>
			<View style={styles.fab}>
				<Feather name="plus" size={28} color="#fff" />
			</View>
		</PlatformPressable>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		overflow: "visible",
	},
	fab: {
		width: 58,
		height: 58,
		borderRadius: 29,
		backgroundColor: "#0a7ea4",
		alignItems: "center",
		justifyContent: "center",
		transform: [{ translateY: -14 }],
		borderWidth: 3,
		borderColor: "#fff",
		elevation: 10,
		shadowColor: "#0a7ea4",
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.45,
		shadowRadius: 10,
	},
});
