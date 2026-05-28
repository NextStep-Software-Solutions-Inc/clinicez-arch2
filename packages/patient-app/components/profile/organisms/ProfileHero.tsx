import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
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
	const age = calcAge(dob);

	return (
		<ThemedView className="mb-5">
			<ThemedView className="rounded-2xl bg-white dark:bg-slate-800 shadow-md p-4">
				<ThemedView className="flex-row items-center">
					<AvatarWithEdit
						uri={avatarUri}
						size={88}
						uploading={avatarUploading}
						onPress={onAvatarPress}
					/>

					<ThemedView className="ml-4 flex-1">
						<ThemedText className="text-lg font-extrabold text-slate-900 dark:text-white">
							{fullName}
						</ThemedText>

						<ThemedView className="flex-row items-center mt-1 space-x-2">
							<ThemedView className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700">
								<ThemedText className="text-xs text-slate-700 dark:text-slate-200">
									Patient
								</ThemedText>
							</ThemedView>

							{philhealthId ? (
								<ThemedView className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700">
									<ThemedText className="text-xs text-slate-700 dark:text-slate-200">
										PhilHealth: {philhealthId}
									</ThemedText>
								</ThemedView>
							) : null}
						</ThemedView>
					</ThemedView>
				</ThemedView>

				<ThemedView className="flex-row mt-4 w-full">
					<ThemedView className="flex-1 items-center px-1">
						<StatChip
							label="Blood Type"
							value={bloodType}
							icon="droplet"
							color="#ef4444"
						/>
					</ThemedView>

					<ThemedView className="flex-1 items-center px-1">
						<StatChip label="Age" value={age} icon="calendar" color="#f59e0b" />
					</ThemedView>

					<ThemedView className="flex-1 items-center px-1">
						<StatChip label="Sex" value={sex} icon="user" color="#0a7ea4" />
					</ThemedView>

					<ThemedView className="flex-1 items-center px-1">
						<StatChip
							label="Civil Status"
							value={civilStatus}
							icon="heart"
							color="#8b5cf6"
						/>
					</ThemedView>
				</ThemedView>
			</ThemedView>
		</ThemedView>
	);
}
