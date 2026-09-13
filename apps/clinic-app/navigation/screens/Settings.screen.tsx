import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Clinic Configuration</ThemedText>
        <ThemedText style={styles.title}>Facility & Sync</ThemedText>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>Facility Details</ThemedText>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Clinic Name</ThemedText>
          <ThemedText style={styles.value}>St. Jude Family Clinic</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Accreditation ID</ThemedText>
          <ThemedText style={styles.value}>PHIC-KONSULTA-09214</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Operating Mode</ThemedText>
          <ThemedText style={styles.value}>Multi-Tenant Cloud + Local Edge</ThemedText>
        </View>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>Offline-First Synchronization</ThemedText>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Backend Service</ThemedText>
          <ThemedText style={styles.value}>services/clinic-api</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Sync Status</ThemedText>
          <ThemedText style={[styles.value, { color: '#16A34A', fontWeight: '700' }]}>Synced (0 pending)</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Local Storage</ThemedText>
          <ThemedText style={styles.value}>SQLite Encrypted Cache</ThemedText>
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
});
