import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Modal from '../ui/Modal';
import { notify } from '@utils/feedback';
import { useClinic } from '../../context/ClinicContext';
import { clinicService, type ClinicPatient } from '../../services/clinicService';
import EditPatientModal from '../patient/EditPatientModal';
import {
  OrderCatalogSearchModal,
  type CategoryTab,
  type OrderCatalogItemPayload,
} from '../consultation/OrderCatalogSearchModal';
import { reconcileChartWithPatient } from './PatientSummarySpine';
import {
  CenteredModalChartLayout,
  SplitPaneChartLayout,
  SlideOverDrawerChartLayout,
} from './layouts';
import {
  type ChartTab,
  type ChartLayoutMode,
  type ChartLayoutProps,
  type PatientChartModalProps,
  CHART_TABS,
  CHART_TAB_LABELS,
  DEFAULT_CHART_LAYOUT,
  getAvailableChartTabs,
  pushChartTabHistory,
  popChartTabHistory,
} from './types';
import { getActiveAudioPreferences } from '../../utils/alertSounds';

export { CHART_TABS };
export type { ChartTab, ChartLayoutMode, PatientChartModalProps };

/**
 * Top-Level Patient Chart Modal Orchestrator
 *
 * Responsibilities:
 *  - Manages modal visibility, active tab, active patient, and edit modal state.
 *  - Resolves facility-wide preferred layout from ClinicContext (or props fallback).
 *  - Allows the clinician to switch layouts on the fly via in-modal layout switcher.
 *  - Delegates rendering directly to dedicated layout components in `./layouts/`,
 *    preventing code clutter, spaghetti styling, or bloated branching logic.
 */
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
  onPatientUpdated,
  onPressEdit,
  preferredLayout: preferredLayoutProp,
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
  availableTabs: availableTabsProp,
  focusToothNumber,
  onOrderDentalProcedure,
  onVoidDentalCondition,
  onOrderProcedure,
  onOrderDiagnostic,
  queueItemId,
  allowDuplicateActive = false,
}: PatientChartModalProps) {
  const { settings } = useClinic();
  const personalPreferredLayout = getActiveAudioPreferences().preferredChartLayout;
  const configuredLayout: ChartLayoutMode =
    preferredLayoutProp ||
    personalPreferredLayout ||
    ((settings as any)?.preferredChartLayout as ChartLayoutMode) ||
    DEFAULT_CHART_LAYOUT;

  const availableTabs = useMemo(() => {
    if (availableTabsProp) return availableTabsProp;
    const hasDentalRecords = Boolean(
      (patientChart?.dentalTeeth && patientChart.dentalTeeth.length > 0) ||
      (patientChart?.dentalChart?.teeth && patientChart.dentalChart.teeth.length > 0)
    );
    const isDentalEnabled = Boolean(
      settings?.enableDentalModule ||
      settings?.specialtyMode === 'Dental' ||
      hasDentalRecords ||
      focusToothNumber
    );
    return getAvailableChartTabs(isDentalEnabled);
  }, [
    availableTabsProp,
    settings?.enableDentalModule,
    settings?.specialtyMode,
    patientChart?.dentalTeeth,
    patientChart?.dentalChart,
    focusToothNumber,
  ]);

  const defaultInitialTab: ChartTab = activeTabProp || (focusToothNumber ? 'dental' : initialTab);
  const [internalTab, setInternalTab] = useState<ChartTab>(defaultInitialTab);
  const [tabHistory, setTabHistory] = useState<ChartTab[]>([]);
  const [activeLayout, setActiveLayout] = useState<ChartLayoutMode>(configuredLayout);
  const [editDemographicsVisible, setEditDemographicsVisible] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<ClinicPatient | null>(patient);
  const [materializedQueueItemId, setMaterializedQueueItemId] = useState<string | null>(null);
  const [catalogModalState, setCatalogModalState] = useState<{
    visible: boolean;
    initialCategory: CategoryTab;
    toothNumber?: number;
    toothSurface?: string;
  }>({ visible: false, initialCategory: 'Procedure' });

  const tabVisibleRef = useRef(false);
  const prevPatientIdRef = useRef<string | undefined>(patient?.id);
  const layoutVisibleRef = useRef(false);
  const prevConfiguredLayoutRef = useRef(configuredLayout);

  useEffect(() => {
    setCurrentPatient(patient);
    if (patient?.id !== prevPatientIdRef.current) {
      prevPatientIdRef.current = patient?.id;
      setTabHistory([]);
      setMaterializedQueueItemId(null);
    }
  }, [patient]);

  useEffect(() => {
    if (activeTabProp) {
      setInternalTab(activeTabProp);
    }
  }, [activeTabProp]);

  useEffect(() => {
    if (visible && !tabVisibleRef.current) {
      setTabHistory([]);
      if (activeTabProp) {
        setInternalTab(activeTabProp);
      } else if (focusToothNumber) {
        setInternalTab('dental');
      } else if (initialTab) {
        setInternalTab(initialTab);
      }
    } else if (!visible && tabVisibleRef.current) {
      setTabHistory([]);
      setMaterializedQueueItemId(null);
    }
    tabVisibleRef.current = visible;
  }, [visible, activeTabProp, initialTab, focusToothNumber]);

  useEffect(() => {
    if (focusToothNumber && !activeTabProp) {
      setInternalTab('dental');
    }
  }, [focusToothNumber, activeTabProp]);

  useEffect(() => {
    const justOpened = visible && !layoutVisibleRef.current;
    const layoutPreferenceChanged = configuredLayout !== prevConfiguredLayoutRef.current;

    if (justOpened || (visible && layoutPreferenceChanged)) {
      setActiveLayout(configuredLayout);
    }

    layoutVisibleRef.current = visible;
    prevConfiguredLayoutRef.current = configuredLayout;
  }, [visible, configuredLayout]);

  const handleEditPress = () => {
    if (onPressEdit) {
      onPressEdit();
    } else {
      setEditDemographicsVisible(true);
    }
  };

  const [isLocalRefreshing, setIsLocalRefreshing] = useState(false);
  const isRefreshing = Boolean(loadingChart || isLocalRefreshing);
  const isRefreshingRef = React.useRef(isRefreshing);
  isRefreshingRef.current = isRefreshing;
  const onRefreshChartRef = React.useRef(onRefreshChart);
  onRefreshChartRef.current = onRefreshChart;

  const handleRefresh = useCallback(async () => {
    const refreshFn = onRefreshChartRef.current;
    if (isRefreshingRef.current || !refreshFn) return;
    isRefreshingRef.current = true;
    setIsLocalRefreshing(true);
    try {
      const minDurationPromise = new Promise((resolve) => setTimeout(resolve, 600));
      const res = (refreshFn as any)();
      if (Boolean(res) && typeof (res as any)?.then === 'function') {
        await Promise.all([res, minDurationPromise]);
      } else {
        await minDurationPromise;
      }
    } catch {
      // Handled upstream
    } finally {
      isRefreshingRef.current = false;
      setIsLocalRefreshing(false);
    }
  }, []);

  const handleDemographicsSaved = (updated: ClinicPatient) => {
    setCurrentPatient(updated);
    onPatientUpdated?.(updated);
    handleRefresh();
  };

  const displayPatient = currentPatient || patient;
  const reconciledChart = useMemo(
    () => (patientChart ? reconcileChartWithPatient(patientChart, displayPatient) : patientChart),
    [patientChart, displayPatient],
  );
  const rawActiveTab = activeTabProp ?? internalTab;

  const allowedTabIds = useMemo(
    () => availableTabs.map((t) => t.value),
    [availableTabs],
  );

  const isTabAvailable = allowedTabIds.includes(rawActiveTab);
  const activeTab: ChartTab = isTabAvailable ? rawActiveTab : 'summary';

  useEffect(() => {
    if (visible && allowedTabIds.length > 0 && !isTabAvailable) {
      setInternalTab('summary');
      onTabChange?.('summary');
    }
  }, [visible, allowedTabIds, isTabAvailable, onTabChange]);

  const { previousTab } = useMemo(
    () => popChartTabHistory(tabHistory, allowedTabIds),
    [tabHistory, allowedTabIds],
  );

  const handleTabChange = (tab: ChartTab) => {
    if (tab === activeTab) return;
    setTabHistory((prev) => pushChartTabHistory(prev, activeTab, tab));
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const handleBackTab = useCallback(() => {
    const { previousTab: target, nextHistory } = popChartTabHistory(tabHistory, allowedTabIds);
    if (!target) return;
    setTabHistory(nextHistory);
    setInternalTab(target);
    onTabChange?.(target);
  }, [tabHistory, allowedTabIds, onTabChange]);

  const resolvedQueueItemId =
    queueItemId ??
    materializedQueueItemId ??
    (patientChart as any)?.queueItemId ??
    (displayPatient as any)?.queueItemId ??
    null;

  const handleOpenBuiltInOrderProcedure = useCallback(() => {
    setCatalogModalState({ visible: true, initialCategory: 'Procedure' });
  }, []);

  const handleOpenBuiltInOrderDiagnostic = useCallback(() => {
    setCatalogModalState({ visible: true, initialCategory: 'Diagnostic' });
  }, []);

  const handleOpenBuiltInOrderDentalProcedure = useCallback(
    (toothNumber: number, toothSurface?: string) => {
      setCatalogModalState({
        visible: true,
        initialCategory: 'Dental',
        toothNumber,
        toothSurface,
      });
    },
    []
  );

  const handleSubmitBuiltInCatalogOrder = useCallback(
    async (order: OrderCatalogItemPayload) => {
      if (!displayPatient?.id) {
        notify.error('No patient selected.');
        return;
      }
      const patientFullName =
        displayPatient.fullName ||
        `${displayPatient.firstName || ''} ${displayPatient.lastName || ''}`.trim() ||
        'Patient';
      const isDiag = (order.category || '').toLowerCase().includes('diagnostic');

      let effectiveQueueItemId = resolvedQueueItemId;
      if (!effectiveQueueItemId) {
        const [directVisit, visitErr] = await clinicService.ensureDirectVisit({
          patientId: displayPatient.id,
          patientName: patientFullName,
          doctorId: order.orderedByDoctorId,
          doctorName: order.orderedByDoctorName,
          visitType: isDiag ? 'Consultation' : 'StandaloneProcedure',
          initialStatus: isDiag ? 'InConsultation' : 'PendingProcedure',
          allowDuplicateActive: allowDuplicateActive && !materializedQueueItemId,
        });
        if (visitErr || !directVisit) {
          notify.error(visitErr?.message || 'Could not initialize direct visit for order.');
          return;
        }
        effectiveQueueItemId = directVisit.id;
        setMaterializedQueueItemId(directVisit.id);
      }

      if (isDiag) {
        const [, err] = await clinicService.createLabOrder({
          patientId: displayPatient.id,
          patientName: patientFullName,
          queueItemId: effectiveQueueItemId || undefined,
          orderedByDoctorId: order.orderedByDoctorId,
          orderedByDoctorName: order.orderedByDoctorName,
          notes: order.instructions,
          items: [
            {
              testName: order.name,
              category: order.category || 'Diagnostic',
              instructions: order.instructions,
            },
          ],
        });
        if (err) {
          notify.error(err.message || 'Failed to order diagnostic test.');
          return;
        }
        notify.success(`${order.name} ordered.`);
        void handleRefresh();
        return;
      }

      const [, err] = await clinicService.orderProcedure({
        patientId: displayPatient.id,
        patientName: patientFullName,
        queueItemId: effectiveQueueItemId || undefined,
        procedureCode: order.code || undefined,
        procedureName: order.name,
        category: order.category || 'Procedure',
        targetRoomId: order.targetRoomId || order.roomId || undefined,
        targetRoomName: order.targetRoomName || order.roomName || undefined,
        toothNumber: order.toothNumber,
        toothSurface: order.toothSurface,
        clinicalNotes: order.instructions,
        orderedByDoctorId: order.orderedByDoctorId,
        orderedByDoctorName: order.orderedByDoctorName,
      });
      if (err) {
        notify.error(err.message || 'Failed to order procedure.');
        return;
      }
      notify.success(`${order.name} ordered successfully.`);
      void handleRefresh();
    },
    [displayPatient, resolvedQueueItemId, allowDuplicateActive, materializedQueueItemId, handleRefresh]
  );

  if (!visible) {
    return null;
  }

  const layoutProps: ChartLayoutProps = {
    patient: displayPatient,
    patientChart: reconciledChart,
    loadingChart: isRefreshing,
    chartError,
    patientAttachments,
    activeTab,
    onTabChange: handleTabChange,
    onClose,
    onRefreshChart: handleRefresh,
    onEditDemographics: handleEditPress,
    currentLayout: activeLayout,
    onSwitchLayout: setActiveLayout,
    canGoBackTab: Boolean(previousTab),
    previousTabLabel: previousTab ? CHART_TAB_LABELS[previousTab] : null,
    onBackTab: previousTab ? handleBackTab : undefined,
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
    availableTabs,
    focusToothNumber,
    onOrderDentalProcedure: onOrderDentalProcedure ?? handleOpenBuiltInOrderDentalProcedure,
    onVoidDentalCondition,
    onOrderProcedure: onOrderProcedure ?? handleOpenBuiltInOrderProcedure,
    onOrderDiagnostic: onOrderDiagnostic ?? handleOpenBuiltInOrderDiagnostic,
    queueItemId: resolvedQueueItemId,
    allowDuplicateActive: allowDuplicateActive && !materializedQueueItemId,
  };

  return (
    <Modal
      raw
      visible={visible}
      animationType="fade"
      transparent
      onClose={onClose}
    >
      {/* Declarative layout dispatcher: clean, modular, zero spaghetti */}
      {activeLayout === 'split' ? (
        <SplitPaneChartLayout {...layoutProps} />
      ) : activeLayout === 'drawer' ? (
        <SlideOverDrawerChartLayout {...layoutProps} />
      ) : (
        <CenteredModalChartLayout {...layoutProps} />
      )}

      {/* Patient Demographics Edit Modal */}
      {editDemographicsVisible && (
        <EditPatientModal
          visible={editDemographicsVisible}
          patient={displayPatient}
          onClose={() => setEditDemographicsVisible(false)}
          onSaved={handleDemographicsSaved}
        />
      )}

      {/* Standard Permission-Aware Add Test or Procedure Modal */}
      {catalogModalState.visible ? (
        <OrderCatalogSearchModal
          visible={catalogModalState.visible}
          onClose={() => setCatalogModalState((prev) => ({ ...prev, visible: false }))}
          initialCategory={catalogModalState.initialCategory}
          initialToothNumber={catalogModalState.toothNumber}
          initialToothSurface={catalogModalState.toothSurface}
          isYakapEligible={Boolean(
            displayPatient?.philHealthNumber || (displayPatient as any)?.isYakapEligible
          )}
          alreadyOrderedNames={
            (reconciledChart?.proceduresHistory || [])
              .filter((p) => p.status === 'Ordered' || p.status === 'InProgress')
              .map((p) => p.procedureName)
          }
          alreadyOrderedCodes={
            (reconciledChart?.proceduresHistory || [])
              .filter((p) => p.status === 'Ordered' || p.status === 'InProgress')
              .map((p) => p.procedureCode || '')
              .filter(Boolean)
          }
          onSelectOrder={handleSubmitBuiltInCatalogOrder}
        />
      ) : null}
    </Modal>
  );
}
