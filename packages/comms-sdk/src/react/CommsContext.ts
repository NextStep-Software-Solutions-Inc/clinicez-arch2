import { createContext, useContext } from 'react';
import { CommsContextValue } from './types';
import { OptimisticStore } from './internal/OptimisticStore';
import { SubscriptionTracker } from './internal/SubscriptionTracker';

export interface InternalCommsContextValue extends CommsContextValue {
  store: OptimisticStore;
  subscriptionTracker: SubscriptionTracker;
}

export const CommsContext = createContext<InternalCommsContextValue | null>(null);

export function useCommsContext(): InternalCommsContextValue {
  const context = useContext(CommsContext);
  if (!context) {
    throw new Error('useComms hooks must be used within a <CommsProvider>.');
  }
  return context;
}
