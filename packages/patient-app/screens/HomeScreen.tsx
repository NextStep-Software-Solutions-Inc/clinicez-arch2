import { useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { Image, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatChip } from "@/components/profile/atoms/StatChip";
import { SectionCard } from "@/components/profile/molecules/SectionCard";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useColorScheme } from "@/hooks/useColorScheme";
import { usePatientProfile } from "@/hooks/usePatientProfile";
import { getMockAppointments } from "@/services/mockData";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) return "Good morning";
	if (hour < 17) return "Good afternoon";
	return "Good evening";
}

function formatApptShort(isoDate: string, time: string): string {
	const parsed = new Date(isoDate);
	if (Number.isNaN(parsed.getTime())) return time;
	const date = new Intl.DateTimeFormat("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
	}).format(parsed);
	return `${date} · ${time}`;
}

function getStatusColor(status: string): string {
	if (status === "Confirmed") return "#10b981";
	if (status === "Pending") return "#f59e0b";
	return "#ef4444";
}

// ── Quick actions definition ──────────────────────────────────────────────────

type QuickAction = {
	key: string;
	icon: React.ComponentProps<typeof Feather>["name"];
	label: string;
	color: string;
};

const QUICK_ACTIONS: QuickAction[] = [
	{
		key: "appointments",
		icon: "calendar",
		label: "Appointments",
		color: "#0a7ea4",
	},
	{ key: "files", icon: "file-text", label: "My Files", color: "#8b5cf6" },
	{ key: "health", icon: "activity", label: "Health", color: "#10b981" },
	{ key: "profile", icon: "user", label: "Profile", color: "#f59e0b" },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
	const { user: clerkUser } = useUser();
	const { patient, isLoading } = usePatientProfile();
	const isDark = useColorScheme() === "dark";

	const firstName = patient?.firstName ?? clerkUser?.firstName ?? "there";
	const avatarUri = useMemo(
		() =>
			clerkUser?.imageUrl ??
			`https://ui-avatars.com/api/?name=${encodeURIComponent(firstName)}&background=0a7ea4&color=fff`,
		[clerkUser?.imageUrl, firstName],
	);

	const allAppointments = getMockAppointments();
	const nextAppointment = allAppointments[0] ?? null;
	const upcomingCount = allAppointments.length;

	return (
		<SafeAreaView edges={["left", "right"]} style={{ flex: 1 }}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ paddingBottom: 24 }}
			>
				{/* ── Hero banner ──────────────────────────────────────────── */}
				<ThemedView
					style={{
						backgroundColor: isDark ? "#0f172a" : "#0a7ea4",
						paddingHorizontal: 20,
						paddingTop: 20,
						paddingBottom: 28,
					}}
				>
					<ThemedView
						style={{
							flexDirection: "row",
							alignItems: "center",
							backgroundColor: "transparent",
						}}
					>
						<Image
							source={{ uri: avatarUri }}
							style={{
								width: 52,
								height: 52,
								borderRadius: 26,
								borderWidth: 2,
								borderColor: "rgba(255,255,255,0.6)",
								backgroundColor: "#e2e8f0",
							}}
						/>
						<ThemedView
							style={{
								marginLeft: 14,
								flex: 1,
								backgroundColor: "transparent",
							}}
						>
							<ThemedText
								style={{
									fontSize: 13,
									color: "rgba(255,255,255,0.75)",
									marginBottom: 2,
								}}
							>
								{getGreeting()}
							</ThemedText>
							<ThemedText
								style={{ fontSize: 20, fontWeight: "800", color: "#ffffff" }}
								numberOfLines={1}
							>
								{isLoading ? "…" : firstName}
							</ThemedText>
						</ThemedView>
						<ThemedView
							style={{
								backgroundColor: "rgba(255,255,255,0.18)",
								borderRadius: 20,
								padding: 8,
							}}
						>
							<Feather name="bell" size={20} color="#ffffff" />
						</ThemedView>
					</ThemedView>

					{/* Health stat chips inline with hero */}
					<ThemedView
						style={{
							flexDirection: "row",
							gap: 10,
							marginTop: 20,
							backgroundColor: "transparent",
						}}
					>
						<StatChip
							label="Blood Type"
							value={patient?.bloodType ?? "—"}
							icon="droplet"
							color="#ef4444"
						/>
						<StatChip
							label="Appointments"
							value={`${upcomingCount}`}
							icon="calendar"
							color="#ffffff"
						/>
						<StatChip
							label="Status"
							value={patient ? "Active" : "—"}
							icon="shield"
							color="#10b981"
						/>
					</ThemedView>
				</ThemedView>

				<ThemedView style={{ paddingHorizontal: 16, paddingTop: 20, gap: 4 }}>
					{/* ── Next appointment ────────────────────────────────── */}
					<SectionCard
						title="Next Appointment"
						icon="calendar"
						accentColor="#0a7ea4"
					>
						{nextAppointment ? (
							<ThemedView style={{ backgroundColor: "transparent" }}>
								<ThemedView
									style={{
										flexDirection: "row",
										alignItems: "center",
										marginBottom: 12,
										backgroundColor: "transparent",
									}}
								>
									<ThemedView
										style={{
											width: 44,
											height: 44,
											borderRadius: 22,
											backgroundColor: isDark ? "#1e3a5f" : "#e0f2fe",
											alignItems: "center",
											justifyContent: "center",
											marginRight: 12,
										}}
									>
										<Feather name="user" size={20} color="#0a7ea4" />
									</ThemedView>
									<ThemedView
										style={{
											flex: 1,
											backgroundColor: "transparent",
										}}
									>
										<ThemedText
											style={{ fontSize: 15, fontWeight: "700" }}
											className="dark:text-slate-100"
											numberOfLines={1}
										>
											{nextAppointment.doctor}
										</ThemedText>
										<ThemedText
											style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}
											numberOfLines={1}
										>
											{nextAppointment.clinicName}
										</ThemedText>
									</ThemedView>
									<ThemedView
										style={{
											paddingHorizontal: 8,
											paddingVertical: 3,
											borderRadius: 20,
											backgroundColor: `${getStatusColor(nextAppointment.status)}18`,
										}}
									>
										<ThemedText
											style={{
												fontSize: 11,
												fontWeight: "700",
												color: getStatusColor(nextAppointment.status),
											}}
										>
											{nextAppointment.status}
										</ThemedText>
									</ThemedView>
								</ThemedView>

								<ThemedView
									style={{
										flexDirection: "row",
										alignItems: "center",
										backgroundColor: isDark ? "#1e293b" : "#f8fafc",
										borderRadius: 10,
										padding: 10,
										gap: 8,
									}}
								>
									<Feather name="clock" size={14} color="#0a7ea4" />
									<ThemedText
										style={{ fontSize: 13, fontWeight: "600", flex: 1 }}
										className="dark:text-slate-300"
									>
										{formatApptShort(
											nextAppointment.date,
											nextAppointment.time,
										)}
									</ThemedText>
								</ThemedView>

								<ThemedText
									style={{ fontSize: 13, color: "#64748b", marginTop: 10 }}
								>
									{nextAppointment.about}
								</ThemedText>
							</ThemedView>
						) : (
							<ThemedView
								style={{
									alignItems: "center",
									paddingVertical: 12,
									backgroundColor: "transparent",
								}}
							>
								<Feather
									name="calendar"
									size={36}
									color={isDark ? "#475569" : "#cbd5e1"}
									style={{ marginBottom: 8 }}
								/>
								<ThemedText
									style={{
										fontSize: 14,
										color: "#64748b",
										textAlign: "center",
									}}
								>
									No upcoming appointments.{"\n"}Schedule your next visit below.
								</ThemedText>
							</ThemedView>
						)}

						{/* Book appointment CTA */}
						<TouchableOpacity
							activeOpacity={0.8}
							style={{
								marginTop: 14,
								backgroundColor: "#0a7ea4",
								borderRadius: 12,
								paddingVertical: 11,
								alignItems: "center",
								flexDirection: "row",
								justifyContent: "center",
								gap: 8,
							}}
						>
							<Feather name="plus-circle" size={16} color="#ffffff" />
							<ThemedText
								style={{ color: "#ffffff", fontWeight: "700", fontSize: 14 }}
							>
								Book Appointment
							</ThemedText>
						</TouchableOpacity>
					</SectionCard>

					{/* ── Quick actions ────────────────────────────────────── */}
					<SectionCard title="Quick Access" icon="grid" accentColor="#8b5cf6">
						<ThemedView
							style={{
								flexDirection: "row",
								flexWrap: "wrap",
								gap: 10,
								backgroundColor: "transparent",
							}}
						>
							{QUICK_ACTIONS.map((action) => (
								<TouchableOpacity
									key={action.key}
									activeOpacity={0.75}
									style={{
										flex: 1,
										minWidth: "44%",
										backgroundColor: isDark
											? `${action.color}22`
											: `${action.color}12`,
										borderRadius: 14,
										paddingVertical: 16,
										alignItems: "center",
										borderWidth: 1,
										borderColor: isDark
											? `${action.color}44`
											: `${action.color}28`,
									}}
								>
									<ThemedView
										style={{
											width: 40,
											height: 40,
											borderRadius: 20,
											backgroundColor: `${action.color}22`,
											alignItems: "center",
											justifyContent: "center",
											marginBottom: 8,
										}}
									>
										<Feather
											name={action.icon}
											size={18}
											color={action.color}
										/>
									</ThemedView>
									<ThemedText
										style={{
											fontSize: 13,
											fontWeight: "700",
											color: action.color,
											textAlign: "center",
										}}
									>
										{action.label}
									</ThemedText>
								</TouchableOpacity>
							))}
						</ThemedView>
					</SectionCard>

					{/* ── Upcoming list ─────────────────────────────────────── */}
					{allAppointments.length > 1 && (
						<SectionCard
							title="Upcoming Visits"
							icon="list"
							accentColor="#10b981"
						>
							{allAppointments.slice(1, 4).map((appt, idx) => (
								<ThemedView
									key={appt.id}
									style={{ backgroundColor: "transparent" }}
								>
									{idx > 0 && (
										<ThemedView
											style={{
												height: 1,
												backgroundColor: isDark ? "#1e293b" : "#f1f5f9",
												marginVertical: 10,
											}}
										/>
									)}
									<ThemedView
										style={{
											flexDirection: "row",
											alignItems: "center",
											gap: 10,
											backgroundColor: "transparent",
										}}
									>
										<ThemedView
											style={{
												width: 8,
												height: 8,
												borderRadius: 4,
												backgroundColor: getStatusColor(appt.status),
											}}
										/>
										<ThemedView
											style={{
												flex: 1,
												backgroundColor: "transparent",
											}}
										>
											<ThemedText
												style={{ fontSize: 14, fontWeight: "600" }}
												className="dark:text-slate-200"
												numberOfLines={1}
											>
												{appt.doctor}
											</ThemedText>
											<ThemedText
												style={{
													fontSize: 12,
													color: "#94a3b8",
													marginTop: 1,
												}}
											>
												{formatApptShort(appt.date, appt.time)}
											</ThemedText>
										</ThemedView>
										<ThemedText
											style={{ fontSize: 12, color: "#64748b" }}
											numberOfLines={1}
										>
											{appt.about}
										</ThemedText>
									</ThemedView>
								</ThemedView>
							))}

							{allAppointments.length > 4 && (
								<TouchableOpacity
									activeOpacity={0.7}
									style={{
										marginTop: 14,
										flexDirection: "row",
										alignItems: "center",
										justifyContent: "center",
										gap: 4,
									}}
								>
									<ThemedText
										style={{
											fontSize: 13,
											fontWeight: "600",
											color: "#0a7ea4",
										}}
									>
										View all {allAppointments.length} appointments
									</ThemedText>
									<Feather name="chevron-right" size={14} color="#0a7ea4" />
								</TouchableOpacity>
							)}
						</SectionCard>
					)}
				</ThemedView>

				<ThemedText
					style={{
						fontSize: 11,
						color: "#94a3b8",
						textAlign: "center",
						marginTop: 8,
						marginBottom: 4,
					}}
				>
					Powered by NextStep Software Inc.
				</ThemedText>
			</ScrollView>
		</SafeAreaView>
	);
}
