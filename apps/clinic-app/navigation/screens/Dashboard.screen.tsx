import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  TextInput,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ThemedText, Badge, Button, StatCard, ProgressBar } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import {
  clinicService,
  PatientQueueItem,
  QueueMetrics,
  QueueStatus,
  QueuePriority,
  TriageVitals,
  ClinicAnalytics,
  DailyEodReport,
  MorbidityReport,
  TaxDiscountAuditReport,
  DoctorSharesReport,
} from '../../services/clinicService';

type DashboardTab = 'OPERATIONS' | 'ANALYTICS' | 'REPORTS';
type ReportType = 'DAILY_EOD' | 'MORBIDITY' | 'TAX_DISCOUNT' | 'DOCTOR_SHARES';

const SAMPLE_METRICS: QueueMetrics = {
  inQueue: 3,
  urgentTriage: 1,
  completedToday: 14,
  totalCheckedIn: 18,
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
    calledTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    chiefComplaint: 'Hypertension Follow-up',
    hasVitals: true,
    vitalsSummary: 'BP: 138/88 • HR: 76 bpm • Temp: 36.6°C • BMI: 24.2',
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
    chiefComplaint: 'Acute Chest Discomfort & Shortness of Breath',
    hasVitals: false,
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
    chiefComplaint: 'Prenatal Routine Checkup',
    hasVitals: true,
    vitalsSummary: 'BP: 110/70 • HR: 72 bpm • Temp: 36.5°C • BMI: 21.8',
  },
  {
    id: 'q-004',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    queueNumber: 'Q-004',
    sequenceNumber: 4,
    queueDate: new Date().toISOString().split('T')[0],
    patientId: 'pat-104',
    patientName: 'Antonio Reyes',
    doctorId: 'doc-001',
    doctorName: 'Dr. Cruz',
    priority: 'Routine',
    status: 'Completed',
    checkInTime: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    calledTime: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    completedTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    chiefComplaint: 'Suture removal & wound inspection',
    hasVitals: true,
    vitalsSummary: 'BP: 122/80 • HR: 70 bpm • BMI: 23.5',
  },
];

