
import React from 'react';
import { ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import AppointmentForm from '@/components/appointments/AppointmentForm';
import { useRouter } from 'expo-router';

export default function CreateAppointmentScreen() {
    const router = useRouter();
    return (
        <>
            <ThemedView className="flex-1 bg-white dark:bg-neutral-900">
                <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
                    <ThemedView className="bg-white dark:bg-neutral-900 rounded-3xl shadow-xl mt-2 mb-4 w-full self-center">
                        <AppointmentForm onSuccess={() => router.back()} />
                    </ThemedView>
                </ScrollView>
            </ThemedView>
        </>
    );
}
