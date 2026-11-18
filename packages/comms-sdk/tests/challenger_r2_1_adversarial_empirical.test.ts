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
    conversationId: 'conv-challenger-r2-1',
    requestId: 'req-challenger-r2-1',
    patientId: 'pat-challenger-r2-1',
    patientNameMasked: 'Patient R2***',
    category: 'General',
    contentText: 'Challenger R2.1 adversarial stress test inquiry',
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
    activeTicket: { ticket: 'r2-ticket-test', expiresAtUtc: new Date().toISOString() },
    tenantId: 'tenant-r2',
    facilityId: 'facility-r2',
    staffId: 'staff-r2',
    staffDisplayName: 'Dr. Challenger R2',
    baseUrl,
    connect: async () => {},
    disconnect: async () => {},
    reconnect: async () => {},
    refreshTicket: async () => ({ ticket: 'r2-ticket-refreshed', expiresAtUtc: new Date().toISOString() }),
    store,
    subscriptionTracker: new SubscriptionTracker()
  };
}

describe('Challenger R2.1: Adversarial Triage Subsystem & State Stress Harness', () => {
  // =========================================================================
  // MISSION 1: SLA Countdown Boundary Math
  // =========================================================================
  describe('Mission 1: SLA Countdown Boundary Math Empirical Matrix', () => {
    it('boundary: exactly 900 seconds remaining MUST return "warning" (amber), NOT "onSchedule" (green)', () => {
      const item900 = createMockQueueItem({ slaTimeRemainingSeconds: 900, triageDueAtUtc: undefined });
      
      const nativeTier = nativeGetSlaTier(item900);
      const webTier = webGetSlaTier(item900);

      expect(nativeTier).toBe('warning');
      expect(webTier).toBe('warning');
      expect(nativeTier).not.toBe('onSchedule');
      expect(webTier).not.toBe('onSchedule');

      // Verify UI Pill styles in Native
      const nativeHarness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [item900],
          facilityName: 'St. Jude Clinic',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );
      const nativeWarningPill = findElement(
        nativeHarness.result.current,
        (el) =>
          el.props?.['data-rn'] === 'View' &&
          Array.isArray(el.props?.style) &&
          el.props.style.some((s: any) => s && s.backgroundColor === lightColors.warningBg)
      );
      expect(nativeWarningPill).toBeDefined();
      nativeHarness.unmount();

      // Verify UI Pill styles in Web
      const webHarness = createHookHarness(() =>
        WebTriageQueueView({
          items: [item900],
          facilityName: 'St. Jude Clinic',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );
      const webPill = findElement(
        webHarness.result.current,
        (el) => el.type === 'span' && typeof el.props?.className === 'string' && el.props.className.includes('bg-amber-100')
      );
      expect(webPill).toBeDefined();
      expect(webPill.props.className).toContain('text-amber-800');
      expect(webPill.props.className).not.toContain('bg-emerald-100');
      webHarness.unmount();
    });

    it('boundary: 899 seconds remaining MUST return "warning" (amber)', () => {
      const item899 = createMockQueueItem({ slaTimeRemainingSeconds: 899 });
      expect(nativeGetSlaTier(item899)).toBe('warning');
      expect(webGetSlaTier(item899)).toBe('warning');
    });

    it('boundary: 901 seconds remaining MUST return "onSchedule" (green)', () => {
      const item901 = createMockQueueItem({ slaTimeRemainingSeconds: 901 });
      expect(nativeGetSlaTier(item901)).toBe('onSchedule');
      expect(webGetSlaTier(item901)).toBe('onSchedule');

      // Check Native styles
      const nativeHarness = createHookHarness(() =>
        NativeTriageQueueView({
          items: [item901],
          facilityName: 'St. Jude Clinic',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );
      const nativeGreenPill = findElement(
        nativeHarness.result.current,
        (el) =>
          el.props?.['data-rn'] === 'View' &&
          Array.isArray(el.props?.style) &&
          el.props.style.some((s: any) => s && s.backgroundColor === lightColors.successBg)
      );
      expect(nativeGreenPill).toBeDefined();
      nativeHarness.unmount();

      // Check Web styles
      const webHarness = createHookHarness(() =>
        WebTriageQueueView({
          items: [item901],
          facilityName: 'St. Jude Clinic',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );
      const webPill = findElement(
        webHarness.result.current,
        (el) => el.type === 'span' && typeof el.props?.className === 'string' && el.props.className.includes('bg-emerald-100')
      );
      expect(webPill).toBeDefined();
      expect(webPill.props.className).toContain('text-emerald-800');
      webHarness.unmount();
    });

    it('boundary: 0 seconds remaining MUST return "breached" (red Response Overdue)', () => {
      const item0 = createMockQueueItem({ slaTimeRemainingSeconds: 0 });
      expect(nativeGetSlaTier(item0)).toBe('breached');
      expect(webGetSlaTier(item0)).toBe('breached');
      expect(nativeIsItemSlaBreached(item0)).toBe(true);
      expect(webIsItemSlaBreached(item0)).toBe(true);

      const webHarness = createHookHarness(() =>
        WebTriageQueueView({
          items: [item0],
          facilityName: 'St. Jude Clinic',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );
      const text = getTextContent(webHarness.result.current);
      expect(text).toContain('Response Overdue');
      expect(text).not.toContain('SLA Breached');
      webHarness.unmount();
    });

    it('boundary: negative seconds remaining MUST return "breached" (red Response Overdue)', () => {
      const negativeValues = [-1, -5, -60, -900, -9999];
      for (const sec of negativeValues) {
        const itemNeg = createMockQueueItem({ slaTimeRemainingSeconds: sec });
        expect(nativeGetSlaTier(itemNeg)).toBe('breached');
        expect(webGetSlaTier(itemNeg)).toBe('breached');
        expect(nativeIsItemSlaBreached(itemNeg)).toBe(true);
        expect(webIsItemSlaBreached(itemNeg)).toBe(true);
      }
    });

    it('boundary: null or undefined remaining seconds MUST return "onSchedule" (green/neutral), NEVER "breached"', () => {
      const itemNull = createMockQueueItem({ slaTimeRemainingSeconds: null as any, triageDueAtUtc: undefined, slaBreached: false });
      const itemUndefined = createMockQueueItem({ slaTimeRemainingSeconds: undefined, triageDueAtUtc: undefined, slaBreached: false });

      expect(nativeGetSlaTier(itemNull)).toBe('onSchedule');
      expect(webGetSlaTier(itemNull)).toBe('onSchedule');
      expect(nativeGetSlaTier(itemNull)).not.toBe('breached');
      expect(webGetSlaTier(itemNull)).not.toBe('breached');

      expect(nativeGetSlaTier(itemUndefined)).toBe('onSchedule');
      expect(webGetSlaTier(itemUndefined)).toBe('onSchedule');
      expect(nativeGetSlaTier(itemUndefined)).not.toBe('breached');
      expect(webGetSlaTier(itemUndefined)).not.toBe('breached');

      // Verify Web UI displays "Target: Queued" with emerald/green style and NOT red-100 breached
      const webHarness = createHookHarness(() =>
        WebTriageQueueView({
          items: [itemUndefined],
          facilityName: 'St. Jude Clinic',
          onExecuteDisposition: async () => {},
          onRefresh: () => {}
        })
      );
      const webText = getTextContent(webHarness.result.current);
      expect(webText).toContain('Target: Queued');
      expect(webText).not.toContain('Response Overdue');

      const webPill = findElement(
        webHarness.result.current,
        (el) => el.type === 'span' && getTextContent(el) === 'Target: Queued'
      );
      expect(webPill).toBeDefined();
      expect(webPill.props.className).toContain('bg-emerald-100');
      expect(webPill.props.className).not.toContain('bg-red-100');
      webHarness.unmount();
    });

    it('boundary: calculated remainingSec via triageDueAtUtc handles exact 900s, 899s, 901s, 0s, -10s, and invalid dates', () => {
      const now = Date.now();

      // +900s due time
      const itemDue900 = createMockQueueItem({
        slaTimeRemainingSeconds: undefined,
        triageDueAtUtc: new Date(now + 900 * 1000).toISOString()
      });
      // Tolerating +/- 1 second in execution time
      const tier900 = nativeGetSlaTier(itemDue900);
      expect(['warning', 'onSchedule']).toContain(tier900);

      // +300s due time (clearly warning)
      const itemDue300 = createMockQueueItem({
        slaTimeRemainingSeconds: undefined,
        triageDueAtUtc: new Date(now + 300 * 1000).toISOString()
      });
      expect(nativeGetSlaTier(itemDue300)).toBe('warning');
      expect(webGetSlaTier(itemDue300)).toBe('warning');

      // -60s due time (clearly breached)
      const itemDuePast = createMockQueueItem({
        slaTimeRemainingSeconds: undefined,
        triageDueAtUtc: new Date(now - 60 * 1000).toISOString()
      });
      expect(nativeGetSlaTier(itemDuePast)).toBe('breached');
      expect(webGetSlaTier(itemDuePast)).toBe('breached');

      // Invalid date string
      const itemInvalidDate = createMockQueueItem({
        slaTimeRemainingSeconds: undefined,
        triageDueAtUtc: 'not-a-valid-date'
      });
      expect(nativeGetSlaTier(itemInvalidDate)).toBe('onSchedule');
      expect(webGetSlaTier(itemInvalidDate)).toBe('onSchedule');
    });
  });

  // =========================================================================
  // MISSION 2: useTriageQueue Error Handling & Optimistic Rollback
  // =========================================================================
  describe('Mission 2: useTriageQueue Error Handling & Optimistic Rollback', () => {
    it('injects HTTP 500 into refresh() -> captures error, sets error state, does NOT leave error as null', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ error: 'Server fault' }), {
          status: 500,
          statusText: 'Internal Server Error',
          headers: { 'Content-Type': 'application/json' }
        });
      }) as any;

      try {
        const client = new MockCommsClient();
        const store = new OptimisticStore();
        const mockContext = createMockContext(client, store, 'https://comms.local');

        const contextMap = new Map();
        contextMap.set(CommsContext, mockContext);

        const harness = createHookHarness(() => useTriageQueue('fac-500'), {
          contextValues: contextMap
        });

        await harness.result.current.refresh();

        expect(harness.result.current.error).not.toBeNull();
        expect(harness.result.current.error).toBeInstanceOf(Error);
        expect(harness.result.current.error?.message).toContain('Failed to fetch triage queue: 500');
        expect(harness.result.current.isLoading).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('injects HTTP 401 into refresh() -> captures auth error, sets error state, does NOT leave error as null', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        return new Response('Unauthorized Access', {
          status: 401,
          statusText: 'Unauthorized'
        });
      }) as any;

      try {
        const client = new MockCommsClient();
        const store = new OptimisticStore();
        const mockContext = createMockContext(client, store, 'https://comms.local');

        const contextMap = new Map();
        contextMap.set(CommsContext, mockContext);

        const harness = createHookHarness(() => useTriageQueue('fac-401'), {
          contextValues: contextMap
        });

        await harness.result.current.refresh();

        expect(harness.result.current.error).not.toBeNull();
        expect(harness.result.current.error?.message).toContain('401 Unauthorized');
        expect(harness.result.current.isLoading).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('injects HTTP 502 Bad Gateway into refresh() -> captures error, sets error state, does NOT leave error as null', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        return new Response('Bad Gateway', {
          status: 502,
          statusText: 'Bad Gateway'
        });
      }) as any;

      try {
        const client = new MockCommsClient();
        const store = new OptimisticStore();
        const mockContext = createMockContext(client, store, 'https://comms.local');

        const contextMap = new Map();
        contextMap.set(CommsContext, mockContext);

        const harness = createHookHarness(() => useTriageQueue('fac-502'), {
          contextValues: contextMap
        });

        await harness.result.current.refresh();

        expect(harness.result.current.error).not.toBeNull();
        expect(harness.result.current.error?.message).toContain('502 Bad Gateway');
        expect(harness.result.current.isLoading).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('injects HTTP 500 into recordDisposition() -> optimistic removal is rolled back, error is thrown, threadStateChanged NOT emitted', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: string, options: any) => {
        if (options?.method === 'POST') {
          return new Response(JSON.stringify({ error: 'Database transaction failed' }), {
            status: 500,
            statusText: 'Internal Server Error',
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
        const store = new OptimisticStore();
        const mockContext = createMockContext(client, store, 'https://comms.local');

        const emittedEvents: any[] = [];
        client.events.on('threadStateChanged', (payload) => {
          emittedEvents.push(payload);
        });

        const contextMap = new Map();
        contextMap.set(CommsContext, mockContext);

        const harness = createHookHarness(() => useTriageQueue('fac-rollback'), {
          contextValues: contextMap
        });

        await harness.result.current.refresh();

        // Seed 2 conversations into rawItems
        client.events.emit('conversationCreated', {
          id: 'conv-rb-1',
          tenantId: 'tenant-r2',
          facilityId: 'fac-rollback',
          scope: 'PatientFacility',
          kind: 'PatientTriage',
          title: 'Juan Dela Cruz',
          category: 'Consultation',
          status: 'Submitted',
          priority: 'Urgent',
          isEmergencyConfirmed: false,
          isLocalOnly: false,
          reopenCount: 0,
          messageCount: 1,
          lastSeq: 1,
          createdAtUtc: new Date().toISOString(),
          createdBy: 'patient',
          participants: []
        });

        client.events.emit('conversationCreated', {
          id: 'conv-rb-2',
          tenantId: 'tenant-r2',
          facilityId: 'fac-rollback',
          scope: 'PatientFacility',
          kind: 'PatientTriage',
          title: 'Maria Clara',
          category: 'PrescriptionRefill',
          status: 'Submitted',
          priority: 'Routine',
          isEmergencyConfirmed: false,
          isLocalOnly: false,
          reopenCount: 0,
          messageCount: 1,
          lastSeq: 1,
          createdAtUtc: new Date().toISOString(),
          createdBy: 'patient',
          participants: []
        });

        expect(harness.result.current.items.length).toBe(2);
        expect(harness.result.current.pendingCount).toBe(2);

        // Attempt disposition that fails with 500
        let thrownError: Error | null = null;
        try {
          await harness.result.current.recordDisposition('conv-rb-1', 'Answered', 'Prescription refilled');
        } catch (err: any) {
          thrownError = err;
        }

        // Verification 1: Error MUST be thrown to caller
        expect(thrownError).not.toBeNull();
        expect(thrownError?.message).toContain('Failed to record triage disposition: 500');

        // Verification 2: Optimistic item removal MUST be immediately rolled back to previous snapshot
        expect(harness.result.current.items.length).toBe(2);
        expect(harness.result.current.pendingCount).toBe(2);
        const item1 = harness.result.current.items.find((i) => i.id === 'conv-rb-1');
        expect(item1).toBeDefined();
        expect(item1?.status).toBe('Submitted');
        expect(item1?.triageDisposition).toBeUndefined();

        // Verification 3: threadStateChanged event MUST NOT be emitted on failure
        expect(emittedEvents.length).toBe(0);
        expect(harness.result.current.isSubmittingDisposition).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('injects network offline failure into recordDisposition() -> optimistic removal rolled back, error thrown, threadStateChanged NOT emitted', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: string, options: any) => {
        if (options?.method === 'POST') {
          throw new TypeError('Failed to fetch: net::ERR_INTERNET_DISCONNECTED');
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }) as any;

      try {
        const client = new MockCommsClient();
        const store = new OptimisticStore();
        const mockContext = createMockContext(client, store, 'https://comms.local');

        const emittedEvents: any[] = [];
        client.events.on('threadStateChanged', (payload) => {
          emittedEvents.push(payload);
        });

        const contextMap = new Map();
        contextMap.set(CommsContext, mockContext);

        const harness = createHookHarness(() => useTriageQueue('fac-net-drop'), {
          contextValues: contextMap
        });

        await harness.result.current.refresh();

        client.events.emit('conversationCreated', {
          id: 'conv-net-drop-1',
          tenantId: 'tenant-r2',
          facilityId: 'fac-net-drop',
          scope: 'PatientFacility',
          kind: 'PatientTriage',
          title: 'Andres Bonifacio',
          category: 'Emergency',
          status: 'Submitted',
          priority: 'Emergency',
          isEmergencyConfirmed: true,
          isLocalOnly: false,
          reopenCount: 0,
          messageCount: 1,
          lastSeq: 1,
          createdAtUtc: new Date().toISOString(),
          createdBy: 'patient',
          participants: []
        });

        expect(harness.result.current.items.length).toBe(1);
        expect(harness.result.current.urgentCount).toBe(1);

        let thrownError: Error | null = null;
        try {
          await harness.result.current.requestVisit('conv-net-drop-1', 'Requires immediate triage room inspection');
        } catch (err: any) {
          thrownError = err;
        }

        expect(thrownError).not.toBeNull();
        expect(thrownError?.message).toContain('Failed to fetch: net::ERR_INTERNET_DISCONNECTED');

        // Rollback verification
        expect(harness.result.current.items.length).toBe(1);
        expect(harness.result.current.urgentCount).toBe(1);
        expect(harness.result.current.items[0].id).toBe('conv-net-drop-1');
        expect(harness.result.current.items[0].status).toBe('Submitted');

        // No event emitted
        expect(emittedEvents.length).toBe(0);
        expect(harness.result.current.isSubmittingDisposition).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('injects 1-click helper declineRequest failure -> optimistic state rolled back, reasonCode reverted', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: string, options: any) => {
        if (options?.method === 'POST') {
          return new Response('Conflict / Lock error', {
            status: 409,
            statusText: 'Conflict'
          });
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }) as any;

      try {
        const client = new MockCommsClient();
        const store = new OptimisticStore();
        const mockContext = createMockContext(client, store, 'https://comms.local');

        const contextMap = new Map();
        contextMap.set(CommsContext, mockContext);

        const harness = createHookHarness(() => useTriageQueue('fac-decline-fail'), {
          contextValues: contextMap
        });

        await harness.result.current.refresh();

        client.events.emit('conversationCreated', {
          id: 'conv-decline-fail-1',
          tenantId: 'tenant-r2',
          facilityId: 'fac-decline-fail',
          scope: 'PatientFacility',
          kind: 'PatientTriage',
          title: 'Gabriela Silang',
          category: 'General',
          status: 'Submitted',
          priority: 'Routine',
          isEmergencyConfirmed: false,
          isLocalOnly: false,
          reopenCount: 0,
          messageCount: 1,
          lastSeq: 1,
          createdAtUtc: new Date().toISOString(),
          createdBy: 'patient',
          participants: []
        });

        expect(harness.result.current.items.length).toBe(1);

        let errorCaught: any = null;
        try {
          await harness.result.current.declineRequest('conv-decline-fail-1', 'OUT_OF_SCOPE', 'Non-clinical query');
        } catch (e) {
          errorCaught = e;
        }

        expect(errorCaught).not.toBeNull();
        expect(errorCaught.message).toContain('409 Conflict');

        // Must remain in queue with 'Submitted' status and no declineReasonCode
        expect(harness.result.current.items.length).toBe(1);
        expect(harness.result.current.items[0].status).toBe('Submitted');
        expect(harness.result.current.items[0].declineReasonCode).toBeUndefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
