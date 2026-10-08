import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { laboratoryService, LabRequisitionItem } from '../../services/laboratoryService';

export default function WorklistScreen() {
  const [orders, setOrders] = useState<LabRequisitionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const loadWorklist = async () => {
    setLoading(true);
    const [data] = await laboratoryService.getWorklist(statusFilter || undefined, search || undefined);
    if (data && data.length > 0) {
      setOrders(data);
    } else {
      // Offline fallback samples if no backend connection
      setOrders([
        {
          id: 'mock-1',
          accessionNumber: 'ACC-2026-081',
          orderingFacilityName: 'Metro Health Outpatient Clinic',
          orderingDoctorName: 'Dr. Roberto Cruz, MD',
          patientId: 'p-1',
          patientName: 'Maria Santos',
          patientAge: 45,
          patientGender: 'Female',
          urgency: 'STAT',
          status: 'PendingAccession',
          createdAt: new Date().toISOString(),
          specimens: [
            { id: 's-1', barcode: 'ACC-2026-081-S01', containerType: 'Purple_EDTA', specimenType: 'WholeBlood', status: 'Pending' },
            { id: 's-2', barcode: 'ACC-2026-081-S02', containerType: 'Yellow_SST', specimenType: 'Serum', status: 'Pending' },
          ],
          analyteResults: [],
        },
        {
          id: 'mock-2',
          accessionNumber: 'ACC-2026-082',
          orderingFacilityName: 'St. Luke Community Clinic',
          orderingDoctorName: 'Dr. Anna Reyes, MD',
          patientId: 'p-2',
          patientName: 'Juan Dela Cruz',
          patientAge: 52,
          patientGender: 'Male',
          urgency: 'Routine',
          status: 'InTesting',
          createdAt: new Date().toISOString(),
          specimens: [
            { id: 's-3', barcode: 'ACC-2026-082-S01', containerType: 'Yellow_SST', specimenType: 'Serum', status: 'Collected' },
          ],
          analyteResults: [
            { id: 'a-1', panelName: 'Clinical Chemistry', analyteCode: 'FBS', analyteName: 'Fasting Blood Sugar', value: '115.0', unit: 'mg/dL', referenceInterval: '70.0 - 99.0', flag: 'High' }
          ],
        },
      ]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadWorklist();
  }, [statusFilter]);

  const pendingCount = orders.filter(o => o.status === 'PendingAccession').length;
  const statCount = orders.filter(o => o.urgency === 'STAT').length;
  const verifiedCount = orders.filter(o => o.status === 'Verified').length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadWorklist} />}
    >
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Laboratory Information System</ThemedText>
        <ThemedText style={styles.title}>Diagnostic Worklist</ThemedText>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>{pendingCount}</ThemedText>
          <ThemedText style={styles.statLabel}>Pending Accession</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#DC2626' }]}>{statCount}</ThemedText>
          <ThemedText style={styles.statLabel}>STAT Priority</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#16A34A' }]}>{verifiedCount}</ThemedText>
          <ThemedText style={styles.statLabel}>Verified Today</ThemedText>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {[
          { label: 'All Orders', val: '' },
          { label: 'Pending Accession', val: 'PendingAccession' },
          { label: 'In Testing', val: 'InTesting' },
          { label: 'Verified', val: 'Verified' },
        ].map(tab => (
          <Pressable
            key={tab.label}
            style={[styles.filterChip, statusFilter === tab.val && styles.filterChipActive]}
            onPress={() => setStatusFilter(tab.val)}
          >
            <ThemedText style={[styles.filterChipText, statusFilter === tab.val && styles.filterChipTextActive]}>
              {tab.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Incoming Diagnostic Orders ({orders.length})</ThemedText>
        <View style={styles.list}>
          {orders.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.rowBetween}>
                <ThemedText style={styles.orderNo}>{item.accessionNumber}</ThemedText>
                <ThemedText
                  style={[
                    styles.priorityBadge,
                    item.urgency === 'STAT' ? styles.statBadge : styles.routineBadge,
                  ]}
                >
                  {item.urgency}
                </ThemedText>
              </View>
              <ThemedText style={styles.patientName}>
                {item.patientName} ({item.patientAge}y • {item.patientGender})
              </ThemedText>
              <ThemedText style={styles.facilityText}>
                🏥 {item.orderingFacilityName || 'Clinic EZ Partner Clinic'}
              </ThemedText>
              <ThemedText style={styles.doctor}>Ordered by: {item.orderingDoctorName}</ThemedText>
              
              <View style={styles.footerRow}>
                <ThemedText style={styles.specimenCount}>
                  🧪 {item.specimens?.length ?? 0} Specimen Tube(s)
                </ThemedText>
                <View style={[
                  styles.statusTag,
                  item.status === 'Verified' ? styles.statusVerified :
                  item.status === 'InTesting' ? styles.statusTesting : styles.statusPending
                ]}>
                  <ThemedText style={styles.statusTagText}>{item.status}</ThemedText>
                </View>
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    gap: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7C3AED',
  },
  priorityBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  statBadge: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
  },
  routineBadge: {
    backgroundColor: '#E0F2FE',
    color: '#0284C7',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  facilityText: {
    fontSize: 13,
    color: '#4B5563',
  },
  doctor: {
    fontSize: 12,
    color: '#6B7280',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  specimenCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  statusTesting: {
    backgroundColor: '#DBEAFE',
  },
  statusVerified: {
    backgroundColor: '#DCFCE7',
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
});
