// token-guard:ignore-file (this file is the native adapter around Alert.alert)
import { Alert } from 'react-native';
import type { ConfirmOptions, DialogApi, DialogButton, DialogOptions } from './dialogTypes';

export type { ConfirmOptions, DialogApi, DialogButton, DialogOptions } from './dialogTypes';

/**
 * Cross-platform dialog service.
 *
 * Native: thin wrapper over `Alert.alert` (platform-native look).
 * Web: `dialog.web.ts` queues requests rendered by <DialogHost /> - react-native-web's
 * `Alert.alert` is a no-op, so button callbacks would otherwise never run.
 */
export const dialog: DialogApi = {
  alert(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions) {
    Alert.alert(title, message, buttons, options);
  },
  confirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive }: ConfirmOptions) {
    return new Promise<boolean>((resolve) => {
      Alert.alert(
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