const SAMPLE_ANALYTICS: ClinicAnalytics = {
  startDate: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0],
  tenantId: 'tenant-default',
  clinicId: 'clinic-default',
  flow: {
    totalEncountersToday: 18,
    inQueueNow: 3,
    urgentTriageNow: 1,
    inConsultationNow: 1,
    completedToday: 14,
    averageWaitMinutes: 14.5,
    averageConsultMinutes: 18.2,
    routineCount: 15,
    urgentCount: 2,
    emergencyCount: 1,
  },
  totalGrossRevenue: 34850,
  totalNetRevenue: 30120,
  totalCollections: 28620,
  totalUnpaidBalances: 1500,
  averageTicketSize: 580,
  seniorDiscountsGiven: 3250,
  pwdDiscountsGiven: 1480,
  revenueTrend: [
    { dateLabel: 'Sep 23', revenue: 4200, patientCount: 12 },
    { dateLabel: 'Sep 24', revenue: 5100, patientCount: 15 },
    { dateLabel: 'Sep 25', revenue: 3800, patientCount: 11 },
    { dateLabel: 'Sep 26', revenue: 6400, patientCount: 19 },
    { dateLabel: 'Sep 27', revenue: 4950, patientCount: 14 },
    { dateLabel: 'Sep 28', revenue: 5800, patientCount: 17 },
    { dateLabel: 'Sep 29', revenue: 4570, patientCount: 18 },
  ],
  tenderShares: [
    { method: 'Cash', totalAmount: 14200, percentage: 49.6 },
    { method: 'GCash', totalAmount: 7850, percentage: 27.4 },
    { method: 'Maya', totalAmount: 3200, percentage: 11.2 },
    { method: 'CreditCard', totalAmount: 2370, percentage: 8.3 },
    { method: 'PhilHealth', totalAmount: 1000, percentage: 3.5 },
  ],
  topDiagnoses: [
    { icd10Code: 'I10', description: 'Essential (Primary) Hypertension', caseCount: 38, percentageShare: 31.7 },
    { icd10Code: 'J06.9', description: 'Acute Upper Respiratory Tract Infection', caseCount: 29, percentageShare: 24.2 },
    { icd10Code: 'E11.9', description: 'Type 2 Diabetes Mellitus without complications', caseCount: 22, percentageShare: 18.3 },
    { icd10Code: 'A09', description: 'Infectious Gastroenteritis and Colitis', caseCount: 15, percentageShare: 12.5 },
    { icd10Code: 'J45.9', description: 'Bronchial Asthma, Unspecified', caseCount: 11, percentageShare: 9.2 },
    { icd10Code: 'M54.5', description: 'Low Back Pain, Lumbago', caseCount: 5, percentageShare: 4.1 },
  ],
  topServices: [
    { itemType: 'Procedure', itemName: 'Salbutamol Nebulization', quantity: 24 },
    { itemType: 'LabOrder', itemName: 'Complete Blood Count (CBC)', quantity: 22 },
    { itemType: 'Procedure', itemName: 'Surgical Wound Dressing', quantity: 18 },
    { itemType: 'LabOrder', itemName: 'Fasting Blood Sugar (FBS)', quantity: 16 },
    { itemType: 'LabOrder', itemName: 'Lipid Profile', quantity: 14 },
    { itemType: 'Procedure', itemName: 'Influenza Vaccine Administration', quantity: 12 },
  ],
  doctorStats: [
    { doctorName: 'Dr. Cruz, MD (Family Medicine)', encountersCount: 28, totalBilled: 15400 },
    { doctorName: 'Dr. Reyes, MD (Internal Medicine)', encountersCount: 22, totalBilled: 12800 },
    { doctorName: 'Dr. Santos, MD (Pediatrics)', encountersCount: 19, totalBilled: 9800 },
  ],
};

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<DashboardTab>('OPERATIONS');
  const [metrics, setMetrics] = useState<QueueMetrics>(SAMPLE_METRICS);
  const [queue, setQueue] = useState<PatientQueueItem[]>(SAMPLE_QUEUE);
  const [analytics, setAnalytics] = useState<ClinicAnalytics>(SAMPLE_ANALYTICS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<string>('ALL');

  // Nurse Triage Modal State
  const [triageModalVisible, setTriageModalVisible] = useState(false);
  const [triageItem, setTriageItem] = useState<PatientQueueItem | null>(null);
  const [triageBpSys, setTriageBpSys] = useState('120');
  const [triageBpDia, setTriageBpDia] = useState('80');
  const [triageHr, setTriageHr] = useState('75');
  const [triageRr, setTriageRr] = useState('18');
  const [triageTemp, setTriageTemp] = useState('36.6');
  const [triageSpo2, setTriageSpo2] = useState('98');
  const [triageHeight, setTriageHeight] = useState('165');
  const [triageWeight, setTriageWeight] = useState('65');
  const [triagePain, setTriagePain] = useState('0');
  const [triagePriority, setTriagePriority] = useState<QueuePriority>('Routine');
  const [triageNotes, setTriageNotes] = useState('');
  const [savingTriage, setSavingTriage] = useState(false);

  // Statutory Reports State
  const [reportType, setReportType] = useState<ReportType>('DAILY_EOD');
  const [eodReport, setEodReport] = useState<DailyEodReport | null>(null);
  const [morbidityReport, setMorbidityReport] = useState<MorbidityReport | null>(null);
  const [taxReport, setTaxReport] = useState<TaxDiscountAuditReport | null>(null);
  const [doctorSharesReport, setDoctorSharesReport] = useState<DoctorSharesReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [printModalVisible, setPrintModalVisible] = useState(false);

  const loadData = useCallback(async () => {
    const [
      [metricsData],
      [queueData],
      [analyticsData],
      [eodData],
      [morbidityData],
      [taxData],
      [sharesData],
    ] = await Promise.all([
      clinicService.getQueueMetrics(),
      clinicService.getQueue(),
      clinicService.getClinicAnalytics(),
      clinicService.getDailyEodReport(),
      clinicService.getMorbidityReport(),
      clinicService.getTaxDiscountAuditReport(),
      clinicService.getDoctorSharesReport(),
    ]);

    if (metricsData) setMetrics(metricsData);
    if (queueData && queueData.length > 0) setQueue(queueData);
    if (analyticsData) setAnalytics(analyticsData);
    if (eodData) setEodReport(eodData);
    if (morbidityData) setMorbidityReport(morbidityData);
    if (taxData) setTaxReport(taxData);
    if (sharesData) setDoctorSharesReport(sharesData);
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

  // Queue Actions
  const handleCallPatient = async (item: PatientQueueItem) => {
    setActioningId(item.id);
    await clinicService.callQueueItem(item.id, 'doc-001', 'Dr. Cruz');
    setActioningId(null);

    setQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? { ...q, status: 'InConsultation' as QueueStatus, calledTime: new Date().toISOString() }
          : q
      )
    );
  };

  const handleOpenTriage = (item: PatientQueueItem) => {
    setTriageItem(item);
    setTriagePriority(item.priority);
    setTriageNotes(item.chiefComplaint ?? '');
    setTriageModalVisible(true);
  };

  const handleSaveTriage = async () => {
    if (!triageItem) return;
    setSavingTriage(true);

    const bpSys = parseInt(triageBpSys, 10) || 120;
    const bpDia = parseInt(triageBpDia, 10) || 80;
    const hr = parseInt(triageHr, 10) || 75;
    const temp = parseFloat(triageTemp) || 36.6;
    const rr = parseInt(triageRr, 10) || 18;
    const spo2 = parseInt(triageSpo2, 10) || 98;
    const ht = parseFloat(triageHeight) || 165;
    const wt = parseFloat(triageWeight) || 65;
    const pain = parseInt(triagePain, 10) || 0;
    const bmiVal = Math.round((wt / ((ht / 100) * (ht / 100))) * 10) / 10;

    await clinicService.recordTriage(triageItem.id, {
      nurseId: 'nurse-001',
      recordedByNurseName: 'Nurse Bea Gomez, RN',
      systolicBp: bpSys,
      diastolicBp: bpDia,
      heartRateBpm: hr,
      temperatureCelsius: temp,
      respiratoryRateBreathsPerMin: rr,
      oxygenSaturationPercent: spo2,
      heightCm: ht,
      weightKg: wt,
      painScore: pain,
      notes: triageNotes,
    });

    const summaryStr = `BP: ${bpSys}/${bpDia} • HR: ${hr} • SpO2: ${spo2}% • BMI: ${bmiVal}`;

    setQueue((prev) =>
      prev.map((q) =>
        q.id === triageItem.id
          ? {
              ...q,
              status: 'Triaged' as QueueStatus,
              priority: triagePriority,
              hasVitals: true,
              vitalsSummary: summaryStr,
              chiefComplaint: triageNotes || q.chiefComplaint,
            }
          : q
      )
    );

    setSavingTriage(false);
    setTriageModalVisible(false);
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
    <ResponsiveLayout
      headerTitle="Clinic Operations Command"
      headerSubtitle="Provider Center • Outpatient Encounters, Live Queue & Analytics"
      rightAction={
        <Button
          title="+ Intake / Patient"
          variant="primary"
          size="sm"
          onPress={() => navigation.navigate('Patients')}
        />
      }
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.rowBetween}>
          <View>
            <ThemedText style={styles.subtitle}>Clinic Operations Command</ThemedText>
            <ThemedText style={styles.title}>Provider Center</ThemedText>
          </View>
          <Pressable
            style={styles.newPatientBtn}
            onPress={() => navigation.navigate('Patients')}
          >
            <ThemedText style={styles.newPatientBtnText}>+ Intake / Patient</ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Main Segmented Mode Switcher */}
      <View style={styles.modeTabs}>
        <Pressable
          style={[styles.modeTab, activeTab === 'OPERATIONS' && styles.modeTabActive]}
          onPress={() => setActiveTab('OPERATIONS')}
        >
          <ThemedText style={[styles.modeTabText, activeTab === 'OPERATIONS' && styles.modeTabTextActive]}>
            🏥 Live Queue
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.modeTab, activeTab === 'ANALYTICS' && styles.modeTabActive]}
          onPress={() => setActiveTab('ANALYTICS')}
        >
          <ThemedText style={[styles.modeTabText, activeTab === 'ANALYTICS' && styles.modeTabTextActive]}>
            📊 Executive Analytics
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.modeTab, activeTab === 'REPORTS' && styles.modeTabActive]}
          onPress={() => setActiveTab('REPORTS')}
        >
          <ThemedText style={[styles.modeTabText, activeTab === 'REPORTS' && styles.modeTabTextActive]}>
            📑 Statutory Reports
          </ThemedText>
        </Pressable>
      </View>

      {/* ============================================================== */}
      {/* TAB 1: OPERATIONS & REAL-TIME QUEUE                            */}
      {/* ============================================================== */}
      {activeTab === 'OPERATIONS' && (
        <View style={{ gap: 16 }}>
          {/* Telemetry Ribbons */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <ThemedText style={styles.statNumber}>{metrics.inQueue}</ThemedText>
              <ThemedText style={styles.statLabel}>In Queue</ThemedText>
            </View>
            <View style={styles.statCard}>
              <ThemedText style={[styles.statNumber, { color: '#DC2626' }]}>{metrics.urgentTriage}</ThemedText>
              <ThemedText style={styles.statLabel}>Urgent Triage</ThemedText>
            </View>
            <View style={styles.statCard}>
              <ThemedText style={[styles.statNumber, { color: '#7E22CE' }]}>
                {queue.filter((q) => q.status === 'InConsultation').length}
              </ThemedText>
              <ThemedText style={styles.statLabel}>In Room</ThemedText>
            </View>
            <View style={styles.statCard}>
              <ThemedText style={[styles.statNumber, { color: '#16A34A' }]}>{metrics.completedToday}</ThemedText>
              <ThemedText style={styles.statLabel}>Completed</ThemedText>
            </View>
          </View>

          {/* Wait Time & Consultation Efficiency Metric Strip */}
          <View style={styles.efficiencyStrip}>
            <View style={styles.efficiencyItem}>
              <ThemedText style={styles.efficiencyVal}>⏱️ {analytics.flow.averageWaitMinutes} min</ThemedText>
              <ThemedText style={styles.efficiencyLabel}>Avg Patient Wait Time</ThemedText>
            </View>
            <View style={styles.efficiencyDivider} />
            <View style={styles.efficiencyItem}>
              <ThemedText style={styles.efficiencyVal}>🩺 {analytics.flow.averageConsultMinutes} min</ThemedText>
              <ThemedText style={styles.efficiencyLabel}>Avg Consult Duration</ThemedText>
            </View>
            <View style={styles.efficiencyDivider} />
            <View style={styles.efficiencyItem}>
              <ThemedText style={styles.efficiencyVal}>🎟️ {metrics.totalCheckedIn}</ThemedText>
              <ThemedText style={styles.efficiencyLabel}>Total Census Today</ThemedText>
            </View>
          </View>

          {/* Filter Pills */}
          <View style={styles.filterRow}>
            {['ALL', 'Waiting', 'Triaged', 'InConsultation', 'Completed'].map((filterKey) => {
              const isActive = queueFilter === filterKey;
              const count =
                filterKey === 'ALL'
                  ? queue.length
                  : queue.filter((q) => q.status === filterKey).length;
              return (
                <Pressable
                  key={filterKey}
                  onPress={() => setQueueFilter(filterKey)}
                  style={[styles.filterTab, isActive && styles.filterTabActive]}
                >
                  <ThemedText style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                    {filterKey === 'ALL'
                      ? 'All'
                      : filterKey === 'InConsultation'
                      ? 'In Room'
                      : filterKey}{' '}
                    ({count})
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Queue List */}
          {loading && !refreshing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0284C7" />
              <ThemedText style={styles.loadingText}>Updating live queue...</ThemedText>
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
                  const isCompleted = item.status === 'Completed';

                  return (
                    <View key={item.id} style={styles.card}>
                      <View style={styles.itemHeader}>
                        <ThemedText
                          style={[
                            styles.queueBadge,
                            { backgroundColor: priorityStyle.bg, color: priorityStyle.text },
                          ]}
                        >
                          {item.queueNumber}
                        </ThemedText>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <ThemedText style={styles.itemPatientName}>{item.patientName}</ThemedText>
                          <ThemedText style={styles.itemMeta}>
                            Doctor: {item.doctorName ?? 'General Pool'} • Triage: {item.priority}
                          </ThemedText>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                          <ThemedText style={[styles.statusBadgeText, { color: statusBadge.text }]}>
                            {statusBadge.label}
                          </ThemedText>
                        </View>
                      </View>

                      {/* Chief Complaint */}
                      {item.chiefComplaint ? (
                        <View style={styles.complaintBox}>
                          <ThemedText style={styles.complaintText}>
                            <ThemedText style={{ fontWeight: '700' }}>Chief Complaint: </ThemedText>
                            {item.chiefComplaint}
                          </ThemedText>
                        </View>
                      ) : null}

                      {/* Vitals Summary Strip */}
                      {item.hasVitals && item.vitalsSummary ? (
                        <View style={styles.vitalsBox}>
                          <ThemedText style={styles.vitalsText}>📊 {item.vitalsSummary}</ThemedText>
                        </View>
                      ) : item.status !== 'Completed' ? (
                        <View style={styles.vitalsPendingBox}>
                          <ThemedText style={styles.vitalsPendingText}>
                            ⚠️ Vitals Pending — Nurse triage required
                          </ThemedText>
                        </View>
                      ) : null}

                      {/* Actions Toolbar */}
                      <View style={styles.itemActions}>
                        <Pressable
                          style={[styles.actionBtn, styles.triageBtn]}
                          onPress={() => handleOpenTriage(item)}
                        >
                          <ThemedText style={styles.triageBtnText}>📋 Triage & Vitals</ThemedText>
                        </Pressable>

                        {canCall && (
                          <Pressable
                            style={[styles.actionBtn, styles.callBtn, isActioning && { opacity: 0.6 }]}
                            onPress={() => handleCallPatient(item)}
                            disabled={isActioning}
                          >
                            <ThemedText style={styles.callBtnText}>🩺 Call into Room</ThemedText>
                          </Pressable>
                        )}

                        <Pressable
                          style={[styles.actionBtn, styles.examineBtn]}
                          onPress={() =>
                            navigation.navigate('Consultations', {
                              patientId: item.patientId,
                              patientName: item.patientName,
                              queueId: item.id,
                            })
                          }
                        >
                          <ThemedText style={styles.examineBtnText}>🔬 Examine</ThemedText>
                        </Pressable>

                        {isCompleted && (
                          <Pressable
                            style={[styles.actionBtn, styles.billBtn]}
                            onPress={() =>
                              navigation.navigate('Billing', {
                                patientId: item.patientId,
                                patientName: item.patientName,
                              })
                            }
                          >
                            <ThemedText style={styles.billBtnText}>💵 Bill Visit →</ThemedText>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>
      )}

      {/* ============================================================== */}
      {/* TAB 2: EXECUTIVE ANALYTICS                                     */}
      {/* ============================================================== */}
      {activeTab === 'ANALYTICS' && (
        <View style={{ gap: 16 }}>
          {/* Financial KPI Grid */}
          <View style={styles.analyticsKpiGrid}>
            <View style={styles.kpiCard}>
              <ThemedText style={styles.kpiLabel}>Gross Billings</ThemedText>
              <ThemedText style={styles.kpiValue}>
                ₱{analytics.totalGrossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </ThemedText>
              <ThemedText style={styles.kpiSub}>Before discounts</ThemedText>
            </View>

            <View style={styles.kpiCard}>
              <ThemedText style={styles.kpiLabel}>Net Collections</ThemedText>
              <ThemedText style={[styles.kpiValue, { color: '#16A34A' }]}>
                ₱{analytics.totalCollections.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </ThemedText>
              <ThemedText style={styles.kpiSub}>Deposited / Tendered</ThemedText>
            </View>

            <View style={styles.kpiCard}>
              <ThemedText style={styles.kpiLabel}>Statutory Discounts</ThemedText>
              <ThemedText style={[styles.kpiValue, { color: '#D97706' }]}>
                ₱{(analytics.seniorDiscountsGiven + analytics.pwdDiscountsGiven).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </ThemedText>
              <ThemedText style={styles.kpiSub}>RA 9994 & RA 10754</ThemedText>
            </View>

            <View style={styles.kpiCard}>
              <ThemedText style={styles.kpiLabel}>Average Ticket</ThemedText>
              <ThemedText style={styles.kpiValue}>₱{analytics.averageTicketSize.toFixed(2)}</ThemedText>
              <ThemedText style={styles.kpiSub}>Per encounter bill</ThemedText>
            </View>
          </View>

          {/* 7-Day Revenue Trend Visualization */}
          <View style={styles.analyticsSection}>
            <ThemedText style={styles.sectionTitle}>📅 7-Day Revenue & Patient Volume</ThemedText>
            <ThemedText style={styles.sectionSubtitle}>
              Daily collection trends and completed patient visits across this week
            </ThemedText>

            <View style={styles.trendRow}>
              {analytics.revenueTrend.map((pt, i) => (
                <View key={i} style={styles.trendCol}>
                  <ThemedText style={styles.trendBarAmt}>₱{(pt.revenue / 1000).toFixed(1)}k</ThemedText>
                  <View
                    style={[
                      styles.trendBar,
                      {
                        height: Math.max(20, Math.min(100, (pt.revenue / 7000) * 100)),
                        backgroundColor: i === analytics.revenueTrend.length - 1 ? '#0284C7' : '#93C5FD',
                      },
                    ]}
                  />
                  <ThemedText style={styles.trendBarDate}>{pt.dateLabel}</ThemedText>
                  <ThemedText style={styles.trendBarCount}>{pt.patientCount} pts</ThemedText>
                </View>
              ))}
            </View>
          </View>

          {/* Tender Mode Breakdown */}
          <View style={styles.analyticsSection}>
            <ThemedText style={styles.sectionTitle}>💳 Payment Tender Mode Shares</ThemedText>
            <View style={{ gap: 8, marginTop: 6 }}>
              {analytics.tenderShares.map((t, idx) => (
                <View key={idx} style={{ gap: 4 }}>
                  <View style={styles.rowBetween}>
                    <ThemedText style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>
                      {t.method}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                      ₱{t.totalAmount.toLocaleString()} ({t.percentage}%)
                    </ThemedText>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, t.percentage)}%`,
                          backgroundColor:
                            t.method === 'Cash'
                              ? '#16A34A'
                              : t.method === 'GCash'
                              ? '#0284C7'
                              : t.method === 'Maya'
                              ? '#7E22CE'
                              : '#F59E0B',
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Top 10 ICD-10 Morbidity (Primary Care Disease Census) */}
          <View style={styles.analyticsSection}>
            <ThemedText style={styles.sectionTitle}>🦠 Top Outpatient Morbidity (ICD-10)</ThemedText>
            <ThemedText style={styles.sectionSubtitle}>
              Most frequent clinical diagnoses encountered during outpatient primary care visits
            </ThemedText>

            <View style={{ gap: 10, marginTop: 8 }}>
              {analytics.topDiagnoses.map((diag, index) => (
                <View key={index} style={{ gap: 4 }}>
                  <View style={styles.rowBetween}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <ThemedText style={styles.icdRank}>#{index + 1}</ThemedText>
                      <ThemedText style={styles.icdCode}>{diag.icd10Code}</ThemedText>
                      <ThemedText style={styles.icdDesc} numberOfLines={1}>
                        {diag.description}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.icdCount}>
                      {diag.caseCount} ({diag.percentageShare}%)
                    </ThemedText>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.min(100, diag.percentageShare * 2.5)}%`, backgroundColor: '#4F46E5' },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Top Services (Procedures & Labs) */}
          <View style={styles.analyticsSection}>
            <ThemedText style={styles.sectionTitle}>🧪 Clinical Procedures & Lab Tests</ThemedText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {analytics.topServices.map((svc, i) => (
                <View key={i} style={styles.serviceChip}>
                  <ThemedText style={styles.serviceChipBadge}>
                    {svc.itemType === 'Procedure' ? '💉 Proc' : '🔬 Lab'}
                  </ThemedText>
                  <ThemedText style={styles.serviceChipText}>{svc.itemName}</ThemedText>
                  <ThemedText style={styles.serviceChipCount}>{svc.quantity}x</ThemedText>
                </View>
              ))}
            </View>
          </View>

          {/* Doctor Productivity */}
          <View style={styles.analyticsSection}>
            <ThemedText style={styles.sectionTitle}>👨‍⚕️ Physician Encounters & Billed PF</ThemedText>
            <View style={{ gap: 8, marginTop: 8 }}>
              {analytics.doctorStats.map((doc, idx) => (
                <View key={idx} style={styles.docStatRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                      {doc.doctorName}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 12, color: '#6B7280' }}>
                      Encounters Handled: {doc.encountersCount}
                    </ThemedText>
                  </View>
                  <ThemedText style={{ fontSize: 14, fontWeight: '700', color: '#0284C7' }}>
                    ₱{doc.totalBilled.toLocaleString()}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* ============================================================== */}
      {/* TAB 3: STATUTORY & OPERATIONAL REPORTS                         */}
      {/* ============================================================== */}
      {activeTab === 'REPORTS' && (
        <View style={{ gap: 16 }}>
          {/* Report Type Selector Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reportTabsRow}>
            {[
              { key: 'DAILY_EOD' as ReportType, label: '💰 Daily EOD Remittance' },
              { key: 'MORBIDITY' as ReportType, label: '📊 DOH Morbidity Census' },
              { key: 'TAX_DISCOUNT' as ReportType, label: '🏷️ BIR Senior/PWD Audit' },
              { key: 'DOCTOR_SHARES' as ReportType, label: '🩺 Physician PF Sharing' },
            ].map((rep) => {
              const isSelected = reportType === rep.key;
              return (
                <Pressable
                  key={rep.key}
                  onPress={() => setReportType(rep.key)}
                  style={[styles.reportTypePill, isSelected && styles.reportTypePillActive]}
                >
                  <ThemedText
                    style={[styles.reportTypePillText, isSelected && styles.reportTypePillTextActive]}
                  >
                    {rep.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Action Ribbon: Printable View */}
          <View style={styles.reportActionRibbon}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                {reportType === 'DAILY_EOD' && 'Daily End-of-Day Remittance & Cashier Audit'}
                {reportType === 'MORBIDITY' && 'DOH / PhilHealth Konsulta Outpatient Morbidity Report'}
                {reportType === 'TAX_DISCOUNT' && 'BIR RA 9994 / RA 10754 Statutory Discount Audit'}
                {reportType === 'DOCTOR_SHARES' && 'Physician Workload & Professional Fee (PF) Sharing'}
              </ThemedText>
              <ThemedText style={{ fontSize: 11, color: '#6B7280' }}>
                Official Philippine healthcare compliance and statutory records
              </ThemedText>
            </View>
            <Pressable
              style={styles.printSheetBtn}
              onPress={() => setPrintModalVisible(true)}
            >
              <ThemedText style={styles.printSheetBtnText}>🖨️ Official Sheet View</ThemedText>
            </Pressable>
          </View>

          {/* Report 1: Daily EOD Remittance */}
          {reportType === 'DAILY_EOD' && (
            <View style={styles.reportCard}>
              <View style={styles.reportCardHeader}>
                <ThemedText style={styles.reportCardTitle}>Cashier Shift Handover & Teller Reconciliation</ThemedText>
                <ThemedText style={styles.reportCardDate}>
                  Report Date: {new Date().toLocaleDateString()}
                </ThemedText>
              </View>

              <View style={styles.censusBox}>
                <View style={styles.censusItem}>
                  <ThemedText style={styles.censusVal}>{eodReport?.totalCheckedIn ?? 18}</ThemedText>
                  <ThemedText style={styles.censusLabel}>Total Patients</ThemedText>
                </View>
                <View style={styles.censusItem}>
                  <ThemedText style={styles.censusVal}>{eodReport?.totalWalkIns ?? 14}</ThemedText>
                  <ThemedText style={styles.censusLabel}>Walk-in Intake</ThemedText>
                </View>
                <View style={styles.censusItem}>
                  <ThemedText style={styles.censusVal}>{eodReport?.totalAppointments ?? 4}</ThemedText>
                  <ThemedText style={styles.censusLabel}>Booked Appts</ThemedText>
                </View>
                <View style={styles.censusItem}>
                  <ThemedText style={[styles.censusVal, { color: '#16A34A' }]}>
                    {eodReport?.totalCompletedVisits ?? 14}
                  </ThemedText>
                  <ThemedText style={styles.censusLabel}>Completed Visits</ThemedText>
                </View>
              </View>

              {/* Physical Cash in Drawer vs Electronic Collections */}
              <View style={styles.cashDrawerBanner}>
                <View>
                  <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#15803D' }}>
                    💵 Physical Cash in Drawer (Bank Drop)
                  </ThemedText>
                  <ThemedText style={{ fontSize: 11, color: '#166534' }}>
                    Coins and bills ready for physical safe handover
                  </ThemedText>
                </View>
                <ThemedText style={{ fontSize: 18, fontWeight: '800', color: '#15803D' }}>
                  ₱{(eodReport?.cashInDrawer ?? 14200).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </ThemedText>
              </View>

              <View style={styles.financialTable}>
                <View style={styles.financialRow}>
                  <ThemedText style={styles.finLabel}>Total Gross Revenue</ThemedText>
                  <ThemedText style={styles.finVal}>
                    ₱{(eodReport?.totalGrossAmount ?? 34850).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </ThemedText>
                </View>
                <View style={styles.financialRow}>
                  <ThemedText style={styles.finLabel}>Senior Citizen Discounts (RA 9994)</ThemedText>
                  <ThemedText style={[styles.finVal, { color: '#DC2626' }]}>
                    - ₱{(eodReport?.totalSeniorDiscounts ?? 3250).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </ThemedText>
                </View>
                <View style={styles.financialRow}>
                  <ThemedText style={styles.finLabel}>PWD Discounts (RA 10754)</ThemedText>
                  <ThemedText style={[styles.finVal, { color: '#DC2626' }]}>
                    - ₱{(eodReport?.totalPwdDiscounts ?? 1480).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </ThemedText>
                </View>
                <View style={[styles.financialRow, { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 6 }]}>
                  <ThemedText style={[styles.finLabel, { fontWeight: '700' }]}>Total Net Collections</ThemedText>
                  <ThemedText style={[styles.finVal, { fontWeight: '800', color: '#0284C7' }]}>
                    ₱{(eodReport?.totalAmountCollected ?? 28620).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </ThemedText>
                </View>
              </View>
            </View>
          )}

          {/* Report 2: DOH Morbidity Census */}
          {reportType === 'MORBIDITY' && (
            <View style={styles.reportCard}>
              <View style={styles.reportCardHeader}>
                <ThemedText style={styles.reportCardTitle}>DOH Field Health Services Morbidity Census</ThemedText>
                <ThemedText style={styles.reportCardDate}>
                  Classification: Primary Care Outpatient Visits by Age Bracket
                </ThemedText>
              </View>

              <View style={styles.tableHeaderRow}>
                <ThemedText style={[styles.thCell, { width: 30 }]}>#</ThemedText>
                <ThemedText style={[styles.thCell, { width: 60 }]}>Code</ThemedText>
                <ThemedText style={[styles.thCell, { flex: 1 }]}>ICD-10 Diagnosis</ThemedText>
                <ThemedText style={[styles.thCell, { width: 45, textAlign: 'center' }]}>Pedia</ThemedText>
                <ThemedText style={[styles.thCell, { width: 45, textAlign: 'center' }]}>Adult</ThemedText>
                <ThemedText style={[styles.thCell, { width: 45, textAlign: 'center' }]}>Senior</ThemedText>
                <ThemedText style={[styles.thCell, { width: 45, textAlign: 'right' }]}>Total</ThemedText>
              </View>

              {(morbidityReport?.diseases ?? [
                { rank: 1, icd10Code: 'I10', description: 'Essential (Primary) Hypertension', pediatricCases: 0, adultCases: 24, seniorCases: 18, totalCases: 42 },
                { rank: 2, icd10Code: 'J06.9', description: 'Acute Upper Respiratory Tract Infection', pediatricCases: 14, adultCases: 15, seniorCases: 2, totalCases: 31 },
                { rank: 3, icd10Code: 'E11.9', description: 'Type 2 Diabetes Mellitus without complications', pediatricCases: 0, adultCases: 16, seniorCases: 10, totalCases: 26 },
                { rank: 4, icd10Code: 'A09', description: 'Infectious Gastroenteritis and Colitis', pediatricCases: 6, adultCases: 8, seniorCases: 2, totalCases: 16 },
                { rank: 5, icd10Code: 'J45.9', description: 'Bronchial Asthma, Unspecified', pediatricCases: 5, adultCases: 6, seniorCases: 2, totalCases: 13 },
              ]).map((row, idx) => (
                <View key={idx} style={[styles.tableDataRow, idx % 2 === 1 && { backgroundColor: '#F9FAFB' }]}>
                  <ThemedText style={[styles.tdCell, { width: 30, color: '#6B7280' }]}>{row.rank}</ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 60, fontWeight: '700', color: '#0284C7' }]}>
                    {row.icd10Code}
                  </ThemedText>
                  <ThemedText style={[styles.tdCell, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>
                    {row.description}
                  </ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 45, textAlign: 'center' }]}>{row.pediatricCases}</ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 45, textAlign: 'center' }]}>{row.adultCases}</ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 45, textAlign: 'center' }]}>{row.seniorCases}</ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 45, textAlign: 'right', fontWeight: '700' }]}>
                    {row.totalCases}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}

          {/* Report 3: BIR Statutory Discount & Tax Exemption Audit */}
          {reportType === 'TAX_DISCOUNT' && (
            <View style={styles.reportCard}>
              <View style={styles.reportCardHeader}>
                <ThemedText style={styles.reportCardTitle}>BIR RA 9994 / RA 10754 Statutory Discount Audit</ThemedText>
                <ThemedText style={styles.reportCardDate}>
                  Mandatory audit trail for 20% discount and 12% VAT exemption validation
                </ThemedText>
              </View>

              <View style={styles.tableHeaderRow}>
                <ThemedText style={[styles.thCell, { width: 85 }]}>Invoice / OR</ThemedText>
                <ThemedText style={[styles.thCell, { flex: 1 }]}>Patient & ID No.</ThemedText>
                <ThemedText style={[styles.thCell, { width: 65, textAlign: 'right' }]}>Gross</ThemedText>
                <ThemedText style={[styles.thCell, { width: 65, textAlign: 'right' }]}>-20% Disc</ThemedText>
                <ThemedText style={[styles.thCell, { width: 65, textAlign: 'right' }]}>VAT Exempt</ThemedText>
                <ThemedText style={[styles.thCell, { width: 65, textAlign: 'right' }]}>Net Paid</ThemedText>
              </View>

              {(taxReport?.items ?? [
                {
                  invoiceNumber: 'INV-20260929-0001',
                  officialReceiptNumber: 'OR-0001',
                  patientName: 'Maria Santos',
                  discountType: 'Senior (RA 9994)',
                  identificationCardNumber: 'OSCA-MNL-2018-4491',
                  grossAmount: 750,
                  discountAmount: 150,
                  vatAmountExempted: 90,
                  amountPaid: 600,
                },
                {
                  invoiceNumber: 'INV-20260929-0004',
                  officialReceiptNumber: 'OR-0003',
                  patientName: 'Antonio Reyes',
                  discountType: 'PWD (RA 10754)',
                  identificationCardNumber: 'PWD-QC-2021-9932',
                  grossAmount: 900,
                  discountAmount: 180,
                  vatAmountExempted: 108,
                  amountPaid: 720,
                },
              ]).map((item, idx) => (
                <View key={idx} style={[styles.tableDataRow, idx % 2 === 1 && { backgroundColor: '#F9FAFB' }]}>
                  <View style={{ width: 85 }}>
                    <ThemedText style={{ fontSize: 11, fontWeight: '700', color: '#111827' }}>
                      {item.invoiceNumber}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 10, color: '#16A34A' }}>
                      {item.officialReceiptNumber ?? 'Paid'}
                    </ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ fontSize: 11, fontWeight: '700', color: '#111827' }}>
                      {item.patientName}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 10, color: '#6B7280' }}>
                      {item.identificationCardNumber}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.tdCell, { width: 65, textAlign: 'right' }]}>
                    ₱{item.grossAmount.toFixed(2)}
                  </ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 65, textAlign: 'right', color: '#DC2626' }]}>
                    -₱{item.discountAmount.toFixed(2)}
                  </ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 65, textAlign: 'right', color: '#D97706' }]}>
                    ₱{item.vatAmountExempted.toFixed(2)}
                  </ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 65, textAlign: 'right', fontWeight: '700' }]}>
                    ₱{item.amountPaid.toFixed(2)}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}

          {/* Report 4: Physician PF Sharing */}
          {reportType === 'DOCTOR_SHARES' && (
            <View style={styles.reportCard}>
              <View style={styles.reportCardHeader}>
                <ThemedText style={styles.reportCardTitle}>Physician Workload & Professional Fee (PF) Sharing</ThemedText>
                <ThemedText style={styles.reportCardDate}>
                  Breakdown: 70% Attending Physician PF Share • 30% Clinic Facility Share
                </ThemedText>
              </View>

              <View style={styles.tableHeaderRow}>
                <ThemedText style={[styles.thCell, { flex: 1 }]}>Physician</ThemedText>
                <ThemedText style={[styles.thCell, { width: 50, textAlign: 'center' }]}>Visits</ThemedText>
                <ThemedText style={[styles.thCell, { width: 75, textAlign: 'right' }]}>Gross (₱)</ThemedText>
                <ThemedText style={[styles.thCell, { width: 75, textAlign: 'right' }]}>Doctor PF (70%)</ThemedText>
                <ThemedText style={[styles.thCell, { width: 75, textAlign: 'right' }]}>Facility (30%)</ThemedText>
              </View>

              {(doctorSharesReport?.doctorShares ?? [
                {
                  doctorName: 'Dr. Cruz, MD (Family Medicine)',
                  totalEncounters: 24,
                  totalGrossGenerated: 15500,
                  estimatedPhysicianShare: 10850,
                  clinicFacilityShare: 4650,
                },
                {
                  doctorName: 'Dr. Reyes, MD (Internal Medicine)',
                  totalEncounters: 18,
                  totalGrossGenerated: 12100,
                  estimatedPhysicianShare: 8470,
                  clinicFacilityShare: 3630,
                },
                {
                  doctorName: 'Dr. Santos, MD (Pediatrics)',
                  totalEncounters: 15,
                  totalGrossGenerated: 13200,
                  estimatedPhysicianShare: 9240,
                  clinicFacilityShare: 3960,
                },
              ]).map((doc, idx) => (
                <View key={idx} style={[styles.tableDataRow, idx % 2 === 1 && { backgroundColor: '#F9FAFB' }]}>
                  <ThemedText style={[styles.tdCell, { flex: 1, fontWeight: '700' }]} numberOfLines={1}>
                    {doc.doctorName}
                  </ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 50, textAlign: 'center' }]}>
                    {doc.totalEncounters}
                  </ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 75, textAlign: 'right' }]}>
                    ₱{doc.totalGrossGenerated.toLocaleString()}
                  </ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 75, textAlign: 'right', fontWeight: '700', color: '#16A34A' }]}>
                    ₱{doc.estimatedPhysicianShare.toLocaleString()}
                  </ThemedText>
                  <ThemedText style={[styles.tdCell, { width: 75, textAlign: 'right', color: '#0284C7' }]}>
                    ₱{doc.clinicFacilityShare.toLocaleString()}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: NURSE TRIAGE & VITALS RECORDING MODAL                 */}
      {/* ============================================================== */}
      <Modal visible={triageModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <ThemedText style={styles.modalTitle}>Nurse Triage & Vital Signs</ThemedText>
                <ThemedText style={styles.modalSubTitle}>
                  {triageItem?.queueNumber} • {triageItem?.patientName}
                </ThemedText>
              </View>
              <Pressable onPress={() => setTriageModalVisible(false)}>
                <ThemedText style={styles.modalCloseText}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {/* Triage Urgency Priority Selector */}
              <View>
                <ThemedText style={styles.inputLabel}>Triage Priority Level</ThemedText>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['Routine', 'Urgent', 'Emergency'] as QueuePriority[]).map((p) => {
                    const isSel = triagePriority === p;
                    const pStyle = getPriorityStyle(p);
                    return (
                      <Pressable
                        key={p}
                        onPress={() => setTriagePriority(p)}
                        style={[
                          styles.priorityPill,
                          isSel && { backgroundColor: pStyle.bg, borderColor: pStyle.text },
                        ]}
                      >
                        <ThemedText style={[styles.priorityPillText, isSel && { color: pStyle.text, fontWeight: '700' }]}>
                          {p}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Blood Pressure & Heart Rate */}
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Systolic BP (mmHg)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={triageBpSys}
                    onChangeText={setTriageBpSys}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Diastolic BP (mmHg)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={triageBpDia}
                    onChangeText={setTriageBpDia}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Heart Rate (bpm)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={triageHr}
                    onChangeText={setTriageHr}
                  />
                </View>
              </View>

              {/* Temp, SpO2, Resp Rate */}
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Temp (°C)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={triageTemp}
                    onChangeText={setTriageTemp}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>SpO2 (%)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={triageSpo2}
                    onChangeText={setTriageSpo2}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Resp Rate (cpm)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={triageRr}
                    onChangeText={setTriageRr}
                  />
                </View>
              </View>

              {/* Height, Weight & Pain */}
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Height (cm)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={triageHeight}
                    onChangeText={setTriageHeight}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Weight (kg)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={triageWeight}
                    onChangeText={setTriageWeight}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.inputLabel}>Pain Score (0-10)</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={triagePain}
                    onChangeText={setTriagePain}
                  />
                </View>
              </View>

              {/* Chief Complaint / Nurse Notes */}
              <View>
                <ThemedText style={styles.inputLabel}>Chief Complaint & Triage Notes</ThemedText>
                <TextInput
                  style={[styles.textInput, { minHeight: 60, textAlignVertical: 'top' }]}
                  multiline
                  value={triageNotes}
                  onChangeText={setTriageNotes}
                  placeholder="Record symptoms, onset, and clinical observations..."
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <Pressable
                style={[styles.saveTriageBtn, savingTriage && { opacity: 0.6 }]}
                onPress={handleSaveTriage}
                disabled={savingTriage}
              >
                {savingTriage ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <ThemedText style={styles.saveTriageBtnText}>✓ Save Triage & Forward to Doctor</ThemedText>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============================================================== */}
      {/* MODAL 2: PRINTABLE OFFICIAL STATUTORY REPORT SHEET PREVIEW     */}
      {/* ============================================================== */}
      <Modal visible={printModalVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <ThemedText style={styles.modalTitle}>Official Report Document</ThemedText>
                <ThemedText style={styles.modalSubTitle}>Philippine Statutory Regulatory Format</ThemedText>
              </View>
              <Pressable onPress={() => setPrintModalVisible(false)}>
                <ThemedText style={styles.modalCloseText}>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: 14 }}>
              {/* Official Clinic Letterhead Header */}
              <View style={styles.letterheadBox}>
                <ThemedText style={styles.letterheadClinicName}>CLINICEZ PRIMARY CARE CENTER</ThemedText>
                <ThemedText style={styles.letterheadMeta}>
                  DOH Accreditation No. 04-2026-00192 • PhilHealth Konsulta Accredited Facility
                </ThemedText>
                <ThemedText style={styles.letterheadMeta}>
                  128 Rizal Avenue, Poblacion, Manila • Tel: (02) 8921-4450 • tax ID: 291-849-102-000
                </ThemedText>
                <View style={styles.letterheadRule} />
              </View>

              <View style={{ alignItems: 'center' }}>
                <ThemedText style={styles.docTitle}>
                  {reportType === 'DAILY_EOD' && 'OFFICIAL DAILY END-OF-DAY REMITTANCE REPORT'}
                  {reportType === 'MORBIDITY' && 'ANNUAL / MONTHLY OUTPATIENT MORBIDITY CENSUS (DOH FORM)'}
                  {reportType === 'TAX_DISCOUNT' && 'BIR STATUTORY DISCOUNT & VAT EXEMPTION AUDIT REPORT'}
                  {reportType === 'DOCTOR_SHARES' && 'PHYSICIAN WORKLOAD & PROFESSIONAL FEE (PF) SETTLEMENT'}
                </ThemedText>
                <ThemedText style={{ fontSize: 11, color: '#4B5563', marginTop: 2 }}>
                  Census Period: {new Date().toLocaleDateString()} • Generated By: Clinic Administrator
                </ThemedText>
              </View>

              {/* Document Summary Box */}
              <View style={styles.docSummaryBox}>
                <ThemedText style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>
                  Statutory Audit Certification
                </ThemedText>
                <ThemedText style={{ fontSize: 11, color: '#374151', lineHeight: 16, marginTop: 4 }}>
                  This document serves as the official operational and financial record generated by the ClinicEZ
                  EMR & HIS. All captured encounters, statutory deductions (RA 9994 / RA 10754), and collections
                  conform with Philippine Department of Health and Bureau of Internal Revenue regulations.
                </ThemedText>
              </View>

              {/* Signatures & Certification Stamp */}
              <View style={styles.signaturesRow}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <View style={styles.signatureLine} />
                  <ThemedText style={styles.signatureName}>Nurse Bea Gomez, RN</ThemedText>
                  <ThemedText style={styles.signatureTitle}>Triage Officer / Head Nurse</ThemedText>
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <View style={styles.signatureLine} />
                  <ThemedText style={styles.signatureName}>Dr. Roberto Cruz, MD</ThemedText>
                  <ThemedText style={styles.signatureTitle}>Medical Director / PRC 0149281</ThemedText>
                </View>
              </View>

              <Pressable
                style={styles.exportBtn}
                onPress={() => setPrintModalVisible(false)}
              >
                <ThemedText style={styles.exportBtnText}>🖨️ Export PDF / Send to Printer</ThemedText>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  </ResponsiveLayout>
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
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#6B7280',
    fontWeight: '700',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  newPatientBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  newPatientBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  modeTabTextActive: {
    color: '#0284C7',
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '600',
  },
  efficiencyStrip: {
    flexDirection: 'row',
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 12,
    alignItems: 'center',
  },
  efficiencyItem: {
    flex: 1,
    alignItems: 'center',
  },
  efficiencyDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#BAE6FD',
  },
  efficiencyVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
  },
  efficiencyLabel: {
    fontSize: 10,
    color: '#0284C7',
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
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
    fontWeight: '700',
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
    gap: 10,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueBadge: {
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  itemPatientName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  itemMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
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
  complaintBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  complaintText: {
    fontSize: 12,
    color: '#374151',
  },
  vitalsBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    padding: 8,
  },
  vitalsText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  vitalsPendingBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 8,
  },
  vitalsPendingText: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
  },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triageBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  triageBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  callBtn: {
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  callBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7E22CE',
  },
  examineBtn: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  examineBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  billBtn: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  billBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
  analyticsKpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
  },
  kpiSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  analyticsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  trendCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    gap: 4,
  },
  trendBarAmt: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0369A1',
  },
  trendBar: {
    width: 18,
    borderRadius: 4,
  },
  trendBarDate: {
    fontSize: 10,
    color: '#4B5563',
    fontWeight: '600',
  },
  trendBarCount: {
    fontSize: 9,
    color: '#9CA3AF',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  icdRank: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    width: 24,
  },
  icdCode: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  icdDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  icdCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  serviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 6,
  },
  serviceChipBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
  },
  serviceChipText: {
    fontSize: 12,
    color: '#374151',
  },
  serviceChipCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  docStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  reportTabsRow: {
    gap: 8,
  },
  reportTypePill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reportTypePillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  reportTypePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  reportTypePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  reportActionRibbon: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    alignItems: 'center',
  },
  printSheetBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  printSheetBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 12,
  },
  reportCardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
    gap: 2,
  },
  reportCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  reportCardDate: {
    fontSize: 11,
    color: '#6B7280',
  },
  censusBox: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
  },
  censusItem: {
    flex: 1,
    alignItems: 'center',
  },
  censusVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  censusLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'center',
  },
  cashDrawerBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 10,
    padding: 12,
  },
  financialTable: {
    gap: 6,
    marginTop: 4,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  finLabel: {
    fontSize: 13,
    color: '#4B5563',
  },
  finVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  thCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tdCell: {
    fontSize: 11,
    color: '#374151',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  modalSubTitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
  },
  priorityPill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  priorityPillText: {
    fontSize: 11,
    color: '#6B7280',
  },
  saveTriageBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  saveTriageBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  letterheadBox: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 8,
  },
  letterheadClinicName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 0.5,
  },
  letterheadMeta: {
    fontSize: 10,
    color: '#6B7280',
    textAlign: 'center',
  },
  letterheadRule: {
    width: '100%',
    height: 2,
    backgroundColor: '#111827',
    marginTop: 8,
    marginBottom: 6,
  },
  docTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  docSummaryBox: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
  },
  signaturesRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 20,
    paddingTop: 10,
  },
  signatureLine: {
    width: 140,
    height: 1,
    backgroundColor: '#111827',
    marginBottom: 4,
  },
  signatureName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  signatureTitle: {
    fontSize: 10,
    color: '#6B7280',
  },
  exportBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
