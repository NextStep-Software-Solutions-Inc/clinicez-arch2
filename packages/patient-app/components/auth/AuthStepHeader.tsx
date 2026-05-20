import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

type Props = {
	title: string;
	subtitle?: string;
};

export function AuthStepHeader({ title, subtitle }: Props) {
	return (
		<ThemedView className="bg-transparent items-center mb-8 mt-8">
			<ThemedText className="text-white text-3xl font-extrabold tracking-tight mb-2">
				{title}
			</ThemedText>
			{!!subtitle && (
				<ThemedText className="text-white/70 text-sm text-center">
					{subtitle}
				</ThemedText>
			)}
		</ThemedView>
	);
}
