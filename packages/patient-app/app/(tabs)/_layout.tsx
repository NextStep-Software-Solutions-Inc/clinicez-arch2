import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { ElevatedCenterTab } from "@/components/ElevatedCenterTab";
import { GlobalHeader } from "@/components/GlobalHeader";
import { HapticTab } from "@/components/HapticTab";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

const currentClinic = {
	name: "Downtown Medical Center",
	address: "123 Main St, Cityville",
	// logo: '...' // could add logo uri here
};
export default function TabLayout() {
	const colorScheme = useColorScheme();

	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
				tabBarInactiveTintColor: Colors[colorScheme ?? "light"].tabIconDefault,
				headerShown: true,
				header: () => <GlobalHeader />,
				tabBarButton: HapticTab,
				tabBarBackground: TabBarBackground,
				tabBarLabelStyle: {
					fontSize: 10,
					fontWeight: "600",
					marginTop: 2,
				},
				tabBarStyle: Platform.select({
					ios: {
						backgroundColor: Colors[colorScheme ?? "light"].background,
						height: 68,
						paddingBottom: 10,
						paddingTop: 6,
						borderTopWidth: 0,
						overflow: "visible",
						shadowColor: "#000",
						shadowOffset: { width: 0, height: -3 },
						shadowOpacity: 0.07,
						shadowRadius: 8,
					},
					default: {
						backgroundColor: Colors[colorScheme ?? "light"].background,
						height: 68,
						paddingBottom: 10,
						paddingTop: 6,
						borderTopWidth: 0,
						overflow: "visible",
						elevation: 12,
					},
				}),
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					tabBarLabel: "Home",
					tabBarIcon: ({ color }) => (
						<Feather size={24} name="home" color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="appointments"
				options={{
					tabBarLabel: "Appointments",
					tabBarIcon: ({ color }) => (
						<Feather size={24} name="calendar" color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="book-appointment"
				options={{
					tabBarLabel: "",
					tabBarIcon: () => null,
					tabBarButton: ElevatedCenterTab,
				}}
			/>
			<Tabs.Screen
				name="files"
				options={{
					tabBarLabel: "Files",
					tabBarIcon: ({ color }) => (
						<Feather size={24} name="file-text" color={color} />
					),
				}}
			/>
			<Tabs.Screen
				name="health"
				options={{
					href: null,
				}}
			/>
			<Tabs.Screen
				name="profile"
				options={{
					tabBarLabel: "Profile",
					tabBarIcon: ({ color }) => (
						<Feather size={24} name="user" color={color} />
					),
				}}
			/>
		</Tabs>
	);
}
