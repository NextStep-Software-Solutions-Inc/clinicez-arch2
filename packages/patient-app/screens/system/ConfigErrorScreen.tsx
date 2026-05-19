import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

export default function ConfigErrorScreen() {
	return (
		<SafeAreaView style={{ flex: 1 }}>
			<ThemedView className="flex-1 items-center justify-center px-6">
				<ThemedText className="text-2xl font-bold text-center mb-3">
					Missing App Configuration
				</ThemedText>
				<ThemedText className="text-center opacity-80">
					EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not available in this build.
				</ThemedText>
				<ThemedText className="text-center opacity-80 mt-2">
					For EAS builds, map the profile to the correct environment or build with
					--environment development/preview.
				</ThemedText>
			</ThemedView>
		</SafeAreaView>
	);
}
