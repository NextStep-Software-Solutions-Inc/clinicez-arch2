import { Alert as RNAlert, Platform, AlertButton, AlertOptions } from 'react-native';

/**
 * Cross-platform feedback layer.
 *
 * `react-native-web` implements `Alert.alert` as a no-op, so every validation error and
 * confirmation in the app was silently swallowed in the browser build. This module
 * keeps the exact `Alert.alert(title, message, buttons)` signature:
 *   - native -> the real system dialog
 *   - web    -> a dialog rendered by <FeedbackHost /> (components/ui/FeedbackHost)
 * and adds non-blocking toasts via `notify`.
 */

export interface AlertRequest {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  cancelable: boolean;
}

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastRequest {
  id: number;
  kind: ToastKind;
  message: string;
  durationMs: number;
}

type FeedbackState = { alerts: AlertRequest[]; toasts: ToastRequest[] };

let nextId = 1;
let state: FeedbackState = { alerts: [], toasts: [] };
const listeners = new Set<() => void>();

function emit(next: FeedbackState) {
  state = next;
  listeners.forEach((l) => l());
}

export function subscribeFeedback(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFeedbackState(): FeedbackState {
  return state;
}

export function dismissAlert(id: number) {
  emit({ ...state, alerts: state.alerts.filter((a) => a.id !== id) });
}

export function dismissToast(id: number) {
  emit({ ...state, toasts: state.toasts.filter((t) => t.id !== id) });
}

function showToast(kind: ToastKind, message: string, durationMs = 4000) {
  const id = nextId++;
  emit({ ...state, toasts: [...state.toasts.slice(-2), { id, kind, message, durationMs }] });
  return id;
}

export const notify = {
  success: (message: string) => showToast('success', message),
  error: (message: string) => showToast('error', message, 6000),
  info: (message: string) => showToast('info', message),
};

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    if (Platform.OS !== 'web') {
      RNAlert.alert(title, message, buttons, options);
      return;
    }
    const resolvedButtons = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    emit({
      ...state,
      alerts: [
        ...state.alerts,
        {
          id: nextId++,
          title,
          message,
          buttons: resolvedButtons,
          cancelable: options?.cancelable !== false,
        },
      ],
    });
  },
};
