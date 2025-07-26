
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

export default function HealthScreen() {
  return (
    <ThemedView className="flex-1 items-center justify-center bg-white dark:bg-slate-950">
      <ThemedText className="text-2xl font-bold text-blue-900 dark:text-blue-200">Health</ThemedText>
      <ThemedText className="text-base text-slate-500 dark:text-slate-300 mt-2">Access your health records, prescriptions, and lab results here.</ThemedText>
    </ThemedView>
  );
}
