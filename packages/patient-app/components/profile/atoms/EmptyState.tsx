import { ThemedText } from "@/components/ThemedText";

type Props = {
	message?: string;
};

/** Placeholder shown when a list section has no records. */
export function EmptyState({ message = "No records added yet." }: Props) {
	return (
		<ThemedText style={{ fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>
			{message}
		</ThemedText>
	);
}
