export type DialogButtonStyle = 'default' | 'cancel' | 'destructive';

export type DialogTone = 'error' | 'warning' | 'success' | 'info';

export interface DialogButton {
  text?: string;
  style?: DialogButtonStyle;
  onPress?: (value?: string) => void | Promise<void>;
}

export interface DialogOptions {
  /** Android only (parity with Alert.alert). On web and custom dialogs, tapping the backdrop dismisses when true. */
  cancelable?: boolean;
  onDismiss?: () => void;
  /** Explicit tone for colored borders, icons, and haptics. Auto-detected from title/buttons if omitted. */
  type?: DialogTone;
  /** Force native OS alert (UIAlertController / AlertDialog) on native mobile instead of themed custom dialog */
  nativeAlert?: boolean;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  type?: DialogTone;
  nativeAlert?: boolean;
}

export interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  options?: DialogOptions;
  tone: DialogTone;
}

/** Shared signature: identical to `Alert.alert` so call sites can be swapped mechanically. */
export interface DialogApi {
  alert(title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions): void;
  confirm(options: ConfirmOptions): Promise<boolean>;
}
