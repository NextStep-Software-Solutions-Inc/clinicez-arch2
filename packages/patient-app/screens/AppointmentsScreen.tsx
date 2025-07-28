import React, { useRef, useState } from 'react';
import { ScrollView, TouchableOpacity } from 'react-native';
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

export default function AppointmentsScreen() {
    const { clinics, currentClinicId } = useClinicContext();
    const clinic = clinics.find(c => c.id === currentClinicId);
    const clinicName = clinic?.name || 'Current Clinic';
    const dummyAppointments = useDummyAppointments(clinicName);

    // Track scroll state
    const [isScrolling, setIsScrolling] = useState(false);
    const scrollTimeout = useRef<number | null>(null);

    // Show button if not scrolling, or always if few appointments
    const alwaysShowButton = dummyAppointments.length <= 8;
    const showButton = alwaysShowButton || !isScrolling;

    // Handlers for scroll events
    const handleScrollBeginDrag = () => {
        setIsScrolling(true);
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };
    const handleScrollEndDrag = () => {
        // Wait for momentum to finish
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
        scrollTimeout.current = window.setTimeout(() => setIsScrolling(false), 200);
    };
    const handleMomentumScrollEnd = () => {
        setIsScrolling(false);
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    };

    return (
        <ThemedView style={{ flex: 1, backgroundColor: '#fff' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScrollEndDrag={handleScrollEndDrag}
                onMomentumScrollEnd={handleMomentumScrollEnd}
                scrollEventThrottle={16}
            >
                <ThemedView style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, justifyContent: 'space-between' }}>
                    <ThemedText style={{ fontSize: 32, fontWeight: 'bold', color: Colors.light.tint, letterSpacing: 0.5 }}>
                        Appointments
                    </ThemedText>
                    <Feather name="calendar" size={32} color={Colors.light.tint} style={{ marginLeft: 8 }} />
                </ThemedView>
                {dummyAppointments.map(appt => (
                    <ThemedView
                        key={appt.id}
                        style={{
                            backgroundColor: '#fff',
                            borderRadius: 18,
                            padding: 0,
                            marginBottom: 22,
                            shadowColor: Colors.light.tint,
                            shadowOpacity: 0.12,
                            shadowRadius: 12,
                            elevation: 4,
                            overflow: 'hidden',
                        }}
                    >
                        <ThemedView style={{
                            backgroundColor: appt.status === 'Confirmed' ? Colors.light.tint : appt.status === 'Pending' ? '#fbbf24' : '#ef4444',
                            paddingVertical: 10,
                            paddingHorizontal: 18,
                            flexDirection: 'row',
                            alignItems: 'center',
                        }}>
                            <Feather
                                name={appt.status === 'Confirmed' ? 'check-circle' : appt.status === 'Pending' ? 'clock' : 'x-circle'}
                                size={28}
                                color={'#fff'}
                                style={{ marginRight: 10 }}
                            />
                            <ThemedText style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, flex: 1 }} numberOfLines={1}>
                                {appt.status}
                            </ThemedText>
                            <ThemedText style={{ color: '#fff', fontWeight: 'bold', fontSize: 13, opacity: 0.7 }}>
                                #{appt.id}
                            </ThemedText>
                        </ThemedView>
                        <ThemedView style={{ padding: 18 }}>
                            <ThemedText style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 4, color: Colors.light.tint }}>
                                {appt.about}
                            </ThemedText>
                            <ThemedText style={{ fontSize: 16, color: '#444', marginBottom: 2 }}>
                                <Feather name="user" size={16} color={Colors.light.tint} />{' '}
                                {appt.doctor}
                            </ThemedText>
                            <ThemedText style={{ fontSize: 16, color: '#444', marginBottom: 2 }}>
                                <Feather name="calendar" size={16} color={Colors.light.tint} />{' '}
                                {appt.date}
                                {'  '}
                                <Feather name="clock" size={16} color={Colors.light.tint} />{' '}
                                {appt.time}
                            </ThemedText>
                        </ThemedView>
                    </ThemedView>
                ))}
            </ScrollView>
            {showButton && (
                <ThemedView style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: 16,
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    borderTopLeftRadius: 18,
                    borderTopRightRadius: 18,
                    shadowColor: Colors.light.tint,
                    shadowOpacity: 0.10,
                    shadowRadius: 8,
                    elevation: 8,
                }}>
                    <TouchableOpacity
                        style={{
                            backgroundColor: Colors.light.tint,
                            borderRadius: 8,
                            paddingVertical: 16,
                            alignItems: 'center',
                            shadowColor: Colors.light.tint,
                            shadowOpacity: 0.12,
                            shadowRadius: 4,
                            elevation: 2,
                        }}
                        onPress={() => {/* TODO: Add appointment logic */ }}
                    >
                        <ThemedText style={{ color: '#fff', fontWeight: 'bold', fontSize: 18, letterSpacing: 0.5 }}>
                            Book New Appointment
                        </ThemedText>
                    </TouchableOpacity>
                </ThemedView>
            )}
        </ThemedView>
    );
}
