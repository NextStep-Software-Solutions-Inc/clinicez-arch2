import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function DispenseScreen() {
  const items = [
    { name: 'Amlodipine Besylate', dosage: '5mg Tablet', qty: 30, batch: 'B-AML-2026-03', exp: '11/2027', sig: 'Take 1 tablet once daily in the morning' },
    { name: 'Losartan Potassium', dosage: '50mg Tablet', qty: 30, batch: 'B-LOS-2026-08', exp: '09/2027', sig: 'Take 1 tablet once daily at bedtime' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Verification & Fulfillment</ThemedText>
        <ThemedText style={styles.title}>Dispense Order</ThemedText>
      </View>

      <View style={styles.patientBanner}>
        <ThemedText style={styles.patientName}>Maria Santos (RX-2026-0412)</ThemedText>
        <ThemedText style={styles.patientMeta}>Allergies: No Known Drug Allergies (NKDA)</ThemedText>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Prescribed Items to Dispense</ThemedText>
        {items.map((med, idx) => (
          <View key={idx} style={styles.card}>
            <View style={styles.rowBetween}>
              <ThemedText style={styles.medName}>{med.name}</ThemedText>
              <ThemedText style={styles.qtyBadge}>Qty: {med.qty}</ThemedText>
            </View>
            <ThemedText style={styles.dosage}>{med.dosage}</ThemedText>
            <ThemedText style={styles.sig}>Sig: {med.sig}</ThemedText>
            <View style={styles.batchRow}>
              <ThemedText style={styles.batchInfo}>Batch: {med.batch}</ThemedText>
              <ThemedText style={styles.batchInfo}>Exp: {med.exp}</ThemedText>
            </View>
          </View>
        ))}
      </View>

      <Pressable style={styles.dispenseButton}>
        <ThemedText style={styles.dispenseButtonText}>Verify & Complete Dispense</ThemedText>
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
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#99F6E4',
    gap: 2,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#134E4A',
  },
  patientMeta: {
    fontSize: 12,
    color: '#0D9488',
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
  medName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  qtyBadge: {
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: '#CCFBF1',
    color: '#0F766E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dosage: {
    fontSize: 13,
    color: '#4B5563',
  },
  sig: {
    fontSize: 13,
    color: '#1F2937',
    fontStyle: 'italic',
  },
  batchRow: {
    flexDirection: 'row',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginTop: 4,
    paddingTop: 8,
  },
  batchInfo: {
    fontSize: 12,
    color: '#6B7280',
  },
  dispenseButton: {
    backgroundColor: '#0D9488',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  dispenseButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
