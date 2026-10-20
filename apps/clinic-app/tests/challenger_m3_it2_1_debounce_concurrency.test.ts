// token-guard:ignore-file
/**
 * Milestone 3 Iteration 2 Challenger 1: Empirical Verification & Adversarial Stress Tests
 * Focus: Debounce Timing, AbortSignal In-Flight Cancellation, Query Clearing, Contributor Unregistration Lifecycle & Concurrency
 *
 * Specific Dimensions Tested:
 * 1. Keystroke Debounce Timing: 5 rapid keystrokes within 100ms only dispatches 1 search request 200ms after the last stroke.
 * 2. In-Flight AbortSignal Cancellation: In-flight requests are immediately aborted via AbortSignal when query changes.
 * 3. Whitespace Query Clearing: Clearing query to whitespace immediately cancels in-flight timers and reverts to Quick Actions with 0 network calls.
 * 4. Contributor Unregistration: Cleanly unregisters all 3 contributors (clinic-quick-actions, clinic-settings-nav, clinic-api-search) on unmount.
 * 5. High-Concurrency & Race Condition Harness: Out-of-order network response resolution, chained aborts, rapid fuzzer churn, error isolation.
 */

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import type { SearchItem, SearchResponseDto, ApiError } from '@shared/safe';

(globalThis as any).__DEV__ = true;

// =============================================================================
// React Native & Expo Mock Infrastructure
// =============================================================================

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    testID,
    visible,
    style,
    onPress,
    value,
    onChangeText,
    autoFocus,
    role,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) return null;
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { 'data-accessibility-role': accessibilityRole } : {}),
        ...(role ? { role } : accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(autoFocus ? { 'data-autofocus': 'true' } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  RefreshControl: createMockComponent('RefreshControl'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Touchable: { Mixin: {} },
  Image: createMockComponent('Image'),
  ImageBackground: createMockComponent('ImageBackground'),
  Alert: { alert: () => {} },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  processColor: (c: any) => c,
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  G: 'G',
  Line: 'Line',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  Text: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
  setCustomFontsAvailable: () => {},
}));


mock.module('../utils/useSafeInsets', () => ({
  useSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, setParams: () => {} }),
  useRoute: () => ({ key: 'Dashboard', name: 'Dashboard', params: undefined }),
  DefaultTheme: { colors: {} },
  createStaticNavigation: () => () => null,
}));

let mockStaffPermissions: string[] | undefined = ['Clinic.PatientsRead', 'Clinic.ConsultationsRead'];
mock.module('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Test Clinician' },
    permissions: mockStaffPermissions,
    signOut: () => {},
  }),
  usePermission: (perm: string) => mockStaffPermissions.includes(perm),
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    currentStaff: { id: 's1', firstName: 'Dr.', lastName: 'Santos', role: 'Doctor' },
    permissions: mockStaffPermissions,
  }),
  formatStaffName: (s: any) => `${s.firstName || ''} ${s.lastName || ''}`.trim(),
}));

mock.module('../hooks/useClinicNotifications', () => ({
  useClinicNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    hasStatAlert: false,
    loading: false,
    refresh: () => {},
    markAsRead: () => {},
    markAllAsRead: () => {},
  }),
}));

// =============================================================================
// Imports from System Under Test
// =============================================================================

const { universalSearchRegistry } = await import('@shared/safe');
const {
  GlobalSearchProvider,
  useGlobalSearch,
  QUICK_ACTIONS,
  SETTINGS_NAV_ITEMS,
  resolveSearchNavigation,
} = await import('../components/search/GlobalSearchProvider');
const { clinicService } = await import('../services/clinicService');

// =============================================================================
// Headless React Component Runner with Full Lifecycle & Effect Cleanup
// =============================================================================

interface ComponentHarness<P> {
  getValue: () => any;
  setProps: (props: Partial<P>) => void;
  rerender: () => void;
  unmount: () => void;
}

