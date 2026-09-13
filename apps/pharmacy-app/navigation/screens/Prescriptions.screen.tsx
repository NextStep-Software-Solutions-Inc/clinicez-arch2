import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function PrescriptionsScreen() {
  const prescriptions = [
    { id: '1', rxNo: 'RX-2026-0412', patient: 'Maria Santos', items: 'Amlodipine 5mg (#30), Losartan 50mg (#30)', doctor: 'Dr. Cruz', status: 'Pending' },
    { id: '2', rxNo: 'RX-2026-0413', patient: 'Juan Dela Cruz', items: 'Clopidogrel 75mg (#14), Atorvastatin 20mg (#30)', doctor: 'Dr. Cruz', status: 'Pending' },
    { id: '3', rxNo: 'RX-2026-0414', patient: 'Elena Ramos', items: 'Co-Amoxiclav 625mg (#21)', doctor: 'Dr. Reyes', status: 'Ready for Pickup' },
    { id: '4', rxNo: 'RX-2026-0415', patient: 'Roberto Garcia', items: 'Metformin 500mg (#60)', doctor: 'Dr. Cruz', status: 'Dispensed' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Pharmacy Management</ThemedText>
        <ThemedText style={styles.title}>E-Prescription Queue</ThemedText>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>8</ThemedText>
          <ThemedText style={styles.statLabel}>Pending Queue</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#059669' }]}>3</ThemedText>
          <ThemedText style={styles.statLabel}>Ready for Pickup</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>46</ThemedText>
          <ThemedText style={styles.statLabel}>Dispensed Today</ThemedText>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Incoming Prescriptions</ThemedText>
        <View style={styles.list}>
          {prescriptions.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <ThemedText style={styles.rxBadge}>{item.rxNo}</ThemedText>
                <ThemedText
                  style={[
                    styles.statusBadge,
                    item.status === 'Pending' ? styles.pendingBadge : styles.readyBadge,
                  ]}
                >
                  {item.status}
                </ThemedText>
              </View>
              <ThemedText style={styles.patientName}>{item.patient}</ThemedText>
              <ThemedText style={styles.itemsText}>{item.items}</ThemedText>
              <ThemedText style={styles.doctorText}>Prescribed by: {item.doctor}</ThemedText>
            </View>
          ))}
        </View>
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
    gap: 20,
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0D9488',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
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
    gap: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rxBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F766E',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    color: '#B45309',
  },
  readyBadge: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  itemsText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  doctorText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
