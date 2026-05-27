import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Platform } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";

const notificationCount = 3;

type GlobalHeaderProps = {
	title: string;
	showSettings?: boolean;
};

export function GlobalHeader({
	title,
	showSettings = false,
}: GlobalHeaderProps) {
	const colorScheme = useColorScheme();
	const router = useRouter();

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
			{/* Screen title */}
			<ThemedView
				style={{
					flexDirection: "row",
					alignItems: "center",
					backgroundColor: Colors[colorScheme ?? "light"].background,
					borderRadius: 8,
					paddingVertical: 2,
				}}
			>
				<ThemedText
					style={{
						fontSize: 16,
						fontWeight: "bold",
						color: Colors[colorScheme ?? "light"].tint,
					}}
				>
					{title}
				</ThemedText>
			</ThemedView>
			{/* No app name in center for cleaner look */}
			{/* Actions */}
			<ThemedView
				style={{ flexDirection: "row", alignItems: "center", gap: 16 }}
			>
				{showSettings ? (
					<Feather
						name="settings"
						size={22}
						color={Colors[colorScheme ?? "light"].tint}
						onPress={() => router.push("/settings")}
					/>
				) : null}
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
