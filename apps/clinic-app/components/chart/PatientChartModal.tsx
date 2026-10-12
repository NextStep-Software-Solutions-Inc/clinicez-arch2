import React, { useState, useEffect } from 'react';
import {
  Modal as RNModal,
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import { theme } from '../../constants/theme';
import {
  ThemedText,
  Badge,
  Icon,
  SkeletonList,
  ErrorState,
  SegmentedControl,
} from '../ui';
import type { SegmentedOption } from '../ui/SegmentedControl';
import { useBreakpoint } from '../../utils/useBreakpoint';
import type {
  ClinicPatient,
  PatientChart,
  ClinicRecordAttachmentRecord,
  AdministerVaccinePayload,
  RecordHistoricalImmunizationPayload,
  RecordAefiPayload,
  ConsultationRecord,
} from '../../services/clinicService';

import PatientSummarySpine from './PatientSummarySpine';
import ExecutiveSummaryTab from './ExecutiveSummaryTab';
import EncountersTimelineTab from './EncountersTimelineTab';
import DiagnosticLabTab from './DiagnosticLabTab';
import NursingProceduresTab from './NursingProceduresTab';
import StatutoryImmunizationsTab from './StatutoryImmunizationsTab';
import HealthProfilesTab from './HealthProfilesTab';
import ExternalDocumentVaultTab from './ExternalDocumentVaultTab';

export type ChartTab =
  | 'summary'
  | 'encounters'
  | 'diagnostics'
  | 'procedures'
  | 'immunizations'
  | 'profiles'
  | 'vault';

export const CHART_TABS: SegmentedOption<ChartTab>[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'encounters', label: 'Encounters' },
  { value: 'diagnostics', label: 'Diagnostics' },
  { value: 'procedures', label: 'Procedures' },
  { value: 'immunizations', label: 'Vaccines' },
  { value: 'profiles', label: 'Health Profiles' },
  { value: 'vault', label: 'Doc Vault' },
];

export interface PatientChartModalProps {
  /** Visibility toggle of the modal */
  visible: boolean;
  /** Patient record */
  patient: ClinicPatient | null;
  /** Patient chart record */
  patientChart: PatientChart | null;
  /** Whether the chart is currently loading */
  loadingChart?: boolean;
  /** Error message if chart retrieval failed */
  chartError?: string | null;
  /** Optional pre-fetched external document attachments */
  patientAttachments?: ClinicRecordAttachmentRecord[];
  /** Tab to show upon initial open (defaults to 'summary') */
  initialTab?: ChartTab;
  /** Active tab override */
  activeTab?: ChartTab;
  /** Callback when tab changes */
  onTabChange?: (tab: ChartTab) => void;
  /** Close modal callback */
  onClose: () => void;
  /** Refresh chart data callback */
  onRefreshChart?: () => void;

  // Tab action handlers
  onViewPrescriptionSlip?: (consultation: ConsultationRecord) => void;
  onOpenExternalDispense?: (consultation: ConsultationRecord) => void;
  onViewLabSlip?: (orderId: string) => void;
  onAttachExternalResult?: (orderId: string) => void;
  onUploadDocument?: () => void;
  onVerifyAttachment?: (attachmentId: string, isApproved: boolean) => Promise<void>;
  onDownloadAttachment?: (attachmentId: string) => Promise<void>;
  onAdministerVaccine?: (payload: AdministerVaccinePayload) => Promise<void>;
  onRecordHistoricalVaccine?: (payload: RecordHistoricalImmunizationPayload) => Promise<void>;
  onRecordAefi?: (immId: string, payload: RecordAefiPayload) => Promise<void>;
}

