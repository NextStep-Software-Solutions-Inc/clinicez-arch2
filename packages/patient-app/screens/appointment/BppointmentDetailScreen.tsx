import React from 'react';
import { ScrollView } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useLocalSearchParams, useRouter } from 'expo-router';

const dummyAppointment = {
    id: '1',
    about: 'General Checkup',
    doctor: 'Dr. Smith',
    date: '2025-08-01',
    time: '10:00 AM',
    status: 'Confirmed',
}
type AppointmentDetailParams = { appointmentId: string };
export default function AppointmentDetailScreen() {
    const router = useRouter();
    const { appointmentId } = useLocalSearchParams<AppointmentDetailParams>();

    return (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
            <ThemedView className="bg-white dark:bg-neutral-900 rounded-2xl shadow p-6 mb-6">
                <ThemedText className="text-2xl font-bold mb-2" style={{ color: Colors.light.tint }}>
                    Appointment Details
                </ThemedText>
                <ThemedView className="flex-row items-center mb-4">
                    <Feather
                        name={
                            dummyAppointment.status === 'Confirmed'
                                ? 'check-circle'
                                : dummyAppointment.status === 'Pending'
                                    ? 'clock'
                                    : 'x-circle'
                        }
                        size={28}
                        color={
                            dummyAppointment.status === 'Confirmed'
                                ? '#22c55e'
                                : dummyAppointment.status === 'Pending'
                                    ? '#eab308'
                                    : '#ef4444'
                        }
                        style={{ marginRight: 10 }}
                    />
                    <ThemedText className="font-bold text-lg" style={{ color: Colors.light.tint }}>
                        {dummyAppointment.status}
                    </ThemedText>
                    <ThemedText className="ml-4 text-base text-slate-500">#{appointmentId}</ThemedText>
                </ThemedView>
                <ThemedText className="text-xl font-bold mb-2" style={{ color: Colors.light.tint }}>
                    {dummyAppointment.about}
                </ThemedText>
                <ThemedView className="mb-2 flex-row items-center">
                    <Feather name="user" size={18} color={Colors.light.tint} />
                    <ThemedText className="ml-2 text-base">Doctor: {dummyAppointment.doctor}</ThemedText>
                </ThemedView>
                <ThemedView className="mb-2 flex-row items-center">
                    <Feather name="calendar" size={18} color={Colors.light.tint} />
                    <ThemedText className="ml-2 text-base">Date: {dummyAppointment.date}</ThemedText>
                </ThemedView>
                <ThemedView className="mb-2 flex-row items-center">
                    <Feather name="clock" size={18} color={Colors.light.tint} />
                    <ThemedText className="ml-2 text-base">Time: {dummyAppointment.time}</ThemedText>
                </ThemedView>
                {/* Add more fields as needed */}
            </ThemedView>
            <ThemedView className="flex-row justify-end">
                <ThemedText
                    className="text-indigo-600 font-semibold text-base underline"
                    onPress={() => router.back()}
                >
                    Back to Appointments
                </ThemedText>
            </ThemedView>
        </ScrollView>
    );
}
