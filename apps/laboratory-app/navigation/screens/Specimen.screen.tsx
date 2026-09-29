import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert, RefreshControl } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { laboratoryService, LabRequisitionItem, SpecimenItem } from '../../services/laboratoryService';

interface SpecimenWithMeta extends SpecimenItem {
  requisitionId: string;
  accessionNumber: string;
  patientName: string;
}

export default function SpecimenScreen() {
  const [specimens, setSpecimens] = useState<SpecimenWithMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [phlebName, setPhlebName] = useState('Sarah Ramos, RMT');
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Collected'>('All');

  const loadSpecimens = async () => {
    setLoading(true);
    const [orders] = await laboratoryService.getWorklist();
    if (orders && orders.length > 0) {
      const flattened: SpecimenWithMeta[] = [];
      for (const order of orders) {
        for (const spec of order.specimens ?? []) {
          flattened.push({
            ...spec,
            requisitionId: order.id,
            accessionNumber: order.accessionNumber,
            patientName: order.patientName,
          });
        }
      }
      setSpecimens(flattened);
    } else {
      // Fallback demo data
      setSpecimens([
        {
          id: 's-1',
          requisitionId: 'req-1',
          accessionNumber: 'ACC-2026-081',
          patientName: 'Maria Santos',
          barcode: 'ACC-2026-081-S01',
          containerType: 'Purple_EDTA',
          specimenType: 'WholeBlood',
          status: 'Pending',
        },
        {
          id: 's-2',
          requisitionId: 'req-1',
          accessionNumber: 'ACC-2026-081',
          patientName: 'Maria Santos',
          barcode: 'ACC-2026-081-S02',
          containerType: 'Yellow_SST',
          specimenType: 'Serum',
          status: 'Pending',
        },
        {
          id: 's-3',
          requisitionId: 'req-2',
          accessionNumber: 'ACC-2026-082',
          patientName: 'Juan Dela Cruz',
          barcode: 'ACC-2026-082-S01',
          containerType: 'Yellow_SST',
          specimenType: 'Serum',
          status: 'Collected',
          collectedAt: new Date().toISOString(),
          collectedByPhlebotomistName: 'Sarah Ramos, RMT',
        },
      ]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSpecimens();
  }, []);

  const handleCollect = async (item: SpecimenWithMeta) => {
    const [updated, err] = await laboratoryService.accessionSpecimen(item.requisitionId, phlebName, [
      {
        specimenId: item.id,
        barcode: item.barcode,
        containerType: item.containerType,
        specimenType: item.specimenType,
        collectedAt: new Date().toISOString(),
        notes: `Collected by ${phlebName}`,
      },
    ]);

    if (err) {
      Alert.alert('Collection Error', err.message);
    } else {
      Alert.alert('Accessioned', `Specimen ${item.barcode} marked as Collected.`);
      loadSpecimens();
    }
  };

  const filtered = specimens.filter(s => {
    if (filter === 'Pending') return s.status === 'Pending';
    if (filter === 'Collected') return s.status === 'Collected' || s.status === 'ReceivedInLab';
    return true;
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSpecimens} />}
    >
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Sample Tracking & Barcoding</ThemedText>
        <ThemedText style={styles.title}>Specimen Accessioning</ThemedText>
      </View>

      {/* Phlebotomist Bar */}
      <View style={styles.phlebBar}>
        <ThemedText style={styles.phlebLabel}>Phlebotomist on Duty:</ThemedText>
        <TextInput
          style={styles.phlebInput}
          value={phlebName}
          onChangeText={setPhlebName}
          placeholder="Phlebotomist Name"
        />
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {(['All', 'Pending', 'Collected'] as const).map(tab => (
          <Pressable
            key={tab}
            style={[styles.filterChip, filter === tab && styles.filterChipActive]}
            onPress={() => setFilter(tab)}
          >
            <ThemedText style={[styles.filterChipText, filter === tab && styles.filterChipTextActive]}>
              {tab} ({specimens.filter(s => tab === 'All' ? true : tab === 'Pending' ? s.status === 'Pending' : s.status !== 'Pending').length})
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Specimens Queue ({filtered.length})</ThemedText>
        <View style={styles.list}>
          {filtered.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <ThemedText style={styles.barcodeText}>{item.barcode}</ThemedText>
                <View style={[
                  styles.statusBadge,
                  item.status === 'Collected' ? styles.statusCollected : styles.statusPending
                ]}>
                  <ThemedText style={styles.statusBadgeText}>{item.status}</ThemedText>
                </View>
              </View>

              <ThemedText style={styles.patientName}>{item.patientName}</ThemedText>
              <ThemedText style={styles.accessionText}>Accession: {item.accessionNumber}</ThemedText>

              <View style={styles.row}>
                <View style={styles.tubeBadge}>
                  <ThemedText style={styles.tubeBadgeText}>🧪 {item.containerType}</ThemedText>
                </View>
                <ThemedText style={styles.typeText}>{item.specimenType}</ThemedText>
              </View>

              {item.status === 'Pending' ? (
                <Pressable
                  style={styles.collectBtn}
                  onPress={() => handleCollect(item)}
                >
                  <ThemedText style={styles.collectBtnText}>✓ Mark as Collected</ThemedText>
                </Pressable>
              ) : (
                <ThemedText style={styles.collectedInfo}>
                  Collected by {item.collectedByPhlebotomistName || 'Phlebotomist'} • {item.collectedAt ? new Date(item.collectedAt).toLocaleTimeString() : 'Logged'}
                </ThemedText>
              )}
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
  phlebBar: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  phlebLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  phlebInput: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#7C3AED',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
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
    fontSize: 14,
    fontWeight: '700',
    color: '#7C3AED',
    fontFamily: 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  statusCollected: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  accessionText: {
    fontSize: 12,
    color: '#6B7280',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tubeBadge: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tubeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B21A8',
  },
  typeText: {
    fontSize: 13,
    color: '#4B5563',
  },
  collectBtn: {
    backgroundColor: '#7C3AED',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  collectBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  collectedInfo: {
    fontSize: 11,
    color: '#16A34A',
    fontWeight: '600',
    marginTop: 2,
  },
});
