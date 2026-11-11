// token-guard:ignore-file
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  ScrollView: 'ScrollView',
}));

const {
  usePersistedScrollPosition,
  readPersistedScrollOffset,
  writePersistedScrollOffset,
} = await import('../hooks/usePersistedScrollPosition');

function createMockSessionStorage() {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
      setItem: (key: string, val: string) => {
        map.set(key, String(val));
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
      clear: () => {
        map.clear();
      },
      key: (i: number) => Array.from(map.keys())[i] ?? null,
      get length() {
        return map.size;
      },
    } as Storage,
  };
}

/**
 * Lightweight stateful hook runner for testing multi-render transitions
 * (`ready: false -> true`, `storageKey` tab switches, `onScroll`, `onContentSizeChange`).
 */
function createHookHarness<P, R>(hookFn: (props: P) => R, initialProps: P) {
  const refs: Array<{ current: any }> = [];
  const effects: Array<{ deps?: unknown[]; cleanup?: () => void; create: () => void | (() => void) }> = [];
  const memos: Array<{ deps?: unknown[]; value: any }> = [];
  let currentProps = initialProps;
  let lastResult!: R;

  function runRender() {
    let refIdx = 0;
    let effectIdx = 0;
    let memoIdx = 0;
    const pendingEffects: Array<{ slot: number; create: () => void | (() => void); deps?: unknown[] }> = [];

    const dispatcher = {
      useRef: (init: any) => {
        if (!refs[refIdx]) {
          refs[refIdx] = { current: init };
        }
        return refs[refIdx++];
      },
      useCallback: (fn: any, deps?: unknown[]) => {
        const prev = memos[memoIdx];
        const unchanged =
          prev &&
          deps &&
          prev.deps &&
          deps.length === prev.deps.length &&
          deps.every((d, i) => Object.is(d, prev.deps![i]));
        if (unchanged) {
          memoIdx++;
          return prev.value;
        }
        memos[memoIdx++] = { deps, value: fn };
        return fn;
      },
      useEffect: (create: () => void | (() => void), deps?: unknown[]) => {
        const slot = effectIdx++;
        const prev = effects[slot];
        const unchanged =
          prev &&
          deps &&
          prev.deps &&
          deps.length === prev.deps.length &&
          deps.every((d, i) => Object.is(d, prev.deps![i]));
        if (!unchanged) {
          pendingEffects.push({ slot, create, deps });
        }
      },
    };

    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prevDispatcher = internals ? internals.H : null;
    if (internals) internals.H = dispatcher;
    try {
      lastResult = hookFn(currentProps);
    } finally {
      if (internals) internals.H = prevDispatcher;
    }

    for (const eff of pendingEffects) {
      effects[eff.slot]?.cleanup?.();
      const cleanup = eff.create();
      effects[eff.slot] = {
        deps: eff.deps,
        create: eff.create,
        cleanup: typeof cleanup === 'function' ? cleanup : undefined,
      };
    }

    return lastResult;
  }

  runRender();

  return {
    get result() {
      return lastResult;
    },
    rerender(nextProps: P) {
      currentProps = nextProps;
      return runRender();
    },
    unmount() {
      for (const eff of effects) {
        eff?.cleanup?.();
      }
    },
  };
}

