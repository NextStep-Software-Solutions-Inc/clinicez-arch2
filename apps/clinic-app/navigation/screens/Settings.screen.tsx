import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { clinicService, DailyEodReport } from '../../services/clinicService';

export default function SettingsScreen() {
  const [eodReport, setEodReport] = useState<DailyEodReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadEod = useCallback(async () => {
    const [data, err] = await clinicService.getDailyEodReport();
    if (!err && data) {
      setEodReport(data);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadEod().finally(() => setLoading(false));
  }, [loadEod]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEod();
    setRefreshing(false);
  }, [loadEod]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0284C7']} />}
    >
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Clinic Operations & Config</ThemedText>
        <ThemedText style={styles.title}>Facility & Audit</ThemedText>
      </View>

      {/* End-of-Day Census & Cashier Remittance Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <ThemedText style={styles.cardTitle}>Daily Operations & Remittance</ThemedText>
          <Pressable onPress={loadEod} style={styles.auditBtn}>
            <ThemedText style={styles.auditBtnText}>↻ Refresh Audit</ThemedText>
          </Pressable>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="small" color="#0284C7" style={{ padding: 16 }} />
        ) : eodReport ? (
          <View style={styles.censusContainer}>
            <View style={styles.remittanceHero}>
              <View style={styles.remittanceBlock}>
                <ThemedText style={styles.remittanceLabel}>Physical Cash in Drawer</ThemedText>
                <ThemedText style={styles.remittanceAmount}>
                  ₱{(eodReport.cashInDrawer ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </ThemedText>
                <ThemedText style={styles.remittanceSub}>Ready for bank deposit / handover</ThemedText>
              </View>
              <View style={styles.remittanceDivider} />
              <View style={styles.remittanceBlock}>
                <ThemedText style={styles.remittanceLabel}>Total Collections</ThemedText>
                <ThemedText style={[styles.remittanceAmount, { color: '#0369A1' }]}>
                  ₱{(eodReport.totalAmountCollected ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </ThemedText>
                <ThemedText style={styles.remittanceSub}>Net: ₱{(eodReport.totalNetAmount ?? 0).toFixed(2)}</ThemedText>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <ThemedText style={styles.statVal}>{eodReport.totalCheckedIn}</ThemedText>
                <ThemedText style={styles.statDesc}>Total Checked In</ThemedText>
              </View>
              <View style={styles.statCell}>
                <ThemedText style={styles.statVal}>{eodReport.totalCompletedVisits}</ThemedText>
                <ThemedText style={styles.statDesc}>Visits Completed</ThemedText>
              </View>
              <View style={styles.statCell}>
                <ThemedText style={[styles.statVal, { color: '#D97706' }]}>
                  ₱{(eodReport.totalDiscountsGiven ?? 0).toFixed(2)}
                </ThemedText>
                <ThemedText style={styles.statDesc}>Senior/PWD Disc.</ThemedText>
              </View>
              <View style={styles.statCell}>
                <ThemedText style={[styles.statVal, { color: '#059669' }]}>
                  ₱{(eodReport.totalPhilHealthCovered ?? 0).toFixed(2)}
                </ThemedText>
                <ThemedText style={styles.statDesc}>PhilHealth Konsulta</ThemedText>
              </View>
            </View>

            {/* Payment Modes */}
            {eodReport.collectionsByMethod && eodReport.collectionsByMethod.length > 0 && (
              <View style={styles.subSection}>
                <ThemedText style={styles.subSectionTitle}>Collections by Payment Mode</ThemedText>
                {eodReport.collectionsByMethod.map((pm, idx) => (
                  <View key={idx} style={styles.row}>
                    <ThemedText style={styles.label}>{pm.method} ({pm.transactionCount} txn)</ThemedText>
                    <ThemedText style={styles.value}>
                      ₱{pm.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}

            {/* Doctor Workloads */}
            {eodReport.doctorWorkloads && eodReport.doctorWorkloads.length > 0 && (
              <View style={styles.subSection}>
                <ThemedText style={styles.subSectionTitle}>Physician Consultations</ThemedText>
                {eodReport.doctorWorkloads.map((dw, idx) => (
                  <View key={idx} style={styles.row}>
                    <ThemedText style={styles.label}>{dw.doctorName}</ThemedText>
                    <ThemedText style={styles.value}>{dw.encountersCount} patients</ThemedText>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <ThemedText style={{ color: '#6B7280', fontSize: 13, padding: 8 }}>
            No financial census recorded for today yet.
          </ThemedText>
        )}
      </View>

      {/* Facility Details */}
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

      {/* Sync Status */}
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  auditBtn: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  auditBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  censusContainer: {
    gap: 14,
  },
  remittanceHero: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  remittanceBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  remittanceDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#86EFAC',
  },
  remittanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
    textTransform: 'uppercase',
  },
  remittanceAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#15803D',
  },
  remittanceSub: {
    fontSize: 10,
    color: '#4B5563',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCell: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  statVal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  statDesc: {
    fontSize: 11,
    color: '#6B7280',
  },
  subSection: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
    gap: 6,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
