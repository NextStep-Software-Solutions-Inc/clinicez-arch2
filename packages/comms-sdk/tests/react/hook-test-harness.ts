import React from 'react';

export interface RenderHookOptions<Props> {
  initialProps?: Props;
  wrapper?: React.FC<{ children: React.ReactNode }>;
  contextValues?: Map<React.Context<any>, any>;
}

export function createHookHarness<Result, Props = any>(
  hookFn: (props: Props) => Result,
  options?: RenderHookOptions<Props>
) {
  let stateSlots: any[] = [];
  let slotIndex = 0;
  let effectSlots: Array<{ fn: () => any; cleanup?: any; deps: any[]; hasChanged: boolean }> = [];
  let effectIndex = 0;
  let refSlots: Array<{ current: any }> = [];
  let refIndex = 0;
  let memoSlots: Array<{ value: any; deps: any[] }> = [];
  let memoIndex = 0;
  let currentProps = options?.initialProps as Props;
  let hookResult: Result;

  const contextMap = options?.contextValues ?? new Map<React.Context<any>, any>();

  const mockHooks: any = {
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
    useMemo: (fn: any, deps: any[]) => {
      const idx = memoIndex++;
      const prev = memoSlots[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (hasChanged) {
        const value = fn();
        memoSlots[idx] = { value, deps };
        return value;
      }
      return prev.value;
    },
    useEffect: (fn: any, deps: any[]) => {
      const idx = effectIndex++;
      const prev = effectSlots[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev?.deps[i]);
      effectSlots[idx] = { fn, deps, hasChanged, cleanup: prev?.cleanup };
    },
    useContext: (context: React.Context<any>) => {
      if (contextMap.has(context)) {
        return contextMap.get(context);
      }
      return (context as any)._currentValue;
    }
  };

  let isRendering = false;
  let hasPendingRender = false;

  function scheduleRender() {
    if (isRendering) {
      hasPendingRender = true;
      return;
    }
    render();
  }

  function render() {
    if (isRendering) return;
    isRendering = true;
    try {
      do {
        hasPendingRender = false;
        slotIndex = 0;
        effectIndex = 0;
        refIndex = 0;
        memoIndex = 0;

        const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
        const prevDispatcher = internals ? internals.H : null;
        if (internals) {
          internals.H = mockHooks;
        }

        try {
          hookResult = hookFn(currentProps);
        } finally {
          if (internals) {
            internals.H = prevDispatcher;
          }
        }

        // Run effects that changed
        for (const eff of effectSlots) {
          if (eff.hasChanged) {
            eff.hasChanged = false;
            if (typeof eff.cleanup === 'function') {
              eff.cleanup();
            }
            eff.cleanup = eff.fn();
          }
        }
      } while (hasPendingRender);
    } finally {
      isRendering = false;
    }
  }

  render();

  return {
    get result() {
      return { current: hookResult };
    },
    rerender: (newProps?: Props) => {
      if (newProps !== undefined) currentProps = newProps;
      render();
    },
    unmount: () => {
      for (const eff of effectSlots) {
        if (typeof eff.cleanup === 'function') {
          eff.cleanup();
        }
      }
    }
  };
}

export async function act(callback: () => Promise<void> | void): Promise<void> {
  await callback();
}
