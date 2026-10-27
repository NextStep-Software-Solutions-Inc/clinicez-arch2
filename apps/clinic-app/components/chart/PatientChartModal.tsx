import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Modal from '../ui/Modal';
import { useClinic } from '../../context/ClinicContext';
import type { ClinicPatient } from '../../services/clinicService';
import EditPatientModal from '../patient/EditPatientModal';
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
  DEFAULT_CHART_LAYOUT,
  getAvailableChartTabs,
} from './types';

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
}: PatientChartModalProps) {
  const { settings } = useClinic();
  const configuredLayout: ChartLayoutMode =
    preferredLayoutProp ||
    ((settings as any)?.preferredChartLayout as ChartLayoutMode) ||
    DEFAULT_CHART_LAYOUT;

  const availableTabs = useMemo(() => {
    if (availableTabsProp) return availableTabsProp;
    const isDentalEnabled = Boolean(
      settings?.enableDentalModule ||
      settings?.specialtyMode === 'Dental' ||
      (patientChart?.dentalTeeth && patientChart.dentalTeeth.length > 0) ||
      (patientChart?.dentalChart?.teeth && patientChart.dentalChart.teeth.length > 0) ||
      focusToothNumber ||
      activeTabProp === 'dental' ||
      initialTab === 'dental'
    );
    return getAvailableChartTabs(isDentalEnabled);
  }, [availableTabsProp, settings?.enableDentalModule, settings?.specialtyMode, patientChart?.dentalTeeth, patientChart?.dentalChart, focusToothNumber, activeTabProp, initialTab]);

  const defaultInitialTab: ChartTab = activeTabProp || (focusToothNumber ? 'dental' : initialTab);
  const [internalTab, setInternalTab] = useState<ChartTab>(defaultInitialTab);
  const [activeLayout, setActiveLayout] = useState<ChartLayoutMode>(configuredLayout);
  const [editDemographicsVisible, setEditDemographicsVisible] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<ClinicPatient | null>(patient);

  const tabVisibleRef = useRef(false);
  const layoutVisibleRef = useRef(false);
  const prevConfiguredLayoutRef = useRef(configuredLayout);

  useEffect(() => {
    setCurrentPatient(patient);
  }, [patient]);

  useEffect(() => {
    if (activeTabProp) {
      setInternalTab(activeTabProp);
    }
  }, [activeTabProp]);

  useEffect(() => {
    if (visible && !tabVisibleRef.current) {
      if (activeTabProp) {
        setInternalTab(activeTabProp);
      } else if (focusToothNumber) {
        setInternalTab('dental');
      } else if (initialTab) {
        setInternalTab(initialTab);
      }
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

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !onRefreshChart) return;
    setIsLocalRefreshing(true);
    try {
      const minDurationPromise = new Promise((resolve) => setTimeout(resolve, 600));
      const res = (onRefreshChart as any)();
      if (Boolean(res) && typeof (res as any)?.then === 'function') {
        await Promise.all([res, minDurationPromise]);
      } else {
        await minDurationPromise;
      }
    } catch {
      // Handled upstream
    } finally {
      setIsLocalRefreshing(false);
    }
  }, [isRefreshing, onRefreshChart]);

  const handleDemographicsSaved = (updated: ClinicPatient) => {
    setCurrentPatient(updated);
    onPatientUpdated?.(updated);
    handleRefresh();
  };

  const displayPatient = currentPatient || patient;
  const activeTab = activeTabProp ?? internalTab;

  const handleTabChange = (tab: ChartTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  if (!visible) {
    return null;
  }

  const layoutProps: ChartLayoutProps = {
    patient: displayPatient,
    patientChart,
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
    onOrderDentalProcedure,
    onVoidDentalCondition,
    onOrderProcedure,
    onOrderDiagnostic,
    queueItemId: queueItemId ?? (patientChart as any)?.queueItemId ?? (displayPatient as any)?.queueItemId ?? null,
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
    </Modal>
  );
}
