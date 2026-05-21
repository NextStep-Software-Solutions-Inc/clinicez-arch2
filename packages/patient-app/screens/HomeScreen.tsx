import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ComponentProps } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HelloWave } from "@/components/HelloWave";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useColorScheme } from "@/hooks/useColorScheme";
import { getMockAppointments, MOCK_HEALTH_OVERVIEW } from "@/services/mockData";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

const QUICK_LINKS: {
	key: string;
	icon: { name: FeatherIconName; color: string };
	bg: string;
	title: string;
	titleClass: string;
	desc: string;
}[] = [
	{
		key: "appointments",
		icon: { name: "calendar", color: "#2563eb" },
		bg: "bg-blue-100 dark:bg-blue-900/60",
		title: "Appointments",
		titleClass: "text-blue-900 dark:text-blue-100",
		desc: "See and manage your upcoming visits",
	},
	{
		key: "health",
		icon: { name: "heart", color: "#059669" },
		bg: "bg-green-100 dark:bg-green-900/60",
		title: "Health",
		titleClass: "text-green-900 dark:text-green-100",
		desc: "View your records and results",
	},
	{
		key: "profile",
		icon: { name: "user", color: "#334155" },
		bg: "bg-slate-100 dark:bg-slate-800/60",
		title: "Profile",
		titleClass: "text-slate-900 dark:text-slate-100",
		desc: "Manage your account",
	},
];

