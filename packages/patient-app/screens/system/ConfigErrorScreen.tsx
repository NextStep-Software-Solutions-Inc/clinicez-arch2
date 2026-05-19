import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import type { AppConfigIssue } from "@/services/appConfig";

type ConfigErrorScreenProps = {
	configIssues?: AppConfigIssue[];
	runtimeErrors?: string[];
};

export default function ConfigErrorScreen({
	configIssues = [],
	runtimeErrors = [],
}: ConfigErrorScreenProps) {
	const hasDetails = configIssues.length > 0 || runtimeErrors.length > 0;
	const runtimeErrorEntries = runtimeErrors.reduce(
		(entries, message) => {
			const count = (entries.counts.get(message) ?? 0) + 1;
			entries.counts.set(message, count);
			entries.items.push({
				key: `${message}-${count}`,
				message,
			});
			return entries;
		},
		{
			counts: new Map<string, number>(),
			items: [] as Array<{ key: string; message: string }>,
		},
	).items;

	return (
		<SafeAreaView className="flex-1">
			<ThemedView className="flex-1 items-center justify-center px-6">
				<ThemedText className="text-2xl font-bold text-center mb-3">
					App Configuration Error
				</ThemedText>
				{hasDetails ? (
					<ThemedView className="w-full max-w-xl rounded-xl p-4 border border-neutral-300/40">
						{configIssues.map((issue) => (
							<ThemedText
								className="text-center opacity-90 mb-2"
								key={`${issue.code}-${issue.key}`}
							>
								• {issue.key}: {issue.message}
							</ThemedText>
						))}
						{runtimeErrorEntries.map((entry) => (
							<ThemedText className="text-center opacity-90 mb-2" key={entry.key}>
								• {entry.message}
							</ThemedText>
						))}
					</ThemedView>
				) : (
					<ThemedText className="text-center opacity-80">
						The app encountered a startup configuration error.
					</ThemedText>
				)}
				<ThemedText className="text-center opacity-80 mt-3">
					For EAS builds, map the profile to the correct environment or build with
					--environment development/preview.
				</ThemedText>
			</ThemedView>
		</SafeAreaView>
	);
}
