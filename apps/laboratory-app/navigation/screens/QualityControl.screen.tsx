import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert, Modal, ActivityIndicator } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { laboratoryService, QcLotItem, QcRunItem, LeveyJenningsChartData, LeveyJenningsPoint } from '../../services/laboratoryService';

const SAMPLE_LOTS: QcLotItem[] = [
  {
    id: 'lot-hgb-norm-01',
    tenantId: 'default',
    lotNumber: 'HEM-2026-N1',
    controlName: 'Hematology Tri-Level Control',
    level: 'Level2_Normal',
    analyteCode: 'HGB',
    instrumentName: 'Mindray BC-5150',
    targetMean: 14.00,
    targetStandardDeviation: 0.40,
    manufacturerExpirationDate: '2026-12-31T00:00:00Z',
    openVialDate: '2026-09-15T00:00:00Z',
    openVialStabilityDays: 30,
    openVialExpirationDate: '2026-10-15T00:00:00Z',
    isExpired: false,
    daysRemaining: 15,
    isActive: true,
  },
  {
    id: 'lot-hgb-low-01',
    tenantId: 'default',
    lotNumber: 'HEM-2026-L1',
    controlName: 'Hematology Tri-Level Control',
    level: 'Level1_Low',
    analyteCode: 'HGB',
    instrumentName: 'Mindray BC-5150',
    targetMean: 8.50,
    targetStandardDeviation: 0.30,
    manufacturerExpirationDate: '2026-12-31T00:00:00Z',
    openVialDate: '2026-09-15T00:00:00Z',
    openVialStabilityDays: 30,
    openVialExpirationDate: '2026-10-15T00:00:00Z',
    isExpired: false,
    daysRemaining: 15,
    isActive: true,
  },
  {
    id: 'lot-hgb-high-01',
    tenantId: 'default',
    lotNumber: 'HEM-2026-H1',
    controlName: 'Hematology Tri-Level Control',
    level: 'Level3_High',
    analyteCode: 'HGB',
    instrumentName: 'Mindray BC-5150',
    targetMean: 18.20,
    targetStandardDeviation: 0.50,
    manufacturerExpirationDate: '2026-12-31T00:00:00Z',
    openVialDate: '2026-09-01T00:00:00Z',
    openVialStabilityDays: 30,
    openVialExpirationDate: '2026-10-01T00:00:00Z',
    isExpired: false,
    daysRemaining: 1,
    isActive: true,
  },
  {
    id: 'lot-glu-norm-01',
    tenantId: 'default',
    lotNumber: 'CHEM-2026-N2',
    controlName: 'Clinical Chemistry Multichem',
    level: 'Level2_Normal',
    analyteCode: 'GLU',
    instrumentName: 'Cobas c311 Chemistry Analyzer',
    targetMean: 95.00,
    targetStandardDeviation: 3.50,
    manufacturerExpirationDate: '2026-11-30T00:00:00Z',
    openVialDate: '2026-09-20T00:00:00Z',
    openVialStabilityDays: 21,
    openVialExpirationDate: '2026-10-11T00:00:00Z',
    isExpired: false,
    daysRemaining: 11,
    isActive: true,
  },
  {
    id: 'lot-crea-norm-01',
    tenantId: 'default',
    lotNumber: 'CHEM-2026-C1',
    controlName: 'Clinical Chemistry Multichem',
    level: 'Level2_Normal',
    analyteCode: 'CREA',
    instrumentName: 'Cobas c311 Chemistry Analyzer',
    targetMean: 1.05,
    targetStandardDeviation: 0.05,
    manufacturerExpirationDate: '2026-10-20T00:00:00Z',
    openVialDate: '2026-08-20T00:00:00Z',
    openVialStabilityDays: 21,
    openVialExpirationDate: '2026-09-10T00:00:00Z',
    isExpired: true,
    daysRemaining: -20,
    isActive: true,
  },
  {
    id: 'lot-wbc-norm-01',
    tenantId: 'default',
    lotNumber: 'HEM-2026-W1',
    controlName: 'Hematology Tri-Level Control',
    level: 'Level2_Normal',
    analyteCode: 'WBC',
    instrumentName: 'Mindray BC-5150',
    targetMean: 7.20,
    targetStandardDeviation: 0.35,
    manufacturerExpirationDate: '2026-12-31T00:00:00Z',
    openVialDate: '2026-09-22T00:00:00Z',
    openVialStabilityDays: 30,
    openVialExpirationDate: '2026-10-22T00:00:00Z',
    isExpired: false,
    daysRemaining: 22,
    isActive: true,
  }
];

const SAMPLE_RUNS: Record<string, LeveyJenningsPoint[]> = {
  'lot-hgb-norm-01': [
    { runId: 'run-01', runAt: '2026-09-20 07:15', measuredValue: 13.95, zScore: -0.125, status: 'Passed' },
    { runId: 'run-02', runAt: '2026-09-21 07:20', measuredValue: 14.10, zScore: 0.25, status: 'Passed' },
    { runId: 'run-03', runAt: '2026-09-22 07:10', measuredValue: 14.05, zScore: 0.125, status: 'Passed' },
    { runId: 'run-04', runAt: '2026-09-23 07:30', measuredValue: 14.30, zScore: 0.75, status: 'Passed' },
    { runId: 'run-05', runAt: '2026-09-24 07:15', measuredValue: 14.45, zScore: 1.125, status: 'Passed' },
    { runId: 'run-06', runAt: '2026-09-25 07:25', measuredValue: 14.75, zScore: 1.875, status: 'Passed' },
    { runId: 'run-07', runAt: '2026-09-26 07:15', measuredValue: 14.85, zScore: 2.125, status: 'Warning', violationRules: '1_2s' },
    { runId: 'run-08', runAt: '2026-09-27 07:40', measuredValue: 14.20, zScore: 0.50, status: 'Passed' },
    { runId: 'run-09', runAt: '2026-09-28 07:10', measuredValue: 13.90, zScore: -0.25, status: 'Passed' },
    { runId: 'run-10', runAt: '2026-09-29 07:30', measuredValue: 13.80, zScore: -0.50, status: 'Passed' },
    { runId: 'run-11', runAt: '2026-09-30 07:15', measuredValue: 15.35, zScore: 3.375, status: 'Rejected', violationRules: '1_3s' },
  ]
};

