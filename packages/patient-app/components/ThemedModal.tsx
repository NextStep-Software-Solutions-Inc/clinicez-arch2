import type React from "react";
import { Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";

export interface ThemedModalProps {
	visible: boolean;
	onClose: () => void;
	children: React.ReactNode;
}

export default function ThemedModal({
	visible,
	onClose,
	children,
}: ThemedModalProps) {
	return (
		<Modal
			visible={visible}
			animationType="slide"
			transparent
			onRequestClose={onClose}
		>
			<View style={styles.overlay}>
				<View style={styles.modalContent}>
					{children}
					<TouchableOpacity onPress={onClose} style={styles.closeButton}>
						<ThemedText style={styles.closeText}>Close</ThemedText>
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		justifyContent: "flex-end",
		backgroundColor: "rgba(0,0,0,0.25)",
	},
	modalContent: {
		backgroundColor: "#fff",
		borderTopLeftRadius: 14,
		borderTopRightRadius: 14,
		padding: 18,
		minHeight: 160,
		shadowColor: Colors.light.tint,
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 3,
	},
	closeButton: {
		alignSelf: "flex-end",
		padding: 8,
		backgroundColor: `${Colors.light.tint}22`,
		borderRadius: 6,
	},
	closeText: {
		color: Colors.light.tint,
		fontWeight: "bold",
		fontSize: 15,
	},
});
