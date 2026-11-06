import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';
import { lightColors } from '@clinicez/design-tokens';

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

import {
  TriageQueueView as WebTriageQueueView,
  getSlaTier as webGetSlaTier,
  isItemSlaBreached as webIsItemSlaBreached
} from '../src/web-ui/TriageQueueView';
import { TriageQueueItem } from '../src/web-ui/types';
import { createHookHarness, act } from './react/hook-test-harness';
import { CommsContext, InternalCommsContextValue } from '../src/react/CommsContext';
import { useTriageQueue } from '../src/react/hooks/useTriageQueue';
import { useComms } from '../src/react/hooks/useComms';
import { OptimisticStore } from '../src/react/internal/OptimisticStore';
import { SubscriptionTracker } from '../src/react/internal/SubscriptionTracker';
import { MockCommsClient } from './mocks/MockCommsClient';

let NativeTriageQueueView: any;
let nativeGetSlaTier: any;
let nativeIsItemSlaBreached: any;

beforeAll(async () => {
  const mod = await import('../src/native-ui/TriageQueueView');
  NativeTriageQueueView = mod.TriageQueueView;
  nativeGetSlaTier = mod.getSlaTier;
  nativeIsItemSlaBreached = mod.isItemSlaBreached;
});

function createMockQueueItem(overrides: Partial<TriageQueueItem> = {}): TriageQueueItem {
  return {
    conversationId: 'conv-test-1',
    requestId: 'req-test-1',
    patientId: 'pat-test-1',
    patientNameMasked: 'Patient Test***',
    category: 'General',
    contentText: 'Adversarial empirical test content',
    priority: 'Routine',
    status: 'Submitted',
    submittedAtUtc: new Date().toISOString(),
    triageDueAtUtc: new Date().toISOString(),
    isOffHours: false,
    slaBreached: false,
    isEmergencyConfirmed: false,
    ...overrides
  };
}

