import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import ThemedText from '@ui/ThemedText';

export default function InventoryScreen() {
  const inventory = [
    { sku: 'MED-001', name: 'Amlodipine Besylate 5mg', stock: 450, reorder: 100, price: '₱8.50', status: 'In Stock' },
    { sku: 'MED-002', name: 'Losartan Potassium 50mg', stock: 320, reorder: 100, price: '₱12.00', status: 'In Stock' },
    { sku: 'MED-003', name: 'Co-Amoxiclav 625mg', stock: 45, reorder: 50, price: '₱28.00', status: 'Low Stock' },
    { sku: 'MED-004', name: 'Metformin HCl 500mg', stock: 680, reorder: 150, price: '₱6.25', status: 'In Stock' },
    { sku: 'MED-005', name: 'Paracetamol 500mg', stock: 1200, reorder: 300, price: '₱3.50', status: 'In Stock' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Drug Inventory & Formulary</ThemedText>
        <ThemedText style={styles.title}>Stock Management</ThemedText>
      </View>

      <View style={styles.list}>
        {inventory.map((item) => (
          <View key={item.sku} style={styles.card}>
            <View style={styles.rowBetween}>
              <ThemedText style={styles.skuText}>{item.sku}</ThemedText>
              <ThemedText
                style={[
                  styles.statusBadge,
                  item.status === 'Low Stock' ? styles.lowStockBadge : styles.inStockBadge,
                ]}
              >
                {item.status}
              </ThemedText>
            </View>
            <ThemedText style={styles.medName}>{item.name}</ThemedText>
            <View style={styles.stockRow}>
              <ThemedText style={styles.stockText}>Stock: {item.stock} units</ThemedText>
              <ThemedText style={styles.priceText}>{item.price} / unit</ThemedText>
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
    gap: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skuText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  inStockBadge: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
  },
  lowStockBadge: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  medName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  stockText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  priceText: {
    fontSize: 13,
    color: '#0D9488',
    fontWeight: '700',
  },
});
