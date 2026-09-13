import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function SpecimenScreen() {
  const specimens = [
    { id: '1', barcode: 'BAR-09214-1', patient: 'Maria Santos', tube: 'EDTA (Lavender)', type: 'Whole Blood', status: 'Accessioned' },
    { id: '2', barcode: 'BAR-09214-2', patient: 'Maria Santos', tube: 'SST Gel (Gold)', type: 'Serum', status: 'In Centrifuge' },
    { id: '3', barcode: 'BAR-09215-1', patient: 'Juan Dela Cruz', tube: 'Sodium Citrate (Blue)', type: 'Plasma', status: 'Collected' },
    { id: '4', barcode: 'BAR-09216-1', patient: 'Elena Ramos', tube: 'Sterile Container', type: 'Midstream Urine', status: 'Accessioned' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Sample Tracking</ThemedText>
        <ThemedText style={styles.title}>Specimen Accessioning</ThemedText>
      </View>

      <Pressable style={styles.scanButton}>
        <ThemedText style={styles.scanButtonText}>Scan Barcode / QR Sample</ThemedText>
      </Pressable>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Tracked Specimens</ThemedText>
        <View style={styles.list}>
          {specimens.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <ThemedText style={styles.barcodeText}>{item.barcode}</ThemedText>
                <ThemedText style={styles.statusBadge}>{item.status}</ThemedText>
              </View>
              <ThemedText style={styles.patientName}>{item.patient}</ThemedText>
              <View style={styles.row}>
                <ThemedText style={styles.tubeBadge}>{item.tube}</ThemedText>
                <ThemedText style={styles.typeText}>{item.type}</ThemedText>
              </View>
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
  scanButton: {
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  scanButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
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
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barcodeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6D28D9',
    fontFamily: 'monospace',
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#EDE9FE',
    color: '#6D28D9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tubeBadge: {
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: '#F3F4F6',
    color: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