function formatApptDate(isoDate: string): string {
	return new Intl.DateTimeFormat("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(new Date(isoDate));
}

export default function HomeScreen() {
	const colorScheme = useColorScheme();

	const appointments = getMockAppointments().slice(0, 5);
	const healthOverview = MOCK_HEALTH_OVERVIEW;

	return (
		<SafeAreaView edges={["left", "right"]} className="flex-1 px-0 py-0">
			<ScrollView
				contentContainerStyle={{ flexGrow: 1 }}
				showsVerticalScrollIndicator={false}
			>
				<ThemedView className="flex-1 w-full">
					{/* Greeting */}
					<ThemedView className="px-4 mt-4">
						<ThemedView className="flex-row items-center w-full">
							<HelloWave />
							<ThemedText className="text-4xl font-black text-blue-700 dark:text-blue-300 leading-tight">
								{" "}
								Hi, Wave!
							</ThemedText>
						</ThemedView>
						<ThemedText className="text-xl text-slate-600 dark:text-slate-300 mb-4 text-left w-full">
							Here’s what’s happening with your health today.
						</ThemedText>
						{/* Current Clinic Context moved to header */}
					</ThemedView>

					{/* Health Overview Card - Modernized */}
					<ThemedView
						className="mx-4 flex-1 rounded-3xl shadow-xl shadow-blue-200 p-0 mb-7 overflow-hidden bg-white/90 dark:bg-slate-800"
						style={{
							elevation: 4,
							shadowColor: "#2563eb",
							shadowOffset: { width: 0, height: 6 },
							shadowOpacity: 0.13,
							shadowRadius: 12,
						}}
					>
						<ThemedView
							className=" w-full h-full absolute left-0 top-0"
							style={{ zIndex: 0 }}
						>
							<Feather
								name="activity"
								size={120}
								color="#bae5fd83"
								style={{
									position: "absolute",
									right: -30,
									top: -30,
									zIndex: 0,
								}}
							/>
							<LinearGradient
								colors={
									colorScheme === "dark"
										? ["#1e293b", "#334155"]
										: ["#f0f9ff", "#e0e7ff"]
								}
								start={{ x: 0, y: 0 }}
								end={{ x: 1, y: 1 }}
								style={{
									position: "absolute",
									left: 0,
									top: 0,
									right: 0,
									bottom: 0,
									opacity: 0.7,
								}}
							/>
						</ThemedView>
						<ThemedView
							className="flex-row items-center mb-4 px-6 pt-6"
							style={{ zIndex: 1 }}
						>
							<Feather
								name="activity"
								size={28}
								color="#649199ff"
								style={{ marginRight: 12 }}
							/>
							<ThemedText className="font-extrabold text-blue-900 dark:text-blue-100">
								Health Overview
							</ThemedText>
						</ThemedView>
						<ThemedView
							className="flex-row justify-between gap-4 px-6 pb-6 "
							style={{ zIndex: 1 }}
						>
							{healthOverview.map((item) => (
								<ThemedView key={item.id} className="items-center flex-1">
									<ThemedView
										className={`mb-2 px-4 py-2 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-sm`}
										style={{ minWidth: 70, maxWidth: 90, alignItems: "center" }}
									>
										<ThemedText
											className={`text-sm font-black ${item.color}`}
											numberOfLines={1}
											ellipsizeMode="tail"
											style={{ textAlign: "center" }}
										>
											{item.value}
										</ThemedText>
									</ThemedView>
									<ThemedText className="text-slate-500 dark:text-slate-400 font-semibold mt-1 text-center">
										{item.label}
									</ThemedText>
								</ThemedView>
							))}
						</ThemedView>
					</ThemedView>

					{/* Upcoming Appointments - Modern Glassmorphism Cards */}
					<ThemedText className="text-lg font-bold text-blue-900 dark:text-blue-200 mb-2 px-6">
						Upcoming Appointments
					</ThemedText>
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={{
							gap: 16,
							paddingHorizontal: 16,
							paddingBottom: 8,
						}}
						style={{ overflow: "visible" }}
					>
						{appointments.length === 0 ? (
							<ThemedView
								className="min-w-[270px] max-w-[320px] rounded-2xl overflow-hidden shadow-md bg-white/90 dark:bg-slate-900/80 items-center justify-center p-8"
								style={{
									minHeight: 220,
									elevation: 2,
									shadowOffset: { width: 0, height: 4 },
									shadowOpacity: 0.1,
									shadowRadius: 8,
								}}
							>
								<Feather
									name="calendar"
									size={48}
									color="#2563eb"
									style={{ marginBottom: 12 }}
								/>
								<ThemedText className="text-lg font-bold text-blue-900 dark:text-blue-100 mb-2 text-center">
									No upcoming appointments
								</ThemedText>
								<ThemedText className="text-base text-slate-500 dark:text-slate-400 text-center mb-4">
									You're all caught up! Schedule your next visit when you're
									ready.
								</ThemedText>
								<ThemedView className="flex-row justify-center">
									<ThemedText className="text-base font-semibold text-blue-700 dark:text-blue-300 mr-1">
										Book Now
									</ThemedText>
									<Feather name="chevron-right" size={20} color="#2563eb" />
								</ThemedView>
							</ThemedView>
						) : (
							appointments.map((appt) => (
								<ThemedView
									key={appt.id}
									className="min-w-[270px] max-w-[320px] rounded-2xl overflow-hidden shadow-md bg-white dark:bg-slate-900/80"
									style={{
										elevation: 2,
										shadowOffset: { width: 0, height: 4 },
										shadowOpacity: 0.1,
										shadowRadius: 8,
									}}
								>
									<ThemedView
										className="flex-1 px-5 py-5 justify-between"
										style={{ zIndex: 1 }}
									>
										{/* Avatar and info row */}
										<ThemedView className="flex-row items-center mb-2">
											<ThemedView
												className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 items-center justify-center mr-3 shadow-md"
												style={{ elevation: 2 }}
											>
												<Feather name="user" size={24} color="#2563eb" />
											</ThemedView>
											<ThemedView className="flex-1">
												<ThemedText
													className="font-extrabold text-blue-900 dark:text-blue-100 mb-0.5"
													numberOfLines={1}
												>
													{appt.doctor}
												</ThemedText>
												<ThemedText
													className="text-xs text-slate-600 dark:text-slate-300 mb-0.5"
													numberOfLines={1}
												>
													{appt.clinicName}
												</ThemedText>
											</ThemedView>
										</ThemedView>
										{/* Date/time pill */}
										<ThemedView className="mb-2 px-3 py-1 rounded-full bg-blue-600/90 dark:bg-blue-700/90 self-start">
											<ThemedText className="text-xs font-bold text-white tracking-wide">
												{formatApptDate(appt.date)} · {appt.time}
											</ThemedText>
										</ThemedView>
										{/* Details section at bottom */}
										<ThemedView className="w-full mt-2">
											<ThemedText className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
												{appt.about}
											</ThemedText>
											<ThemedView className="flex-row items-center">
												<ThemedText className="text-xs text-blue-700 dark:text-blue-300 mr-1">
													Details
												</ThemedText>
												<Feather
													name="chevron-right"
													size={20}
													color="#2563eb"
												/>
											</ThemedView>
										</ThemedView>
									</ThemedView>
								</ThemedView>
							))
						)}
					</ScrollView>

					{/* Quick Links */}
					{/* Quick Links - Refactored to use array and map */}
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={{
							gap: 16,
							paddingHorizontal: 16,
							alignItems: "flex-start",
							marginBlock: 8,
						}}
					>
						{QUICK_LINKS.map((link) => (
							<ThemedView
								key={link.key}
								className={`min-w-[130px] max-w-[150px] h-40 ${link.bg} rounded-xl p-4 items-center justify-center shadow-md`}
								style={{
									elevation: 2,
									shadowColor: "#000",
									shadowOffset: { width: 0, height: 3 },
									shadowOpacity: 0.1,
									shadowRadius: 3,
									height: 160,
								}}
							>
								<Feather
									name={link.icon.name as keyof typeof Feather.glyphMap}
									size={20}
									color={link.icon.color}
									style={{ marginBottom: 4 }}
								/>
								<ThemedText
									className={`text-lg font-extrabold mb-1 text-center ${link.titleClass}`}
								>
									{link.title}
								</ThemedText>
								<ThemedText className="text-sm text-slate-500 dark:text-slate-400 text-center">
									{link.desc}
								</ThemedText>
							</ThemedView>
						))}
					</ScrollView>

					<ThemedText className="text-base text-slate-400 dark:text-slate-500 text-center mt-auto mb-2">
						Powered by NextStep Software Inc.
					</ThemedText>
				</ThemedView>
			</ScrollView>
		</SafeAreaView>
	);
}
