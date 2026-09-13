import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function AppointmentsScreen() {
  const appointments = [
    { id: '1', time: '09:00 AM', patient: 'Maria Santos', type: 'Follow-up', doctor: 'Dr. Cruz' },
    { id: '2', time: '09:30 AM', patient: 'Juan Dela Cruz', type: 'Consultation', doctor: 'Dr. Cruz' },
    { id: '3', time: '10:15 AM', patient: 'Elena Ramos', type: 'Pre-natal', doctor: 'Dr. Reyes' },
    { id: '4', time: '11:00 AM', patient: 'Roberto Garcia', type: 'Annual Checkup', doctor: 'Dr. Cruz' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Scheduling & Check-in</ThemedText>
        <ThemedText style={styles.title}>Appointments</ThemedText>
      </View>

      <View style={styles.list}>
        {appointments.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.timeColumn}>
              <ThemedText style={styles.timeText}>{item.time}</ThemedText>
              <ThemedText style={styles.typeText}>{item.type}</ThemedText>
            </View>
            <View style={styles.infoColumn}>
              <ThemedText style={styles.patientName}>{item.patient}</ThemedText>
              <ThemedText style={styles.doctorName}>Provider: {item.doctor}</ThemedText>
            </View>
            <View style={styles.checkInButton}>
              <ThemedText style={styles.checkInText}>Check In</ThemedText>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#4B5563',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  timeColumn: {
    width: 80,
    gap: 2,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284C7',
  },
  typeText: {
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  infoColumn: {
    flex: 1,
    gap: 2,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  doctorName: {
    fontSize: 12,
    color: '#4B5563',
  },
  checkInButton: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  checkInText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
  },
});
