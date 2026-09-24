import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import ThemedText from '@ui/ThemedText';
import {
  clinicService,
  PatientQueueItem,
  QueueMetrics,
  QueueStatus,
} from '../../services/clinicService';

const SAMPLE_METRICS: QueueMetrics = {
  inQueue: 3,
  urgentTriage: 1,
  completedToday: 14,
  totalCheckedIn: 17,
};

const SAMPLE_QUEUE: PatientQueueItem[] = [
  {
    id: 'q-001',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueNumber: 'Q-001',
    sequenceNumber: 1,
    queueDate: new Date().toISOString().split('T')[0],
    patientId: 'pat-101',
    patientName: 'Maria Santos',
    doctorId: 'doc-001',
    doctorName: 'Dr. Cruz',
    priority: 'Routine',
    status: 'Triaged',
    checkInTime: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    chiefComplaint: 'Hypertension Follow-up',
    hasVitals: true,
    vitalsSummary: 'BP: 138/88 • HR: 76 bpm • BMI: 24.2',
  },
  {
    id: 'q-002',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueNumber: 'Q-002',
    sequenceNumber: 2,
    queueDate: new Date().toISOString().split('T')[0],
    patientId: 'pat-102',
    patientName: 'Juan Dela Cruz',
    doctorId: 'doc-001',
    doctorName: 'Dr. Cruz',
    priority: 'Urgent',
    status: 'Waiting',
    checkInTime: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    chiefComplaint: 'Acute Chest Discomfort',
    hasVitals: false,
    vitalsSummary: undefined,
  },
  {
    id: 'q-003',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueNumber: 'Q-003',
    sequenceNumber: 3,
    queueDate: new Date().toISOString().split('T')[0],
    patientId: 'pat-103',
    patientName: 'Elena Ramos',
    doctorId: 'doc-002',
    doctorName: 'Dr. Reyes',
    priority: 'Routine',
    status: 'InConsultation',
    checkInTime: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
    calledTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    chiefComplaint: 'Pre-natal Routine Checkup',
    hasVitals: true,
    vitalsSummary: 'BP: 110/70 • HR: 72 bpm • BMI: 21.8',
  },
];

