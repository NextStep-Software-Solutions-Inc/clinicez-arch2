import { Feather } from "@expo/vector-icons";
import BottomSheet, {
	BottomSheetBackdrop,
	BottomSheetView,
} from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
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
	const sheetRef = useRef<BottomSheet>(null);
	const scheme = useColorScheme();
	const snapPoints = [320, "70%"];

	// Open/close sheet based on visible prop
	useEffect(() => {
		if (visible) {
			sheetRef.current?.expand();
		} else {
			sheetRef.current?.close();
		}
	}, [visible]);

	const handleSheetChange = useCallback(
		(index: number) => {
			// If sheet is closed (index === -1), call onClose
			if (index === -1) {
				onClose();
			}
		},
		[onClose],
	);

	if (!visible) return null;

	return (
		<Modal visible={visible} transparent>
			<GestureHandlerRootView>
				<BottomSheet
					ref={sheetRef}
					index={1}
					snapPoints={snapPoints}
					enablePanDownToClose
					onChange={handleSheetChange}
					backdropComponent={(props) => (
						<BottomSheetBackdrop
							{...props}
							disappearsOnIndex={-1}
							appearsOnIndex={0}
							pressBehavior="close"
						/>
					)}
					backgroundStyle={{
						...styles.sheetBg,
						backgroundColor:
							scheme === "dark"
								? Colors.dark.background
								: Colors.light.background,
					}}
				>
					<BottomSheetView style={styles.contentContainer}>
						<ThemedView style={styles.headerRow}>
							<ThemedText style={styles.title}>{title}</ThemedText>
							<TouchableOpacity onPress={onClose}>
								<Feather name="x" size={24} color={Colors.light.tint} />
							</TouchableOpacity>
						</ThemedView>
						<View style={styles.scrollArea}>{children}</View>
					</BottomSheetView>
				</BottomSheet>
			</GestureHandlerRootView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	sheetBg: {
		backgroundColor: "transparent",
		borderTopLeftRadius: 18,
		borderTopRightRadius: 18,
		shadowColor: "#000",
		shadowOpacity: 0.12,
		shadowRadius: 8,
		elevation: 8,
	},
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
