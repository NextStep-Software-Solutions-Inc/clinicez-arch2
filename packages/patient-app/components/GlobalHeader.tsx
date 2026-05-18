import { Feather } from "@expo/vector-icons";
import { Platform } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";

const notificationCount = 3;

export function GlobalHeader() {
	const colorScheme = useColorScheme();

	return (
		<ThemedView
			style={{
				flexDirection: "row",
				alignItems: "center",
				justifyContent: "space-between",
				paddingTop: Platform.select({
					ios: 54,
					android: 44,
					default: 24,
				}),
				paddingBottom: 12,
				paddingHorizontal: 16,
				backgroundColor: Colors[colorScheme ?? "light"].background,
				borderBottomWidth: 1,
				borderBottomColor: colorScheme === "dark" ? "#222" : "#e5e7eb",
				elevation: 5,
			}}
		>
			{/* App branding */}
			<ThemedView
				style={{
					flexDirection: "row",
					alignItems: "center",
					backgroundColor: Colors[colorScheme ?? "light"].background,
					borderRadius: 8,
					paddingVertical: 2,
				}}
			>
				<Feather
					name="activity"
					size={18}
					color={Colors[colorScheme ?? "light"].tint}
					style={{ marginRight: 6 }}
				/>
				<ThemedText
					style={{
						fontSize: 16,
						fontWeight: "bold",
						color: Colors[colorScheme ?? "light"].tint,
					}}
				>
					ClinicEZ
				</ThemedText>
			</ThemedView>
			{/* No app name in center for cleaner look */}
			{/* Actions */}
			<ThemedView
				style={{ flexDirection: "row", alignItems: "center", gap: 16 }}
			>
				{/* Notification Bell with Badge */}
				<ThemedView style={{ position: "relative", marginRight: 8 }}>
					<Feather
						name="bell"
						size={24}
						color={Colors[colorScheme ?? "light"].tint}
					/>
					<ThemedView
						style={{
							position: "absolute",
							top: -2,
							right: -2,
							backgroundColor: "red",
							borderRadius: 8,
							width: 16,
							height: 16,
							justifyContent: "center",
							alignItems: "center",
						}}
					>
						<ThemedText
							style={{ color: "white", fontSize: 10, fontWeight: "bold" }}
						>
							{notificationCount}
						</ThemedText>
					</ThemedView>
				</ThemedView>
			</ThemedView>
		</ThemedView>
	);
}
