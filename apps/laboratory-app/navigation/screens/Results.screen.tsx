import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function ResultsScreen() {
  const results = [
    { parameter: 'Hemoglobin', value: '138', unit: 'g/L', ref: '120 - 160', abnormal: false },
    { parameter: 'White Blood Cells (WBC)', value: '11.8', unit: 'x10^9/L', ref: '4.5 - 11.0', abnormal: true },
    { parameter: 'Platelet Count', value: '265', unit: 'x10^9/L', ref: '150 - 450', abnormal: false },
    { parameter: 'Fasting Blood Sugar (FBS)', value: '6.4', unit: 'mmol/L', ref: '3.9 - 5.5', abnormal: true },
    { parameter: 'Total Cholesterol', value: '5.8', unit: 'mmol/L', ref: '< 5.2', abnormal: true },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Verification & Validation</ThemedText>
        <ThemedText style={styles.title}>Results Entry</ThemedText>
      </View>

      <View style={styles.patientBanner}>
        <ThemedText style={styles.patientName}>Maria Santos (ORD-2026-081)</ThemedText>
        <ThemedText style={styles.patientMeta}>Analyzer: Mindray BC-5000 • Direct Interfaced</ThemedText>
      </View>

      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <ThemedText style={[styles.colHeader, { flex: 2 }]}>Test Parameter</ThemedText>
          <ThemedText style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>Result</ThemedText>
          <ThemedText style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>Reference</ThemedText>
        </View>

        {results.map((row, idx) => (
          <View key={idx} style={[styles.tableRow, idx > 0 && styles.borderTop]}>
            <View style={{ flex: 2 }}>
              <ThemedText style={styles.paramName}>{row.parameter}</ThemedText>
              <ThemedText style={styles.paramUnit}>{row.unit}</ThemedText>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <ThemedText style={[styles.paramValue, row.abnormal && styles.abnormalValue]}>
                {row.value} {row.abnormal ? '▲' : ''}
              </ThemedText>
            </View>
            <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
              <ThemedText style={styles.paramRef}>{row.ref}</ThemedText>
            </View>
          </View>
        ))}
      </View>

      <Pressable style={styles.verifyButton}>
        <ThemedText style={styles.verifyButtonText}>Sign & Validate Diagnostic Report</ThemedText>
      </Pressable>
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
  patientBanner: {
    backgroundColor: '#F5F3FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    gap: 2,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4C1D95',
  },
  patientMeta: {
    fontSize: 12,
    color: '#6D28D9',
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  colHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  borderTop: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  paramName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  paramUnit: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  paramValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  abnormalValue: {
    color: '#DC2626',
  },
  paramRef: {
    fontSize: 12,
    color: '#6B7280',
  },
  verifyButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
