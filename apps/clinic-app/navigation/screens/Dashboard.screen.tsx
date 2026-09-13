import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function DashboardScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Clinic Operations</ThemedText>
        <ThemedText style={styles.title}>Provider Dashboard</ThemedText>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>18</ThemedText>
          <ThemedText style={styles.statLabel}>In Queue</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#DC2626' }]}>2</ThemedText>
          <ThemedText style={styles.statLabel}>Urgent Triage</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>24</ThemedText>
          <ThemedText style={styles.statLabel}>Completed Today</ThemedText>
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Active Patient Queue</ThemedText>
        <View style={styles.card}>
          <View style={styles.queueItem}>
            <ThemedText style={styles.queueBadge}>Q-001</ThemedText>
            <View style={styles.queueInfo}>
              <ThemedText style={styles.patientName}>Maria Santos</ThemedText>
              <ThemedText style={styles.visitReason}>Hypertension Follow-up</ThemedText>
            </View>
            <ThemedText style={styles.statusBadge}>In Room 2</ThemedText>
          </View>
          <View style={[styles.queueItem, styles.borderTop]}>
            <ThemedText style={[styles.queueBadge, { backgroundColor: '#FEE2E2', color: '#991B1B' }]}>Q-002</ThemedText>
            <View style={styles.queueInfo}>
              <ThemedText style={styles.patientName}>Juan Dela Cruz</ThemedText>
              <ThemedText style={styles.visitReason}>Acute Chest Discomfort</ThemedText>
            </View>
            <ThemedText style={[styles.statusBadge, { backgroundColor: '#FEF2F2', color: '#DC2626' }]}>Urgent</ThemedText>
          </View>
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
    color: '#0284C7',
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginTop: 8,
    paddingTop: 16,
  },
  queueBadge: {
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: '#E0F2FE',
    color: '#0369A1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  queueInfo: {
    flex: 1,
    gap: 2,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  visitReason: {
    fontSize: 13,
    color: '#6B7280',
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#F3F4F6',
    color: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
});
