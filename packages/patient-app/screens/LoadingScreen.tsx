import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ActivityIndicator } from "react-native";

export default function LoadingScreen({ message = 'Please wait for a moment' }: { message?: string }) {
    return (
        <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#6366f1" />
            <ThemedView style={{ height: 16 }} />
            <ThemedText
                className="text-lg text-slate-700 dark:text-slate-100"
                style={{ fontSize: 16, fontWeight: '600' }}>{message}</ThemedText>
        </ThemedView>
    );
}