function mountComponent<P>(Component: React.ComponentType<P>, initialProps: P): ComponentHarness<P> {
  let stateSlots: any[] = [];
  let slotIndex = 0;
  let effectSlots: Array<{ fn: () => any; cleanup?: any; deps: any[]; hasChanged: boolean }> = [];
  let effectIndex = 0;
  let refSlots: Array<{ current: any }> = [];
  let refIndex = 0;
  let memoSlots: Array<{ val: any; deps: any[] }> = [];
  let memoIndex = 0;
  let currentProps = { ...initialProps };
  let renderedElement: any = null;

  const mockDispatcher = {
    useState: (initial: any) => {
      const idx = slotIndex++;
      if (stateSlots.length <= idx) {
        stateSlots.push(typeof initial === 'function' ? initial() : initial);
      }
      const setState = (newVal: any) => {
        const nextVal = typeof newVal === 'function' ? newVal(stateSlots[idx]) : newVal;
        if (stateSlots[idx] !== nextVal) {
          stateSlots[idx] = nextVal;
          scheduleRender();
        }
      };
      return [stateSlots[idx], setState];
    },
    useRef: (initial: any) => {
      const idx = refIndex++;
      if (refSlots.length <= idx) {
        refSlots.push({ current: initial });
      }
      return refSlots[idx];
    },
    useCallback: (fn: any, _deps: any[]) => fn,
    useMemo: (factory: any, deps: any[]) => {
      const idx = memoIndex++;
      const prev = memoSlots[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (hasChanged) {
        memoSlots[idx] = { val: factory(), deps };
      }
      return memoSlots[idx].val;
    },
    useEffect: (fn: any, deps: any[]) => {
      const idx = effectIndex++;
      const prev = effectSlots[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      effectSlots[idx] = { fn, deps, hasChanged, cleanup: prev?.cleanup };
    },
    useContext: (ctx: any) => {
      if (ctx && ctx._currentValue) return ctx._currentValue;
      return null;
    },
  };

  let isRendering = false;
  function scheduleRender() {
    if (!isRendering) {
      render();
    }
  }

  function render() {
    isRendering = true;
    slotIndex = 0;
    effectIndex = 0;
    refIndex = 0;
    memoIndex = 0;

    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prevDispatcher = internals ? internals.H : null;
    if (internals) internals.H = mockDispatcher;

    try {
      renderedElement = (Component as any)(currentProps);
    } finally {
      if (internals) internals.H = prevDispatcher;
      isRendering = false;
    }

    // Run active/changed effects and cleanups
    for (const eff of effectSlots) {
      if (eff.hasChanged) {
        eff.hasChanged = false;
        if (typeof eff.cleanup === 'function') {
          eff.cleanup();
        }
        eff.cleanup = eff.fn();
      }
    }
  }

  // Initial mount
  render();

  return {
    getValue: () => renderedElement?.props?.value,
    setProps: (props: Partial<P>) => {
      currentProps = { ...currentProps, ...props };
      render();
    },
    rerender: () => {
      render();
    },
    unmount: () => {
      for (const eff of effectSlots) {
        if (typeof eff.cleanup === 'function') {
          eff.cleanup();
          eff.cleanup = undefined;
        }
      }
    },
  };
}

const activeHarnesses: Array<ComponentHarness<any>> = [];

function safeMount<P>(Component: React.ComponentType<P>, initialProps: P): ComponentHarness<P> {
  const harness = mountComponent(Component, initialProps);
  activeHarnesses.push(harness);
  return harness;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// =============================================================================
// TEST SUITE: Milestone 3 Iteration 2 Challenger 1
// =============================================================================

describe('Milestone 3 Iteration 2 Challenger 1: Debounce, AbortSignal & Concurrency Stress Suite', () => {
  const originalSearch = clinicService.search;

  beforeEach(() => {
    universalSearchRegistry.clear();
    mockStaffPermissions = ['Clinic.PatientsRead', 'Clinic.ConsultationsRead'];
  });

  afterEach(() => {
    while (activeHarnesses.length > 0) {
      const h = activeHarnesses.pop();
      try {
        h?.unmount();
      } catch {}
    }
    clinicService.search = originalSearch;
    universalSearchRegistry.clear();
  });

  // ===========================================================================
  // Dimension 1: Rapid Keystroke Debounce Timing (5 keystrokes in 100ms -> 1 call @ 200ms)
  // ===========================================================================
  describe('Dimension 1: Keystroke Debounce Timing & Dispatch Precision', () => {
    test('rapidly typing 5 keystrokes within 100ms only dispatches 1 search request 200ms after the last stroke', async () => {
      const searchEvents: Array<{ query: string; timeFromStart: number }> = [];
      const testStart = Date.now();

      clinicService.search = async (q: string) => {
        searchEvents.push({ query: q, timeFromStart: Date.now() - testStart });
        return [{ items: [{ id: 'p-1', category: 'Patients', title: `Result: ${q}`, subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // Typing sequence: 'c', 'cl', 'cli', 'clin', 'clinic' within 80ms total
      ctx.setQuery('c');      // t = 0ms
      await sleep(20);
      ctx.setQuery('cl');     // t = 20ms
      await sleep(20);
      ctx.setQuery('cli');    // t = 40ms
      await sleep(20);
      ctx.setQuery('clin');   // t = 60ms
      await sleep(20);
      ctx.setQuery('clinic'); // t = 80ms (last keystroke)

      // 1. Immediately after 5th stroke (t ~ 90ms total, ~10ms after last stroke)
      expect(searchEvents.length).toBe(0);
      expect(harness.getValue().loading).toBe(true);

      // 2. 120ms after last stroke (t ~ 200ms total from start): Debounce window (200ms) not reached yet
      await sleep(110);
      expect(searchEvents.length).toBe(0);

      // 3. 170ms after last stroke (t ~ 250ms total from start): Still within debounce window
      await sleep(50);
      expect(searchEvents.length).toBe(0);

      // 4. 230ms after last stroke (t ~ 310ms total from start): Debounce expired, exactly 1 request dispatched!
      await sleep(60);
      expect(searchEvents.length).toBe(1);
      expect(searchEvents[0].query).toBe('clinic');

      // 5. Verify results updated and loading cleared
      const currentState = harness.getValue();
      expect(currentState.loading).toBe(false);
      // 'clinic' matches quick actions, settings navigation, and clinic API (5 total items)
      expect(currentState.results.length).toBeGreaterThanOrEqual(1);
      expect(currentState.results.some((r: SearchItem) => r.title === 'Result: clinic')).toBe(true);

      // 6. Settle buffer: verify zero trailing calls occur
      await sleep(100);
      expect(searchEvents.length).toBe(1);

      harness.unmount();
    });

    test('rapid backspacing does not fire intermediate searches and settles on final truncated query', async () => {
      const dispatchedQueries: string[] = [];

      clinicService.search = async (q: string) => {
        dispatchedQueries.push(q);
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // User types 'doctor' rapidly
      ctx.setQuery('doc');
      await sleep(15);
      ctx.setQuery('doct');
      await sleep(15);
      ctx.setQuery('docto');
      await sleep(15);
      ctx.setQuery('doctor');
      await sleep(20);

      // User immediately backspaces 3 characters before debounce fires
      ctx.setQuery('docto');
      await sleep(15);
      ctx.setQuery('doct');
      await sleep(15);
      ctx.setQuery('doc'); // final settled query

      // During active typing/backspacing, 0 requests should fire
      expect(dispatchedQueries.length).toBe(0);

      // Wait for debounce period (220ms)
      await sleep(220);

      expect(dispatchedQueries.length).toBe(1);
      expect(dispatchedQueries[0]).toBe('doc');

      harness.unmount();
    });

    test('sequential queries separated by >= 200ms pause execute separate search dispatches', async () => {
      const dispatchedQueries: string[] = [];

      clinicService.search = async (q: string) => {
        dispatchedQueries.push(q);
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // Query 1: Settles and executes
      ctx.setQuery('vital');
      await sleep(230);
      expect(dispatchedQueries).toEqual(['vital']);

      // Query 2: Settles and executes
      ctx.setQuery('vital signs');
      await sleep(230);
      expect(dispatchedQueries).toEqual(['vital', 'vital signs']);

      harness.unmount();
    });
  });

  // ===========================================================================
  // Dimension 2: In-Flight Network Requests AbortSignal Cancellation
  // ===========================================================================
  describe('Dimension 2: AbortSignal In-Flight Cancellation & Race Defense', () => {
    test('in-flight network requests are aborted via AbortSignal when query changes', async () => {
      let firstSignal: AbortSignal | undefined;
      let firstSignalAborted = false;
      let secondSignal: AbortSignal | undefined;

      clinicService.search = async (q: string, _cat?: string, _limit?: number, signal?: AbortSignal) => {
        if (q === 'first-query') {
          firstSignal = signal;
          signal?.addEventListener('abort', () => {
            firstSignalAborted = true;
          });
          // Simulate latency (250ms)
          await sleep(250);
          return [{ items: [{ id: '1', category: 'Patients', title: 'First Stale Result', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
        }

        if (q === 'second-query') {
          secondSignal = signal;
          return [{ items: [{ id: '2', category: 'Patients', title: 'Second Fresh Result', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
        }

        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // Dispatch first query
      ctx.setQuery('first-query');
      await sleep(220); // Debounce fires; first query is in-flight

      expect(firstSignal).toBeDefined();
      expect(firstSignal?.aborted).toBe(false);
      expect(firstSignalAborted).toBe(false);

      // Change query while first request is actively in-flight
      ctx.setQuery('second-query');

      // First signal must be aborted synchronously upon query change!
      expect(firstSignal?.aborted).toBe(true);
      expect(firstSignalAborted).toBe(true);

      // Wait for second query debounce and completion
      await sleep(230);
      expect(secondSignal).toBeDefined();
      expect(secondSignal?.aborted).toBe(false);

      // State must display second query results and NOT stale first query results
      const state = harness.getValue();
      expect(state.results.length).toBe(1);
      expect(state.results[0].title).toBe('Second Fresh Result');

      harness.unmount();
    });

    test('triple chained query changes abort intermediate in-flight requests sequentially', async () => {
      const signals: Record<string, { signal?: AbortSignal; aborted: boolean }> = {
        q1: { aborted: false },
        q2: { aborted: false },
        q3: { aborted: false },
      };

      clinicService.search = async (q: string, _cat?: string, _limit?: number, signal?: AbortSignal) => {
        if (signals[q]) {
          signals[q].signal = signal;
          signal?.addEventListener('abort', () => {
            signals[q].aborted = true;
          });
          await sleep(200);
        }
        return [{ items: [{ id: q, category: 'Patients', title: `Result ${q}`, subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // Trigger q1
      ctx.setQuery('q1');
      await sleep(220); // q1 in-flight
      expect(signals.q1.signal?.aborted).toBe(false);

      // Trigger q2
      ctx.setQuery('q2');
      expect(signals.q1.signal?.aborted).toBe(true);
      expect(signals.q1.aborted).toBe(true);

      await sleep(220); // q2 in-flight
      expect(signals.q2.signal?.aborted).toBe(false);

      // Trigger q3
      ctx.setQuery('q3');
      expect(signals.q2.signal?.aborted).toBe(true);
      expect(signals.q2.aborted).toBe(true);

      // Wait for q3 debounce (220ms) and mock search execution (200ms + buffer)
      await sleep(220); // q3 debounce fires, request starts
      await sleep(230); // q3 search resolves
      expect(signals.q3.signal?.aborted).toBe(false);
      expect(signals.q3.aborted).toBe(false);

      const state = harness.getValue();
      expect(state.results.length).toBeGreaterThanOrEqual(1);
      expect(state.results.some((r: SearchItem) => r.title === 'Result q3')).toBe(true);

      harness.unmount();
    });

    test('delayed out-of-order network responses never overwrite newer search results', async () => {
      clinicService.search = async (q: string, _cat?: string, _limit?: number, signal?: AbortSignal) => {
        if (q === 'slow-initial') {
          await sleep(350);
          if (signal?.aborted) {
            return [null, { message: 'Canceled', statusCode: 0 } as ApiError];
          }
          return [{ items: [{ id: 'slow', category: 'Patients', title: 'Slow Overwrite Candidate', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
        }

        if (q === 'fast-latest') {
          await sleep(20);
          return [{ items: [{ id: 'fast', category: 'Patients', title: 'Fast Authority Result', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
        }

        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('slow-initial');
      await sleep(220); // slow request launched

      ctx.setQuery('fast-latest');
      await sleep(220); // fast request launched
      await sleep(50);  // fast request completes

      expect(harness.getValue().results[0]?.title).toBe('Fast Authority Result');

      // Wait past slow request's total completion time (350ms)
      await sleep(250);

      // Authority result remains untouched
      const finalState = harness.getValue();
      expect(finalState.results.length).toBe(1);
      expect(finalState.results[0]?.title).toBe('Fast Authority Result');

      harness.unmount();
    });

    test('network cancellation errors (AbortError/CanceledError) never leak into UI error state', async () => {
      clinicService.search = async (_q: string, _cat?: string, _limit?: number, signal?: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('running-search');
      await sleep(220); // in-flight

      ctx.setQuery('aborted-search');
      await sleep(50);

      const state = harness.getValue();
      expect(state.error).toBeNull(); // UI must remain clean of abort errors

      harness.unmount();
    });
  });

  // ===========================================================================
  // Dimension 3: Whitespace Query Clearing & Quick Actions Revert
  // ===========================================================================
  describe('Dimension 3: Query Clearing & Immediate Revert to Quick Actions', () => {
    test('clearing query to empty string immediately cancels in-flight timer and resets results with 0 network calls', async () => {
      let networkCalls = 0;
      clinicService.search = async () => {
        networkCalls++;
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('patient search');
      expect(harness.getValue().loading).toBe(true);

      // User clears query at 60ms (well before 200ms debounce expires)
      await sleep(60);
      ctx.setQuery('');

      // State must immediately reset without waiting 200ms
      const immediateState = harness.getValue();
      expect(immediateState.query).toBe('');
      expect(immediateState.results).toEqual([]);
      expect(immediateState.loading).toBe(false);
      expect(immediateState.error).toBeNull();

      // Wait past 250ms debounce window to ensure zero network requests fired
      await sleep(250);
      expect(networkCalls).toBe(0);

      harness.unmount();
    });

    test('clearing query to whitespace ("   ", "\\t\\n  ") cancels in-flight timer and triggers 0 network calls', async () => {
      let networkCalls = 0;
      clinicService.search = async () => {
        networkCalls++;
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // 1. Whitespace variants
      const whitespaceVariants = ['   ', '\t', '\n\r  \t', '     '];
      for (const ws of whitespaceVariants) {
        ctx.setQuery('consultation');
        await sleep(50);
        ctx.setQuery(ws);

        const state = harness.getValue();
        expect(state.results).toEqual([]);
        expect(state.loading).toBe(false);

        await sleep(220);
        expect(networkCalls).toBe(0);
      }

      harness.unmount();
    });

    test('clearing query while a network request is in-flight immediately aborts the network request', async () => {
      let aborted = false;
      let signalCaptured: AbortSignal | undefined;

      clinicService.search = async (_q: string, _cat?: string, _limit?: number, signal?: AbortSignal) => {
        signalCaptured = signal;
        signal?.addEventListener('abort', () => {
          aborted = true;
        });
        await sleep(300);
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('active-req');
      await sleep(220); // Request is in-flight

      expect(signalCaptured).toBeDefined();
      expect(aborted).toBe(false);

      // Clear query while request is in-flight
      ctx.setQuery('');

      expect(signalCaptured?.aborted).toBe(true);
      expect(aborted).toBe(true);

      const state = harness.getValue();
      expect(state.loading).toBe(false);
      expect(state.results).toEqual([]);

      harness.unmount();
    });

    test('zero-state displays all 4 QUICK_ACTIONS with valid target routes and parameters', () => {
      expect(QUICK_ACTIONS.length).toBe(4);

      const ids = QUICK_ACTIONS.map((qa) => qa.id);
      expect(ids).toContain('quick-action-register');
      expect(ids).toContain('quick-action-queue');
      expect(ids).toContain('quick-action-roster');
      expect(ids).toContain('quick-action-services');

      // Verify deep navigation resolution for all 4 quick actions
      for (const qa of QUICK_ACTIONS) {
        const resolved = resolveSearchNavigation(qa);
        expect(resolved.destinationRoute).toBeDefined();
        expect(typeof resolved.destinationRoute).toBe('string');
        expect(resolved.destinationParams).toBeDefined();
      }
    });

    test('clinicService.search direct unit verification: empty or whitespace queries return early with 0 HTTP calls', async () => {
      const emptyQueries = ['', '   ', '\t', '\n', '   \t\n   '];
      for (const eq of emptyQueries) {
        const [res, err] = await clinicService.search(eq);
        expect(err).toBeNull();
        expect(res?.items).toEqual([]);
        expect(res?.totalCount).toBe(0);
      }
    });
  });

  // ===========================================================================
  // Dimension 4: Contributor Unregistration Lifecycle on Component Unmount
  // ===========================================================================
  describe('Dimension 4: Contributor Unregistration Lifecycle & Cleanup', () => {
    test('mount registers all 3 contributors and unmount cleans up all 3 contributors', () => {
      // Prior state: empty registry
      expect(universalSearchRegistry.size).toBe(0);

      const harness = safeMount(GlobalSearchProvider, { children: null });

      // After mount: all 3 contributors registered
      expect(universalSearchRegistry.size).toBe(3);
      expect(universalSearchRegistry.has('clinic-quick-actions')).toBe(true);
      expect(universalSearchRegistry.has('clinic-settings-nav')).toBe(true);
      expect(universalSearchRegistry.has('clinic-api-search')).toBe(true);

      // Unmount provider
      harness.unmount();

      // After unmount: all 3 contributors removed
      expect(universalSearchRegistry.has('clinic-quick-actions')).toBe(false);
      expect(universalSearchRegistry.has('clinic-settings-nav')).toBe(false);
      expect(universalSearchRegistry.has('clinic-api-search')).toBe(false);
      expect(universalSearchRegistry.size).toBe(0);
    });

    test('50 repeated mount and unmount cycles cause 0 leaks or duplicate registrations', () => {
      for (let i = 0; i < 50; i++) {
        const harness = safeMount(GlobalSearchProvider, { children: null });
        expect(universalSearchRegistry.size).toBe(3);
        harness.unmount();
        expect(universalSearchRegistry.size).toBe(0);
      }
      expect(universalSearchRegistry.size).toBe(0);
    });

    test('external contributors registered prior to GlobalSearchProvider are preserved on unmount', () => {
      // Register external contributor
      const externalCleanup = universalSearchRegistry.register({
        id: 'external-custom-contributor',
        category: 'Custom',
        categoryLabel: 'Custom',
        search: () => [],
      });

      expect(universalSearchRegistry.size).toBe(1);

      const harness = safeMount(GlobalSearchProvider, { children: null });
      expect(universalSearchRegistry.size).toBe(4);

      harness.unmount();

      // Only the 3 internal contributors removed; external contributor remains
      expect(universalSearchRegistry.size).toBe(1);
      expect(universalSearchRegistry.has('external-custom-contributor')).toBe(true);

      externalCleanup();
      expect(universalSearchRegistry.size).toBe(0);
    });

    test('priority ordering contract: Quick Actions (5) < Settings (15) < Clinic API (25)', () => {
      const harness = safeMount(GlobalSearchProvider, { children: null });

      const sorted = universalSearchRegistry.getContributors();
      expect(sorted.length).toBe(3);
      expect(sorted[0].id).toBe('clinic-quick-actions');
      expect(sorted[0].priority).toBe(5);

      expect(sorted[1].id).toBe('clinic-settings-nav');
      expect(sorted[1].priority).toBe(15);

      expect(sorted[2].id).toBe('clinic-api-search');
      expect(sorted[2].priority).toBe(25);

      harness.unmount();
    });
  });

  // ===========================================================================
  // Dimension 5: High-Concurrency Adversarial Fuzzing & Stress Harness
  // ===========================================================================
  describe('Dimension 5: High-Concurrency Adversarial Stress & Race Resilience', () => {
    test('rapid random query fuzzer (50 random query changes) settles with 0 uncaught errors', async () => {
      let callCount = 0;
      clinicService.search = async (q: string) => {
        callCount++;
        await sleep(10 + (Math.random() * 20));
        return [{ items: [{ id: `item-${q}`, category: 'Clinic', title: `Result for ${q}`, subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      const fuzzTokens = [
        'patient',
        '',
        'dr',
        '   ',
        'dermatology',
        'consultation',
        'appointment 101',
        '',
        'x-ray',
        'pediatrician',
        '<script>alert(1)</script>',
        '-- drop table users;',
        '👍 José Rizal 👨‍⚕️',
      ];

      for (let i = 0; i < 50; i++) {
        const token = fuzzTokens[i % fuzzTokens.length];
        ctx.setQuery(token);
        await sleep(15); // Faster than 200ms debounce
      }

      // Settle
      await sleep(250);

      const finalState = harness.getValue();
      expect(finalState.error).toBeNull();
      // Should have only dispatched a fraction of calls due to debounce suppression
      expect(callCount).toBeLessThan(10);

      harness.unmount();
    });

    test('fault isolation: failing contributor does not crash search or break other contributors', async () => {
      // Register custom failing contributor
      universalSearchRegistry.register({
        id: 'exploding-contributor',
        category: 'Broken',
        categoryLabel: 'Broken',
        priority: 1,
        search: () => {
          throw new Error('Explosion in custom contributor');
        },
      });

      clinicService.search = async () => {
        return [{ items: [{ id: 'survivor', category: 'Clinic', title: 'Survivor Result', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('test-fault-isolation');
      await sleep(230);

      const state = harness.getValue();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      // Survivor result from clinicService must be present
      expect(state.results.some((r: SearchItem) => r.title === 'Survivor Result')).toBe(true);

      harness.unmount();
    });

    test('switching activeCategory filters in-memory results without triggering additional network requests', async () => {
      let networkCalls = 0;
      clinicService.search = async () => {
        networkCalls++;
        return [{
          items: [
            { id: '1', category: 'Patients', title: 'Patient Maria', subtitle: '', targetRoute: 'Patients' },
            { id: '2', category: 'Consultations', title: 'Consultation Routine', subtitle: '', targetRoute: 'Consultations' },
          ],
          totalCount: 2,
        }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('maria');
      await sleep(230); // 1 search fired
      expect(networkCalls).toBe(1);

      // Change category filter
      ctx.setActiveCategory('Patients');
      await sleep(50);
      ctx.setActiveCategory('Consultations');
      await sleep(50);
      ctx.setActiveCategory('all');
      await sleep(50);

      // No additional network calls dispatched when filtering by category tab
      expect(networkCalls).toBe(1);

      harness.unmount();
    });

    test('query whitespace trimming: leading and trailing whitespace is sanitized before dispatch', async () => {
      let dispatchedQuery = '';
      clinicService.search = async (q: string) => {
        dispatchedQuery = q;
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('   spaced query   ');
      await sleep(230);

      expect(dispatchedQuery).toBe('spaced query');

      harness.unmount();
    });
  });
});
