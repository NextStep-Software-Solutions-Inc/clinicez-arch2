// token-guard:ignore-file
/**
 * Milestone 3 Challenger 1: Empirical Verification & Adversarial Stress Tests
 * Focus: Debounce, AbortSignal, Concurrency & Contributor Lifecycle
 *
 * Requirements Tested:
 * 1. Rapid typing (5 keystrokes in 100ms) only dispatches 1 search request exactly 200ms after the last stroke.
 * 2. In-flight requests are aborted via AbortSignal when a new query is entered.
 * 3. Clearing query to whitespace immediately cancels in-flight timers and reverts to Quick Actions zero-state without network calls.
 * 4. Contributor unregistration cleans up all 3 contributors (clinic-quick-actions, clinic-settings-nav, clinic-api-search) upon unmount.
 * 5. High-concurrency stress harness, out-of-order race resolution, and error fault tolerance.
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

// Helpers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// =============================================================================
// TEST SUITE: Milestone 3 Challenger 1 (Debounce, AbortSignal & Concurrency)
// =============================================================================

describe('Milestone 3 Challenger 1: Debounce, AbortSignal & Concurrency Stress Suite', () => {
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
  // Requirement 4: Contributor Registration & Clean Unmount
  // ===========================================================================
  describe('Requirement 4: Contributor Lifecycle & Unmount Cleanup', () => {
    test('mount registers all 3 contributors (clinic-quick-actions, clinic-settings-nav, clinic-api-search)', () => {
      expect(universalSearchRegistry.has('clinic-quick-actions')).toBe(false);
      expect(universalSearchRegistry.has('clinic-settings-nav')).toBe(false);
      expect(universalSearchRegistry.has('clinic-api-search')).toBe(false);

      const harness = safeMount(GlobalSearchProvider, { children: null });

      expect(universalSearchRegistry.has('clinic-quick-actions')).toBe(true);
      expect(universalSearchRegistry.has('clinic-settings-nav')).toBe(true);
      expect(universalSearchRegistry.has('clinic-api-search')).toBe(true);

      const contributors = universalSearchRegistry.getContributors();
      expect(contributors.length).toBe(3);

      // Verify priorities and categories
      const qa = universalSearchRegistry.getContributor('clinic-quick-actions');
      expect(qa?.priority).toBe(5);
      expect(qa?.category).toBe('Quick Actions');

      const sn = universalSearchRegistry.getContributor('clinic-settings-nav');
      expect(sn?.priority).toBe(15);
      expect(sn?.category).toBe('Settings');

      const api = universalSearchRegistry.getContributor('clinic-api-search');
      expect(api?.priority).toBe(25);
      expect(api?.category).toBe('Clinic');

      harness.unmount();
    });

    test('registered contributors execute search functions correctly', async () => {
      let apiCalledWith = '';
      clinicService.search = async (q: string) => {
        apiCalledWith = q;
        return [{ items: [{ id: 'p-1', category: 'Patients', title: 'Juan Dela Cruz', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });

      const qa = universalSearchRegistry.getContributor('clinic-quick-actions')!;
      const qaResults = qa.search('walk-in') as SearchItem[];
      expect(qaResults.length).toBeGreaterThan(0);
      expect(qaResults[0].title).toContain('Register Walk-In Patient');

      const sn = universalSearchRegistry.getContributor('clinic-settings-nav')!;
      const snResults = sn.search('philhealth') as SearchItem[];
      expect(snResults.length).toBeGreaterThan(0);
      expect(snResults[0].title).toContain('PhilHealth');

      const api = universalSearchRegistry.getContributor('clinic-api-search')!;
      const apiResults = (await api.search('juan')) as SearchItem[];
      expect(apiCalledWith).toBe('juan');
      expect(apiResults.length).toBe(1);
      expect(apiResults[0].title).toBe('Juan Dela Cruz');

      harness.unmount();
    });

    test('unmount cleans up all 3 contributors without leaving orphaned entries', () => {
      const harness = safeMount(GlobalSearchProvider, { children: null });

      expect(universalSearchRegistry.size).toBe(3);

      harness.unmount();

      expect(universalSearchRegistry.has('clinic-quick-actions')).toBe(false);
      expect(universalSearchRegistry.has('clinic-settings-nav')).toBe(false);
      expect(universalSearchRegistry.has('clinic-api-search')).toBe(false);
      expect(universalSearchRegistry.size).toBe(0);
    });

    test('stress: 20 repeated mount and unmount cycles cause 0 leaks or duplicate registrations', () => {
      for (let i = 0; i < 20; i++) {
        const harness = safeMount(GlobalSearchProvider, { children: null });
        expect(universalSearchRegistry.size).toBe(3);
        harness.unmount();
        expect(universalSearchRegistry.size).toBe(0);
      }
      expect(universalSearchRegistry.size).toBe(0);
    });
  });

  // ===========================================================================
  // Requirement 1: Rapid Keystroke Debounce (5 keystrokes in 100ms -> 1 request @ 200ms)
  // ===========================================================================
  describe('Requirement 1: Rapid Keystroke Debounce (200ms Timing)', () => {
    test('rapidly typing 5 keystrokes within 100ms only dispatches 1 backend request exactly 200ms after the last stroke', async () => {
      const recordedCalls: Array<{ query: string; timestamp: number }> = [];
      const startTime = Date.now();

      clinicService.search = async (q: string) => {
        recordedCalls.push({ query: q, timestamp: Date.now() - startTime });
        return [{ items: [{ id: 'p-1', category: 'Patients', title: `Result for ${q}`, subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // Stroke 1: t = 0ms ('p')
      ctx.setQuery('p');
      await sleep(20);

      // Stroke 2: t = 20ms ('pa')
      ctx.setQuery('pa');
      await sleep(20);

      // Stroke 3: t = 40ms ('pat')
      ctx.setQuery('pat');
      await sleep(20);

      // Stroke 4: t = 60ms ('pati')
      ctx.setQuery('pati');
      await sleep(20);

      // Stroke 5: t = 80ms ('patie') - last stroke
      ctx.setQuery('patie');

      // Check immediately after typing finished (t ~ 90ms): 0 requests should have fired
      expect(recordedCalls.length).toBe(0);

      // Wait 150ms after the last stroke (t ~ 230ms total from start, 150ms from last stroke):
      // Debounce requires 200ms from last stroke, so still 0 requests!
      await sleep(150);
      expect(recordedCalls.length).toBe(0);

      // Wait another 70ms (total ~220ms from last stroke): exactly 1 request should have fired!
      await sleep(70);
      expect(recordedCalls.length).toBe(1);
      expect(recordedCalls[0].query).toBe('patie');

      // Verify that no further delayed calls occur
      await sleep(100);
      expect(recordedCalls.length).toBe(1);

      harness.unmount();
    });

    test('burst typing: 10 rapid keystrokes with jitter < 30ms dispatches exactly 1 search with final query', async () => {
      const calls: string[] = [];

      clinicService.search = async (q: string) => {
        calls.push(q);
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      const word = 'consultation';
      for (let i = 1; i <= word.length; i++) {
        ctx.setQuery(word.substring(0, i));
        await sleep(15); // rapid typing
      }

      // Zero calls immediately after typing stops
      expect(calls.length).toBe(0);

      // Wait for debounce period (220ms)
      await sleep(220);

      expect(calls.length).toBe(1);
      expect(calls[0]).toBe('consultation');

      harness.unmount();
    });

    test('sequential typing with pauses >= 200ms dispatches separate requests per settled query', async () => {
      const calls: string[] = [];

      clinicService.search = async (q: string) => {
        calls.push(q);
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // Word 1: type and pause 230ms
      ctx.setQuery('dr');
      await sleep(230);
      expect(calls).toEqual(['dr']);

      // Word 2: type and pause 230ms
      ctx.setQuery('dr santos');
      await sleep(230);
      expect(calls).toEqual(['dr', 'dr santos']);

      harness.unmount();
    });
  });

  // ===========================================================================
  // Requirement 2: In-Flight Search AbortSignal Cancellation & Race Defense
  // ===========================================================================
  describe('Requirement 2: AbortSignal In-Flight Cancellation & Concurrency', () => {
    test('in-flight request is aborted via AbortSignal when a new query is entered', async () => {
      let firstSignalAborted = false;
      let firstSignalReceived: AbortSignal | undefined;
      let secondSignalReceived: AbortSignal | undefined;

      clinicService.search = async (q: string, _cat?: string, _limit?: number, signal?: AbortSignal) => {
        if (q === 'first') {
          firstSignalReceived = signal;
          signal?.addEventListener('abort', () => {
            firstSignalAborted = true;
          });
          // Simulate slow backend
          await sleep(300);
          return [{ items: [{ id: '1', category: 'Patients', title: 'First Result', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
        }
        if (q === 'second') {
          secondSignalReceived = signal;
          return [{ items: [{ id: '2', category: 'Patients', title: 'Second Result', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
        }
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // Start first search
      ctx.setQuery('first');
      // Wait for debounce to fire and request to become in-flight
      await sleep(220);
      expect(firstSignalReceived).toBeDefined();
      expect(firstSignalReceived?.aborted).toBe(false);
      expect(firstSignalAborted).toBe(false);

      // Now enter second query while first is in-flight
      ctx.setQuery('second');

      // The first signal must be aborted immediately upon query change!
      expect(firstSignalReceived?.aborted).toBe(true);
      expect(firstSignalAborted).toBe(true);

      // Wait for second debounce and resolution
      await sleep(230);
      expect(secondSignalReceived).toBeDefined();
      expect(secondSignalReceived?.aborted).toBe(false);

      // Verify that final results reflect second query, NOT first query
      const currentCtx = harness.getValue();
      expect(currentCtx.results.length).toBe(1);
      expect(currentCtx.results[0].title).toBe('Second Result');

      harness.unmount();
    });

    test('slow request race condition: delayed first response never overwrites faster second response', async () => {
      clinicService.search = async (q: string, _cat?: string, _limit?: number, signal?: AbortSignal) => {
        if (q === 'slow') {
          // Slow request takes 250ms after debounce
          await sleep(250);
          if (signal?.aborted) {
            return [null, { message: 'Canceled', statusCode: 0 } as ApiError];
          }
          return [{ items: [{ id: 'slow', category: 'Patients', title: 'Slow Patient', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
        }
        if (q === 'fast') {
          // Fast request resolves in 30ms
          await sleep(30);
          return [{ items: [{ id: 'fast', category: 'Patients', title: 'Fast Patient', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
        }
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('slow');
      await sleep(220); // 'slow' is dispatched and in-flight

      ctx.setQuery('fast');
      await sleep(220); // 'fast' debounce fires and starts
      await sleep(50);  // 'fast' completes

      // Fast results should be active
      let state = harness.getValue();
      expect(state.results[0]?.title).toBe('Fast Patient');

      // Wait until 'slow' would have finished if it weren't cancelled
      await sleep(200);

      // Fast results MUST still be the active results!
      state = harness.getValue();
      expect(state.results[0]?.title).toBe('Fast Patient');
      expect(state.results.length).toBe(1);

      harness.unmount();
    });

    test('abort error during in-flight cancellation does not set UI error state', async () => {
      clinicService.search = async (_q: string, _cat?: string, _limit?: number, signal?: AbortSignal) => {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const err: any = new Error('Request aborted');
            err.name = 'CanceledError';
            reject(err);
          });
        });
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('testing');
      await sleep(220); // search in-flight

      ctx.setQuery('testing next'); // aborts first
      await sleep(50);

      const state = harness.getValue();
      expect(state.error).toBeNull(); // Abort should never show error toast/alert

      harness.unmount();
    });

    test('contributor fault isolation: contributor failure does not break search or throw', async () => {
      clinicService.search = async () => {
        throw new Error('Connection refused by clinic gateway');
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('network-fail');
      await sleep(230);

      const state = harness.getValue();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull(); // Fault-isolated: other contributors preserved, error not thrown
      expect(Array.isArray(state.results)).toBe(true);

      harness.unmount();
    });

    test('genuine registry failure sets error message and clears loading', async () => {
      const originalRegistrySearch = universalSearchRegistry.search;
      universalSearchRegistry.search = async () => {
        throw new Error('Universal search registry internal error');
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('registry-fail');
      await sleep(230);

      const state = harness.getValue();
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Universal search registry internal error');

      universalSearchRegistry.search = originalRegistrySearch;
      harness.unmount();
    });
  });

  // ===========================================================================
  // Requirement 3: Whitespace & Empty Query Immediate Reset
  // ===========================================================================
  describe('Requirement 3: Whitespace & Empty Query Immediate Reset', () => {
    test('clearing query to empty string immediately cancels timer and resets state with 0 network calls', async () => {
      let networkCallsCount = 0;
      clinicService.search = async () => {
        networkCallsCount++;
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('patient');
      expect(harness.getValue().loading).toBe(true);

      // Before 200ms debounce fires, user clears query to empty
      await sleep(50);
      ctx.setQuery('');

      // Verify immediate state reset without waiting 200ms
      const state = harness.getValue();
      expect(state.results).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();

      // Wait 250ms to ensure no delayed network call was dispatched
      await sleep(250);
      expect(networkCallsCount).toBe(0);

      harness.unmount();
    });

    test('clearing query to whitespace only ("   ", "\\t", "\\n") cancels timer and aborts with 0 network calls', async () => {
      let networkCallsCount = 0;
      clinicService.search = async () => {
        networkCallsCount++;
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('appointments');
      await sleep(50);

      // Set to whitespace
      ctx.setQuery('   \t  \n  ');

      const state = harness.getValue();
      expect(state.results).toEqual([]);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();

      await sleep(250);
      expect(networkCallsCount).toBe(0);

      harness.unmount();
    });

    test('in-flight search is aborted immediately when query is cleared to empty', async () => {
      let signalAborted = false;
      let requestStarted = false;

      clinicService.search = async (_q: string, _cat?: string, _limit?: number, signal?: AbortSignal) => {
        requestStarted = true;
        signal?.addEventListener('abort', () => {
          signalAborted = true;
        });
        await sleep(300);
        return [{ items: [{ id: 'p1', category: 'Patients', title: 'Juan', subtitle: '', targetRoute: 'Patients' }], totalCount: 1 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('juan');
      await sleep(220); // debounce fires, request starts

      expect(requestStarted).toBe(true);
      expect(signalAborted).toBe(false);

      // User clears query while request is in-flight
      ctx.setQuery('');

      expect(signalAborted).toBe(true);
      const state = harness.getValue();
      expect(state.results).toEqual([]);
      expect(state.loading).toBe(false);

      harness.unmount();
    });

    test('clinicService.search direct unit verification: empty/whitespace returns early with 0 HTTP calls', async () => {
      // Test direct method contract on clinicService.search
      const [res1, err1] = await clinicService.search('');
      expect(err1).toBeNull();
      expect(res1?.items).toEqual([]);
      expect(res1?.totalCount).toBe(0);

      const [res2, err2] = await clinicService.search('   \t  ');
      expect(err2).toBeNull();
      expect(res2?.items).toEqual([]);
      expect(res2?.totalCount).toBe(0);

      const [res3, err3] = await clinicService.search(null as any);
      expect(err3).toBeNull();
      expect(res3?.items).toEqual([]);
      expect(res3?.totalCount).toBe(0);
    });
  });

  // ===========================================================================
  // Suite 5: High-Concurrency Adversarial Fuzzing & Stress Harness
  // ===========================================================================
  describe('Suite 5: High-Concurrency Adversarial Fuzzing & Stress Harness', () => {
    test('churn stress: 50 rapid random query changes handle race conditions cleanly', async () => {
      let totalDispatched = 0;

      clinicService.search = async (q: string, _cat?: string, _limit?: number, signal?: AbortSignal) => {
        totalDispatched++;
        // Random asynchronous latency between 10ms and 80ms
        const latency = 10 + Math.floor(Math.random() * 70);
        await sleep(latency);
        if (signal?.aborted) {
          return [null, { message: 'Canceled', statusCode: 0 } as ApiError];
        }
        return [
          {
            items: [
              { id: `res-${q}`, category: 'Clinic', title: `Result for ${q}`, subtitle: 'Record', targetRoute: 'Dashboard' },
            ],
            totalCount: 1,
          },
          null,
        ];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      const candidateWords = ['patients', 'queue', 'appointments', 'services', 'staff', 'billing', 'icd10', 'lab', 'xray', 'vital'];

      // Send 50 rapid random updates with 5-15ms intervals
      for (let i = 0; i < 50; i++) {
        const randWord = candidateWords[i % candidateWords.length];
        const partial = randWord.substring(0, 1 + (i % randWord.length));
        ctx.setQuery(partial);
        await sleep(5 + Math.floor(Math.random() * 10));
      }

      // Final settled query
      ctx.setQuery('final-test-target');

      // Wait for debounce and final query resolution
      await sleep(350);

      const state = harness.getValue();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.results.length).toBeGreaterThanOrEqual(1);

      // Verify the final result matches the final query
      const clinicResult = state.results.find((r: SearchItem) => r.category === 'Clinic');
      expect(clinicResult?.title).toBe('Result for final-test-target');

      // Because typing was continuous at < 20ms intervals, almost all prior timers were debounced
      // total dispatched should be significantly lower than 50
      expect(totalDispatched).toBeLessThan(10);

      harness.unmount();
    });

    test('permission filtering stress: unpermitted contributors are skipped during search', async () => {
      universalSearchRegistry.register({
        id: 'billing-secret-contributor',
        category: 'Billing',
        categoryLabel: 'Billing',
        requiredPermission: 'Clinic.SuperAdminOnly',
        search: () => [
          { id: 'b-1', category: 'Billing', title: 'Confidential Invoice', subtitle: 'P50,000', targetRoute: 'Billing' },
        ],
      });

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // Current mockStaffPermissions does NOT include 'Clinic.SuperAdminOnly'
      ctx.setQuery('invoice');
      await sleep(230);

      const state = harness.getValue();
      const hasConfidential = state.results.some((r: SearchItem) => r.id === 'b-1');
      expect(hasConfidential).toBe(false);

      harness.unmount();
    });

    test('priority ordering: Quick Actions (priority 5) and Settings (priority 15) precede Clinic API (priority 25)', async () => {
      clinicService.search = async () => {
        return [
          {
            items: [
              { id: 'api-1', category: 'Clinic', title: 'Catalog Search Match', subtitle: 'Backend', targetRoute: 'Dashboard' },
            ],
            totalCount: 1,
          },
          null,
        ];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // Query "catalog" matches Quick Action ("Services & Pricing Catalog"),
      // Setting ("Services & Pricing Catalog"), and Backend API ("Catalog Search Match")
      ctx.setQuery('catalog');
      await sleep(230);

      const state = harness.getValue();
      expect(state.results.length).toBeGreaterThanOrEqual(3);

      const categoriesInOrder = state.results.map((r: SearchItem) => r.category);
      const qaIndex = categoriesInOrder.indexOf('Quick Actions');
      const settingsIndex = categoriesInOrder.indexOf('Settings');
      const clinicIndex = categoriesInOrder.indexOf('Clinic');

      expect(qaIndex).toBeGreaterThanOrEqual(0);
      expect(settingsIndex).toBeGreaterThan(qaIndex);
      expect(clinicIndex).toBeGreaterThan(settingsIndex);

      harness.unmount();
    });

    test('flicker stress: rapid alternating typing and clearing settles cleanly with exactly 1 call', async () => {
      const recorded: string[] = [];
      clinicService.search = async (q: string) => {
        recorded.push(q);
        return [{ items: [{ id: '1', category: 'Clinic', title: q, subtitle: '', targetRoute: 'Dashboard' }], totalCount: 1 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      // Rapidly type, clear, type, clear, then settle
      ctx.setQuery('abc');
      await sleep(20);
      ctx.setQuery('');
      await sleep(20);
      ctx.setQuery('def');
      await sleep(20);
      ctx.setQuery('   ');
      await sleep(20);
      ctx.setQuery('final');

      // Zero calls during rapid sequence
      expect(recorded.length).toBe(0);

      // Wait 230ms for final debounce to fire
      await sleep(230);

      expect(recorded.length).toBe(1);
      expect(recorded[0]).toBe('final');

      const state = harness.getValue();
      expect(state.results.length).toBe(1);
      expect(state.results[0].title).toBe('final');

      harness.unmount();
    });

    test('instant category switching: switching activeCategory filters in-memory without extra network calls', async () => {
      let networkCalls = 0;
      clinicService.search = async () => {
        networkCalls++;
        return [
          {
            items: [
              { id: '1', category: 'Patients', title: 'Patient Maria', subtitle: '', targetRoute: 'Patients' },
              { id: '2', category: 'Consultations', title: 'Consultation Note', subtitle: '', targetRoute: 'Consultations' },
            ],
            totalCount: 2,
          },
          null,
        ];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('maria');
      await sleep(230); // Search resolves

      expect(networkCalls).toBe(1);
      expect(harness.getValue().results.length).toBeGreaterThanOrEqual(2);

      // Switch activeCategory from 'all' to 'patients'
      ctx.setActiveCategory('patients');
      await sleep(100);

      // Switching category tab does NOT make another network call!
      expect(networkCalls).toBe(1);

      // Switch activeCategory to 'consultations'
      ctx.setActiveCategory('consultations');
      await sleep(100);
      expect(networkCalls).toBe(1);

      harness.unmount();
    });

    test('collision-safe cleanup: overlapping provider instances do not unregister successor contributors', () => {
      // Mount Provider A
      const harnessA = safeMount(GlobalSearchProvider, { children: null });
      expect(universalSearchRegistry.size).toBe(3);

      // Mount Provider B before Provider A unmounts (overlapping lifecycle)
      const harnessB = safeMount(GlobalSearchProvider, { children: null });
      expect(universalSearchRegistry.size).toBe(3);

      // Unmount Provider A
      harnessA.unmount();

      // Provider B's contributors MUST still be registered!
      expect(universalSearchRegistry.has('clinic-quick-actions')).toBe(true);
      expect(universalSearchRegistry.has('clinic-settings-nav')).toBe(true);
      expect(universalSearchRegistry.has('clinic-api-search')).toBe(true);
      expect(universalSearchRegistry.size).toBe(3);

      // Unmount Provider B
      harnessB.unmount();
      expect(universalSearchRegistry.size).toBe(0);
    });

    test('whitespace trimming: query with irregular spaces is trimmed before registry and API dispatch', async () => {
      let queryReceivedByApi = '';
      clinicService.search = async (q: string) => {
        queryReceivedByApi = q;
        return [{ items: [], totalCount: 0 }, null];
      };

      const harness = safeMount(GlobalSearchProvider, { children: null });
      const ctx = harness.getValue();

      ctx.setQuery('   dr  santos   ');
      await sleep(230);

      expect(queryReceivedByApi).toBe('dr  santos');

      harness.unmount();
    });
  });
});