export default function DashboardScreen() {
  const [metrics, setMetrics] = useState<QueueMetrics>(SAMPLE_METRICS);
  const [queue, setQueue] = useState<PatientQueueItem[]>(SAMPLE_QUEUE);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<string>('ALL');

  const loadData = useCallback(async () => {
    const [[metricsData, metricsErr], [queueData, queueErr]] = await Promise.all([
      clinicService.getQueueMetrics(),
      clinicService.getQueue(),
    ]);

    if (!metricsErr && metricsData) {
      setMetrics(metricsData);
    }
    if (!queueErr && queueData && queueData.length > 0) {
      setQueue(queueData);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleCallPatient = async (item: PatientQueueItem) => {
    setActioningId(item.id);
    const [, err] = await clinicService.callQueueItem(item.id, 'doc-001', 'Dr. Cruz');
    setActioningId(null);

    // Update locally regardless of API error for offline dev resilience
    setQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? { ...q, status: 'InConsultation' as QueueStatus, calledTime: new Date().toISOString() }
          : q
      )
    );
  };

  const handleCompletePatient = async (item: PatientQueueItem) => {
    setActioningId(item.id);
    const [, err] = await clinicService.completeQueueItem(item.id);
    setActioningId(null);

    // Update locally
    setQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? { ...q, status: 'Completed' as QueueStatus, completedTime: new Date().toISOString() }
          : q
      )
    );
    setMetrics((prev) => ({
      ...prev,
      inQueue: Math.max(0, prev.inQueue - 1),
      completedToday: prev.completedToday + 1,
    }));
  };

  const filteredQueue = queue.filter((item) => {
    if (queueFilter === 'ALL') return true;
    return item.status === queueFilter;
  });

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'Emergency':
        return { bg: '#FEE2E2', text: '#991B1B' };
      case 'Urgent':
        return { bg: '#FFEDD5', text: '#C2410C' };
      case 'Routine':
      default:
        return { bg: '#E0F2FE', text: '#0369A1' };
    }
  };

  const getStatusBadge = (status: QueueStatus) => {
    switch (status) {
      case 'Waiting':
        return { label: 'Waiting', bg: '#FEF3C7', text: '#B45309' };
      case 'Triaged':
        return { label: 'Triaged', bg: '#DCFCE7', text: '#15803D' };
      case 'InConsultation':
        return { label: 'In Room', bg: '#F3E8FF', text: '#7E22CE' };
      case 'Completed':
        return { label: 'Completed', bg: '#F3F4F6', text: '#4B5563' };
      default:
        return { label: status, bg: '#F3F4F6', text: '#374151' };
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0284C7']} />}
    >
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Clinic Operations</ThemedText>
        <ThemedText style={styles.title}>Provider Dashboard</ThemedText>
      </View>

      {/* Metrics Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statNumber}>{metrics.inQueue}</ThemedText>
          <ThemedText style={styles.statLabel}>In Queue</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#DC2626' }]}>{metrics.urgentTriage}</ThemedText>
          <ThemedText style={styles.statLabel}>Urgent Triage</ThemedText>
        </View>
        <View style={styles.statCard}>
          <ThemedText style={[styles.statNumber, { color: '#16A34A' }]}>{metrics.completedToday}</ThemedText>
          <ThemedText style={styles.statLabel}>Completed Today</ThemedText>
        </View>
      </View>

      {/* Queue Filter Tabs */}
      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>Active Patient Queue</ThemedText>
      </View>

      <View style={styles.filterRow}>
        {['ALL', 'Waiting', 'Triaged', 'InConsultation', 'Completed'].map((filterKey) => {
          const isActive = queueFilter === filterKey;
          const count = filterKey === 'ALL'
            ? queue.length
            : queue.filter((q) => q.status === filterKey).length;
          return (
            <Pressable
              key={filterKey}
              onPress={() => setQueueFilter(filterKey)}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
            >
              <ThemedText style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {filterKey === 'ALL' ? 'All' : filterKey === 'InConsultation' ? 'In Room' : filterKey} ({count})
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0284C7" />
          <ThemedText style={styles.loadingText}>Updating queue telemetry...</ThemedText>
        </View>
      ) : (
        <View style={styles.list}>
          {filteredQueue.length === 0 ? (
            <View style={styles.emptyCard}>
              <ThemedText style={styles.emptyText}>No patients in this queue filter.</ThemedText>
            </View>
          ) : (
            filteredQueue.map((item) => {
              const priorityStyle = getPriorityStyle(item.priority);
              const statusBadge = getStatusBadge(item.status);
              const isActioning = actioningId === item.id;
              const canCall = item.status === 'Waiting' || item.status === 'Triaged';
              const canComplete = item.status === 'InConsultation';

              return (
                <View key={item.id} style={styles.card}>
                  <View style={styles.itemHeader}>
                    <ThemedText style={[styles.queueBadge, { backgroundColor: priorityStyle.bg, color: priorityStyle.text }]}>
                      {item.queueNumber}
                    </ThemedText>
                    <View style={styles.patientInfo}>
                      <ThemedText style={styles.patientName}>{item.patientName}</ThemedText>
                      <ThemedText style={styles.providerText}>
                        Assigned: {item.doctorName ?? 'Staff Physician'} • {item.priority}
                      </ThemedText>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                      <ThemedText style={[styles.statusBadgeText, { color: statusBadge.text }]}>
                        {statusBadge.label}
                      </ThemedText>
                    </View>
                  </View>

                  {item.chiefComplaint && (
                    <View style={styles.complaintRow}>
                      <ThemedText style={styles.complaintLabel}>Reason:</ThemedText>
                      <ThemedText style={styles.complaintValue}>{item.chiefComplaint}</ThemedText>
                    </View>
                  )}

                  {/* Vitals Summary Pill */}
                  {item.hasVitals && item.vitalsSummary ? (
                    <View style={styles.vitalsContainer}>
                      <ThemedText style={styles.vitalsText}>📊 {item.vitalsSummary}</ThemedText>
                    </View>
                  ) : (
                    <View style={styles.vitalsPendingContainer}>
                      <ThemedText style={styles.vitalsPendingText}>⏳ Triage Vitals: Pending Nurse Capture</ThemedText>
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View style={styles.itemActions}>
                    {canCall && (
                      <Pressable
                        style={[styles.actionBtn, styles.callBtn, isActioning && styles.btnDisabled]}
                        onPress={() => handleCallPatient(item)}
                        disabled={isActioning}
                      >
                        {isActioning ? (
                          <ActivityIndicator size="small" color="#0369A1" />
                        ) : (
                          <ThemedText style={styles.callBtnText}>Call to Room</ThemedText>
                        )}
                      </Pressable>
                    )}

                    {canComplete && (
                      <Pressable
                        style={[styles.actionBtn, styles.completeBtn, isActioning && styles.btnDisabled]}
                        onPress={() => handleCompletePatient(item)}
                        disabled={isActioning}
                      >
                        {isActioning ? (
                          <ActivityIndicator size="small" color="#15803D" />
                        ) : (
                          <ThemedText style={styles.completeBtnText}>Complete Visit</ThemedText>
                        )}
                      </Pressable>
                    )}

                    {item.status === 'Completed' && (
                      <View style={styles.completedBadge}>
                        <ThemedText style={styles.completedText}>✓ Encounter Closed</ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}
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
  sectionHeader: {
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterTab: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterTabActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 13,
  },
  list: {
    gap: 12,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 10,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  queueBadge: {
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  patientInfo: {
    flex: 1,
    gap: 2,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  providerText: {
    fontSize: 12,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  complaintRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  complaintLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  complaintValue: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
  },
  vitalsContainer: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  vitalsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  vitalsPendingContainer: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  vitalsPendingText: {
    fontSize: 12,
    color: '#B45309',
  },
  itemActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
    marginTop: 2,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  callBtn: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  callBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  completeBtn: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  completeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  completedBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  completedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
});
