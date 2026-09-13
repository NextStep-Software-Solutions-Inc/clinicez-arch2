import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function WorklistScreen() {
  const orders = [
    { id: '1', orderNo: 'ORD-2026-081', patient: 'Maria Santos', tests: 'CBC, Lipid Profile, FBS', priority: 'STAT', doctor: 'Dr. Cruz' },
    { id: '2', orderNo: 'ORD-2026-082', patient: 'Juan Dela Cruz', tests: 'Troponin I, ECG, CK-MB', priority: 'STAT', doctor: 'Dr. Cruz' },
    { id: '3', orderNo: 'ORD-2026-083', patient: 'Elena Ramos', tests: 'Urinalysis, Culture & Sens', priority: 'Routine', doctor: 'Dr. Reyes' },
    { id: '4', orderNo: 'ORD-2026-084', patient: 'Roberto Garcia', tests: 'HbA1c, Serum Creatinine', priority: 'Routine', doctor: 'Dr. Cruz' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Laboratory Information System</ThemedText>
        <ThemedText style={styles.title}>Diagnostic Worklist</ThemedText>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>14</ThemedText>
          <ThemedText style={styles.statLabel}>Pending Orders</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#DC2626' }]}>2</ThemedText>
          <ThemedText style={styles.statLabel}>STAT Priority</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>38</ThemedText>
          <ThemedText style={styles.statLabel}>Verified Today</ThemedText>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Incoming Laboratory Orders</ThemedText>
        <View style={styles.list}>
          {orders.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <ThemedText style={styles.orderNo}>{item.orderNo}</ThemedText>
                <ThemedText
                  style={[
                    styles.priorityBadge,
                    item.priority === 'STAT' ? styles.statBadge : styles.routineBadge,
                  ]}
                >
                  {item.priority}
                </ThemedText>
              </View>
              <ThemedText style={styles.patientName}>{item.patient}</ThemedText>
              <ThemedText style={styles.tests}>{item.tests}</ThemedText>
              <ThemedText style={styles.doctor}>Ordered by: {item.doctor}</ThemedText>
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
    color: '#7C3AED',
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
  orderNo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  priorityBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statBadge: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  routineBadge: {
    backgroundColor: '#F3F4F6',
    color: '#4B5563',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  tests: {
    fontSize: 14,
    color: '#6D28D9',
    fontWeight: '500',
  },
  doctor: {
    fontSize: 12,
    color: '#6B7280',
  },
});
