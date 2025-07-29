import { Redirect, Stack } from 'expo-router'
import { useAuth } from '@clerk/clerk-expo'
import { ActivityIndicator, View } from 'react-native'
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

export default function AuthRoutesLayout() {
    const { isSignedIn, isLoaded } = useAuth()

    if (!isLoaded) {
        return (
            <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#6366f1" />
                <ThemedView style={{ height: 16 }} />
                <ThemedText style={{ fontSize: 16, fontWeight: '600' }}>Please wait for a moment</ThemedText>
            </ThemedView>
        );
    }

    if (isSignedIn) {
        return <Redirect href={'/'} />
    }


    return <Stack screenOptions={{ headerShown: false }} />;
}