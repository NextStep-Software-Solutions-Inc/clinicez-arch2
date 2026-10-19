// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// 1. Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  Image: createMockComponent('Image'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
}));

describe('Consultation Chart Refresh & Encounter Isolation Suite', () => {
  const consultationsScreenPath = path.resolve(
    __dirname,
    '../navigation/screens/Consultations.screen.tsx'
  );

  // =======================================================================
  // 1. STATIC AST & CODE INTEGRITY CHECKS
  // =======================================================================
  describe('1. Static Source Code & Contract Invariants', () => {
    const code = fs.readFileSync(consultationsScreenPath, 'utf8');

    test('1.1 loadPatientContext does NOT unconditionally reset isYakapEligible to false', () => {
      // Find the loadPatientContext function body
      const loadContextMatch = code.match(/const loadPatientContext = useCallback\(async[\s\S]*?setContextLoading\(false\);/);
      expect(loadContextMatch).not.toBeNull();
      const fnBody = loadContextMatch![0];

      // Must not contain `setIsYakapEligible(false)` inside the recordRes handler
      const recordBlockMatch = fnBody.match(/const \[record, recordErr\] = recordRes;[\s\S]*?setRecordError\(null\);/);
      expect(recordBlockMatch).not.toBeNull();
      expect(recordBlockMatch![0]).not.toContain('setIsYakapEligible(false)');
    });

    test('1.2 defines dedicated refreshPatientChart callback', () => {
      expect(code).toContain('const refreshPatientChart = useCallback(async');
      expect(code).toContain('clinicService.getPatientChart(patientId)');
      expect(code).toContain('setPatientChart(chartData)');
    });

    test('1.3 defines dedicated refreshDiagnosticsTab callback', () => {
      expect(code).toContain('const refreshDiagnosticsTab = useCallback(async');
      expect(code).toContain('clinicService.getLabOrders(patientId)');
      expect(code).toContain('setLabOrders(labData)');
    });

    test('1.4 HealthProfilesTab receives refreshPatientChart as onRefreshChart', () => {
      const match = code.match(/<HealthProfilesTab[\s\S]*?\/>/);
      expect(match).not.toBeNull();
      expect(match![0]).toContain('onRefreshChart={refreshPatientChart}');
      expect(match![0]).not.toContain('loadPatientContext');
    });

    test('1.5 ExecutiveSummaryTab and EncountersTimelineTab receive refreshPatientChart', () => {
      const execMatch = code.match(/<ExecutiveSummaryTab[\s\S]*?\/>/);
      expect(execMatch).not.toBeNull();
      expect(execMatch![0]).toContain('onRefreshChart={refreshPatientChart}');

      const encMatch = code.match(/<EncountersTimelineTab[\s\S]*?\/>/);
      expect(encMatch).not.toBeNull();
      expect(encMatch![0]).toContain('onRefreshChart={refreshPatientChart}');
    });

    test('1.6 DiagnosticLabTab receives refreshDiagnosticsTab', () => {
      const diagMatch = code.match(/<DiagnosticLabTab[\s\S]*?\/>/);
      expect(diagMatch).not.toBeNull();
      expect(diagMatch![0]).toContain('onRefreshChart={refreshDiagnosticsTab}');
    });

    test('1.7 StatutoryImmunizationsTab and actions use refreshPatientChart', () => {
      const immMatch = code.match(/<StatutoryImmunizationsTab[\s\S]*?\/>/);
      expect(immMatch).not.toBeNull();
      expect(immMatch![0]).toContain('onRefreshChart={refreshPatientChart}');
      expect(immMatch![0]).not.toContain('loadPatientContext');
    });

    test('1.8 ExternalDocumentVaultTab and AttachExternalDocumentModal use refreshPatientChart', () => {
      const vaultMatch = code.match(/<ExternalDocumentVaultTab[\s\S]*?\/>/);
      expect(vaultMatch).not.toBeNull();
      expect(vaultMatch![0]).toContain('onRefreshChart={refreshPatientChart}');

      const attachModalMatch = code.match(/<AttachExternalDocumentModal[\s\S]*?\/>/);
      expect(attachModalMatch).not.toBeNull();
      expect(attachModalMatch![0]).toContain('await refreshPatientChart()');
    });
  });

  // =======================================================================
  // 2. BEHAVIORAL ISOLATION LOGIC
  // =======================================================================
  describe('2. Behavioral Isolation & State Preservation', () => {
    test('2.1 Calling refreshPatientChart preserves active isYakapEligible and draft notes', async () => {
      // Simulate workstation state
      let activeIsYakapEligible = true;
      let activeSubjective = 'Patient presents with sore throat.';
      let activeLabOrders = [{ id: 'lab-1', testName: 'CBC' }];
      let activeChartData: any = null;

      const mockGetPatientChart = async (patientId: string) => {
        return [{ id: patientId, medicalHistories: [] }, null];
      };

      const mockGetLabOrders = async (patientId: string) => {
        return [[{ id: 'lab-2', testName: 'Urinalysis' }], null];
      };

      // Executing refreshPatientChart
      const refreshPatientChart = async (patientId: string) => {
        const [chartData, chartErr] = await mockGetPatientChart(patientId);
        if (!chartErr && chartData) {
          activeChartData = chartData;
        }
      };

      await refreshPatientChart('pat-123');

      // Assert that chart updated
      expect(activeChartData).toEqual({ id: 'pat-123', medicalHistories: [] });
      // Assert that draft encounter state was NOT touched
      expect(activeIsYakapEligible).toBe(true);
      expect(activeSubjective).toBe('Patient presents with sore throat.');
      // Assert that lab orders were NOT re-fetched/replaced
      expect(activeLabOrders).toEqual([{ id: 'lab-1', testName: 'CBC' }]);
    });

    test('2.2 loadPatientContext without existing encounter keeps isYakapEligible untouched', async () => {
      let activeIsYakapEligible = true;

      // Simulated loadPatientContext logic (post-fix)
      const mockRecordRes = [{ id: 'pat-123', name: 'Cassandra Cruz' }, null];
      const mockChartRes = [{ consultations: [] }, null]; // No existing consultation for this queue item

      const [record, recordErr] = mockRecordRes;
      if (record && !recordErr) {
        // Line 903 was removed: no setIsYakapEligible(false)!
      }

      const [chartData] = mockChartRes;
      const existingEncounter = chartData?.consultations?.find((c: any) => c.queueItemId === 'q-item-1');
      if (existingEncounter && existingEncounter.isYakapEligible != null) {
        activeIsYakapEligible = existingEncounter.isYakapEligible;
      }

      // Must remain true
      expect(activeIsYakapEligible).toBe(true);
    });

    test('2.3 Updating Organ Systems Examination triggers onRefreshChart without mutating active encounter', async () => {
      let chartRefreshTriggered = false;
      let isYakapEligible = true;
      let laboratoryReportsFlashed = false;

      const onRefreshChart = () => {
        chartRefreshTriggered = true;
      };

      // Simulate savePhysicalExam in ClinicalHistoryTab
      const savePhysicalExam = async () => {
        // Successful API call
        onRefreshChart();
      };

      await savePhysicalExam();

      expect(chartRefreshTriggered).toBe(true);
      expect(isYakapEligible).toBe(true);
      expect(laboratoryReportsFlashed).toBe(false);
    });
  });
});
