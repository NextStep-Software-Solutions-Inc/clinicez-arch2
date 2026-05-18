import { Feather } from "@expo/vector-icons";
import { ScrollView } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Colors } from "@/constants/Colors";

export default function FilesScreen() {
	// Dummy files data
	const files = [
		{
			id: "1",
			name: "Lab Report - Blood Work",
			date: "2024-01-15",
			type: "PDF",
			size: "2.4 MB",
		},
		{
			id: "2",
			name: "X-Ray Results",
			date: "2024-01-10",
			type: "Image",
			size: "5.1 MB",
		},
		{
			id: "3",
			name: "Prescription - Medication List",
			date: "2024-01-08",
			type: "PDF",
			size: "1.2 MB",
		},
		{
			id: "4",
			name: "Clinic Visit Notes",
			date: "2024-01-05",
			type: "PDF",
			size: "0.8 MB",
		},
	];

	return (
		<ThemedView className="flex-1">
			<ScrollView
				contentContainerStyle={{ padding: 16 }}
				showsVerticalScrollIndicator={false}
			>
				{files.length === 0 ? (
					<ThemedView className="flex-1 items-center justify-center py-12">
						<Feather
							name="inbox"
							size={64}
							color={Colors.light.icon}
							style={{ marginBottom: 12 }}
						/>
						<ThemedText className="text-lg font-semibold text-center">
							No files yet
						</ThemedText>
						<ThemedText className="text-sm text-slate-500 dark:text-slate-400 text-center mt-2">
							Your documents will appear here
						</ThemedText>
					</ThemedView>
				) : (
					files.map((file) => (
						<ThemedView
							key={file.id}
							className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg p-4 mb-3 shadow-sm"
						>
							<ThemedView className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900 items-center justify-center mr-4">
								<Feather name="file" size={24} color={Colors.light.tint} />
							</ThemedView>
							<ThemedView className="flex-1">
								<ThemedText className="font-semibold text-base mb-1">
									{file.name}
								</ThemedText>
								<ThemedText className="text-xs text-slate-600 dark:text-slate-400">
									{file.date} • {file.size}
								</ThemedText>
							</ThemedView>
							<Feather name="download" size={20} color={Colors.light.tint} />
						</ThemedView>
					))
				)}
			</ScrollView>
		</ThemedView>
	);
}