describe('usePersistedScrollPosition & sessionStorage scroll restoration', () => {
  let mockStore: ReturnType<typeof createMockSessionStorage>;

  beforeEach(() => {
    mockStore = createMockSessionStorage();
    (globalThis as any).window = {
      sessionStorage: mockStore.storage,
    };
  });

  test('readPersistedScrollOffset and writePersistedScrollOffset round, clamp, and handle storage errors safely', () => {
    expect(readPersistedScrollOffset('clinicez.scroll.settings.general')).toBe(0);

    writePersistedScrollOffset('clinicez.scroll.settings.general', 512.7);
    expect(mockStore.map.get('clinicez.scroll.settings.general')).toBe('513');
    expect(readPersistedScrollOffset('clinicez.scroll.settings.general')).toBe(513);

    writePersistedScrollOffset('clinicez.scroll.settings.general', -45);
    expect(readPersistedScrollOffset('clinicez.scroll.settings.general')).toBe(0);

    writePersistedScrollOffset('clinicez.scroll.settings.general', Number.NaN);
    expect(readPersistedScrollOffset('clinicez.scroll.settings.general')).toBe(0);

    // Storage throwing SecurityError never crashes caller
    (globalThis as any).window = {
      get sessionStorage(): Storage {
        throw new Error('SecurityError');
      },
    };
    expect(() => writePersistedScrollOffset('clinicez.scroll.settings.general', 200)).not.toThrow();
    expect(readPersistedScrollOffset('clinicez.scroll.settings.general')).toBe(0);
  });

  test('hydration guard preserves saved offset while ready=false (skeletons) and restores once ready=true', () => {
    const key = 'clinicez.scroll.settings.general';
    writePersistedScrollOffset(key, 640);

    const scrollCalls: Array<{ y?: number; animated?: boolean }> = [];
    const mockScrollNode: any = {
      scrollTo: (opts: { y?: number; animated?: boolean }) => {
        scrollCalls.push(opts);
      },
    };

    const harness = createHookHarness(usePersistedScrollPosition, {
      storageKey: key,
      ready: false,
    });
    (harness.result.scrollViewRef as any).current = mockScrollNode;

    // Skeleton phase fires y = 0 scroll: MUST NOT overwrite saved 640!
    harness.result.onScroll({ nativeEvent: { contentOffset: { y: 0, x: 0 } } } as any);
    expect(readPersistedScrollOffset(key)).toBe(640);
    expect(scrollCalls).toHaveLength(0);

    // Content finishes loading (`ready: true`) -> restores y = 640 immediately
    harness.rerender({ storageKey: key, ready: true });
    expect(scrollCalls).toEqual([{ y: 640, animated: false }]);
    expect(readPersistedScrollOffset(key)).toBe(640);

    // Subsequent user scroll events persist normally, including scrolling back to top (0)
    harness.result.onScroll({ nativeEvent: { contentOffset: { y: 890, x: 0 } } } as any);
    expect(readPersistedScrollOffset(key)).toBe(890);

    harness.result.onScroll({ nativeEvent: { contentOffset: { y: 0, x: 0 } } } as any);
    expect(readPersistedScrollOffset(key)).toBe(0);
  });

  test('onContentSizeChange completes deferred DOM scrollTop restoration when initial scrollHeight is shorter than target', () => {
    const key = 'clinicez.scroll.profile.preferences';
    writePersistedScrollOffset(key, 720);

    const domNode = {
      scrollTop: 0,
      scrollHeight: 400,
      clientHeight: 400,
    };
    const mockScrollNode: any = {
      scrollTo: ({ y }: { y: number }) => {
        domNode.scrollTop = Math.min(y, Math.max(0, domNode.scrollHeight - domNode.clientHeight));
      },
      getScrollableNode: () => domNode,
    };

    const harness = createHookHarness(usePersistedScrollPosition, {
      storageKey: key,
      ready: false,
    });
    (harness.result.scrollViewRef as any).current = mockScrollNode;

    // Ready becomes true before content layout expands (maxScroll = 0 < 720)
    harness.rerender({ storageKey: key, ready: true });
    // Intermediate y=0 event while pending layout expansion must still NOT overwrite 720!
    harness.result.onScroll({ nativeEvent: { contentOffset: { y: 0, x: 0 } } } as any);
    expect(readPersistedScrollOffset(key)).toBe(720);

    // Content expands to 1600px -> onContentSizeChange lands scrollTop = 720!
    domNode.scrollHeight = 1600;
    harness.result.onContentSizeChange(1024, 1600);
    expect(domNode.scrollTop).toBe(720);

    // Now user scrolling persists normally
    harness.result.onScroll({ nativeEvent: { contentOffset: { y: 500, x: 0 } } } as any);
    expect(readPersistedScrollOffset(key)).toBe(500);
  });

  test('resetScrollPosition writes 0 for switched tab and scrolls to top immediately, and SSR renders cleanly', () => {
    const generalKey = 'clinicez.scroll.settings.general';
    const staffKey = 'clinicez.scroll.settings.staff';
    writePersistedScrollOffset(generalKey, 480);
    writePersistedScrollOffset(staffKey, 920);

    const scrollCalls: Array<{ y?: number; animated?: boolean }> = [];
    const harness = createHookHarness(usePersistedScrollPosition, {
      storageKey: generalKey,
      ready: true,
    });
    (harness.result.scrollViewRef as any).current = {
      scrollTo: (opts: { y?: number; animated?: boolean }) => scrollCalls.push(opts),
    };

    // User clicks "Staff" tab -> resetScrollPosition(staffKey) clears staffKey to 0 and scrolls to y: 0
    harness.result.resetScrollPosition(staffKey);
    expect(readPersistedScrollOffset(staffKey)).toBe(0);
    expect(scrollCalls.at(-1)).toEqual({ y: 0, animated: false });

    // SSR smoke check
    function SsrProbe() {
      usePersistedScrollPosition({ storageKey: 'clinicez.scroll.ssr', ready: true });
      return React.createElement('div', null, 'ok');
    }
    expect(renderToStaticMarkup(React.createElement(SsrProbe))).toContain('ok');
  });
});
