// token-guard:ignore-file (native adapter around Alert.alert / themed dialogs)
import { Alert } from 'react-native';
import type { ConfirmOptions, DialogApi, DialogButton, DialogOptions } from './dialogTypes';
import { enqueueAlert, enqueueConfirm, resolveDialog, subscribeDialogs } from './dialogQueue';
import { resolveDialogTone } from './dialogTone';
import { triggerHaptic } from './haptics';

export type { ConfirmOptions, DialogApi, DialogButton, DialogOptions, DialogTone } from './dialogTypes';
export { resolveDialog, subscribeDialogs };

/**
 * Cross-platform dialog service.
 * Supports distinct error, warning, and success borders and haptic feedback.
 */
export const dialog: DialogApi = {
  alert(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions) {
    const tone = resolveDialogTone(title, message, buttons, options?.type);
    void triggerHaptic(tone);

    if (options?.nativeAlert) {
      Alert.alert(title, message, buttons, options);
      return;
    }
    enqueueAlert(title, message, buttons, options);
  },
  confirm(options: ConfirmOptions) {
    const tone = resolveDialogTone(options.title, options.message, undefined, options.type, options.destructive);
    void triggerHaptic(tone);

    if (options.nativeAlert) {
      return new Promise<boolean>((resolve) => {
        Alert.alert(
          options.title,
          options.message,
          [
            { text: options.cancelLabel ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
              text: options.confirmLabel ?? 'Confirm',
              style: options.destructive ? 'destructive' : 'default',
              onPress: () => resolve(true),
            },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        );
      });
    }
    return enqueueConfirm(options);
  },
};

export default dialog;
