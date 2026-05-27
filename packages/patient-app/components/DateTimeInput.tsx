import DateTimePicker from "@expo/ui/community/datetime-picker";
import { format } from "date-fns";
import { useState } from "react";
import { Modal, Platform, Pressable } from "react-native";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";

type DateTimeInputProps = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	mode?: "date" | "time";
	maximumDate?: Date;
	minimumDate?: Date;
};

function parseDateValue(value: string, mode: "date" | "time"): Date | null {
	if (!value) return null;

	if (mode === "time") {
		const today = new Date();
		const [hours = "0", minutes = "0"] = value.split(":");
		const parsed = new Date(today);
		parsed.setHours(Number(hours), Number(minutes), 0, 0);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatValue(value: string, mode: "date" | "time"): string | null {
	const parsed = parseDateValue(value, mode);
	if (!parsed) return null;
	return mode === "time" ? format(parsed, "p") : format(parsed, "PPP");
}

function serializeValue(date: Date, mode: "date" | "time"): string {
	if (mode === "time") {
		return format(date, "HH:mm");
	}

	return format(date, "yyyy-MM-dd");
}

export function DateTimeInput({
	label,
	value,
	onChange,
	placeholder,
	mode = "date",
	maximumDate,
	minimumDate,
}: DateTimeInputProps) {
	const [isVisible, setIsVisible] = useState(false);
	const [draftValue, setDraftValue] = useState<Date>(
		parseDateValue(value, mode) ?? new Date(),
	);
	const displayValue = formatValue(value, mode);

	function openPicker() {
		setDraftValue(parseDateValue(value, mode) ?? new Date());
		setIsVisible(true);
	}

	function handleValueChange(_event: unknown, selectedDate: Date) {
		if (Platform.OS === "android") {
			onChange(serializeValue(selectedDate, mode));
			setIsVisible(false);
			return;
		}

		setDraftValue(selectedDate);
	}

	function handleAndroidDismiss() {
		setIsVisible(false);
	}

	function closeModal() {
		setDraftValue(parseDateValue(value, mode) ?? new Date());
		setIsVisible(false);
	}

	function confirmSelection() {
		onChange(serializeValue(draftValue, mode));
		setIsVisible(false);
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
							displayValue
								? "text-slate-800 dark:text-slate-100"
								: "text-slate-400 dark:text-slate-500"
						}
					>
						{displayValue ??
							placeholder ??
							(mode === "time" ? "Select time" : "Select date")}
					</ThemedText>
				</Pressable>
			</ThemedView>

			{isVisible && Platform.OS === "android" ? (
				<DateTimePicker
					value={draftValue}
					mode={mode}
					display={mode === "time" ? "clock" : "calendar"}
					onValueChange={handleValueChange}
					onDismiss={handleAndroidDismiss}
					maximumDate={maximumDate}
					minimumDate={minimumDate}
				/>
			) : null}

			{Platform.OS === "ios" ? (
				<Modal
					visible={isVisible}
					transparent
					animationType="slide"
					onRequestClose={closeModal}
				>
					<ThemedView className="flex-1 bg-black/45 justify-end">
						<ThemedView className="rounded-t-3xl bg-white dark:bg-slate-800 px-4 pt-4 pb-8">
							<ThemedView className="flex-row items-center justify-between mb-3 bg-transparent">
								<Pressable onPress={closeModal} className="py-2 px-1">
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
							<DateTimePicker
								value={draftValue}
								mode={mode}
								display="spinner"
								onValueChange={handleValueChange}
								maximumDate={maximumDate}
								minimumDate={minimumDate}
							/>
						</ThemedView>
					</ThemedView>
				</Modal>
			) : null}
		</>
	);
}
