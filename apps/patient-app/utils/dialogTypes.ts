export type DialogButtonStyle = 'default' | 'cancel' | 'destructive';

export interface DialogButton {
  text?: string;
  style?: DialogButtonStyle;
  onPress?: (value?: string) => void | Promise<void>;
}

export interface DialogOptions {
  /** Android only (parity with Alert.alert). On web, tapping the backdrop dismisses when true. */
  cancelable?: boolean;
  onDismiss?: () => void;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  options?: DialogOptions;
}

/** Shared signature: identical to `Alert.alert` so call sites can be swapped mechanically. */
export interface DialogApi {
  alert(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions): void;
  confirm(options: ConfirmOptions): Promise<boolean>;
}