export default function PatientChartModal({
  visible,
  patient,
  patientChart,
  loadingChart = false,
  chartError = null,
  patientAttachments = [],
  initialTab = 'summary',
  activeTab: activeTabProp,
  onTabChange,
  onClose,
  onRefreshChart,
  onViewPrescriptionSlip,
  onOpenExternalDispense,
  onViewLabSlip,
  onAttachExternalResult,
  onUploadDocument,
  onVerifyAttachment,
  onDownloadAttachment,
  onAdministerVaccine,
  onRecordHistoricalVaccine,
  onRecordAefi,
}: PatientChartModalProps) {
  const [internalTab, setInternalTab] = useState<ChartTab>(initialTab);
  const [isMaximized, setIsMaximized] = useState(false);
  const { isCompact } = useBreakpoint();

  // Reset tab to initial when modal becomes visible
  useEffect(() => {
    if (visible) {
      setInternalTab(initialTab);
    }
  }, [visible, initialTab]);

  const activeTab = activeTabProp ?? internalTab;
  const handleTabChange = (tab: ChartTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const isFullScreen = isMaximized || isCompact;

  return (
    <RNModal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.modalOverlay,
          isFullScreen && styles.modalOverlayFullScreen,
        ]}
      >
        <View
          style={[
            styles.modalContent,
            isFullScreen && styles.modalContentFullScreen,
          ]}
          aria-modal={true}
          accessibilityLabel={`Medical Chart for ${patient?.fullName || 'Patient'}`}
        >
          {/* ========================================================================= */}
          {/* WORKSTATION MODAL HEADER BAR                                              */}
          {/* ========================================================================= */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleContainer}>
              <View style={styles.titleRow}>
                <ThemedText variant="title">Medical chart</ThemedText>
                {patient ? (
                  <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                    {patient.fullName}
                  </ThemedText>
                ) : null}
              </View>

              {patient ? (
                <View style={styles.headerMetaRow}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Code: <ThemedText variant="caption" color={theme.colors.text}>{patient.patientCode || '—'}</ThemedText>
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.borderDark}>•</ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {patient.age ? `${patient.age} yrs` : ''}{patient.gender ? `, ${patient.gender}` : ''}
                  </ThemedText>
                  {patient.dateOfBirth ? (
                    <>
                      <ThemedText variant="caption" color={theme.colors.borderDark}>•</ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        DOB: {patient.dateOfBirth}
                      </ThemedText>
                    </>
                  ) : null}
                  {patient.verificationStatus === 'Verified' ? (
                    <Badge label="Verified" variant="success" size="sm" icon="checkCircle" />
                  ) : (
                    <Badge label="Unverified" variant="warning" size="sm" icon="alert" />
                  )}
                  {patient.bloodType ? (
                    <Badge label={patient.bloodType} variant="neutral" size="sm" icon="droplet" />
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* Header Action Controls */}
            <View style={styles.headerActions}>
              {onRefreshChart ? (
                <Pressable
                  onPress={onRefreshChart}
                  hitSlop={8}
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh patient chart"
                >
                  <Icon name="refresh" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
                </Pressable>
              ) : null}

              {!isCompact ? (
                <Pressable
                  onPress={() => setIsMaximized(!isMaximized)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={isMaximized ? 'Restore chart window' : 'Maximize chart window'}
                >
                  <Icon
                    name={isMaximized ? 'minimize' : 'maximize'}
                    size={theme.sizes.iconMd}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
              ) : null}

              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Close medical chart"
              >
                <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* ========================================================================= */}
          {/* PATIENT SUMMARY SPINE (GLANCEABLE 6-ZONE HEADER)                          */}
          {/* ========================================================================= */}
          {patient && (
            <View style={styles.spineWrapper}>
              <PatientSummarySpine
                patient={patient}
                chart={patientChart}
                vitals={patientChart?.vitalsHistory?.[0]}
                loading={loadingChart}
                onPressRefresh={onRefreshChart}
              />
            </View>
          )}

          {/* ========================================================================= */}
          {/* LONGITUDINAL 7-TAB NAVIGATION BAR                                         */}
          {/* ========================================================================= */}
          <View style={styles.tabBarWrapper}>
            <SegmentedControl
              options={CHART_TABS}
              value={activeTab}
              onChange={handleTabChange}
            />
          </View>

          {/* ========================================================================= */}
          {/* ACTIVE TAB VIEWPORT BODY (SCROLLABLE WORKSTATION AREA)                    */}
          {/* ========================================================================= */}
          <View style={styles.tabBodyWrapper}>
            {loadingChart ? (
              <SkeletonList rows={6} />
            ) : chartError && !patientChart ? (
              <ErrorState
                title="Unable to load the chart"
                message={chartError}
                onRetry={onRefreshChart}
              />
            ) : patientChart && patient ? (
              activeTab === 'summary' ? (
                <ExecutiveSummaryTab
                  patient={patient}
                  chart={patientChart}
                  onNavigateTab={(tab) => handleTabChange(tab)}
                  onRefreshChart={onRefreshChart}
                />
              ) : activeTab === 'encounters' ? (
                <EncountersTimelineTab
                  patient={patient}
                  patientId={patient.id}
                  consultations={patientChart.consultations || []}
                  onViewPrescriptionSlip={onViewPrescriptionSlip}
                  onOpenExternalDispense={onOpenExternalDispense}
                  onRefreshChart={onRefreshChart}
                />
              ) : activeTab === 'diagnostics' ? (
                <DiagnosticLabTab
                  patient={patient}
                  patientId={patient.id}
                  labOrders={patientChart.labOrdersHistory || []}
                  onViewLabSlip={onViewLabSlip}
                  onOpenLabSlip={(order) => onViewLabSlip?.(order.id)}
                  onAttachExternalResult={onAttachExternalResult}
                  onRefreshChart={onRefreshChart}
                />
              ) : activeTab === 'procedures' ? (
                <NursingProceduresTab
                  patient={patient}
                  patientId={patient.id}
                  procedures={patientChart.proceduresHistory || []}
                  onRefreshChart={onRefreshChart}
                />
              ) : activeTab === 'immunizations' ? (
                <StatutoryImmunizationsTab
                  patient={patient}
                  patientId={patient.id}
                  demographics={patientChart.demographics}
                  immunizations={patientChart.immunizations || []}
                  onAdministerVaccine={onAdministerVaccine}
                  onRecordHistoricalVaccine={onRecordHistoricalVaccine}
                  onRecordAefi={onRecordAefi}
                  onRefreshChart={onRefreshChart}
                />
              ) : activeTab === 'profiles' ? (
                <HealthProfilesTab
                  patient={patient}
                  surgicalHistories={patientChart.surgicalHistories}
                  socialHistory={patientChart.socialHistory}
                  reproductiveHistory={patientChart.reproductiveHistory}
                  latestNcdAssessment={patientChart.latestNcdAssessment}
                  onRefreshChart={onRefreshChart}
                />
              ) : activeTab === 'vault' ? (
                <ExternalDocumentVaultTab
                  patient={patient}
                  patientId={patient.id}
                  attachments={patientChart.attachments || patientAttachments}
                  onUploadDocument={onUploadDocument}
                  onVerifyAttachment={onVerifyAttachment}
                  onDownloadAttachment={onDownloadAttachment}
                  onRefreshChart={onRefreshChart}
                />
              ) : null
            ) : null}
          </View>
        </View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalOverlayFullScreen: {
    padding: 0,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    width: '95%',
    maxWidth: 1400,
    height: '92%',
    maxHeight: '94%',
    alignSelf: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    flexDirection: 'column',
    ...theme.shadows.lg,
  },
  modalContentFullScreen: {
    width: '100%',
    maxWidth: '100%',
    height: '100%',
    maxHeight: '100%',
    borderRadius: 0,
    borderWidth: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  headerTitleContainer: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginLeft: theme.spacing.md,
  },
  actionBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  actionBtnPressed: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  spineWrapper: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  tabBarWrapper: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  tabBodyWrapper: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});
