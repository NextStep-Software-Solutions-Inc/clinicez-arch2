import type {
  ConfirmOptions,
  DialogApi,
  DialogButton,
  DialogOptions,
  DialogRequest,
} from './dialogTypes';

export type { ConfirmOptions, DialogApi, DialogButton, DialogOptions } from './dialogTypes';

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

export const dialog: DialogApi = {
  alert(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions) {
    queue = [
      ...queue,
      {
        id: nextId++,
        title,
        message,
        buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
        options,
      },
    ];
    emit();
  },
  confirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive }: ConfirmOptions) {
    return new Promise<boolean>((resolve) => {
      dialog.alert(
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
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
  },
};

export default dialog;
