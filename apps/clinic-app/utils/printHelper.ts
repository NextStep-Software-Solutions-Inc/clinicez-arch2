import { Linking, Alert } from 'react-native';

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

export function printReceiptDialog(title: string, details: string) {
  Alert.alert(title, details);
}