function getTextContent(element: any): string {
  if (!element) return '';
  if (typeof element === 'string') return element;
  if (typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(getTextContent).join(' ');
  if (element.props?.children) return getTextContent(element.props.children);
  return '';
}

function findElement(element: any, predicate: (el: any) => boolean): any {
  if (!element) return null;
  if (predicate(element)) return element;
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  if (element.props?.children) {
    if (Array.isArray(element.props.children)) {
      for (const child of element.props.children) {
        const found = findElement(child, predicate);
        if (found) return found;
      }
    } else {
      return findElement(element.props.children, predicate);
    }
  }
  return null;
}

function findAllElements(element: any, predicate: (el: any) => boolean): any[] {
  const results: any[] = [];
  function search(el: any) {
    if (!el) return;
    if (Array.isArray(el)) {
      el.forEach(search);
      return;
    }
    if (predicate(el)) results.push(el);
    if (el.props?.children) {
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

function createMockContext(
  client = new MockCommsClient(),
  store = new OptimisticStore(),
  baseUrl = 'https://comms.local'
): InternalCommsContextValue {
  return {
    client,
    connectionState: {
      status: 'connected',
      reconnectAttempt: 0,
      lastConnectedAt: new Date(),
      lastDisconnectedAt: null,
      error: null
    },
    activeTicket: { ticket: 'emp-ticket-123', expiresAtUtc: new Date().toISOString() },
    tenantId: 'tenant-test',
    facilityId: 'facility-test',
    staffId: 'nurse-emp-1',
    staffDisplayName: 'Nurse Emp',
    baseUrl,
    connect: async () => {},
    disconnect: async () => {
      await client.disconnect();
    },
    reconnect: async () => {
      await client.disconnect();
      await client.connect();
    },
    refreshTicket: async () => ({ ticket: 'emp-ticket-refreshed', expiresAtUtc: new Date().toISOString() }),
    store,
    subscriptionTracker: new SubscriptionTracker()
  };
}

describe('Challenger 1: Empirical Verification & Stress Test Suite', () => {
  // =========================================================================
  // Dimension 1: 3-tier SLA countdown timer math and styling boundaries
  // =========================================================================
  describe('Dimension 1: SLA Countdown Math & Styling Boundaries', () => {
    describe('SLA Tier Classification Math', () => {
      it('> 15m (901s, 1800s, 3600s): strictly classifies as onSchedule (green)', () => {
        const item901 = createMockQueueItem({ slaTimeRemainingSeconds: 901 });
        const item1800 = createMockQueueItem({ slaTimeRemainingSeconds: 1800 });
        const item3600 = createMockQueueItem({ slaTimeRemainingSeconds: 3600 });

        expect(nativeGetSlaTier(item901)).toBe('onSchedule');
        expect(webGetSlaTier(item901)).toBe('onSchedule');

        expect(nativeGetSlaTier(item1800)).toBe('onSchedule');
        expect(webGetSlaTier(item1800)).toBe('onSchedule');

        expect(nativeGetSlaTier(item3600)).toBe('onSchedule');
        expect(webGetSlaTier(item3600)).toBe('onSchedule');
      });

      it('<= 15m (900s, 899s, 1s): evaluates warning tier boundary math', () => {
        const item899 = createMockQueueItem({ slaTimeRemainingSeconds: 899 });
        const item1 = createMockQueueItem({ slaTimeRemainingSeconds: 1 });

        // 899s and 1s should classify as warning
        expect(nativeGetSlaTier(item899)).toBe('warning');
        expect(webGetSlaTier(item899)).toBe('warning');
        expect(nativeGetSlaTier(item1)).toBe('warning');
        expect(webGetSlaTier(item1)).toBe('warning');

        // Boundary test: exactly 900 seconds (15 minutes) maps to warning (amber)
        const item900 = createMockQueueItem({ slaTimeRemainingSeconds: 900 });
        const nativeTier900 = nativeGetSlaTier(item900);
        const webTier900 = webGetSlaTier(item900);

        expect(nativeTier900).toBe('warning');
        expect(webTier900).toBe('warning');
      });

      it('null/undefined remaining seconds strictly classifies as onSchedule (neutral/queued)', () => {
        const itemNull = createMockQueueItem({ slaTimeRemainingSeconds: null as any, triageDueAtUtc: undefined });
        const itemUndefined = createMockQueueItem({ slaTimeRemainingSeconds: undefined, triageDueAtUtc: undefined });

        expect(nativeGetSlaTier(itemNull)).toBe('onSchedule');
        expect(webGetSlaTier(itemNull)).toBe('onSchedule');
        expect(nativeGetSlaTier(itemUndefined)).toBe('onSchedule');
        expect(webGetSlaTier(itemUndefined)).toBe('onSchedule');
      });

      it('<= 0s (0s, -1s, -120s, -9999s): strictly classifies as breached (red) & displays "Response Overdue"', () => {
        const testCases = [0, -1, -120, -9999];
        for (const sec of testCases) {
          const item = createMockQueueItem({ slaTimeRemainingSeconds: sec });
          expect(nativeGetSlaTier(item)).toBe('breached');
          expect(webGetSlaTier(item)).toBe('breached');
          expect(nativeIsItemSlaBreached(item)).toBe(true);
          expect(webIsItemSlaBreached(item)).toBe(true);
        }
      });
    });

    describe('SLA UI Styling & Display Invariants', () => {
      it('<= 0s renders red style and "Response Overdue" with NO "SLA Breached" jargon in Native & Web', () => {
        const item0 = createMockQueueItem({ slaTimeRemainingSeconds: 0 });

        // Native UI
        const nativeHarness = createHookHarness(() =>
          NativeTriageQueueView({
            items: [item0],
            facilityName: 'ClinicEZ Central',
            onExecuteDisposition: async () => {},
            onRefresh: () => {}
          })
        );
        const nativeText = getTextContent(nativeHarness.result.current);
        expect(nativeText).toContain('Response Overdue');
        expect(nativeText).not.toContain('SLA Breached');

        const nativePill = findElement(
          nativeHarness.result.current,
          (el) =>
            el.props?.['data-rn'] === 'View' &&
            Array.isArray(el.props?.style) &&
            el.props.style.some((s: any) => s && s.backgroundColor === lightColors.emergencyBg)
        );
        expect(nativePill).toBeDefined();
        nativeHarness.unmount();

        // Web UI
        const webHarness = createHookHarness(() =>
          WebTriageQueueView({
            items: [item0],
            facilityName: 'ClinicEZ Central',
            onExecuteDisposition: async () => {},
            onRefresh: () => {}
          })
        );
        const webText = getTextContent(webHarness.result.current);
        expect(webText).toContain('Response Overdue');
        expect(webText).not.toContain('SLA Breached');

        const webPill = findElement(
          webHarness.result.current,
          (el) => el.type === 'span' && getTextContent(el) === 'Response Overdue'
        );
        expect(webPill).toBeDefined();
        expect(webPill.props.className).toContain('bg-red-100');
        webHarness.unmount();
      });

      it('> 15m (901s) renders green style in Native (successBg) and Web (bg-emerald-100)', () => {
        const item901 = createMockQueueItem({ slaTimeRemainingSeconds: 901 });

        // Native UI
        const nativeHarness = createHookHarness(() =>
          NativeTriageQueueView({
            items: [item901],
            facilityName: 'ClinicEZ Central',
            onExecuteDisposition: async () => {},
            onRefresh: () => {}
          })
        );
        const nativePill = findElement(
          nativeHarness.result.current,
          (el) =>
            el.props?.['data-rn'] === 'View' &&
            Array.isArray(el.props?.style) &&
            el.props.style.some((s: any) => s && s.backgroundColor === lightColors.successBg)
        );
        expect(nativePill).toBeDefined();
        nativeHarness.unmount();

        // Web UI
        const webHarness = createHookHarness(() =>
          WebTriageQueueView({
            items: [item901],
            facilityName: 'ClinicEZ Central',
            onExecuteDisposition: async () => {},
            onRefresh: () => {}
          })
        );
        const webPill = findElement(
          webHarness.result.current,
          (el) => el.type === 'span' && getTextContent(el).includes('Target:')
        );
        expect(webPill).toBeDefined();
        expect(webPill.props.className).toContain('bg-emerald-100');
        webHarness.unmount();
      });

      it('<= 15m (899s) renders amber style in Native (warningBg) and Web (bg-amber-100)', () => {
        const item899 = createMockQueueItem({ slaTimeRemainingSeconds: 899 });

        // 899s Native UI
        const nativeHarness899 = createHookHarness(() =>
          NativeTriageQueueView({
            items: [item899],
            facilityName: 'ClinicEZ Central',
            onExecuteDisposition: async () => {},
            onRefresh: () => {}
          })
        );
        const nativePill899 = findElement(
          nativeHarness899.result.current,
          (el) =>
            el.props?.['data-rn'] === 'View' &&
            Array.isArray(el.props?.style) &&
            el.props.style.some((s: any) => s && s.backgroundColor === lightColors.warningBg)
        );
        expect(nativePill899).toBeDefined();
        nativeHarness899.unmount();

        // 899s Web UI
        const webHarness899 = createHookHarness(() =>
          WebTriageQueueView({
            items: [item899],
            facilityName: 'ClinicEZ Central',
            onExecuteDisposition: async () => {},
            onRefresh: () => {}
          })
        );
        const webPill899 = findElement(
          webHarness899.result.current,
          (el) => el.type === 'span' && getTextContent(el).includes('Target:')
        );
        expect(webPill899).toBeDefined();
        expect(webPill899.props.className).toContain('bg-amber-100');
        webHarness899.unmount();
      });

      it('observes 900s boundary styling in Native and Web', () => {
        const item900 = createMockQueueItem({ slaTimeRemainingSeconds: 900 });

        const nativeHarness900 = createHookHarness(() =>
          NativeTriageQueueView({
            items: [item900],
            facilityName: 'ClinicEZ Central',
            onExecuteDisposition: async () => {},
            onRefresh: () => {}
          })
        );
        const nativePillAmber = findAllElements(
          nativeHarness900.result.current,
          (el) =>
            Array.isArray(el.props?.style) &&
            el.props.style.some((s: any) => s && s.backgroundColor === lightColors.warningBg)
        )[0];
        const nativePillGreen = findAllElements(
          nativeHarness900.result.current,
          (el) =>
            Array.isArray(el.props?.style) &&
            el.props.style.some((s: any) => s && s.backgroundColor === lightColors.successBg)
        )[0];
        expect(Boolean(nativePillAmber)).toBe(true);
        expect(Boolean(nativePillGreen)).toBe(false);
        nativeHarness900.unmount();

        const webHarness900 = createHookHarness(() =>
          WebTriageQueueView({
            items: [item900],
            facilityName: 'ClinicEZ Central',
            onExecuteDisposition: async () => {},
            onRefresh: () => {}
          })
        );
        const webPill900 = findElement(
          webHarness900.result.current,
          (el) => el.type === 'span' && getTextContent(el).includes('Target:')
        );
        const webIsAmber = webPill900?.props.className.includes('bg-amber-100');
        const webIsGreen = webPill900?.props.className.includes('bg-emerald-100');
        expect(webIsAmber).toBe(true);
        expect(webIsGreen).toBe(false);
        webHarness900.unmount();
      });
    });
  });

  // =========================================================================
  // Dimension 2: useTriageQueue.ts HTTP Contracts & 1-Click Clinical Actions
  // =========================================================================
  describe('Dimension 2: useTriageQueue HTTP Contracts & Clinical Actions', () => {
    it('refresh() issues GET /api/v1/comms/conversations?scope=PatientFacility&facilityId=${facilityId} with Bearer token', async () => {
      const originalFetch = globalThis.fetch;
      const fetchCalls: { url: string; options: any }[] = [];

      globalThis.fetch = (async (url: string, options: any) => {
        fetchCalls.push({ url, options });
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }) as any;

      try {
        const mockContext = createMockContext();
        const contextMap = new Map();
        contextMap.set(CommsContext, mockContext);

        const harness = createHookHarness(() => useTriageQueue('fac-999'), {
          contextValues: contextMap
        });

        await harness.result.current.refresh();

        const getCall = fetchCalls.find(
          (c) => c.url.includes('/api/v1/comms/conversations') && c.options?.method === 'GET'
        );
        expect(getCall).toBeDefined();
        expect(getCall!.url).toBe('https://comms.local/api/v1/comms/conversations?scope=PatientFacility&facilityId=fac-999');
        expect(getCall!.options.headers['Authorization']).toBe('Bearer emp-ticket-123');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('recordDisposition() issues POST /api/v1/comms/triage/${id}/disposition with valid JSON payload', async () => {
      const originalFetch = globalThis.fetch;
      const postCalls: { url: string; options: any }[] = [];

      globalThis.fetch = (async (url: string, options: any) => {
        if (options?.method === 'POST') {
          postCalls.push({ url, options });
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }) as any;

      try {
        const client = new MockCommsClient();
        const mockContext = createMockContext(client);
        const contextMap = new Map();
        contextMap.set(CommsContext, mockContext);

        const harness = createHookHarness(() => useTriageQueue('fac-999'), {
          contextValues: contextMap
        });

        await harness.result.current.recordDisposition('conv-post-test', {
          disposition: 'NeedsVisit',
          declineReasonCode: undefined,
          priority: 'Urgent',
          internalNote: 'High fever, needs in-person examination',
          publicResponseText: 'Please come to the facility immediately',
          assignedStaffId: 'dr-garcia',
          assignedStaffName: 'Dr. Garcia'
        });

        expect(postCalls.length).toBe(1);
        const call = postCalls[0];
        expect(call.url).toBe('https://comms.local/api/v1/comms/triage/conv-post-test/disposition');
        expect(call.options.headers['Authorization']).toBe('Bearer emp-ticket-123');
        expect(call.options.headers['Content-Type']).toBe('application/json');

        const body = JSON.parse(call.options.body);
        expect(body).toEqual({
          action: 'NeedsVisit',
          disposition: 'NeedsVisit',
          declineReasonCode: undefined,
          priority: 'Urgent',
          internalNote: 'High fever, needs in-person examination',
          publicMessage: 'Please come to the facility immediately',
          publicResponseText: 'Please come to the facility immediately',
          assignedStaffId: 'dr-garcia',
          assignedStaffName: 'Dr. Garcia'
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('1-click clinical actions (Consult, Need Visit, Route, Decline) format valid payloads and update local optimistic state', async () => {
      const originalFetch = globalThis.fetch;
      const postCalls: { url: string; options: any }[] = [];

      globalThis.fetch = (async (url: string, options: any) => {
        if (options?.method === 'POST') {
          postCalls.push({ url, options });
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }) as any;

      try {
        const client = new MockCommsClient();
        const mockContext = createMockContext(client);
        const contextMap = new Map();
        contextMap.set(CommsContext, mockContext);

        const harness = createHookHarness(() => useTriageQueue('fac-123'), {
          contextValues: contextMap
        });

        // Emit 4 conversations
        const convs = ['c-consult', 'c-visit', 'c-route', 'c-decline'].map((id, index) => ({
          id,
          tenantId: 'tenant-test',
          facilityId: 'fac-123',
          scope: 'PatientFacility' as const,
          kind: 'PatientTriage' as const,
          title: `Patient ${index}`,
          category: 'Inquiry',
          status: 'Submitted' as const,
          priority: 'Routine' as const,
          isEmergencyConfirmed: false,
          isLocalOnly: false,
          reopenCount: 0,
          messageCount: 1,
          lastSeq: 1,
          createdAtUtc: new Date().toISOString(),
          createdBy: 'patient',
          participants: []
        }));

        for (const conv of convs) {
          client.events.emit('conversationCreated', conv);
        }

        expect(harness.result.current.items.length).toBe(4);

        // 1. Consult / Answer
        const consultResult = await harness.result.current.answerRequest(
          'c-consult',
          'Dr. Santos is reviewing your symptoms.',
          'Initial review note'
        );
        expect(consultResult.triageDisposition).toBe('Answered');
        expect(consultResult.status).toBe('Closed');

        // 2. Need Visit
        const visitResult = await harness.result.current.requestVisit(
          'c-visit',
          'Physical exam required at Clinic Room 1',
          'Referred for in-person visit'
        );
        expect(visitResult.triageDisposition).toBe('NeedsVisit');
        expect(visitResult.status).toBe('Closed');

        // 3. Route
        const routeResult = await harness.result.current.routeToStaff(
          'c-route',
          'staff-specialist-1',
          'Dr. Specialist',
          'Urgent',
          'Routing to cardiology'
        );
        expect(routeResult.triageDisposition).toBe('Routed');
        expect(routeResult.status).toBe('Routed');
        expect(routeResult.assignedStaffId).toBe('staff-specialist-1');
        expect(routeResult.priority).toBe('Urgent');

        // 4. Decline
        const declineResult = await harness.result.current.declineRequest(
          'c-decline',
          'DUPLICATE',
          'Duplicate request submitted earlier.',
          'Patient already has ticket #12'
        );
        expect(declineResult.triageDisposition).toBe('Declined');
        expect(declineResult.declineReasonCode).toBe('DUPLICATE');
        expect(declineResult.status).toBe('Closed');

        // Check items list: Closed items are filtered out, Routed items remain filtered if not Submitted/WithTriage
        expect(harness.result.current.items.length).toBe(0);
        expect(postCalls.length).toBe(4);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // Dimension 3: Card-to-thread navigation (onSelectCard)
  // =========================================================================
  describe('Dimension 3: Card-to-Thread Navigation', () => {
    it('Native UI: onSelectCard callback is called when clicking/pressing triage card', () => {
      let selectedConversationId: string | null = null;
      const item = createMockQueueItem({ conversationId: 'conv-nav-native' });

      const harness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [item],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {},
          onSelectCard: (id: string) => {
            selectedConversationId = id;
          }
        })
      );

      // In Native, card is wrapped in a TouchableOpacity with accessibilityRole="button" and onPress
      const buttons = findAllElements(
        harness.result.current,
        (el) => el.props?.accessibilityRole === 'button' && typeof el.props?.onPress === 'function'
      );
      const cardContainer = buttons.find((b) => b.props?.accessibilityLabel?.includes('Inquiry from'));
      expect(cardContainer).toBeDefined();

      act(() => {
        cardContainer.props.onPress();
      });

      expect(selectedConversationId).toBe('conv-nav-native');
      harness.unmount();
    });

    it('Web UI: onSelectCard callback is called when clicking or keyboard pressing triage card', () => {
      let selectedConversationId: string | null = null;
      const item = createMockQueueItem({ conversationId: 'conv-nav-web' });

      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [item],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {},
          onRefresh: () => {},
          onSelectCard: (id) => {
            selectedConversationId = id;
          }
        })
      );

      // Find the card container
      const cardDiv = findElement(
        harness.result.current,
        (el) => el.type === 'div' && el.props?.role === 'button' && typeof el.props?.onClick === 'function'
      );
      expect(cardDiv).toBeDefined();

      // Click
      act(() => {
        cardDiv.props.onClick();
      });
      expect(selectedConversationId).toBe('conv-nav-web');

      // KeyDown Enter
      selectedConversationId = null;
      act(() => {
        cardDiv.props.onKeyDown({ key: 'Enter', preventDefault: () => {} });
      });
      expect(selectedConversationId).toBe('conv-nav-web');

      // KeyDown Space
      selectedConversationId = null;
      act(() => {
        cardDiv.props.onKeyDown({ key: ' ', preventDefault: () => {} });
      });
      expect(selectedConversationId).toBe('conv-nav-web');

      harness.unmount();
    });

    it('Web UI: action buttons stop propagation to prevent inadvertent navigation', () => {
      let cardNavCount = 0;
      let actionExecuted = false;
      const item = createMockQueueItem({ conversationId: 'conv-stop-prop' });

      const harness = createHookHarness(() =>
        WebTriageQueueView({
          items: [item],
          facilityName: 'ClinicEZ Central',
          onExecuteDisposition: async () => {
            actionExecuted = true;
          },
          onRefresh: () => {},
          onSelectCard: () => {
            cardNavCount++;
          }
        })
      );

      // Find Needs Visit button
      const needsVisitBtn = findElement(
        harness.result.current,
        (el) => el.type === 'button' && getTextContent(el).trim() === 'Needs Visit'
      );
      expect(needsVisitBtn).toBeDefined();

      let stopPropagationCalled = false;
      const fakeEvent = {
        stopPropagation: () => {
          stopPropagationCalled = true;
        }
      };

      act(() => {
        needsVisitBtn.props.onClick(fakeEvent);
      });

      expect(stopPropagationCalled).toBe(true);
      expect(actionExecuted).toBe(true);
      expect(cardNavCount).toBe(0); // Card navigation was NOT triggered
      harness.unmount();
    });
  });

  // =========================================================================
  // Dimension 4: Reconnect execution cleanly
  // =========================================================================
  describe('Dimension 4: Reconnect Execution Safety', () => {
    it('reconnect() from useComms() executes cleanly without runtime exception', async () => {
      const client = new MockCommsClient();
      let disconnectCalled = false;
      let connectCalled = false;

      const mockContext = createMockContext(client);
      mockContext.disconnect = async () => {
        disconnectCalled = true;
        await client.disconnect();
      };
      mockContext.connect = async () => {
        connectCalled = true;
        await client.connect();
      };
      mockContext.reconnect = async () => {
        await mockContext.disconnect();
        await mockContext.connect();
      };

      const contextMap = new Map();
      contextMap.set(CommsContext, mockContext);

      const harness = createHookHarness(() => useComms(), {
        contextValues: contextMap
      });

      expect(harness.result.current.reconnect).toBeDefined();
      expect(typeof harness.result.current.reconnect).toBe('function');

      // Execute reconnect
      await harness.result.current.reconnect();

      expect(disconnectCalled).toBe(true);
      expect(connectCalled).toBe(true);
      expect(client.getConnectionState()).toBe('Connected');
      harness.unmount();
    });

    it('reconnect handles error gracefully if underlying client fails', async () => {
      const client = new MockCommsClient();
      const mockContext = createMockContext(client);

      mockContext.reconnect = async () => {
        throw new Error('SignalR Hub Connection Refused');
      };

      const contextMap = new Map();
      contextMap.set(CommsContext, mockContext);

      const harness = createHookHarness(() => useComms(), {
        contextValues: contextMap
      });

      let caughtError: Error | null = null;
      try {
        await harness.result.current.reconnect();
      } catch (err: any) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError!.message).toBe('SignalR Hub Connection Refused');
      harness.unmount();
    });
  });
});
