import React, { useEffect, useState, useCallback } from 'react';
import { FlatList, StyleSheet, View, Pressable, Modal, ScrollView } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Badge from '@ui/Badge';
import { AppIcon } from '@ui/Icon';
import Screen from 'components/layout/Screen';
import { useAppTheme } from 'contexts/ThemeContext';
import { useBreakpoint } from 'hooks/useBreakpoint';
import { db } from '@db/index';
import { labResults } from '@db/schema/labResults';
import { eq, desc } from 'drizzle-orm';
import ProfileReadOnlyField from 'components/profile/ProfileReadOnlyField';
import ProfileSectionHeader from 'components/profile/ProfileSectionHeader';
import { useClinicNameMap } from 'hooks/useClinicNameMap';
import { usePatientId } from 'hooks/usePatientId';
import * as Sharing from 'expo-sharing';
import { dialog } from '@utils/dialog';
import { useProfileSync } from 'hooks/useProfileSync';
import EmptyState from '@ui/EmptyState';
import { RecordSkeletonList } from 'components/records/RecordSkeletonList';

export default function LabResultsScreen() {
  const patientId = usePatientId();
  const { getClinicName } = useClinicNameMap();
  const { colors, radii, spacing } = useAppTheme();
  const { isDesktop } = useBreakpoint();

  const [records, setRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<any | null>(null);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const load = useCallback(() => {
    setIsLoading(true);
    db.select()
      .from(labResults)
      .where(eq(labResults.patientId, patientId))
      .orderBy(desc(labResults.dateResulted))
      .then((data) => {
        setRecords(data ?? []);
      })
      .catch(console.error)
      .finally(() => {
        setIsLoading(false);
      });
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  useProfileSync(load);

  const handleOpenReport = (item: any) => {
    setSelectedReport(item);
    setReportModalVisible(true);
  };

  const handleShareReport = async () => {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      dialog.alert('Notice', 'Sharing is not available on this device platform.');
      return;
    }
    if (selectedReport?.pdfUri || selectedReport?.fileUri) {
      await Sharing.shareAsync(selectedReport.pdfUri || selectedReport.fileUri);
    } else {
      dialog.alert('Share Report', 'Diagnostic laboratory report ready for local export and sharing.');
    }
  };

  return (
    <Screen width="content" scroll={false} padded={false}>
      {isLoading ? (
        <RecordSkeletonList count={3} />
      ) : (
        <FlatList
          key={isDesktop ? 'grid-2' : 'list-1'}
          numColumns={isDesktop ? 2 : 1}
          data={records}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.content,
            { padding: spacing.lg, paddingBottom: spacing['4xl'], gap: spacing.md },
          ]}
          columnWrapperStyle={isDesktop ? { gap: spacing.md } : undefined}
          ListHeaderComponent={
            <View
              style={[
                styles.headerBanner,
                {
                  backgroundColor: colors.successBg,
                  borderColor: colors.successBorder,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  gap: spacing.xs,
                },
              ]}
            >
              <View style={styles.bannerHeaderRow}>
                <AppIcon name="lab" color={colors.successText} size={20} />
                <ThemedText variant="title" style={{ color: colors.successText, fontWeight: '700' }}>
                  Official Diagnostic Laboratory Results
                </ThemedText>
              </View>
              <ThemedText variant="caption" style={{ color: colors.textSecondary, lineHeight: 18 }}>
                Signed and verified clinical laboratory reports ordered by your healthcare providers. View analyte findings, reference ranges, and export certified PDF records.
              </ThemedText>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="clipboard"
              title="No Diagnostic Results"
              message="No verified diagnostic laboratory or imaging results recorded yet."
            />
          }
        renderItem={({ item }) => {
          const isCritical = item.flag?.toLowerCase().includes('panic') || item.flag?.toLowerCase().includes('critical');
          const isAbnormal = item.flag?.toLowerCase().includes('high') || item.flag?.toLowerCase().includes('low') || item.flag?.toLowerCase().includes('abnormal');

          const badgeTone = isCritical ? 'danger' : isAbnormal ? 'warning' : 'success';
          const badgeIcon = isCritical ? 'alert' : isAbnormal ? 'activity' : 'check';
          const badgeLabel = isCritical ? 'Panic / Critical' : (item.flag || 'Normal');

          return (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                  gap: spacing.sm,
                  flex: 1,
                },
              ]}
            >
              {/* Header with Test Name & Flag Pill */}
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText variant="title" style={{ color: colors.text, fontWeight: '700' }}>
                    {item.testName ?? 'Lab Result'}
                  </ThemedText>
                  <ThemedText variant="caption" style={{ color: colors.primary, fontWeight: '600' }}>
                    {item.category || 'Diagnostic Clinical Workup'}
                  </ThemedText>
                </View>

                {/* Status / Flag Badge */}
                <Badge tone={badgeTone} label={badgeLabel} icon={badgeIcon} size="sm" />
              </View>

              {/* Primary Key Finding Display */}
              <View
                style={[
                  styles.keyFindingBox,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderLight,
                    borderRadius: radii.md,
                    padding: spacing.sm,
                    gap: 2,
                  },
                ]}
              >
                <ThemedText variant="caption" style={{ color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>
                  Primary Parameter:
                </ThemedText>
                <ThemedText variant="body" style={{ color: colors.text }}>
                  {item.componentParameter ?? 'Primary Analyte'}:{' '}
                  <ThemedText variant="bodyBold" style={{ color: colors.text }}>
                    {item.resultValue} {item.unit}
                  </ThemedText>
                </ThemedText>
                <ThemedText variant="caption" style={{ color: colors.textSecondary, fontStyle: 'italic' }}>
                  Normal Reference: {item.referenceRange}
                </ThemedText>
              </View>

              {/* Details Grid */}
              <View style={{ gap: spacing.xs }}>
                <ProfileReadOnlyField label="Ordered Date" value={item.dateOrdered} />
                <ProfileReadOnlyField label="Result Date" value={item.dateResulted} />
                <ProfileReadOnlyField
                  label="Accredited Laboratory"
                  value={item.laboratory ?? 'Accredited Diagnostic Facility'}
                />
                <ProfileReadOnlyField label="Ordering Physician" value={item.orderingPhysician ?? 'Attending Physician'} />
              </View>

              {/* Actions */}
              <View style={[styles.actionsRow, { borderTopColor: colors.borderLight, paddingTop: spacing.sm }]}>
                <Pressable
                  style={[
                    styles.viewReportBtn,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: radii.md,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      gap: spacing.xs,
                    },
                  ]}
                  onPress={() => handleOpenReport(item)}
                >
                  <AppIcon name="document" color={colors.onPrimary} size={16} />
                  <ThemedText variant="caption" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                    View Certified Diagnostic Report
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
      )}

      {/* Official Diagnostic Report Modal */}
      <Modal visible={reportModalVisible} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay, padding: spacing.md }]}>
          <View
            style={[
              styles.modalContainer,
              {
                backgroundColor: colors.card,
                borderRadius: radii.xl,
              },
            ]}
          >
            <View
              style={[
                styles.modalTopBar,
                {
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  backgroundColor: colors.surfaceSubtle,
                  borderBottomColor: colors.borderLight,
                },
              ]}
            >
              <ThemedText variant="title" style={{ color: colors.text, fontWeight: '700' }}>
                Official Laboratory Certificate
              </ThemedText>
              <Pressable onPress={() => setReportModalVisible(false)} hitSlop={8} style={styles.closeModalBtn}>
                <AppIcon name="close" color={colors.textSecondary} size={20} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={[
                styles.reportScrollContent,
                { padding: spacing.lg, gap: spacing.md },
              ]}
            >
              {/* Header Letterhead */}
              <View style={[styles.reportHeader, { borderBottomColor: colors.borderLight, paddingBottom: spacing.sm }]}>
                <ThemedText variant="title" style={{ color: colors.text, textAlign: 'center', fontWeight: '800' }}>
                  {selectedReport?.laboratory || 'ACCREDITED DIAGNOSTIC LABORATORY'}
                </ThemedText>
                <View style={[styles.divider, { backgroundColor: colors.borderLight, marginVertical: spacing.sm }]} />
                <ThemedText variant="caption" style={{ color: colors.primary, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '800' }}>
                  OFFICIAL CLINICAL LABORATORY REPORT
                </ThemedText>
                <View style={[styles.reportMetaRow, { marginTop: spacing.xs }]}>
                  <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
                    Report No:{' '}
                    <ThemedText variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                      {selectedReport?.reportNumber || '—'}
                    </ThemedText>
                  </ThemedText>
                  <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
                    Date: {selectedReport?.dateResulted || '—'}
                  </ThemedText>
                </View>
              </View>

              {/* Patient and Doctor Demographics */}
              <View
                style={[
                  styles.infoBox,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderColor: colors.borderLight,
                    borderRadius: radii.md,
                    padding: spacing.sm,
                    gap: spacing.xs,
                  },
                ]}
              >
                <View style={styles.infoRow}>
                  <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                    Ordering Physician:
                  </ThemedText>
                  <ThemedText variant="caption" style={{ color: colors.text, fontWeight: '600' }}>
                    {selectedReport?.orderingPhysician || 'Attending Physician'}
                  </ThemedText>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                    Specimen / Test:
                  </ThemedText>
                  <ThemedText variant="caption" style={{ color: colors.text, fontWeight: '600' }}>
                    {selectedReport?.testName || 'Diagnostic Laboratory Test'}
                  </ThemedText>
                </View>
                <View style={styles.infoRow}>
                  <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                    Diagnostic Section:
                  </ThemedText>
                  <ThemedText variant="caption" style={{ color: colors.text, fontWeight: '600' }}>
                    {selectedReport?.category || 'Clinical Pathology'}
                  </ThemedText>
                </View>
              </View>

              {/* Analytes Breakdown Table */}
              <View
                style={[
                  styles.tableCard,
                  {
                    borderColor: colors.border,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <View
                  style={[
                    styles.tableHeaderRow,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderBottomColor: colors.border,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.sm,
                    },
                  ]}
                >
                  <ThemedText variant="caption" style={[styles.thCell, { flex: 2, color: colors.textSecondary, fontWeight: '700' }]}>
                    Analyte / Parameter
                  </ThemedText>
                  <ThemedText variant="caption" style={[styles.thCell, { flex: 1, textAlign: 'center', color: colors.textSecondary, fontWeight: '700' }]}>
                    Result
                  </ThemedText>
                  <ThemedText variant="caption" style={[styles.thCell, { flex: 1, textAlign: 'center', color: colors.textSecondary, fontWeight: '700' }]}>
                    Range
                  </ThemedText>
                  <ThemedText variant="caption" style={[styles.thCell, { width: 50, textAlign: 'center', color: colors.textSecondary, fontWeight: '700' }]}>
                    Flag
                  </ThemedText>
                </View>

                {(selectedReport?.components || [
                  { parameter: selectedReport?.componentParameter, value: selectedReport?.resultValue, unit: selectedReport?.unit, range: selectedReport?.referenceRange, flag: selectedReport?.flag }
                ]).map((comp: any, idx: number) => {
                  const isHigh = comp.flag?.toLowerCase().includes('high');
                  const isLow = comp.flag?.toLowerCase().includes('low');
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.tableDataRow,
                        {
                          paddingVertical: spacing.sm,
                          paddingHorizontal: spacing.sm,
                          backgroundColor: idx % 2 === 1 ? colors.surfaceSubtle : undefined,
                        },
                      ]}
                    >
                      <View style={{ flex: 2 }}>
                        <ThemedText variant="caption" style={{ color: colors.text, fontWeight: '700' }}>
                          {comp.parameter}
                        </ThemedText>
                        <ThemedText variant="caption" style={{ color: colors.textSecondary }}>
                          {comp.unit}
                        </ThemedText>
                      </View>
                      <ThemedText
                        variant="caption"
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          fontWeight: '700',
                          color: (isHigh || isLow) ? colors.warningText : colors.text,
                        }}
                      >
                        {comp.value}
                      </ThemedText>
                      <ThemedText variant="caption" style={{ flex: 1, textAlign: 'center', color: colors.textSecondary }}>
                        {comp.range}
                      </ThemedText>
                      <ThemedText
                        variant="caption"
                        style={{
                          width: 50,
                          textAlign: 'center',
                          fontWeight: '700',
                          color: (isHigh || isLow) ? colors.warningText : colors.successText,
                        }}
                      >
                        {comp.flag === 'Normal' ? 'OK' : comp.flag}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>

              {/* Official Laboratory Signatures */}
              <View style={[styles.signaturesRow, { gap: spacing.sm, marginTop: spacing.xs }]}>
                <View
                  style={[
                    styles.sigBox,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.borderLight,
                      borderRadius: radii.md,
                      padding: spacing.sm,
                    },
                  ]}
                >
                  <ThemedText variant="caption" style={{ color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>
                    Registered Medical Technologist
                  </ThemedText>
                  <ThemedText variant="caption" style={{ color: colors.text, textAlign: 'center', marginTop: 2, fontWeight: '700' }}>
                    {selectedReport?.medtech || 'Attending Medical Technologist'}
                  </ThemedText>
                  {selectedReport?.medtechPrcLicense ? (
                    <ThemedText variant="caption" style={{ color: colors.textSecondary, marginTop: 1 }}>
                      PRC License No. {selectedReport.medtechPrcLicense}
                    </ThemedText>
                  ) : null}
                  <View style={[styles.sigStatusRow, { marginTop: spacing.xs }]}>
                    <AppIcon name="check" size={14} color={colors.successText} />
                    <ThemedText variant="caption" style={{ color: colors.successText, marginLeft: 4, fontWeight: '700' }}>
                      Digitally Performed & Validated
                    </ThemedText>
                  </View>
                </View>
                <View
                  style={[
                    styles.sigBox,
                    {
                      backgroundColor: colors.surfaceSubtle,
                      borderColor: colors.borderLight,
                      borderRadius: radii.md,
                      padding: spacing.sm,
                    },
                  ]}
                >
                  <ThemedText variant="caption" style={{ color: colors.textMuted, textTransform: 'uppercase', fontWeight: '700' }}>
                    Pathologist / Laboratory Director
                  </ThemedText>
                  <ThemedText variant="caption" style={{ color: colors.text, textAlign: 'center', marginTop: 2, fontWeight: '700' }}>
                    {selectedReport?.pathologist || 'Attending Pathologist'}
                  </ThemedText>
                  {selectedReport?.pathologistPrcLicense ? (
                    <ThemedText variant="caption" style={{ color: colors.textSecondary, marginTop: 1 }}>
                      PRC License No. {selectedReport.pathologistPrcLicense}
                    </ThemedText>
                  ) : null}
                  <View style={[styles.sigStatusRow, { marginTop: spacing.xs }]}>
                    <AppIcon name="check" size={14} color={colors.successText} />
                    <ThemedText variant="caption" style={{ color: colors.successText, marginLeft: 4, fontWeight: '700' }}>
                      Digitally Signed & Released
                    </ThemedText>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View
              style={[
                styles.modalFooter,
                {
                  padding: spacing.md,
                  backgroundColor: colors.surfaceSubtle,
                  borderTopColor: colors.borderLight,
                  gap: spacing.sm,
                },
              ]}
            >
              <Pressable
                style={[
                  styles.shareBtn,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: radii.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    gap: spacing.xs,
                  },
                ]}
                onPress={handleShareReport}
              >
                <AppIcon name="share" color={colors.onPrimary} size={16} />
                <ThemedText variant="caption" style={{ color: colors.onPrimary, fontWeight: '700' }}>
                  Export / Share PDF
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.closeFullBtn,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRadius: radii.md,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                  },
                ]}
                onPress={() => setReportModalVisible(false)}
              >
                <ThemedText variant="caption" style={{ color: colors.textSecondary, fontWeight: '700' }}>
                  Close Report
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {},
  headerBanner: {
    borderWidth: 1,
  },
  bannerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  keyFindingBox: {
    borderWidth: 1,
  },
  actionsRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  viewReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '95%',
    overflow: 'hidden',
  },
  modalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  closeModalBtn: {
    padding: 4,
  },
  reportScrollContent: {},
  reportHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  reportMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  infoBox: {
    borderWidth: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tableCard: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  thCell: {},
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signaturesRow: {
    flexDirection: 'row',
  },
  sigBox: {
    flex: 1,
    borderWidth: 1,
    alignItems: 'center',
  },
  sigStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalFooter: {
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeFullBtn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
