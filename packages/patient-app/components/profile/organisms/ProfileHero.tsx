import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useColorScheme } from "@/hooks/useColorScheme";
import { StatChip } from "../atoms/StatChip";
import { AvatarWithEdit } from "../molecules/AvatarWithEdit";

type Props = {
	avatarUri: string;
	fullName: string;
	bloodType?: string | null;
	sex?: string | null;
	dob?: string | null;
	civilStatus?: string | null;
	philhealthId?: string | null;
	avatarUploading?: boolean;
	onAvatarPress: () => void;
};

/** Calculates age in years from an ISO date string. */
function calcAge(dob: string | null | undefined): string | null {
	if (!dob) return null;
	const birth = new Date(dob);
	if (Number.isNaN(birth.getTime())) return null;
	const today = new Date();
	let age = today.getFullYear() - birth.getFullYear();
	const m = today.getMonth() - birth.getMonth();
	// Subtract 1 if the birthday hasn't occurred yet this year
	if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
	return `${age} yrs`;
}

/**
 * Hero section at the top of the profile: gradient banner, avatar with edit
 * overlay, patient name, PhilHealth badge, and quick-stat chips.
 */
export function ProfileHero({
	avatarUri,
	fullName,
	bloodType,
	sex,
	dob,
	civilStatus,
	philhealthId,
	avatarUploading,
	onAvatarPress,
}: Props) {
	const isDark = useColorScheme() === "dark";
	const age = calcAge(dob);

	return (
		<View style={{ marginBottom: 20 }}>
			<LinearGradient
				colors={isDark ? ["#0f2a38", "#071820"] : ["#0a7ea4", "#065a78"]}
				start={{ x: 0, y: 0 }}
				end={{ x: 1, y: 1 }}
				style={{
					borderRadius: 20,
					paddingTop: 28,
					paddingBottom: 52,
					paddingHorizontal: 20,
					alignItems: "center",
				}}
			>
				<AvatarWithEdit
					uri={avatarUri}
					size={96}
					uploading={avatarUploading}
					onPress={onAvatarPress}
				/>

				<ThemedText
					style={{
						fontSize: 22,
						fontWeight: "800",
						color: "white",
						marginTop: 12,
						textAlign: "center",
					}}
				>
					{fullName}
				</ThemedText>

				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: 6,
						marginTop: 4,
					}}
				>
					<View
						style={{
							backgroundColor: "rgba(255,255,255,0.18)",
							borderRadius: 20,
							paddingHorizontal: 10,
							paddingVertical: 3,
						}}
					>
						<ThemedText
							style={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}
						>
							Patient
						</ThemedText>
					</View>
					{philhealthId ? (
						<View
							style={{
								backgroundColor: "rgba(255,255,255,0.18)",
								borderRadius: 20,
								paddingHorizontal: 10,
								paddingVertical: 3,
							}}
						>
							<ThemedText
								style={{ fontSize: 12, color: "rgba(255,255,255,0.9)" }}
							>
								PhilHealth: {philhealthId}
							</ThemedText>
						</View>
					) : null}
				</View>
			</LinearGradient>

			{/* Quick-stat chips — float over the gradient bottom edge */}
			<View
				style={{
					flexDirection: "row",
					justifyContent: "center",
					flexWrap: "wrap",
					gap: 8,
					marginTop: -28,
					paddingHorizontal: 16,
				}}
			>
				<StatChip
					label="Blood Type"
					value={bloodType}
					icon="droplet"
					color="#ef4444"
				/>
				<StatChip label="Age" value={age} icon="calendar" color="#f59e0b" />
				<StatChip label="Sex" value={sex} icon="user" color="#0a7ea4" />
				<StatChip
					label="Civil Status"
					value={civilStatus}
					icon="heart"
					color="#8b5cf6"
				/>
			</View>
		</View>
	);
}
