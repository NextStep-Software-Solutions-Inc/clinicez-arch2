import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';

// Mock react-native before importing native-ui
const RNMock = {
  View: (props: any) => React.createElement('div', { ...props, 'data-rn': 'View' }),
  Text: (props: any) => React.createElement('span', { ...props, 'data-rn': 'Text' }),
  TouchableOpacity: (props: any) =>
    React.createElement('button', { ...props, 'data-rn': 'TouchableOpacity', onClick: props.onPress }),
  TextInput: (props: any) => React.createElement('input', { ...props, 'data-rn': 'TextInput' }),
  ScrollView: (props: any) => React.createElement('div', { ...props, 'data-rn': 'ScrollView' }),
  ActivityIndicator: (props: any) => React.createElement('div', { ...props, 'data-rn': 'ActivityIndicator' }),
  Modal: (props: any) => React.createElement('div', { ...props, 'data-rn': 'Modal' }),
  StyleSheet: {
    create: (styles: any) => styles
  }
};

mock.module('react-native', () => RNMock);

import { TriageQueueView as WebTriageQueueView } from '../../src/web-ui/TriageQueueView';
let NativeTriageQueueView: any;

beforeAll(async () => {
  const mod = await import('../../src/native-ui/TriageQueueView');
  NativeTriageQueueView = mod.TriageQueueView;
});

import { TriageQueueItem } from '../../src/web-ui/types';
import { createHookHarness, act } from '../react/hook-test-harness';

function findAllElements(element: any, predicate: (el: any) => boolean): any[] {
  const results: any[] = [];
  function search(el: any) {
    if (!el) return;
    if (Array.isArray(el)) {
      el.forEach(search);
      return;
    }
    if (predicate(el)) results.push(el);
    if (el.props && el.props.children) {
      if (Array.isArray(el.props.children)) {
        el.props.children.forEach(search);
      } else {
        search(el.props.children);
      }
    }
  }
  search(element);
  return results;
}

