import React, { useRef, useState, useEffect } from 'react';
import { ScrollView, TouchableOpacity, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useClinicContext } from '@/components/ClinicContext';

const doctors = ['Dr. Smith', 'Dr. Lee', 'Dr. Patel', 'Dr. Gomez', 'Dr. Carter'];
const statuses = ['Confirmed', 'Pending', 'Cancelled'];

function useDummyAppointments(clinicName: string) {
    const reasons = [
        'General Checkup',
        'Follow-up Visit',
        'Lab Results Discussion',
        'Prescription Renewal',
        'Vaccination',
        'Consultation',
        'Physical Therapy',
        'Specialist Referral',
        'Annual Physical',
        'Blood Test',
        'Imaging Review',
        'Mental Health',
        'Nutrition Advice',
        'Chronic Care',
        'Minor Procedure',
    ];
    return Array.from({ length: 100 }, (_, i) => {
        const doctor = doctors[i % doctors.length];
        const status = statuses[i % statuses.length];
        const dateObj = new Date(2025, 7, 1 + i); // August 2025
        const date = dateObj.toISOString().slice(0, 10);
        const time = `${8 + (i % 10)}:${(i % 2 === 0 ? '00' : '30')} AM`;
        const about = reasons[i % reasons.length];
        return {
            id: String(i + 1),
            about,
            doctor,
            date,
            time,
            status,
        };
    });
}
export type Appointment = ReturnType<typeof useDummyAppointments>[number];

export default function AppointmentsScreen() {
    const { clinics, currentClinicId } = useClinicContext();
    const clinic = clinics.find(c => c.id === currentClinicId);
    const clinicName = clinic?.name || 'Current Clinic';
    const dummyAppointments = useDummyAppointments(clinicName);
    const router = useRouter();
    const lastPressRef = useRef<number>(0);

    const [isScrolling, setIsScrolling] = useState(false);
    const scrollTimeout = useRef<number | null>(null);

    const alwaysShowButton = dummyAppointments.length <= 8;
    const showButton = alwaysShowButton || !isScrolling;

    const slideAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (alwaysShowButton) {
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 220,
                useNativeDriver: true,
                easing: Easing.out(Easing.ease),
            }).start();
        } else if (isScrolling) {
            Animated.timing(slideAnim, {
                toValue: 1,
                duration: 220,
                useNativeDriver: true,
                easing: Easing.in(Easing.ease),
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 220,
                useNativeDriver: true,
                easing: Easing.out(Easing.ease),
            }).start();
        }
    }, [isScrolling, alwaysShowButton, slideAnim]);

    const handleScroll = () => {
        setIsScrolling(true);
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
    const handleScrollEndDrag = () => {
        setIsScrolling(false);
    };
    const handleMomentumScrollEnd = () => {
        setIsScrolling(false);
    };

    const handleAppointmentPress = (appt: Appointment) => {
        const now = Date.now();
        if (now - lastPressRef.current < 500) return;
        lastPressRef.current = now;
        router.push({
            pathname: '/(tabs)/appointments/[appointmentId]',
            params: { appointmentId: appt.id },
        });
    }

    return (
        <ThemedView className="flex-1">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
                onScroll={handleScroll}
                onScrollEndDrag={handleScrollEndDrag}
                onMomentumScrollEnd={handleMomentumScrollEnd}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
            >
                <ThemedView className="flex-row items-center mb-4 justify-between">
                    <ThemedText className="text-2xl font-bold tracking-wide" style={{ color: Colors.light.tint }}>
                        Appointments
                    </ThemedText>
                    <Feather name="calendar" size={24} color={Colors.light.tint} style={{ marginLeft: 8 }} />
                </ThemedView>
                {dummyAppointments.map(appt => (
                    <TouchableOpacity
                        key={appt.id}
                        activeOpacity={0.85}
                        onPress={() => handleAppointmentPress(appt)}
                    >
                        <ThemedView
                            className="bg-white dark:bg-neutral-800 rounded-2xl mb-5 shadow"
                            style={{ padding: 0, overflow: 'hidden' }}
                        >
                            <ThemedView
                                className={`flex-row items-center py-2.5 px-4 ${appt.status === 'Confirmed'
                                    ? 'bg-green-600 dark:bg-green-700'
                                    : appt.status === 'Pending'
                                        ? 'bg-yellow-600 dark:bg-yellow-700'
                                        : 'bg-red-600 dark:bg-red-700'
                                    }`}
                            >
                                <Feather
                                    name={
                                        appt.status === 'Confirmed'
                                            ? 'check-circle'
                                            : appt.status === 'Pending'
                                                ? 'clock'
                                                : 'x-circle'
                                    }
                                    size={28}
                                    color={'#fff'}
                                    style={{ marginRight: 10 }}
                                />
                                <ThemedText className="font-bold text-base flex-1 text-white" numberOfLines={1}>
                                    {appt.status}
                                </ThemedText>
                                <ThemedText className="font-bold text-sm text-white opacity-70">
                                    #{appt.id}
                                </ThemedText>
                            </ThemedView>
                            <ThemedView className="p-4">
                                <ThemedText className="text-xl font-bold mb-1" style={{ color: Colors.light.tint }}>
                                    {appt.about}
                                </ThemedText>
                                <ThemedText className="text-base text-neutral-700 dark:text-neutral-300 mb-0.5 flex-row items-center">
                                    <Feather name="user" size={16} color={Colors.light.tint} />{' '}
                                    {appt.doctor}
                                </ThemedText>
                                <ThemedText className="text-base text-neutral-700 dark:text-neutral-300 mb-0.5 flex-row items-center">
                                    <Feather name="calendar" size={16} color={Colors.light.tint} />{' '}
                                    {appt.date}
                                    {'  '}
                                    <Feather name="clock" size={16} color={Colors.light.tint} />{' '}
                                    {appt.time}
                                </ThemedText>
                            </ThemedView>
                        </ThemedView>
                    </TouchableOpacity>
                ))}
            </ScrollView>
            <Animated.View
                style={{
                    elevation: 8,
                    transform: [
                        {
                            translateY: slideAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 120],
                            }),
                        },
                    ],
                    opacity: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }),
                }}
                pointerEvents={showButton ? 'auto' : 'none'}
                className="p-4 rounded-t-2xl absolute bottom-0 left-0 right-0 shadow-lg shadow-slate-800/90 "
            >
                <ThemedView className="bg-white dark:bg-neutral-900 rounded-xl">
                    <TouchableOpacity
                        className="rounded-xl py-4 flex items-center bg-blue-600 dark:bg-slate-700"
                        onPress={() => {/* TODO: Add appointment logic */ }}
                    >
                        <ThemedText className="text-white font-bold text-lg tracking-wide">
                            Book New Appointment
                        </ThemedText>
                    </TouchableOpacity>
                </ThemedView>
            </Animated.View>
        </ThemedView>
    );
}
