import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert, Modal, ActivityIndicator } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { laboratoryService, QcLotItem, QcRunItem, ControlLevel, LeveyJenningsChartData, LeveyJenningsPoint } from '../../services/laboratoryService';

const ANALYTES = ['HGB', 'WBC', 'PLT', 'GLU', 'CREA', 'K'];
const LEVELS: { label: string; value: ControlLevel }[] = [
  { label: 'Normal (Level 2)', value: 'Level2_Normal' },
  { label: 'Low (Level 1)', value: 'Level1_Low' },
  { label: 'High (Level 3)', value: 'Level3_High' },
];

export default function QualityControlScreen() {
  const [lots, setLots] = useState<QcLotItem[]>([]);
  const [selectedAnalyte, setSelectedAnalyte] = useState<string>('HGB');
  const [selectedLevel, setSelectedLevel] = useState<ControlLevel>('Level2_Normal');
  const [selectedLot, setSelectedLot] = useState<QcLotItem | null>(null);
  const [chartData, setChartData] = useState<LeveyJenningsChartData | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<LeveyJenningsPoint | null>(null);

  // Modals
  const [logRunModalVisible, setLogRunModalVisible] = useState(false);
  const [newLotModalVisible, setNewLotModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Log Run Form State
  const [runMeasuredValue, setRunMeasuredValue] = useState('');
  const [runMedTechName, setRunMedTechName] = useState('');
  const [runNotes, setRunNotes] = useState('');

  // New Lot Form State
  const [newLotNumber, setNewLotNumber] = useState('');
  const [newControlName, setNewControlName] = useState('');
  const [newLevel, setNewLevel] = useState<ControlLevel>('Level2_Normal');
  const [newAnalyteCode, setNewAnalyteCode] = useState('');
  const [newInstrument, setNewInstrument] = useState('');
  const [newTargetMean, setNewTargetMean] = useState('');
  const [newTargetSD, setNewTargetSD] = useState('');
  const [newMfgExp, setNewMfgExp] = useState('');
  const [newOpenVialStabilityDays, setNewOpenVialStabilityDays] = useState('');

  // Load Lots & Chart
  useEffect(() => {
    loadData();
  }, [selectedAnalyte, selectedLevel]);

  const buildEmptyChart = (lot: QcLotItem): LeveyJenningsChartData => {
    const mean = lot.targetMean;
    const sd = lot.targetStandardDeviation;
    return {
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
      points: [],
    };
  };

  const loadChart = async (lot: QcLotItem) => {
    const [chart] = await laboratoryService.getLeveyJenningsChart(lot.id);
    if (chart) {
      setChartData(chart);
      setSelectedPoint(chart.points.length > 0 ? chart.points[chart.points.length - 1] : null);
    } else {
      setChartData(buildEmptyChart(lot));
      setSelectedPoint(null);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [backendLots] = await laboratoryService.getQcLots(undefined, false);
      const allLots = backendLots ?? [];
      setLots(allLots);

      // Pick matching lot for selected analyte & level
      const matchingLot = allLots.find(l => l.analyteCode === selectedAnalyte && l.level === selectedLevel)
        ?? allLots.find(l => l.analyteCode === selectedAnalyte)
        ?? null;
      setSelectedLot(matchingLot);
      if (matchingLot) {
        await loadChart(matchingLot);
      } else {
        setChartData(null);
        setSelectedPoint(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLotDirectly = async (lot: QcLotItem) => {
    setSelectedLot(lot);
    setSelectedAnalyte(lot.analyteCode);
    setSelectedLevel(lot.level);
    await loadChart(lot);
  };
  // Real-time Z-Score calculation preview in Modal
  const calculatedZScorePreview = useMemo(() => {
    const val = parseFloat(runMeasuredValue);
    if (isNaN(val) || !selectedLot || selectedLot.targetStandardDeviation === 0) return null;
    const z = (val - selectedLot.targetMean) / selectedLot.targetStandardDeviation;
    return Number(z.toFixed(3));
  }, [runMeasuredValue, selectedLot]);

  const handleRecordQcRun = async () => {
    if (!selectedLot) {
      Alert.alert('No QC Lot', 'Register a QC lot for this analyte and level before logging a run.');
      return;
    }
    const val = parseFloat(runMeasuredValue);
    if (isNaN(val)) {
      Alert.alert('Validation Error', 'Please enter a valid numeric measured value.');
      return;
    }
    if (!runMedTechName.trim()) {
      Alert.alert('Validation Error', 'Enter the name of the medical technologist performing the run.');
      return;
    }

    try {
      const [res, err] = await laboratoryService.recordQcRun({
        qcLotId: selectedLot.id,
        measuredValue: val,
        medTechName: runMedTechName.trim(),
        notes: runNotes,
      });

      if (err || !res) {
        Alert.alert('QC Run Not Recorded', err?.message ?? 'The QC run could not be recorded. Try again.');
        return;
      }

      Alert.alert('QC Run Logged', `Recorded successfully with status: ${res.status}. Z-score: ${res.zScore.toFixed(2)}.`);
      setLogRunModalVisible(false);
      setRunMeasuredValue('');
      setRunNotes('');
      await loadData();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to record QC run.');
    }
  };

  const handleCreateNewLot = async () => {
    const mean = parseFloat(newTargetMean);
    const sd = parseFloat(newTargetSD);
    const stabilityDays = parseInt(newOpenVialStabilityDays, 10);
    const mfgExpiry = new Date(newMfgExp);
    if (!newLotNumber.trim() || !newControlName.trim() || !newAnalyteCode.trim() || !newInstrument.trim()) {
      Alert.alert('Validation Error', 'Lot number, control product, analyte code and instrument are required.');
      return;
    }
    if (isNaN(mean) || isNaN(sd) || sd <= 0) {
      Alert.alert('Validation Error', 'Target Mean and Standard Deviation must be positive numbers.');
      return;
    }
    if (isNaN(mfgExpiry.getTime()) || isNaN(stabilityDays) || stabilityDays <= 0) {
      Alert.alert('Validation Error', 'Enter a valid manufacturer expiration date (YYYY-MM-DD) and open-vial stability in days.');
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
        manufacturerExpirationDate: mfgExpiry.toISOString(),
        openVialDate: new Date().toISOString(),
        openVialStabilityDays: stabilityDays,
      });

      if (err || !res) {
        Alert.alert('Lot Not Registered', err?.message ?? 'The QC lot could not be registered. Try again.');
        return;
      }

      setLots(prev => [res, ...prev]);
      setSelectedLot(res);
      setSelectedAnalyte(res.analyteCode);
      setSelectedLevel(res.level);
      await loadData();

      Alert.alert('Success', `Lot ${newLotNumber.trim()} registered successfully.`);
      setNewLotModalVisible(false);
      setNewLotNumber('');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create lot.');
    }
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
          <ThemedText style={styles.kpiSub}>Registered control lots</ThemedText>
        </View>

        <View style={[styles.kpiCard, currentStatus === 'Rejected' ? styles.kpiCardDanger : currentStatus === 'Warning' ? styles.kpiCardWarning : styles.kpiCardSuccess]}>
          <ThemedText style={styles.kpiLabel}>Run Status ({selectedAnalyte})</ThemedText>
          <ThemedText style={[styles.kpiValue, currentStatus === 'Rejected' ? styles.textDanger : currentStatus === 'Warning' ? styles.textWarning : styles.textSuccess]}>
            {!lastPoint ? 'NO RUNS' : currentStatus === 'Rejected' ? 'OUT OF CONTROL' : currentStatus === 'Warning' ? 'WARNING (1-2s)' : 'IN CONTROL'}
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
          <ThemedText style={styles.kpiValueSmall} numberOfLines={1}>{selectedLot?.lotNumber ?? 'No lot'}</ThemedText>
          <ThemedText style={styles.kpiSub}>{selectedLot?.instrumentName ?? 'Register a lot for this analyte'}</ThemedText>
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
              {selectedLot
                ? `Target Mean (μ) = ${selectedLot.targetMean.toFixed(2)} • 1SD (σ) = ${selectedLot.targetStandardDeviation.toFixed(2)} • Lot #${selectedLot.lotNumber}`
                : 'No QC lot registered for this analyte and level.'}
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
          {!loading && lots.length === 0 && (
            <ThemedText style={styles.noDataText}>No QC lots registered yet. Use Register Lot to add one.</ThemedText>
          )}
          {lots.map(lot => {
            const isSelected = selectedLot?.id === lot.id;
            const daysLeft = lot.daysRemaining;
            const isCriticalExpiry = (daysLeft !== undefined && daysLeft <= 3) || lot.isExpired;
            const isWarningExpiry = daysLeft !== undefined && daysLeft <= 7 && !isCriticalExpiry;

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
                      {lot.isExpired ? 'EXPIRED' : daysLeft !== undefined ? `${daysLeft}d left` : 'Active'}
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
                  {selectedLot?.analyteCode} ({selectedLot?.level.replace('Level', 'L')}) — Lot #{selectedLot?.lotNumber}
                </ThemedText>
              </View>

              <View style={styles.modalRow}>
                <ThemedText style={styles.modalFieldLabel}>Target Mean ± SD:</ThemedText>
                <ThemedText style={styles.modalStaticVal}>
                  {selectedLot?.targetMean} ± {selectedLot?.targetStandardDeviation}
                </ThemedText>
              </View>

              <View>
                <ThemedText style={styles.inputLabel}>Measured Control Value *</ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder={selectedLot ? `e.g. ${selectedLot.targetMean}` : undefined}
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
                  placeholder="Name, credentials"
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
                    placeholder="e.g. manufacturer control product"
                    value={newControlName}
                    onChangeText={setNewControlName}
                  />
                </View>

                <View style={styles.inputRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <ThemedText style={styles.inputLabel}>Analyte Code</ThemedText>
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. HGB"
                      value={newAnalyteCode}
                      onChangeText={setNewAnalyteCode}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <ThemedText style={styles.inputLabel}>Control Level</ThemedText>
                    <View style={styles.levelButtonsRow}>
                      {LEVELS.map(lvl => {
                        const active = newLevel === lvl.value;
                        return (
                          <Pressable
                            key={lvl.value}
                            style={[styles.levelBtn, active && styles.levelBtnActive]}
                            onPress={() => setNewLevel(lvl.value)}
                          >
                            <ThemedText style={[styles.levelBtnText, active && styles.levelBtnTextActive]}>{lvl.label}</ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View>
                  <ThemedText style={styles.inputLabel}>Analyzer / Instrument Name</ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. analyzer model"
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
                      placeholder="YYYY-MM-DD"
                      value={newMfgExp}
                      onChangeText={setNewMfgExp}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <ThemedText style={styles.inputLabel}>Open-Vial Stability (Days)</ThemedText>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="numeric"
                      placeholder="e.g. 30"
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
    maxHeight: '95%',
    overflow: 'hidden',
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
