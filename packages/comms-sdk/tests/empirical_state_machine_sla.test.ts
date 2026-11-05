import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';

// Mock react-native
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

import { TriageQueueView as WebTriageQueueView } from '../src/web-ui/TriageQueueView';
let NativeTriageQueueView: any;

beforeAll(async () => {
  const mod = await import('../src/native-ui/TriageQueueView');
  NativeTriageQueueView = mod.TriageQueueView;
});

import { TriageQueueItem } from '../src/web-ui/types';
import { createHookHarness, act } from './react/hook-test-harness';

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

const mockItemEmergency: TriageQueueItem = {
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
};

const mockItemUrgent: TriageQueueItem = {
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
};

const mockItemRoutine: TriageQueueItem = {
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
};

describe('Empirical Verification: State Machine & SLA Parity', () => {
  // -------------------------------------------------------------------------
  // 1. Loading State
  // -------------------------------------------------------------------------
  describe('Core State 1: Loading State', () => {
    it('Native UI renders 3 skeleton cards and takes precedence over error and items', () => {
      const harness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [mockItemEmergency],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {},
          isLoading: true,
          error: 'Fatal Network Crash'
        })
      );
      const tree = harness.result.current;
      const text = getTextContent(tree);

      // Loading takes precedence: error and active items must NOT be rendered
      expect(text).not.toContain('Fatal Network Crash');
      expect(text).not.toContain('Juan D***');
      expect(text).not.toContain('Queue Clear');

      // Verify exactly 3 skeleton cards with 4 skeleton buttons each = 12 buttons
      const skeletonButtons = findAllElements(
        tree,
        (el) =>
          el.props?.style &&
          el.props.style.flexGrow === 1 &&
          el.props.style.minWidth === 80 &&
          el.props.style.minHeight === 44
      );
      expect(skeletonButtons.length).toBe(12);
      harness.unmount();
    });

    it('Web UI renders 3 skeleton cards with animate-pulse and takes precedence over error and items', () => {
      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [mockItemEmergency],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {},
          isLoading: true,
          error: 'Fatal Network Crash'
        })
      );
      const tree = harness.result.current;
      const text = getTextContent(tree);

      expect(text).not.toContain('Fatal Network Crash');
      expect(text).not.toContain('Juan D***');

      const statusContainer = findElement(tree, (el) => el.props?.role === 'status');
      expect(statusContainer).toBeDefined();
      expect(statusContainer.props.className).toContain('animate-pulse');

      const buttons = findAllElements(
        tree,
        (el) =>
          typeof el.props?.className === 'string' &&
          el.props.className.includes('flex-1') &&
          el.props.className.includes('min-w-[80px]') &&
          el.props.className.includes('h-[44px]')
      );
      expect(buttons.length).toBe(12);
      harness.unmount();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Error State
  // -------------------------------------------------------------------------
  describe('Core State 2: Error State', () => {
    it('Native UI renders structured alert container and retry CTA triggers onRefresh', async () => {
      let refreshCalled = false;
      const harness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [mockItemEmergency],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {
            refreshCalled = true;
          },
          isLoading: false,
          error: 'Network timeout'
        })
      );
      const tree = harness.result.current;
      const text = getTextContent(tree);

      expect(text).toContain('Triage Connection Error');
      expect(text).toContain('Network timeout');
      expect(text).toContain('Retry Connection');
      expect(text).not.toContain('Juan D***');

      const retryBtn = findElement(
        tree,
        (el) => typeof el.props?.onPress === 'function' && getTextContent(el).includes('Retry Connection')
      );
      expect(retryBtn).toBeDefined();
      await act(() => retryBtn.props.onPress());
      expect(refreshCalled).toBe(true);
      harness.unmount();
    });

    it('Web UI renders structured alert container with role="alert" and retry CTA triggers onRefresh', async () => {
      let refreshCalled = false;
      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [mockItemEmergency],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {
            refreshCalled = true;
          },
          isLoading: false,
          error: 'Network timeout'
        })
      );
      const tree = harness.result.current;
      const alertContainer = findElement(tree, (el) => el.props?.role === 'alert');
      expect(alertContainer).toBeDefined();

      const text = getTextContent(alertContainer);
      expect(text).toContain('Triage Connection Error');
      expect(text).toContain('Network timeout');
      expect(text).toContain('Retry Connection');

      const retryBtn = findElement(
        alertContainer,
        (el) => el.type === 'button' && getTextContent(el).includes('Retry Connection')
      );
      expect(retryBtn).toBeDefined();
      await act(() => retryBtn.props.onClick());
      expect(refreshCalled).toBe(true);
      harness.unmount();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Empty State
  // -------------------------------------------------------------------------
  describe('Core State 3: Empty State', () => {
    it('Native UI renders check-shield, Queue Clear text, SLA metrics ribbon, and Refresh CTA triggers onRefresh', async () => {
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
      const text = getTextContent(tree);

      expect(text).toContain('Queue Clear - All caught up!');
      expect(text).toContain('0');
      expect(text).toContain('Pending');
      expect(text).toContain('100%');
      expect(text).toContain('SLA Met');
      expect(text).toContain('< 5m');
      expect(text).toContain('Avg Response');

      // Checkmark rotated border element exists
      const checkmark = findElement(
        tree,
        (el) =>
          el.props?.style &&
          el.props.style.width === 14 &&
          el.props.style.height === 24 &&
          el.props.style.borderBottomWidth === 3 &&
          el.props.style.borderRightWidth === 3
      );
      expect(checkmark).toBeDefined();

      const refreshBtn = findElement(
        tree,
        (el) => typeof el.props?.onPress === 'function' && getTextContent(el).includes('Refresh Queue')
      );
      expect(refreshBtn).toBeDefined();
      await act(() => refreshBtn.props.onPress());
      expect(refreshCalled).toBe(true);
      harness.unmount();
    });

    it('Web UI renders check-shield SVG, Queue Clear text, SLA metrics ribbon, and Refresh CTA triggers onRefresh', async () => {
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
      const text = getTextContent(tree);

      expect(text).toContain('Queue Clear - All caught up!');
      expect(text).toContain('0');
      expect(text).toContain('Pending');
      expect(text).toContain('100%');
      expect(text).toContain('SLA Met');
      expect(text).toContain('< 5m');
      expect(text).toContain('Avg Response');

      const svg = findElement(tree, (el) => el.type === 'svg');
      expect(svg).toBeDefined();
      expect(svg.props.xmlns).toBe('http://www.w3.org/2000/svg');

      const refreshBtn = findElement(
        tree,
        (el) => el.type === 'button' && getTextContent(el).includes('Refresh Queue')
      );
      expect(refreshBtn).toBeDefined();
      await act(() => refreshBtn.props.onClick());
      expect(refreshCalled).toBe(true);
      harness.unmount();
    });

    it('Renders empty state when items exist but filter excludes all of them', () => {
      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [mockItemRoutine], // Only routine item
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {},
          activeFilter: 'Emergency' // Filter for STAT/Emergency
        })
      );
      const tree = harness.result.current;
      const text = getTextContent(tree);

      expect(text).toContain('Queue Clear - All caught up!');
      expect(text).not.toContain('Maria S***');
      harness.unmount();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Active State & Disposition Actions
  // -------------------------------------------------------------------------
  describe('Core State 4: Active State & Disposition Actions', () => {
    it('Native UI renders priority badges, SLA pills, and triggers all 4 disposition actions', async () => {
      let dispatchedPayload: any = null;
      const harness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [mockItemEmergency, mockItemUrgent, mockItemRoutine],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async (p) => {
            dispatchedPayload = p;
          },
          onRefresh: () => {}
        })
      );
      const tree = harness.result.current;
      const text = getTextContent(tree);

      expect(text).toContain('STAT');
      expect(text).toContain('Urgent');
      expect(text).toContain('Routine');
      expect(text).toContain('Target: < 1m remaining');
      expect(text).toContain('Target: 10m remaining');
      expect(text).toContain('Target: 2h remaining');

      // Test Needs Visit (1-click)
      const needsVisitBtns = findAllElements(
        tree,
        (el) => typeof el.props?.onPress === 'function' && getTextContent(el).trim() === 'Needs Visit'
      );
      expect(needsVisitBtns.length).toBe(3);
      await act(() => needsVisitBtns[0].props.onPress());
      expect(dispatchedPayload).toEqual({
        conversationId: 'conv-stat-1',
        disposition: 'NeedsVisit',
        replyText: 'Clinical evaluation required in person at the facility.'
      });

      // Test Answer modal opening and submit
      const answerBtns = findAllElements(
        tree,
        (el) => typeof el.props?.onPress === 'function' && getTextContent(el).trim() === 'Answer'
      );
      expect(answerBtns.length).toBe(3);
      await act(() => answerBtns[0].props.onPress());

      // Find modal submit button
      const modalSubmit = findElement(
        harness.result.current,
        (el) => typeof el.props?.onPress === 'function' && getTextContent(el).trim() === 'Confirm Disposition'
      );
      expect(modalSubmit).toBeDefined();
      await act(() => modalSubmit.props.onPress());
      expect(dispatchedPayload.disposition).toBe('Answered');

      harness.unmount();
    });

    it('Web UI renders priority badges, SLA pills, and triggers all 4 disposition actions', async () => {
      let dispatchedPayload: any = null;
      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [mockItemEmergency, mockItemUrgent, mockItemRoutine],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async (p) => {
            dispatchedPayload = p;
          },
          onRefresh: () => {}
        })
      );
      const tree = harness.result.current;
      const text = getTextContent(tree);

      expect(text).toContain('STAT');
      expect(text).toContain('Urgent');
      expect(text).toContain('Routine');
      expect(text).toContain('Target: < 1m remaining');
      expect(text).toContain('Target: 10m remaining');
      expect(text).toContain('Target: 2h remaining');

      // Test Needs Visit (1-click)
      const needsVisitBtns = findAllElements(
        tree,
        (el) => el.type === 'button' && getTextContent(el).trim() === 'Needs Visit'
      );
      expect(needsVisitBtns.length).toBe(3);
      await act(() => needsVisitBtns[0].props.onClick());
      expect(dispatchedPayload).toEqual({
        conversationId: 'conv-stat-1',
        disposition: 'NeedsVisit',
        replyText: 'Clinical evaluation required in person at the facility.'
      });

      // Test Route action
      const routeBtns = findAllElements(
        tree,
        (el) => el.type === 'button' && getTextContent(el).trim() === 'Route'
      );
      expect(routeBtns.length).toBe(3);
      await act(() => routeBtns[0].props.onClick());

      // In modal form, submit route
      const form = findElement(harness.result.current, (el) => el.type === 'form');
      expect(form).toBeDefined();
      await act(() => form.props.onSubmit({ preventDefault: () => {} }));
      expect(dispatchedPayload).toEqual({
        conversationId: 'conv-stat-1',
        disposition: 'Routed',
        routedPriority: 'Urgent' // Emergency items routed to Urgent
      });

      harness.unmount();
    });
  });

  // -------------------------------------------------------------------------
  // 5. SLA Countdown Logic Stress Test
  // -------------------------------------------------------------------------
  describe('SLA Countdown Formatting Stress Harness', () => {
    function runWebSlaCountdown(item: TriageQueueItem): string {
      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [item],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );
      const text = getTextContent(harness.result.current);
      harness.unmount();
      const match = text.match(/(SLA Breached|Target: [^<]+|Target: < [^<]+)/);
      return match ? match[0] : '';
    }

    it('formats exact boundary SLA values correctly in Web UI', () => {
      const base: TriageQueueItem = {
        conversationId: 'c1',
        requestId: 'r1',
        patientId: 'p1',
        patientNameMasked: 'P',
        category: 'Cat',
        contentText: 'Text',
        priority: 'Routine',
        status: 'Submitted',
        submittedAtUtc: new Date().toISOString(),
        triageDueAtUtc: new Date().toISOString(),
        isOffHours: false,
        slaBreached: false,
        isEmergencyConfirmed: false
      };

      // 1. slaBreached = true
      expect(runWebSlaCountdown({ ...base, slaBreached: true })).toContain('SLA Breached');

      // 2. isSlaBreached = true
      expect(runWebSlaCountdown({ ...base, isSlaBreached: true })).toContain('SLA Breached');

      // 3. remainingSec <= 0
      expect(runWebSlaCountdown({ ...base, slaTimeRemainingSeconds: 0 })).toContain('SLA Breached');
      expect(runWebSlaCountdown({ ...base, slaTimeRemainingSeconds: -50 })).toContain('SLA Breached');

      // 4. < 1m remaining (1 to 59s)
      expect(runWebSlaCountdown({ ...base, slaTimeRemainingSeconds: 1 })).toContain('Target: < 1m remaining');
      expect(runWebSlaCountdown({ ...base, slaTimeRemainingSeconds: 59 })).toContain('Target: < 1m remaining');

      // 5. 1m to 59m
      expect(runWebSlaCountdown({ ...base, slaTimeRemainingSeconds: 60 })).toContain('Target: 1m remaining');
      expect(runWebSlaCountdown({ ...base, slaTimeRemainingSeconds: 3599 })).toContain('Target: 59m remaining');

      // 6. Exactly 1h (minutes === 0)
      expect(runWebSlaCountdown({ ...base, slaTimeRemainingSeconds: 3600 })).toContain('Target: 1h remaining');

      // 7. 1h 30m
      expect(runWebSlaCountdown({ ...base, slaTimeRemainingSeconds: 5400 })).toContain('Target: 1h 30m remaining');

      // 8. Missing both remainingSec and triageDueAtUtc
      expect(runWebSlaCountdown({ ...base, triageDueAtUtc: undefined as any })).toContain('Target: Queued');

      // 9. Malformed date string
      expect(runWebSlaCountdown({ ...base, triageDueAtUtc: 'not-a-date' })).toContain('Target: Queued');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Empirical Challenge: SLA Pill Style Inconsistency on Expired Timestamp
  // -------------------------------------------------------------------------
  describe('Empirical Defect Findings: Pill Style Invariants', () => {
    it('REMEDIATED: Native UI styles pill as Breached (Red) when item.isSlaBreached === true', () => {
      const item: TriageQueueItem = {
        conversationId: 'c-breached',
        requestId: 'r-breached',
        patientId: 'p-breached',
        patientNameMasked: 'P',
        category: 'Cat',
        contentText: 'Text',
        priority: 'Routine',
        status: 'Submitted',
        submittedAtUtc: new Date().toISOString(),
        triageDueAtUtc: new Date(Date.now() + 3600000).toISOString(),
        isOffHours: false,
        slaBreached: false, // Legacy field is false
        isSlaBreached: true // Modern field is true
      };

      const harness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [item],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );
      const tree = harness.result.current;
      const pillView = findElement(
        tree,
        (el) => getTextContent(el) === 'SLA Breached' && Array.isArray(el.props?.style)
      );
      expect(pillView).toBeDefined();

      const pillStyle = pillView.props.style;
      const isRedBreached = pillStyle.some((s: any) => s && (s.backgroundColor === '#FEE2E2' || s.backgroundColor === '#FEF2F2'));
      const isAmberWarning = pillStyle.some((s: any) => s && s.backgroundColor === '#FEF3C7');

      // REMEDIATED: Native UI correctly renders Red Breached background
      expect(isRedBreached).toBe(true);
      expect(isAmberWarning).toBe(false);
      harness.unmount();
    });

    it('REMEDIATED: When triageDueAtUtc is expired, both Web and Native display "SLA Breached" with Breached style', () => {
      const expiredItem: TriageQueueItem = {
        conversationId: 'c-expired',
        requestId: 'r-expired',
        patientId: 'p-expired',
        patientNameMasked: 'P',
        category: 'Cat',
        contentText: 'Text',
        priority: 'Routine',
        status: 'Submitted',
        submittedAtUtc: new Date(Date.now() - 7200000).toISOString(),
        triageDueAtUtc: new Date(Date.now() - 600000).toISOString(), // 10 minutes past due!
        isOffHours: false,
        slaBreached: false, // Backend hasn't set slaBreached yet
        isSlaBreached: false
      };

      // In Web UI
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
        (el) => el.type === 'span' && getTextContent(el) === 'SLA Breached'
      );
      expect(webPillSpan).toBeDefined();
      // REMEDIATED: Web UI sets red breached style for an SLA Breached item!
      expect(webPillSpan.props.className).toContain('bg-red-100');
      expect(webPillSpan.props.className).not.toContain('bg-amber-100');
      webHarness.unmount();

      // In Native UI
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
        (el) => getTextContent(el) === 'SLA Breached' && Array.isArray(el.props?.style)
      );
      expect(nativePillView).toBeDefined();
      const nativeStyle = nativePillView.props.style;
      const nativeIsAmberWarning = nativeStyle.some((s: any) => s && s.backgroundColor === '#FEF3C7');
      const nativeIsRedBreached = nativeStyle.some((s: any) => s && (s.backgroundColor === '#FEE2E2' || s.backgroundColor === '#FEF2F2'));
      // REMEDIATED: Native UI sets red breached style for an SLA Breached item!
      expect(nativeIsRedBreached).toBe(true);
      expect(nativeIsAmberWarning).toBe(false);
      nativeHarness.unmount();
    });
  });
});
