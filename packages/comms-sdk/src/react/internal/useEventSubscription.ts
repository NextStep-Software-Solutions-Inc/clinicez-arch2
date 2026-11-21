import { useEffect } from 'react';
import { CommsEventMap, CommsEventEmitter } from '../../core/events/CommsEventEmitter';

export function useEventSubscription<K extends keyof CommsEventMap>(
  emitter: CommsEventEmitter | undefined,
  event: K,
  listener: CommsEventMap[K]
): void {
  useEffect(() => {
    if (!emitter) return;
    let isMounted = true;

    const safeListener = ((...args: any[]) => {
      if (!isMounted) return;
      (listener as any)(...args);
    }) as CommsEventMap[K];

    const unsubscribe = emitter.on(event, safeListener);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [emitter, event, listener]);
}
