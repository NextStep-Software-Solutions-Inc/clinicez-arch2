import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import { SkeletonList, ErrorState } from '../ui';
import ExecutiveSummaryTab from './ExecutiveSummaryTab';
import EncountersTimelineTab from './EncountersTimelineTab';
import DiagnosticLabTab from './DiagnosticLabTab';
import NursingProceduresTab from './NursingProceduresTab';
import StatutoryImmunizationsTab from './StatutoryImmunizationsTab';
import HealthProfilesTab from './HealthProfilesTab';
import ExternalDocumentVaultTab from './ExternalDocumentVaultTab';
import DentalChartTab from './DentalChartTab';
import type { ChartLayoutProps } from './types';

/**
 * Reusable tab content dispatcher shared by all 3 layout shells.
 * Ensures consistent data binding, loading skeleton, error states, and actions.
 */
export default function ChartTabContentView(props: ChartLayoutProps) {
  const {
    patient,
    patientChart,
    loadingChart = false,
    chartError = null,
    patientAttachments = [],
    activeTab,
    onTabChange,
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
  } = props;

  if (loadingChart) {
    return (
      <View style={styles.loadingContainer}>
        <SkeletonList rows={6} />
      </View>
    );
  }

  if (chartError) {
    return (
      <View style={styles.errorContainer}>
        <ErrorState
          title="Unable to load the chart"
          message={chartError}
          onRetry={onRefreshChart}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {activeTab === 'summary' && (
        <ExecutiveSummaryTab
          patient={patient}
          chart={patientChart}
          onNavigateTab={onTabChange}
          onRefreshChart={onRefreshChart}
        />
      )}
      {activeTab === 'encounters' && (
        <EncountersTimelineTab
          patient={patient}
          patientId={patient?.id}
          consultations={patientChart?.consultations || []}
          onViewPrescriptionSlip={onViewPrescriptionSlip}
          onOpenExternalDispense={onOpenExternalDispense}
          onRefreshChart={onRefreshChart}
        />
      )}
      {activeTab === 'diagnostics' && (
        <DiagnosticLabTab
          patient={patient}
          patientId={patient?.id}
          labOrders={patientChart?.labOrdersHistory || []}
          onViewLabSlip={onViewLabSlip}
          onOpenLabSlip={(order: any) => onViewLabSlip?.(order.id)}
          onAttachExternalResult={onAttachExternalResult}
          onRefreshChart={onRefreshChart}
        />
      )}
      {activeTab === 'procedures' && (
        <NursingProceduresTab
          patient={patient}
          patientId={patient?.id}
          procedures={patientChart?.proceduresHistory || []}
          onRefreshChart={onRefreshChart}
        />
      )}
      {activeTab === 'immunizations' && (
        <StatutoryImmunizationsTab
          patient={patient}
          patientId={patient?.id}
          demographics={patientChart?.demographics}
          immunizations={patientChart?.immunizations || []}
          onAdministerVaccine={onAdministerVaccine}
          onRecordHistoricalVaccine={onRecordHistoricalVaccine}
          onRecordAefi={onRecordAefi}
          onRefreshChart={onRefreshChart}
        />
      )}
      {activeTab === 'profiles' && patient && (
        <HealthProfilesTab
          patient={patient}
          surgicalHistories={patientChart?.surgicalHistories}
          socialHistory={patientChart?.socialHistory}
          reproductiveHistory={patientChart?.reproductiveHistory}
          latestNcdAssessment={patientChart?.latestNcdAssessment}
          onRefreshChart={onRefreshChart}
        />
      )}
      {activeTab === 'vault' && (
        <ExternalDocumentVaultTab
          patient={patient}
          patientId={patient?.id}
          attachments={patientChart?.attachments || patientAttachments}
          onUploadDocument={onUploadDocument}
          onVerifyAttachment={onVerifyAttachment}
          onDownloadAttachment={onDownloadAttachment}
          onRefreshChart={onRefreshChart}
        />
      )}
      {activeTab === 'dental' && (
        <DentalChartTab
          patient={patient}
          patientId={patient?.id}
          chart={patientChart}
          focusToothNumber={props.focusToothNumber}
          onOrderProcedure={props.onOrderDentalProcedure}
          onVoidCondition={props.onVoidDentalCondition}
          onRefreshChart={onRefreshChart}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
  },
  loadingContainer: {
    padding: theme.spacing.xl,
    flex: 1,
  },
  errorContainer: {
    padding: theme.spacing.xl,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