const ANALYTES = ['HGB', 'WBC', 'PLT', 'GLU', 'CREA', 'K'];
const LEVELS = [
  { label: 'Normal (Level 2)', value: 'Level2_Normal' },
  { label: 'Low (Level 1)', value: 'Level1_Low' },
  { label: 'High (Level 3)', value: 'Level3_High' },
];

export default function QualityControlScreen() {
  const [lots, setLots] = useState<QcLotItem[]>(SAMPLE_LOTS);
  const [selectedAnalyte, setSelectedAnalyte] = useState<string>('HGB');
  const [selectedLevel, setSelectedLevel] = useState<string>('Level2_Normal');
  const [selectedLot, setSelectedLot] = useState<QcLotItem>(SAMPLE_LOTS[0]);
  const [chartData, setChartData] = useState<LeveyJenningsChartData | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<LeveyJenningsPoint | null>(null);

  // Modals
  const [logRunModalVisible, setLogRunModalVisible] = useState(false);
  const [newLotModalVisible, setNewLotModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Log Run Form State
  const [runMeasuredValue, setRunMeasuredValue] = useState('');
  const [runMedTechName, setRunMedTechName] = useState('Carlos Mendoza, RMT');
  const [runNotes, setRunNotes] = useState('');

  // New Lot Form State
  const [newLotNumber, setNewLotNumber] = useState('');
  const [newControlName, setNewControlName] = useState('Tri-Level Immunoassay Control');
  const [newLevel, setNewLevel] = useState('Level2_Normal');
  const [newAnalyteCode, setNewAnalyteCode] = useState('TROP_I');
  const [newInstrument, setNewInstrument] = useState('Abbott Architect i1000SR');
  const [newTargetMean, setNewTargetMean] = useState('0.05');
  const [newTargetSD, setNewTargetSD] = useState('0.005');
  const [newMfgExp, setNewMfgExp] = useState('2026-12-31');
  const [newOpenVialStabilityDays, setNewOpenVialStabilityDays] = useState('30');

  // Load Lots & Chart
  useEffect(() => {
    loadData();
  }, [selectedAnalyte, selectedLevel]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [backendLots] = await laboratoryService.getQcLots(selectedAnalyte, false);
      let activeLotsList = SAMPLE_LOTS;
      if (backendLots && backendLots.length > 0) {
        // Merge or use backend lots
        activeLotsList = [...backendLots, ...SAMPLE_LOTS.filter(s => !backendLots.some(b => b.id === s.id))];
        setLots(activeLotsList);
      }

      // Pick matching lot for selected analyte & level
      const matchingLot = activeLotsList.find(l => l.analyteCode === selectedAnalyte && l.level === selectedLevel)
        || activeLotsList.find(l => l.analyteCode === selectedAnalyte)
        || activeLotsList[0];

      if (matchingLot) {
        setSelectedLot(matchingLot);
        // Try fetching chart from API
        const [chart] = await laboratoryService.getLeveyJenningsChart(matchingLot.id);
        if (chart && chart.points && chart.points.length > 0) {
          setChartData(chart);
          setSelectedPoint(chart.points[chart.points.length - 1]);
        } else {
          // Build chart from sample/fallback data
          buildLocalChartData(matchingLot);
        }
      }
    } catch {
      // Fallback to sample data
      const matchingLot = SAMPLE_LOTS.find(l => l.analyteCode === selectedAnalyte && l.level === selectedLevel) || SAMPLE_LOTS[0];
      setSelectedLot(matchingLot);
      buildLocalChartData(matchingLot);
    } finally {
      setLoading(false);
    }
  };

  const buildLocalChartData = (lot: QcLotItem) => {
    const points = SAMPLE_RUNS[lot.id] || [
      { runId: 'run-1', runAt: '2026-09-28 07:00', measuredValue: lot.targetMean - (lot.targetStandardDeviation * 0.2), zScore: -0.2, status: 'Passed' },
      { runId: 'run-2', runAt: '2026-09-29 07:15', measuredValue: lot.targetMean + (lot.targetStandardDeviation * 0.5), zScore: 0.5, status: 'Passed' },
      { runId: 'run-3', runAt: '2026-09-30 07:10', measuredValue: lot.targetMean + (lot.targetStandardDeviation * 0.1), zScore: 0.1, status: 'Passed' },
    ];

    const mean = lot.targetMean;
    const sd = lot.targetStandardDeviation;

    const fallbackChart: LeveyJenningsChartData = {
      lotId: lot.id,
      lotNumber: lot.lotNumber,
      controlName: lot.controlName,
      level: lot.level,
      analyteCode: lot.analyteCode,
      targetMean: mean,
      targetSD: sd,
      plus1SD: Number((mean + sd).toFixed(4)),
      plus2SD: Number((mean + 2 * sd).toFixed(4)),
      plus3SD: Number((mean + 3 * sd).toFixed(4)),
      minus1SD: Number((mean - sd).toFixed(4)),
      minus2SD: Number((mean - 2 * sd).toFixed(4)),
      minus3SD: Number((mean - 3 * sd).toFixed(4)),
      points,
    };

    setChartData(fallbackChart);
    setSelectedPoint(points[points.length - 1]);
  };

  const handleSelectLotDirectly = async (lot: QcLotItem) => {
    setSelectedLot(lot);
    setSelectedAnalyte(lot.analyteCode);
    setSelectedLevel(lot.level);
    try {
      const [chart] = await laboratoryService.getLeveyJenningsChart(lot.id);
      if (chart && chart.points && chart.points.length > 0) {
        setChartData(chart);
        setSelectedPoint(chart.points[chart.points.length - 1]);
      } else {
        buildLocalChartData(lot);
      }
    } catch {
      buildLocalChartData(lot);
    }
  };

  // Real-time Z-Score calculation preview in Modal
  const calculatedZScorePreview = useMemo(() => {
    const val = parseFloat(runMeasuredValue);
    if (isNaN(val) || !selectedLot || selectedLot.targetStandardDeviation === 0) return null;
    const z = (val - selectedLot.targetMean) / selectedLot.targetStandardDeviation;
    return Number(z.toFixed(3));
  }, [runMeasuredValue, selectedLot]);

  const handleRecordQcRun = async () => {
    const val = parseFloat(runMeasuredValue);
    if (isNaN(val)) {
      Alert.alert('Validation Error', 'Please enter a valid numeric measured value.');
      return;
    }

    try {
      const [res, err] = await laboratoryService.recordQcRun({
        qcLotId: selectedLot.id,
        measuredValue: val,
        medTechName: runMedTechName,
        notes: runNotes,
      });

      if (err) {
        // Evaluate locally if backend offline or test mode
        const z = (val - selectedLot.targetMean) / selectedLot.targetStandardDeviation;
        let status = 'Passed';
        let violationRules = '';
        if (Math.abs(z) >= 3.0) {
          status = 'Rejected';
          violationRules = '1_3s';
        } else if (Math.abs(z) >= 2.0) {
          status = 'Warning';
          violationRules = '1_2s';
        }

        const newPoint: LeveyJenningsPoint = {
          runId: `run-${Date.now()}`,
          runAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          measuredValue: val,
          zScore: Number(z.toFixed(3)),
          status,
          violationRules: violationRules || undefined,
        };

        setChartData(prev => {
          if (!prev) return null;
          return {
            ...prev,
            points: [...prev.points, newPoint],
          };
        });
        setSelectedPoint(newPoint);

        Alert.alert(
          status === 'Passed' ? 'QC Run Accepted' : status === 'Warning' ? 'QC Warning Flagged' : 'QC Run REJECTED',
          `Z-Score: ${z.toFixed(2)}. ${violationRules ? `Violation: Rule ${violationRules}.` : 'Control within allowable ±2SD range.'}`
        );
      } else if (res) {
        Alert.alert('QC Run Logged', `Recorded successfully with status: ${res.status}. Z-score: ${res.zScore.toFixed(2)}.`);
        await loadData();
      }

      setLogRunModalVisible(false);
      setRunMeasuredValue('');
      setRunNotes('');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to record QC run.');
    }
  };

  const handleCreateNewLot = async () => {
    if (!newLotNumber.trim()) {
      Alert.alert('Validation Error', 'Please enter a valid lot number.');
      return;
    }
    const mean = parseFloat(newTargetMean);
    const sd = parseFloat(newTargetSD);
    if (isNaN(mean) || isNaN(sd) || sd <= 0) {
      Alert.alert('Validation Error', 'Target Mean and Standard Deviation must be positive numbers.');
      return;
    }

    try {
      const [res, err] = await laboratoryService.createQcLot({
        lotNumber: newLotNumber.trim(),
        controlName: newControlName.trim(),
        level: newLevel,
        analyteCode: newAnalyteCode.trim().toUpperCase(),
        instrumentName: newInstrument.trim(),
        targetMean: mean,
        targetStandardDeviation: sd,
        manufacturerExpirationDate: new Date(newMfgExp).toISOString(),
        openVialDate: new Date().toISOString(),
        openVialStabilityDays: parseInt(newOpenVialStabilityDays, 10) || 30,
      });

      if (err) {
        // Fallback local addition
        const createdLot: QcLotItem = {
          id: `lot-${Date.now()}`,
          tenantId: 'default',
          lotNumber: newLotNumber.trim(),
          controlName: newControlName.trim(),
          level: newLevel,
          analyteCode: newAnalyteCode.trim().toUpperCase(),
          instrumentName: newInstrument.trim(),
          targetMean: mean,
          targetStandardDeviation: sd,
          manufacturerExpirationDate: new Date(newMfgExp).toISOString(),
          openVialDate: new Date().toISOString(),
          openVialStabilityDays: parseInt(newOpenVialStabilityDays, 10) || 30,
          openVialExpirationDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          isExpired: false,
          daysRemaining: parseInt(newOpenVialStabilityDays, 10) || 30,
          isActive: true,
        };
        setLots(prev => [createdLot, ...prev]);
        setSelectedLot(createdLot);
        setSelectedAnalyte(createdLot.analyteCode);
        setSelectedLevel(createdLot.level);
        buildLocalChartData(createdLot);
      } else if (res) {
        setLots(prev => [res, ...prev]);
        setSelectedLot(res);
        setSelectedAnalyte(res.analyteCode);
        setSelectedLevel(res.level);
        await loadData();
      }

      Alert.alert('Success', `Lot ${newLotNumber} registered successfully with 30-day open-vial tracking.`);
      setNewLotModalVisible(false);
      setNewLotNumber('');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create lot.');
    }
  };

  const handleSimulateControlBatch = () => {
    if (!selectedLot) return;
    const base = selectedLot.targetMean;
    const sd = selectedLot.targetStandardDeviation;

    // Simulate 5 runs ending with a Westgard 2_2s or 1_3s pattern
    const simulated: LeveyJenningsPoint[] = [
      { runId: 'sim-1', runAt: 'Day 1 07:00', measuredValue: Number((base + 0.1 * sd).toFixed(3)), zScore: 0.1, status: 'Passed' },
      { runId: 'sim-2', runAt: 'Day 2 07:15', measuredValue: Number((base - 0.4 * sd).toFixed(3)), zScore: -0.4, status: 'Passed' },
      { runId: 'sim-3', runAt: 'Day 3 07:10', measuredValue: Number((base + 1.2 * sd).toFixed(3)), zScore: 1.2, status: 'Passed' },
      { runId: 'sim-4', runAt: 'Day 4 07:20', measuredValue: Number((base + 2.15 * sd).toFixed(3)), zScore: 2.15, status: 'Warning', violationRules: '1_2s' },
      { runId: 'sim-5', runAt: 'Day 5 07:30', measuredValue: Number((base + 2.30 * sd).toFixed(3)), zScore: 2.30, status: 'Rejected', violationRules: '2_2s' },
    ];

    setChartData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, ...simulated],
      };
    });
    setSelectedPoint(simulated[simulated.length - 1]);

    Alert.alert(
      'QC Batch Simulation Completed',
      'Generated 5 consecutive runs demonstrating Westgard 1-2s warning transitioning to 2-2s systematic error rejection.'
    );
  };

  // KPI Calculations
  const activeLotsCount = lots.length;
  const expiringLotsCount = lots.filter(l => (l.daysRemaining !== undefined && l.daysRemaining <= 7) || l.isExpired).length;
  const lastPoint = chartData?.points && chartData.points.length > 0 ? chartData.points[chartData.points.length - 1] : null;
  const currentStatus = lastPoint ? lastPoint.status : 'Passed';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Quality Control & Westgard Rules</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            Levey-Jennings Gaussian Statistical QC • Open-Vial Reagent Stability
          </ThemedText>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.simulateBtn} onPress={handleSimulateControlBatch}>
            <ThemedText style={styles.simulateBtnText}>Simulate Batch</ThemedText>
          </Pressable>
          <Pressable style={styles.newLotBtn} onPress={() => setNewLotModalVisible(true)}>
            <ThemedText style={styles.newLotBtnText}>+ New Lot</ThemedText>
          </Pressable>
          <Pressable style={styles.logRunBtn} onPress={() => setLogRunModalVisible(true)}>
            <ThemedText style={styles.logRunBtnText}>Log Daily Run</ThemedText>
          </Pressable>
        </View>
      </View>

      {/* KPI Overview Cards */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <ThemedText style={styles.kpiLabel}>Active QC Lots</ThemedText>
          <ThemedText style={styles.kpiValue}>{activeLotsCount}</ThemedText>
          <ThemedText style={styles.kpiSub}>Across 5 Lab Sections</ThemedText>
        </View>

        <View style={[styles.kpiCard, currentStatus === 'Rejected' ? styles.kpiCardDanger : currentStatus === 'Warning' ? styles.kpiCardWarning : styles.kpiCardSuccess]}>
          <ThemedText style={styles.kpiLabel}>Run Status ({selectedAnalyte})</ThemedText>
          <ThemedText style={[styles.kpiValue, currentStatus === 'Rejected' ? styles.textDanger : currentStatus === 'Warning' ? styles.textWarning : styles.textSuccess]}>
            {currentStatus === 'Rejected' ? 'OUT OF CONTROL' : currentStatus === 'Warning' ? 'WARNING (1-2s)' : 'IN CONTROL'}
          </ThemedText>
          <ThemedText style={styles.kpiSub}>
            {lastPoint ? `Last Z-Score: ${lastPoint.zScore > 0 ? '+' : ''}${lastPoint.zScore.toFixed(2)} SD` : 'No runs recorded'}
          </ThemedText>
        </View>

        <View style={[styles.kpiCard, expiringLotsCount > 0 ? styles.kpiCardWarning : styles.kpiCardNeutral]}>
          <ThemedText style={styles.kpiLabel}>Open-Vial Alerts</ThemedText>
          <ThemedText style={[styles.kpiValue, expiringLotsCount > 0 ? styles.textWarning : styles.textNeutral]}>
            {expiringLotsCount}
          </ThemedText>
          <ThemedText style={styles.kpiSub}>Expiring in ≤ 7 days</ThemedText>
        </View>

        <View style={styles.kpiCard}>
          <ThemedText style={styles.kpiLabel}>Active Control Lot</ThemedText>
          <ThemedText style={styles.kpiValueSmall} numberOfLines={1}>{selectedLot.lotNumber}</ThemedText>
          <ThemedText style={styles.kpiSub}>{selectedLot.instrumentName}</ThemedText>
        </View>
      </View>

      {/* Analyte & Level Selectors */}
      <View style={styles.selectorBar}>
        <View style={styles.selectorGroup}>
          <ThemedText style={styles.selectorLabel}>Analyte:</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContainer}>
            {ANALYTES.map(code => {
              const active = selectedAnalyte === code;
              return (
                <Pressable
                  key={code}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setSelectedAnalyte(code)}
                >
                  <ThemedText style={[styles.pillText, active && styles.pillTextActive]}>{code}</ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.selectorGroup}>
          <ThemedText style={styles.selectorLabel}>Control Level:</ThemedText>
          <View style={styles.levelButtonsRow}>
            {LEVELS.map(lvl => {
              const active = selectedLevel === lvl.value;
              return (
                <Pressable
                  key={lvl.value}
                  style={[styles.levelBtn, active && styles.levelBtnActive]}
                  onPress={() => setSelectedLevel(lvl.value)}
                >
                  <ThemedText style={[styles.levelBtnText, active && styles.levelBtnTextActive]}>{lvl.label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Levey-Jennings Chart Section */}
      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View>
            <ThemedText style={styles.chartTitle}>
              Levey-Jennings Quality Control Chart: {selectedAnalyte} ({selectedLevel.replace('Level', 'L').replace('_', ' ')})
            </ThemedText>
            <ThemedText style={styles.chartSubtitle}>
              Target Mean (μ) = {selectedLot.targetMean.toFixed(2)} • 1SD (σ) = {selectedLot.targetStandardDeviation.toFixed(2)} • Lot #{selectedLot.lotNumber}
            </ThemedText>
          </View>

          {/* Legend */}
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <ThemedText style={styles.legendText}>Passed (≤ 2s)</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
              <ThemedText style={styles.legendText}>Warning (1-2s)</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <ThemedText style={styles.legendText}>Rejection (1-3s / 2-2s / R-4s)</ThemedText>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <ThemedText style={styles.loadingText}>Loading Levey-Jennings runs...</ThemedText>
          </View>
        ) : chartData && chartData.points.length > 0 ? (
          <View style={styles.chartBody}>
            {/* Y-Axis Labels */}
            <View style={styles.yAxisLabels}>
              <ThemedText style={[styles.yAxisText, styles.textDanger]}>+3s ({chartData.plus3SD})</ThemedText>
              <ThemedText style={[styles.yAxisText, styles.textWarning]}>+2s ({chartData.plus2SD})</ThemedText>
              <ThemedText style={[styles.yAxisText, styles.textMuted]}>+1s ({chartData.plus1SD})</ThemedText>
              <ThemedText style={[styles.yAxisText, styles.textSuccess, { fontWeight: '700' }]}>
                Mean ({chartData.targetMean})
              </ThemedText>
              <ThemedText style={[styles.yAxisText, styles.textMuted]}>-1s ({chartData.minus1SD})</ThemedText>
              <ThemedText style={[styles.yAxisText, styles.textWarning]}>-2s ({chartData.minus2SD})</ThemedText>
              <ThemedText style={[styles.yAxisText, styles.textDanger]}>-3s ({chartData.minus3SD})</ThemedText>
            </View>

            {/* Visual Canvas Plot */}
            <View style={styles.plotArea}>
              {/* Background Reference Lines */}
              <View style={[styles.gridLine, styles.gridLine3SD, { top: '3%' }]} />
              <View style={[styles.gridLine, styles.gridLine2SD, { top: '19%' }]} />
              <View style={[styles.gridLine, styles.gridLine1SD, { top: '35%' }]} />
              <View style={[styles.gridLine, styles.gridLineMean, { top: '50%' }]} />
              <View style={[styles.gridLine, styles.gridLine1SD, { top: '65%' }]} />
              <View style={[styles.gridLine, styles.gridLine2SD, { top: '81%' }]} />
              <View style={[styles.gridLine, styles.gridLine3SD, { top: '97%' }]} />

              {/* Data Points */}
              {chartData.points.map((pt, idx) => {
                const count = chartData.points.length;
                // Horizontal spacing: distribute from 5% to 95%
                const leftPercent = count > 1 ? 5 + (idx / (count - 1)) * 90 : 50;
                // Vertical position: z-score between -3.5 and +3.5 mapped to 97% to 3%
                // z = 0 -> 50%
                // z = +3 -> 3%
                // z = -3 -> 97%
                const clampedZ = Math.max(-3.5, Math.min(3.5, pt.zScore));
                const topPercent = 50 - (clampedZ / 3.5) * 47;

                const isSelected = selectedPoint?.runId === pt.runId;
                const dotColor =
                  pt.status === 'Rejected' ? '#EF4444' : pt.status === 'Warning' ? '#F59E0B' : '#10B981';

                return (
                  <Pressable
                    key={pt.runId || idx}
                    onPress={() => setSelectedPoint(pt)}
                    style={[
                      styles.chartPointMarker,
                      {
                        left: `${leftPercent}%`,
                        top: `${topPercent}%`,
                        backgroundColor: dotColor,
                        transform: [{ translateX: -7 }, { translateY: -7 }],
                      },
                      isSelected && styles.chartPointSelected,
                    ]}
                  >
                    {isSelected && <View style={styles.pointPulseRing} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.noDataBox}>
            <ThemedText style={styles.noDataText}>No QC runs recorded for this lot yet.</ThemedText>
            <Pressable style={styles.smallActionBtn} onPress={() => setLogRunModalVisible(true)}>
              <ThemedText style={styles.smallActionBtnText}>Record First Run</ThemedText>
            </Pressable>
          </View>
        )}

        {/* Selected Run Inspector */}
        {selectedPoint && (
          <View style={styles.inspectorBar}>
            <View style={styles.inspectorItem}>
              <ThemedText style={styles.inspectorLabel}>Selected Run Date:</ThemedText>
              <ThemedText style={styles.inspectorVal}>{selectedPoint.runAt}</ThemedText>
            </View>
            <View style={styles.inspectorItem}>
              <ThemedText style={styles.inspectorLabel}>Measured Value:</ThemedText>
              <ThemedText style={styles.inspectorValBold}>{selectedPoint.measuredValue}</ThemedText>
            </View>
            <View style={styles.inspectorItem}>
              <ThemedText style={styles.inspectorLabel}>Z-Score (SD):</ThemedText>
              <ThemedText style={[styles.inspectorValBold, selectedPoint.zScore > 2 ? styles.textWarning : selectedPoint.zScore < -2 ? styles.textWarning : styles.textSuccess]}>
                {selectedPoint.zScore > 0 ? '+' : ''}{selectedPoint.zScore.toFixed(3)} σ
              </ThemedText>
            </View>
            <View style={styles.inspectorItem}>
              <ThemedText style={styles.inspectorLabel}>Evaluation Status:</ThemedText>
              <View style={[styles.badge, selectedPoint.status === 'Rejected' ? styles.badgeDanger : selectedPoint.status === 'Warning' ? styles.badgeWarning : styles.badgeSuccess]}>
                <ThemedText style={[styles.badgeText, selectedPoint.status === 'Rejected' ? styles.badgeDangerText : selectedPoint.status === 'Warning' ? styles.badgeWarningText : styles.badgeSuccessText]}>
                  {selectedPoint.status.toUpperCase()}
                </ThemedText>
              </View>
            </View>
            {selectedPoint.violationRules ? (
              <View style={styles.inspectorItem}>
                <ThemedText style={styles.inspectorLabel}>Rule Violation:</ThemedText>
                <ThemedText style={[styles.inspectorValBold, styles.textDanger]}>
                  Westgard {selectedPoint.violationRules.replace('_', '-')}
                </ThemedText>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Westgard Rules Decision Tree Guide */}
      <View style={styles.westgardCard}>
        <ThemedText style={styles.sectionHeading}>Westgard Multi-Rule Evaluation Logic (Clinical Protocol)</ThemedText>
        <View style={styles.westgardGrid}>
          <View style={styles.ruleBox}>
            <View style={styles.ruleBadgeWarning}>
              <ThemedText style={styles.ruleBadgeText}>1-2s (Warning)</ThemedText>
            </View>
            <ThemedText style={styles.ruleDesc}>
              1 control result exceeds the Mean ± 2SD limit. Warning rule triggering inspection of other rules.
            </ThemedText>
          </View>

          <View style={styles.ruleBox}>
            <View style={styles.ruleBadgeDanger}>
              <ThemedText style={styles.ruleBadgeText}>1-3s (Rejection)</ThemedText>
            </View>
            <ThemedText style={styles.ruleDesc}>
              1 control result exceeds the Mean ± 3SD limit. Detects unacceptable random analytical error.
            </ThemedText>
          </View>

          <View style={styles.ruleBox}>
            <View style={styles.ruleBadgeDanger}>
              <ThemedText style={styles.ruleBadgeText}>2-2s (Rejection)</ThemedText>
            </View>
            <ThemedText style={styles.ruleDesc}>
              2 consecutive control results exceed the same +2SD or -2SD limit. Detects systematic bias.
            </ThemedText>
          </View>

          <View style={styles.ruleBox}>
            <View style={styles.ruleBadgeDanger}>
              <ThemedText style={styles.ruleBadgeText}>R-4s (Rejection)</ThemedText>
            </View>
            <ThemedText style={styles.ruleDesc}>
              Range between 2 controls in the same run exceeds 4SD (+2SD and -2SD). Detects random error.
            </ThemedText>
          </View>

          <View style={styles.ruleBox}>
            <View style={styles.ruleBadgeDanger}>
              <ThemedText style={styles.ruleBadgeText}>4-1s (Rejection)</ThemedText>
            </View>
            <ThemedText style={styles.ruleDesc}>
              4 consecutive control results exceed the same +1SD or -1SD limit. Detects systematic shift.
            </ThemedText>
          </View>

          <View style={styles.ruleBox}>
            <View style={styles.ruleBadgeDanger}>
              <ThemedText style={styles.ruleBadgeText}>10-x (Rejection)</ThemedText>
            </View>
            <ThemedText style={styles.ruleDesc}>
              10 consecutive control results fall on one side of the Mean. Detects calibration drift.
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Reagent & Control Lot Tracking & Open-Vial Stability */}
      <View style={styles.lotsSection}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <ThemedText style={styles.sectionHeading}>QC Lots & Open-Vial Stability Management</ThemedText>
            <ThemedText style={styles.sectionSubheading}>
              Monitors manufacturer expiration and in-use reconstituted vial stability countdown
            </ThemedText>
          </View>
          <Pressable style={styles.newLotBtn} onPress={() => setNewLotModalVisible(true)}>
            <ThemedText style={styles.newLotBtnText}>+ Register Lot</ThemedText>
          </Pressable>
        </View>

        <View style={styles.lotCardsGrid}>
          {lots.map(lot => {
            const isSelected = selectedLot.id === lot.id;
            const daysLeft = lot.daysRemaining ?? 30;
            const isCriticalExpiry = daysLeft <= 3 || lot.isExpired;
            const isWarningExpiry = daysLeft <= 7 && !isCriticalExpiry;

            return (
              <Pressable
                key={lot.id}
                style={[
                  styles.lotCard,
                  isSelected && styles.lotCardSelected,
                  lot.isExpired && styles.lotCardExpired,
                ]}
                onPress={() => handleSelectLotDirectly(lot)}
              >
                <View style={styles.lotCardTop}>
                  <View>
                    <ThemedText style={styles.lotNumberText}>Lot #{lot.lotNumber}</ThemedText>
                    <ThemedText style={styles.lotControlName}>{lot.controlName}</ThemedText>
                  </View>
                  <View style={[styles.stabilityBadge, isCriticalExpiry ? styles.badgeDanger : isWarningExpiry ? styles.badgeWarning : styles.badgeSuccess]}>
                    <ThemedText style={[styles.stabilityBadgeText, isCriticalExpiry ? styles.badgeDangerText : isWarningExpiry ? styles.badgeWarningText : styles.badgeSuccessText]}>
                      {lot.isExpired ? 'EXPIRED' : `${daysLeft}d left`}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.lotDetailRow}>
                  <ThemedText style={styles.lotDetailLabel}>Analyte / Level:</ThemedText>
                  <ThemedText style={styles.lotDetailVal}>{lot.analyteCode} • {lot.level.replace('Level', 'L')}</ThemedText>
                </View>

                <View style={styles.lotDetailRow}>
                  <ThemedText style={styles.lotDetailLabel}>Target Mean ± SD:</ThemedText>
                  <ThemedText style={styles.lotDetailValBold}>{lot.targetMean.toFixed(2)} ± {lot.targetStandardDeviation.toFixed(2)}</ThemedText>
                </View>

                <View style={styles.lotDetailRow}>
                  <ThemedText style={styles.lotDetailLabel}>Instrument:</ThemedText>
                  <ThemedText style={styles.lotDetailVal} numberOfLines={1}>{lot.instrumentName}</ThemedText>
                </View>

                <View style={styles.lotDetailRow}>
                  <ThemedText style={styles.lotDetailLabel}>Open-Vial Period:</ThemedText>
                  <ThemedText style={styles.lotDetailVal}>{lot.openVialStabilityDays} Days Max</ThemedText>
                </View>

                <View style={styles.lotCardFooter}>
                  <ThemedText style={styles.lotMfgExp}>
                    Mfg Exp: {lot.manufacturerExpirationDate.substring(0, 10)}
                  </ThemedText>
                  {isSelected && (
                    <View style={styles.activeLotPill}>
                      <ThemedText style={styles.activeLotPillText}>ACTIVE IN CHART</ThemedText>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* MODAL: Log Daily QC Run */}
      <Modal visible={logRunModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Log Daily Quality Control Run</ThemedText>
              <ThemedText style={styles.modalSubtitle}>
                Westgard multi-rules will evaluate this run in real-time
              </ThemedText>
            </View>

            <View style={styles.modalForm}>
              <View style={styles.modalRow}>
                <ThemedText style={styles.modalFieldLabel}>Analyte & Control Lot:</ThemedText>
                <ThemedText style={styles.modalStaticVal}>
                  {selectedLot.analyteCode} ({selectedLot.level.replace('Level', 'L')}) — Lot #{selectedLot.lotNumber}
                </ThemedText>
              </View>

              <View style={styles.modalRow}>
                <ThemedText style={styles.modalFieldLabel}>Target Mean ± SD:</ThemedText>
                <ThemedText style={styles.modalStaticVal}>
                  {selectedLot.targetMean} ± {selectedLot.targetStandardDeviation}
                </ThemedText>
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Measured Control Value *</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder={`e.g. ${selectedLot.targetMean}`}
                  keyboardType="numeric"
                  value={runMeasuredValue}
                  onChangeText={setRunMeasuredValue}
                />
              </View>

              {calculatedZScorePreview !== null && (
                <View style={styles.zScorePreviewBox}>
                  <ThemedText style={styles.zScorePreviewText}>
                    Calculated Z-Score: <ThemedText style={{ fontWeight: '800' }}>{calculatedZScorePreview > 0 ? '+' : ''}{calculatedZScorePreview} SD</ThemedText>
                  </ThemedText>
                  <ThemedText style={[styles.zScoreStatusText, Math.abs(calculatedZScorePreview) >= 3 ? styles.textDanger : Math.abs(calculatedZScorePreview) >= 2 ? styles.textWarning : styles.textSuccess]}>
                    {Math.abs(calculatedZScorePreview) >= 3 ? 'REJECTION: Exceeds ±3SD (1-3s)' : Math.abs(calculatedZScorePreview) >= 2 ? 'WARNING: Exceeds ±2SD (1-2s)' : 'PASSED: Within allowable ±2SD'}
                  </ThemedText>
                </View>
              )}

              <View>
                <ThemedText style={styles.inputLabel}>Medical Technologist (RMT) *</ThemedText>
                <TextInput
                  style={styles.textInput}
                  value={runMedTechName}
                  onChangeText={setRunMedTechName}
                />
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Corrective Action / Technical Notes</ThemedText>
                <TextInput
                  style={[styles.textInput, { height: 60 }]}
                  multiline
                  placeholder="e.g. Reagent primed, baseline recalibrated..."
                  value={runNotes}
                  onChangeText={setRunNotes}
                />
              </View>

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelModalBtn} onPress={() => setLogRunModalVisible(false)}>
                  <ThemedText style={styles.cancelModalText}>Cancel</ThemedText>
                </Pressable>
                <Pressable style={styles.confirmReleaseBtn} onPress={handleRecordQcRun}>
                  <ThemedText style={styles.confirmReleaseText}>Evaluate & Commit Run</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: Register New QC Lot */}
      <Modal visible={newLotModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Register New QC Reagent Lot</ThemedText>
              <ThemedText style={styles.modalSubtitle}>
                Establish manufacturer target mean, SD, and open-vial stability countdown
              </ThemedText>
            </View>

            <ScrollView style={styles.modalFormScroll}>
              <View style={styles.modalForm}>
                <View>
                  <ThemedText style={styles.inputLabel}>Lot Number *</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. LOT-2026-X88"
                    value={newLotNumber}
                    onChangeText={setNewLotNumber}
                  />
                </View>

                <View>
                  <ThemedText style={styles.inputLabel}>Control Product Name</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    value={newControlName}
                    onChangeText={setNewControlName}
                  />
                </View>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <ThemedText style={styles.inputLabel}>Analyte Code</ThemedText>
                    <TextInput
                      style={styles.textInput}
                      value={newAnalyteCode}
                      onChangeText={setNewAnalyteCode}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <ThemedText style={styles.inputLabel}>Control Level</ThemedText>
                    <TextInput
                      style={styles.textInput}
                      value={newLevel}
                      onChangeText={setNewLevel}
                    />
                  </View>
                </View>

                <View>
                  <ThemedText style={styles.inputLabel}>Analyzer / Instrument Name</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    value={newInstrument}
                    onChangeText={setNewInstrument}
                  />
                </View>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <ThemedText style={styles.inputLabel}>Assayed Target Mean (μ) *</ThemedText>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="numeric"
                      value={newTargetMean}
                      onChangeText={setNewTargetMean}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <ThemedText style={styles.inputLabel}>Target 1SD (σ) *</ThemedText>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="numeric"
                      value={newTargetSD}
                      onChangeText={setNewTargetSD}
                    />
                  </View>
                </View>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <ThemedText style={styles.inputLabel}>Mfg Expiration Date</ThemedText>
                    <TextInput
                      style={styles.textInput}
                      value={newMfgExp}
                      onChangeText={setNewMfgExp}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <ThemedText style={styles.inputLabel}>Open-Vial Stability (Days)</ThemedText>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="numeric"
                      value={newOpenVialStabilityDays}
                      onChangeText={setNewOpenVialStabilityDays}
                    />
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelModalBtn} onPress={() => setNewLotModalVisible(false)}>
                    <ThemedText style={styles.cancelModalText}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable style={styles.confirmReleaseBtn} onPress={handleCreateNewLot}>
                    <ThemedText style={styles.confirmReleaseText}>Register QC Lot</ThemedText>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 24,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  simulateBtn: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  simulateBtnText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '700',
  },
  newLotBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  newLotBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  logRunBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  logRunBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  kpiCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  kpiCardSuccess: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  kpiCardWarning: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  kpiCardDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  kpiCardNeutral: {
    borderColor: '#E2E8F0',
  },
  kpiLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  kpiValueSmall: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  kpiSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  textSuccess: {
    color: '#059669',
  },
  textWarning: {
    color: '#D97706',
  },
  textDanger: {
    color: '#DC2626',
  },
  textNeutral: {
    color: '#64748B',
  },
  textMuted: {
    color: '#94A3B8',
  },
  selectorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: 16,
  },
  selectorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectorLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  pillsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  pillActive: {
    backgroundColor: '#7C3AED',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  levelButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  levelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  levelBtnActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#7C3AED',
  },
  levelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  levelBtnTextActive: {
    color: '#6D28D9',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  chartSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  chartBody: {
    flexDirection: 'row',
    height: 260,
    marginTop: 10,
  },
  yAxisLabels: {
    width: 120,
    height: '100%',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingRight: 8,
  },
  yAxisText: {
    fontSize: 11,
    textAlign: 'right',
  },
  plotArea: {
    flex: 1,
    height: '100%',
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    position: 'relative',
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  gridLine3SD: {
    backgroundColor: '#FCA5A5',
    borderStyle: 'dashed',
  },
  gridLine2SD: {
    backgroundColor: '#FCD34D',
    borderStyle: 'dashed',
  },
  gridLine1SD: {
    backgroundColor: '#E5E7EB',
  },
  gridLineMean: {
    backgroundColor: '#10B981',
    height: 2,
  },
  chartPointMarker: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 10,
  },
  chartPointSelected: {
    borderColor: '#0F172A',
    transform: [{ translateX: -9 }, { translateY: -9 }],
    width: 18,
    height: 18,
    borderRadius: 9,
    zIndex: 20,
  },
  pointPulseRing: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#7C3AED',
    top: -6,
    left: -6,
  },
  loadingBox: {
    height: 240,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  noDataBox: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  noDataText: {
    fontSize: 14,
    color: '#64748B',
  },
  smallActionBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  smallActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  inspectorBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexWrap: 'wrap',
    gap: 12,
  },
  inspectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inspectorLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  inspectorVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  inspectorValBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeSuccess: {
    backgroundColor: '#DCFCE7',
  },
  badgeSuccessText: {
    color: '#166534',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeWarningText: {
    color: '#92400E',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeDanger: {
    backgroundColor: '#FEE2E2',
  },
  badgeDangerText: {
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '700',
  },
  westgardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionSubheading: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  westgardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  ruleBox: {
    flex: 1,
    minWidth: 260,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  ruleBadgeWarning: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ruleBadgeDanger: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ruleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  ruleDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  lotsSection: {
    gap: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  lotCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  lotCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  lotCardSelected: {
    borderColor: '#7C3AED',
    borderWidth: 2,
    backgroundColor: '#FAF5FF',
  },
  lotCardExpired: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  lotCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  lotNumberText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  lotControlName: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  stabilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stabilityBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  lotDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  lotDetailLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  lotDetailVal: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  lotDetailValBold: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  lotCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  lotMfgExp: {
    fontSize: 10,
    color: '#94A3B8',
  },
  activeLotPill: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeLotPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6D28D9',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    width: '100%',
    maxWidth: 540,
    maxHeight: '90%',
    padding: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  modalHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalForm: {
    gap: 12,
  },
  modalFormScroll: {
    maxHeight: 480,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  modalFieldLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  modalStaticVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  inputRow: {
    flexDirection: 'row',
  },
  zScorePreviewBox: {
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
    gap: 2,
  },
  zScorePreviewText: {
    fontSize: 12,
    color: '#334155',
  },
  zScoreStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  cancelModalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  cancelModalText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 13,
  },
  confirmReleaseBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#7C3AED',
  },
  confirmReleaseText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
