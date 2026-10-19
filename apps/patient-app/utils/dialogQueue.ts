import type { ConfirmOptions, DialogButton, DialogOptions, DialogRequest } from './dialogTypes';
import { resolveDialogTone } from './dialogTone';
import { triggerHaptic } from './haptics';

type Listener = (queue: DialogRequest[]) => void;

let nextId = 1;
let queue: DialogRequest[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(queue);
}

/** Subscribe to the pending dialog queue (used by <DialogHost />). Returns an unsubscribe fn. */
export function subscribeDialogs(listener: Listener): () => void {
  listeners.add(listener);
  listener(queue);
  return () => {
    listeners.delete(listener);
  };
}

/** Remove a dialog from the queue (called by the host once a button/backdrop closed it). */
export function resolveDialog(id: number) {
  queue = queue.filter((d) => d.id !== id);
  emit();
}

/** Enqueue a dialog alert with tone resolution and haptic trigger. */
export function enqueueAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options?: DialogOptions
): DialogRequest {
  const tone = resolveDialogTone(title, message, buttons, options?.type);
  void triggerHaptic(tone);

  const request: DialogRequest = {
    id: nextId++,
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
    options,
    tone,
  };

  queue = [...queue, request];
  emit();
  return request;
}

/** Enqueue a confirm dialog with tone resolution and haptic trigger. */
export function enqueueConfirm({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  type,
  nativeAlert,
}: ConfirmOptions): Promise<boolean> {
  const tone = resolveDialogTone(title, message, undefined, type, destructive);
  void triggerHaptic(tone);

  return new Promise<boolean>((resolve) => {
    enqueueAlert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false), type: tone, nativeAlert }
    );
  });
}
