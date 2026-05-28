import { useUser } from "@clerk/expo";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { updatePatientAvatarUrl } from "@/services/patientService";

type Props = {
	patientId: string | undefined;
	onSuccess: (newUri: string) => void;
};

const JPEG_QUALITY = 0.82; // 0–1

/**
 * Headless controller that launches the native image-picker (with built-in
 * crop/zoom and compression), uploads it to Clerk, and syncs the new URL to
 * the local patient record.
 *
 * Returns a `pickAndUpload` trigger and an `uploading` flag for the caller to
 * wire up to the `AvatarWithEdit` molecule.
 */
export function useAvatarPicker({ patientId, onSuccess }: Props) {
	const { user: clerkUser } = useUser();
	const [uploading, setUploading] = useState(false);

	async function pickAndUpload() {
		// 1. Request permission
		const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (status !== "granted") {
			Alert.alert(
				"Permission required",
				"Please allow photo library access in Settings to change your avatar.",
			);
			return;
		}

		// 2. Launch picker with native crop/zoom and built-in compression
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			allowsEditing: true,
			aspect: [1, 1],
			quality: JPEG_QUALITY,
		});

		if (result.canceled || !result.assets[0]) return;

		setUploading(true);
		try {
			const asset = result.assets[0];

			if (!clerkUser) throw new Error("Not signed in.");
			await clerkUser.setProfileImage({ file: asset.uri });

			// Clerk updates imageUrl on the user object — use it
			const newUrl = clerkUser.imageUrl;

			// 3. Persist to local DB so it survives offline restarts
			if (patientId) {
				await updatePatientAvatarUrl(patientId, newUrl);
			}

			onSuccess(newUrl);
		} catch (err) {
			Alert.alert(
				"Upload failed",
				err instanceof Error ? err.message : "Please try again.",
			);
		} finally {
			setUploading(false);
		}
	}

	return { pickAndUpload, uploading };
}

// ---------------------------------------------------------------------------
// Optional prompt sheet (shows camera vs. library choice)
// ---------------------------------------------------------------------------

type SheetProps = {
	visible: boolean;
	patientId: string | undefined;
	onSuccess: (newUri: string) => void;
	onClose: () => void;
};

/**
 * Bottom-sheet prompt letting the patient choose between their camera and
 * photo library. Delegates the actual pick + upload to `useAvatarPicker`.
 */
export function AvatarPickerSheet({
	visible,
	patientId,
	onSuccess,
	onClose,
}: SheetProps) {
	const { user: clerkUser } = useUser();
	const [uploading, setUploading] = useState(false);

	async function launchSource(source: "library" | "camera") {
		onClose();

		const permFn =
			source === "camera"
				? ImagePicker.requestCameraPermissionsAsync
				: ImagePicker.requestMediaLibraryPermissionsAsync;

		const { status } = await permFn();
		if (status !== "granted") {
			Alert.alert(
				"Permission required",
				`Please allow ${source === "camera" ? "camera" : "photo library"} access in Settings.`,
			);
			return;
		}

		const launchFn =
			source === "camera"
				? ImagePicker.launchCameraAsync
				: ImagePicker.launchImageLibraryAsync;

		const result = await launchFn({
			mediaTypes: ["images"],
			allowsEditing: true,
			aspect: [1, 1],
			quality: JPEG_QUALITY,
		});

		if (result.canceled || !result.assets[0]) return;

		setUploading(true);
		try {
			const asset = result.assets[0];

			if (!clerkUser) throw new Error("Not signed in.");
			await clerkUser.setProfileImage({ file: asset.uri });

			const newUrl = clerkUser.imageUrl;
			if (patientId) {
				await updatePatientAvatarUrl(patientId, newUrl);
			}

			onSuccess(newUrl);
		} catch (err) {
			Alert.alert(
				"Upload failed",
				err instanceof Error ? err.message : "Please try again.",
			);
		} finally {
			setUploading(false);
		}
	}

	if (!visible && !uploading) return null;

	return (
		<View
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: "rgba(0,0,0,0.5)",
				justifyContent: "flex-end",
				zIndex: 200,
			}}
		>
			<TouchableOpacity
				style={{ flex: 1 }}
				activeOpacity={1}
				onPress={onClose}
			/>
			<View
				style={{
					backgroundColor: "white",
					borderTopLeftRadius: 20,
					borderTopRightRadius: 20,
					paddingHorizontal: 20,
					paddingTop: 16,
					paddingBottom: 40,
					gap: 12,
				}}
			>
				<ThemedText
					style={{
						fontSize: 16,
						fontWeight: "700",
						color: "#1e293b",
						marginBottom: 4,
						textAlign: "center",
					}}
				>
					Update Profile Photo
				</ThemedText>

				{(
					[
						{ label: "Take Photo", source: "camera", icon: "📷" },
						{ label: "Choose from Library", source: "library", icon: "🖼️" },
					] as const
				).map(({ label, source, icon }) => (
					<TouchableOpacity
						key={source}
						onPress={() => launchSource(source)}
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: 12,
							paddingVertical: 14,
							paddingHorizontal: 16,
							backgroundColor: "#f8fafc",
							borderRadius: 12,
							borderWidth: 1,
							borderColor: "#e2e8f0",
						}}
					>
						<ThemedText style={{ fontSize: 22 }}>{icon}</ThemedText>
						<ThemedText
							style={{ fontSize: 15, fontWeight: "600", color: "#0a7ea4" }}
						>
							{label}
						</ThemedText>
					</TouchableOpacity>
				))}

				<TouchableOpacity onPress={onClose} style={{ paddingVertical: 10 }}>
					<ThemedText
						style={{
							textAlign: "center",
							color: "#94a3b8",
							fontSize: 14,
							fontWeight: "600",
						}}
					>
						Cancel
					</ThemedText>
				</TouchableOpacity>
			</View>
		</View>
	);
}
