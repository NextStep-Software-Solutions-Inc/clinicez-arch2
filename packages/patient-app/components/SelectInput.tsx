import { Picker } from "@react-native-picker/picker";
import { useState } from "react";
import { Modal, Pressable } from "react-native";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";

type SelectOption = {
	label: string;
	value: string;
};

type SelectInputProps = {
	label: string;
	value: string;
	options: SelectOption[];
	onChange: (value: string) => void;
	placeholder?: string;
};

export function SelectInput({
	label,
	value,
	options,
	onChange,
	placeholder = "Select an option",
}: SelectInputProps) {
	const colorScheme = useColorScheme();
	const [isOpen, setIsOpen] = useState(false);
	const [draftValue, setDraftValue] = useState(value);
	const palette = Colors[colorScheme ?? "light"];
	const selectedLabel = options.find((option) => option.value === value)?.label;

	function openPicker() {
		setDraftValue(value);
		setIsOpen(true);
	}

	function closePicker() {
		setDraftValue(value);
		setIsOpen(false);
	}

	function confirmSelection() {
		onChange(draftValue);
		setIsOpen(false);
	}

	return (
		<>
			<ThemedView className="mb-3 bg-transparent">
				<ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-1">
					{label}
				</ThemedText>
				<Pressable
					onPress={openPicker}
					className="rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2.5 bg-slate-50 dark:bg-slate-900"
				>
					<ThemedText
						className={
							selectedLabel
								? "text-slate-800 dark:text-slate-100"
								: "text-slate-400 dark:text-slate-500"
						}
					>
						{selectedLabel ?? placeholder}
					</ThemedText>
				</Pressable>
			</ThemedView>

			<Modal
				visible={isOpen}
				transparent
				animationType="slide"
				onRequestClose={closePicker}
			>
				<ThemedView className="flex-1 bg-black/45 justify-end">
					<ThemedView className="rounded-t-3xl bg-white dark:bg-slate-800 px-4 pt-4 pb-8">
						<ThemedView className="flex-row items-center justify-between mb-3 bg-transparent">
							<Pressable onPress={closePicker} className="py-2 px-1">
								<ThemedText className="text-slate-500 dark:text-slate-400 font-semibold">
									Cancel
								</ThemedText>
							</Pressable>
							<ThemedText className="text-base font-semibold text-slate-800 dark:text-slate-100">
								{label}
							</ThemedText>
							<Pressable onPress={confirmSelection} className="py-2 px-1">
								<ThemedText className="text-blue-600 dark:text-blue-400 font-semibold">
									Done
								</ThemedText>
							</Pressable>
						</ThemedView>
						<Picker
							selectedValue={draftValue}
							onValueChange={(itemValue) => setDraftValue(String(itemValue))}
							style={{
								color: palette.text,
								backgroundColor: palette.background,
							}}
						>
							<Picker.Item label={placeholder} value="" color="#94a3b8" />
							{options.map((option) => (
								<Picker.Item
									key={option.value}
									label={option.label}
									value={option.value}
								/>
							))}
						</Picker>
					</ThemedView>
				</ThemedView>
			</Modal>
		</>
	);
}

export type { SelectOption };
