import { Linking, Alert } from 'react-native';

/**
 * Facility letterhead printed around a receipt. Every field is optional so callers
 * can pass `useClinic().letterhead` straight through; empty values are skipped.
 */
export interface PrintLetterhead {
  header?: string;
  subHeader?: string;
  address?: string;
  contact?: string;
  footer?: string;
}

export async function openPrintableUrl(url: string): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function printReceiptDialog(title: string, details: string, letterhead?: PrintLetterhead) {
  const footer = letterhead?.footer?.trim();
  Alert.alert(title, footer ? `${details}\n\n${footer}` : details);
}
