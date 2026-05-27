import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Image, TouchableOpacity, View } from "react-native";

type Props = {
	uri: string;
	size?: number;
	uploading?: boolean;
	onPress: () => void;
};

/**
 * Circular avatar with a camera-icon overlay button.
 * Shows an activity indicator while an upload is in progress.
 */
export function AvatarWithEdit({
	uri,
	size = 96,
	uploading = false,
	onPress,
}: Props) {
	const badgeSize = size * 0.3;

	return (
		<View style={{ position: "relative", width: size, height: size }}>
			<Image
				source={{ uri }}
				style={{
					width: size,
					height: size,
					borderRadius: size / 2,
					borderWidth: 3,
					borderColor: "white",
					backgroundColor: "#e2e8f0",
				}}
			/>

			{uploading ? (
				<View
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						borderRadius: size / 2,
						backgroundColor: "rgba(0,0,0,0.45)",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<ActivityIndicator color="white" size="small" />
				</View>
			) : (
				<TouchableOpacity
					onPress={onPress}
					activeOpacity={0.8}
					style={{
						position: "absolute",
						bottom: 0,
						right: 0,
						width: badgeSize,
						height: badgeSize,
						borderRadius: badgeSize / 2,
						backgroundColor: "#0a7ea4",
						alignItems: "center",
						justifyContent: "center",
						borderWidth: 2,
						borderColor: "white",
					}}
				>
					<Feather name="camera" size={badgeSize * 0.45} color="white" />
				</TouchableOpacity>
			)}
		</View>
	);
}

