import { BottomSheet, Host } from "@expo/ui";
import { Feather } from "@expo/vector-icons";
import type React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { ThemedView } from "./ThemedView";

export type EditSheetProps = {
	visible: boolean;
	onClose: () => void;
	title: string;
	children?: React.ReactNode;
};

export default function EditSheet({
	visible,
	onClose,
	title,
	children,
}: EditSheetProps) {
	if (!visible) return null;

	return (
		<Host>
			<BottomSheet
				isPresented={visible}
				onDismiss={onClose}
				snapPoints={[{ height: 320 }, { fraction: 0.7 }]}
			>
				<ThemedView style={styles.contentContainer}>
					<ThemedView style={styles.headerRow}>
						<ThemedText style={styles.title}>{title}</ThemedText>
						<TouchableOpacity onPress={onClose}>
							<Feather name="x" size={24} color={Colors.light.tint} />
						</TouchableOpacity>
					</ThemedView>
					<ThemedView style={styles.scrollArea}>{children}</ThemedView>
				</ThemedView>
			</BottomSheet>
		</Host>
	);
}

const styles = StyleSheet.create({
	contentContainer: {
		flex: 1,
		padding: 24,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 12,
	},
	title: {
		color: Colors.light.tint,
		fontSize: 20,
		fontWeight: "bold",
	},
	scrollArea: {
		flex: 1,
	},
});
