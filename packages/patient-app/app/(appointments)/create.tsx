import React from 'react';
import { ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import AppointmentForm from '@/components/appointments/AppointmentForm';
import { useRouter } from 'expo-router';

export default function CreateAppointmentScreen() {
    const router = useRouter();
    return (
        <ScrollView contentContainerStyle={{ padding: 24 }}>
            <ThemedView className="bg-white dark:bg-neutral-900 rounded-3xl shadow-xl p-8 mt-8 mb-8 w-full max-w-xl self-center">
                <ThemedText className="text-2xl font-extrabold mb-6 text-center" style={{ letterSpacing: 0.5 }}>
                    Book New Appointment
                </ThemedText>
                <AppointmentForm onSuccess={() => router.back()} />
            </ThemedView>
        </ScrollView>
    );
}