function findElement(element: any, predicate: (el: any) => boolean): any {
  if (!element) return null;
  if (Array.isArray(element)) {
    for (const item of element) {
      const found = findElement(item, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(element)) return element;
  if (element.props && element.props.children !== undefined) {
    return findElement(element.props.children, predicate);
  }
  return null;
}

function getTextContent(element: any): string {
  if (!element) return '';
  if (typeof element === 'string' || typeof element === 'number') {
    return String(element);
  }
  if (Array.isArray(element)) {
    return element.map(getTextContent).join('');
  }
  if (element.props && element.props.children) {
    return getTextContent(element.props.children);
  }
  return '';
}

const mockActiveItems: TriageQueueItem[] = [
  {
    conversationId: 'conv-stat-1',
    requestId: 'req-stat-1',
    patientId: 'pat-1',
    patientNameMasked: 'Juan D***',
    category: 'ChestPain',
    contentText: 'Severe retrosternal chest pain radiating to left arm.',
    priority: 'Emergency',
    status: 'Submitted',
    submittedAtUtc: new Date().toISOString(),
    triageDueAtUtc: new Date(Date.now() + 60000).toISOString(),
    isOffHours: false,
    slaBreached: false,
    isEmergencyConfirmed: true,
    slaTimeRemainingSeconds: 45
  },
  {
    conversationId: 'conv-urgent-2',
    requestId: 'req-urgent-2',
    patientId: 'pat-2',
    patientNameMasked: 'Baby J***',
    category: 'PediatricFever',
    contentText: 'High grade fever 39.5C for 2 days with decreased activity.',
    priority: 'Urgent',
    status: 'Submitted',
    submittedAtUtc: new Date().toISOString(),
    triageDueAtUtc: new Date(Date.now() + 600000).toISOString(),
    isOffHours: false,
    slaBreached: false,
    isEmergencyConfirmed: false,
    slaTimeRemainingSeconds: 600
  },
  {
    conversationId: 'conv-routine-3',
    requestId: 'req-routine-3',
    patientId: 'pat-3',
    patientNameMasked: 'Maria S***',
    category: 'PrescriptionRefill',
    contentText: 'Needs maintenance metformin 500mg refill.',
    priority: 'Routine',
    status: 'Submitted',
    submittedAtUtc: new Date().toISOString(),
    triageDueAtUtc: new Date(Date.now() + 7200000).toISOString(),
    isOffHours: false,
    slaBreached: false,
    isEmergencyConfirmed: false,
    slaTimeRemainingSeconds: 7200
  }
];

describe('Adversarial Stress Test: TriageQueueView State Machine & SLA Parity', () => {
  // =========================================================================
  // State 1: Loading State (isLoading = true)
  // =========================================================================
  describe('State 1: Loading State (isLoading = true)', () => {
    it('Native UI renders exactly 3 skeleton cards matching card layout without spinners', () => {
      const harness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {},
          isLoading: true
        })
      );

      const tree = harness.result.current;
      const allText = getTextContent(tree);
      expect(allText).not.toContain('Loading triage queue...');

      // Look for elements with skeletonButton (each card has 4 skeleton buttons, total 12)
      const skeletonButtons = findAllElements(
        tree,
        (el) =>
          el.props?.style &&
          el.props.style.flexGrow === 1 &&
          el.props.style.minWidth === 80 &&
          el.props.style.minHeight === 44
      );
      expect(skeletonButtons.length).toBe(12); // 3 cards * 4 buttons
      harness.unmount();
    });

    it('Web UI renders 3 skeleton cards in an animate-pulse container with matching 4-button geometry', () => {
      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {},
          isLoading: true
        })
      );

      const tree = harness.result.current;
      // Should have role="status" and aria-label="Loading triage queue"
      const statusContainer = findElement(
        tree,
        (el) => el.props?.role === 'status' && el.props?.['aria-label'] === 'Loading triage queue'
      );
      expect(statusContainer).toBeDefined();
      expect(statusContainer.props.className).toContain('animate-pulse');

      // Verify 4-button geometry per card (3 cards * 4 = 12 button placeholders)
      const buttonPlaceholders = findAllElements(
        tree,
        (el) =>
          typeof el.props?.className === 'string' &&
          el.props.className.includes('flex-1') &&
          el.props.className.includes('min-w-[80px]') &&
          el.props.className.includes('h-[44px]')
      );
      expect(buttonPlaceholders.length).toBe(12);

      // Verify no raw spinner exists
      const rawSpinners = findAllElements(
        tree,
        (el) => typeof el.props?.className === 'string' && el.props.className.includes('animate-spin')
      );
      expect(rawSpinners.length).toBe(0);
      harness.unmount();
    });
  });

  // =========================================================================
  // State 2: Error State (error = 'Network timeout')
  // =========================================================================
  describe('State 2: Error State (error = "Network timeout")', () => {
    it('Native UI renders structured alert container with message and actionable retry CTA', async () => {
      let refreshCalled = false;
      const harness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {
            refreshCalled = true;
          },
          isLoading: false,
          error: 'Network timeout: 504 Gateway Timeout'
        })
      );

      const tree = harness.result.current;
      const allText = getTextContent(tree);
      expect(allText).toContain('Triage Connection Error');
      expect(allText).toContain('Network timeout: 504 Gateway Timeout');
      expect(allText).toContain('Retry Connection');

      // Find retry button
      const retryBtn = findElement(
        tree,
        (el) =>
          typeof el.props?.onPress === 'function' &&
          getTextContent(el).includes('Retry Connection')
      );
      expect(retryBtn).toBeDefined();

      await act(() => {
        retryBtn.props.onPress();
      });
      expect(refreshCalled).toBe(true);
      harness.unmount();
    });

    it('Web UI renders structured alert container with role="alert" and actionable retry CTA', async () => {
      let refreshCalled = false;
      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {
            refreshCalled = true;
          },
          isLoading: false,
          error: 'Network timeout: 504 Gateway Timeout'
        })
      );

      const tree = harness.result.current;
      const alertContainer = findElement(tree, (el) => el.props?.role === 'alert');
      expect(alertContainer).toBeDefined();

      const allText = getTextContent(alertContainer);
      expect(allText).toContain('Triage Connection Error');
      expect(allText).toContain('Network timeout: 504 Gateway Timeout');
      expect(allText).toContain('Retry Connection');

      // Click retry button
      const retryBtn = findElement(
        alertContainer,
        (el) => el.type === 'button' && getTextContent(el).includes('Retry Connection')
      );
      expect(retryBtn).toBeDefined();

      await act(() => {
        retryBtn.props.onClick();
      });
      expect(refreshCalled).toBe(true);
      harness.unmount();
    });
  });

  // =========================================================================
  // State 3: Empty State (items = [])
  // =========================================================================
  describe('State 3: Empty State (items = [])', () => {
    it('Native UI renders check-shield, Queue Clear text, SLA metrics ribbon, and Refresh CTA', async () => {
      let refreshCalled = false;
      const harness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {
            refreshCalled = true;
          },
          isLoading: false,
          error: null
        })
      );

      const tree = harness.result.current;
      const allText = getTextContent(tree);

      // Verify title and subtitle
      expect(allText).toContain('Queue Clear - All caught up!');
      expect(allText).toContain('Inbound patient inquiries from Nextstep OPD will appear here');

      // Verify SLA metrics strip: 0 Pending, 100% SLA Met, < 5m Avg Response
      expect(allText).toContain('0');
      expect(allText).toContain('Pending');
      expect(allText).toContain('100%');
      expect(allText).toContain('SLA Met');
      expect(allText).toContain('< 5m');
      expect(allText).toContain('Avg Response');

      // Verify Refresh CTA button
      const refreshBtn = findElement(
        tree,
        (el) =>
          typeof el.props?.onPress === 'function' &&
          getTextContent(el).includes('Refresh Queue')
      );
      expect(refreshBtn).toBeDefined();

      await act(() => {
        refreshBtn.props.onPress();
      });
      expect(refreshCalled).toBe(true);
      harness.unmount();
    });

    it('Web UI renders SVG check-shield, Queue Clear text, SLA metrics strip, and Refresh CTA', async () => {
      let refreshCalled = false;
      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {
            refreshCalled = true;
          },
          isLoading: false,
          error: null
        })
      );

      const tree = harness.result.current;
      const allText = getTextContent(tree);

      // Verify title and subtitle
      expect(allText).toContain('Queue Clear - All caught up!');
      expect(allText).toContain('Inbound patient inquiries from Nextstep OPD will appear here');

      // Verify SVG check-shield icon
      const svgIcon = findElement(tree, (el) => el.type === 'svg');
      expect(svgIcon).toBeDefined();
      expect(svgIcon.props.xmlns).toBe('http://www.w3.org/2000/svg');

      // Verify SLA metrics: 0 Pending, 100% SLA Met, < 5m Avg Response
      expect(allText).toContain('0');
      expect(allText).toContain('Pending');
      expect(allText).toContain('100%');
      expect(allText).toContain('SLA Met');
      expect(allText).toContain('< 5m');
      expect(allText).toContain('Avg Response');

      // Verify Refresh CTA button
      const refreshBtn = findElement(
        tree,
        (el) => el.type === 'button' && getTextContent(el).includes('Refresh Queue')
      );
      expect(refreshBtn).toBeDefined();

      await act(() => {
        refreshBtn.props.onClick();
      });
      expect(refreshCalled).toBe(true);
      harness.unmount();
    });
  });

  // =========================================================================
  // State 4: Active State (items = [...]) & 4 Disposition Buttons
  // =========================================================================
  describe('State 4: Active State (items = [...]) & 4 Disposition Buttons', () => {
    it('Native UI renders urgency badges, countdown pills, and 1-click Needs Visit disposition', async () => {
      let executedPayload: any = null;
      const harness = createHookHarness(() =>
        NativeTriageQueueView({
          items: mockActiveItems,
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async (p) => {
            executedPayload = p;
          },
          onRefresh: () => {},
          isLoading: false,
          error: null
        })
      );

      const tree = harness.result.current;
      const allText = getTextContent(tree);

      // Verify badges rendered
      expect(allText).toContain('Emergency');
      expect(allText).toContain('Urgent');
      expect(allText).toContain('Routine');
      expect(allText).toContain('Non-Emergency Confirmed');

      // Verify patient names masked
      expect(allText).toContain('Juan D***');
      expect(allText).toContain('Baby J***');
      expect(allText).toContain('Maria S***');

      // Verify SLA countdown strings
      expect(allText).toContain('Target: < 1m remaining'); // 45s
      expect(allText).toContain('Target: 10m remaining'); // 600s
      expect(allText).toContain('Target: 2h remaining'); // 7200s

      // Find "Needs Visit" button for Item 1 and trigger 1-click disposition
      const needsVisitButtons = findAllElements(
        tree,
        (el) =>
          typeof el.props?.onPress === 'function' &&
          getTextContent(el).trim() === 'Needs Visit'
      );
      expect(needsVisitButtons.length).toBe(3);

      await act(() => {
        needsVisitButtons[0].props.onPress();
      });
      expect(executedPayload).toEqual({
        conversationId: 'conv-stat-1',
        disposition: 'NeedsVisit',
        replyText: 'Clinical evaluation required in person at the facility.'
      });
      harness.unmount();
    });

    it('Web UI renders urgency badges, countdown pills, and 1-click Needs Visit disposition', async () => {
      let executedPayload: any = null;
      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: mockActiveItems,
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async (p) => {
            executedPayload = p;
          },
          onRefresh: () => {},
          isLoading: false,
          error: null
        })
      );

      const tree = harness.result.current;
      const allText = getTextContent(tree);

      // Verify badges
      expect(allText).toContain('Emergency');
      expect(allText).toContain('Urgent');
      expect(allText).toContain('Routine');
      expect(allText).toContain('Non-Emergency Confirmed');

      // Verify countdown strings
      expect(allText).toContain('Target: < 1m remaining');
      expect(allText).toContain('Target: 10m remaining');
      expect(allText).toContain('Target: 2h remaining');

      // Find "Needs Visit" button for Item 1
      const needsVisitButtons = findAllElements(
        tree,
        (el) => el.type === 'button' && getTextContent(el).trim() === 'Needs Visit'
      );
      expect(needsVisitButtons.length).toBe(3);

      await act(() => {
        needsVisitButtons[0].props.onClick();
      });
      expect(executedPayload).toEqual({
        conversationId: 'conv-stat-1',
        disposition: 'NeedsVisit',
        replyText: 'Clinical evaluation required in person at the facility.'
      });
      harness.unmount();
    });
  });

  // =========================================================================
  // State 5: SLA Interval Timer (15s updates) & Interval Lifecycle
  // =========================================================================
  describe('State 5: SLA Interval Timer (15s updates) & Interval Lifecycle', () => {
    it('installs 15-second interval timer on mount and cleans up on unmount in both Native and Web', () => {
      let activeIntervals = 0;
      let lastDelay = 0;

      const originalSetInterval = globalThis.setInterval;
      const originalClearInterval = globalThis.clearInterval;

      globalThis.setInterval = ((fn: any, delay: number) => {
        activeIntervals++;
        lastDelay = delay;
        return 999 as any;
      }) as any;

      globalThis.clearInterval = ((id: any) => {
        if (id === 999) activeIntervals--;
      }) as any;

      try {
        // Native mount & unmount
        const nativeHarness = createHookHarness(() =>
          NativeTriageQueueView({
            items: [],
            facilityName: 'ClinicEZ Central',
            onExecuteDisposition: async () => {},
            onRefresh: () => {}
          })
        );
        expect(activeIntervals).toBe(1);
        expect(lastDelay).toBe(15000);
        nativeHarness.unmount();
        expect(activeIntervals).toBe(0);

        // Web mount & unmount
        const webHarness = createHookHarness(() =>
          WebTriageQueueView({
            items: [],
            facilityName: 'ClinicEZ Central',
            onExecuteDisposition: async () => {},
            onRefresh: () => {}
          })
        );
        expect(activeIntervals).toBe(1);
        expect(lastDelay).toBe(15000);
        webHarness.unmount();
        expect(activeIntervals).toBe(0);
      } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
      }
    });
  });

  // =========================================================================
  // Adversarial Scenario 6: SLA Breached Edge Cases & Style Invariants
  // =========================================================================
  describe('Adversarial Scenario 6: SLA Breached Flag & Pill Style Parity', () => {
    it('Web UI honors item.isSlaBreached === true by formatting text and applying red breached pill classes', () => {
      const breachedItem: TriageQueueItem = {
        conversationId: 'conv-breached-1',
        requestId: 'req-breached-1',
        patientId: 'pat-breached',
        patientNameMasked: 'Patient Breached',
        category: 'General',
        contentText: 'Waiting for over 4 hours without response.',
        priority: 'Urgent',
        status: 'Submitted',
        submittedAtUtc: new Date(Date.now() - 14400000).toISOString(),
        triageDueAtUtc: new Date(Date.now() - 3600000).toISOString(),
        isOffHours: false,
        slaBreached: false, // Legacy field is false!
        isSlaBreached: true // New standard field is true!
      };

      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [breachedItem],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );

      const tree = harness.result.current;
      const allText = getTextContent(tree);
      expect(allText).toContain('Response Overdue');

      // Verify that the span for the pill contains the red breached classes
      const slaPillSpan = findElement(
        tree,
        (el) => el.type === 'span' && getTextContent(el) === 'Response Overdue'
      );
      expect(slaPillSpan).toBeDefined();
      expect(slaPillSpan.props.className).toContain('bg-red-100');
      expect(slaPillSpan.props.className).toContain('text-red-800');
      harness.unmount();
    });

    it('Empirical Parity Verified: Native UI SLA pill styling when item.isSlaBreached === true', () => {
      const breachedItem: TriageQueueItem = {
        conversationId: 'conv-breached-2',
        requestId: 'req-breached-2',
        patientId: 'pat-breached-2',
        patientNameMasked: 'Patient Breached 2',
        category: 'General',
        contentText: 'Waiting for over 4 hours without response.',
        priority: 'Urgent',
        status: 'Submitted',
        submittedAtUtc: new Date(Date.now() - 14400000).toISOString(),
        triageDueAtUtc: new Date(Date.now() + 3600000).toISOString(), // Future due date, but isSlaBreached explicitly flagged
        isOffHours: false,
        slaBreached: false, // Legacy field false!
        isSlaBreached: true // New standard field true!
      };

      const harness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [breachedItem],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );

      const tree = harness.result.current;
      const allText = getTextContent(tree);
      expect(allText).toContain('Response Overdue'); // formatSlaCountdown returned Response Overdue

      // Find the Pill View containing text 'Response Overdue'
      const pillView = findElement(
        tree,
        (el) => getTextContent(el) === 'Response Overdue' && Array.isArray(el.props?.style)
      );
      expect(pillView).toBeDefined();

      const pillStyle = pillView.props.style;
      const hasBreachedBg = pillStyle.some((s: any) => s && (s.backgroundColor === '#FEE2E2' || s.backgroundColor === '#FEF2F2'));
      const hasWarningBg = pillStyle.some((s: any) => s && s.backgroundColor === '#FEF3C7');

      // Parity check: Both Web and Native apply red breached background!
      expect(hasBreachedBg).toBe(true);
      expect(hasWarningBg).toBe(false);
      harness.unmount();
    });

    it('Empirical Parity Verified: SLA Pill styling when triageDueAtUtc is expired and slaBreached is omitted', () => {
      const expiredItem: TriageQueueItem = {
        conversationId: 'conv-expired-1',
        requestId: 'req-expired-1',
        patientId: 'pat-expired',
        patientNameMasked: 'Patient Expired',
        category: 'General',
        contentText: 'Waiting past due date.',
        priority: 'Routine',
        status: 'Submitted',
        submittedAtUtc: new Date(Date.now() - 7200000).toISOString(),
        triageDueAtUtc: new Date(Date.now() - 600000).toISOString(), // 10 minutes in the past!
        isOffHours: false,
        slaBreached: false // backend did not set slaBreached: true
        // slaTimeRemainingSeconds is undefined
      };

      // In Web UI: formatSlaCountdown correctly displays 'SLA Breached'
      const webHarness = createHookHarness(() =>
        WebTriageQueueView({
          items: [expiredItem],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );
      const webTree = webHarness.result.current;
      const webPillSpan = findElement(
        webTree,
        (el) => el.type === 'span' && getTextContent(el) === 'Response Overdue'
      );
      expect(webPillSpan).toBeDefined();
      expect(webPillSpan.props.className).toContain('bg-red-100');
      expect(webPillSpan.props.className).not.toContain('bg-amber-100');
      webHarness.unmount();

      // In Native UI:
      const nativeHarness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [expiredItem],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );
      const nativeTree = nativeHarness.result.current;
      const nativePillView = findElement(
        nativeTree,
        (el) => getTextContent(el) === 'Response Overdue' && Array.isArray(el.props?.style)
      );
      expect(nativePillView).toBeDefined();
      const nativeStyle = nativePillView.props.style;
      const hasBreachedBg = nativeStyle.some((s: any) => s && (s.backgroundColor === '#FEE2E2' || s.backgroundColor === '#FEF2F2'));
      const hasWarningBg = nativeStyle.some((s: any) => s && s.backgroundColor === '#FEF3C7');
      expect(hasBreachedBg).toBe(true);
      expect(hasWarningBg).toBe(false);
      nativeHarness.unmount();
    });
  });
});
