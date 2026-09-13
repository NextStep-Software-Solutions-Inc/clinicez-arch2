import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>LIS Configuration</ThemedText>
        <ThemedText style={styles.title}>Laboratory & Interfaces</ThemedText>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>Laboratory Profile</ThemedText>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Laboratory Name</ThemedText>
          <ThemedText style={styles.value}>St. Jude Clinical Laboratory</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>License to Operate (LTO)</ThemedText>
          <ThemedText style={styles.value}>DOH-LIS-2026-4412</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Category</ThemedText>
          <ThemedText style={styles.value}>Secondary Clinical Laboratory</ThemedText>
        </View>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>Analyzer Interfaces & Sync</ThemedText>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Backend Service</ThemedText>
          <ThemedText style={styles.value}>services/laboratory-api</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>ASTM / HL7 Protocol</ThemedText>
          <ThemedText style={[styles.value, { color: '#16A34A', fontWeight: '700' }]}>Connected (Port 5001)</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Local Cache</ThemedText>
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
