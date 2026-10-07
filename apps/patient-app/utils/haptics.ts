export type HapticTone = 'error' | 'warning' | 'success' | 'info' | 'impact' | 'selection';

let expoHaptics: typeof import('expo-haptics') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  expoHaptics = require('expo-haptics');
} catch {
  // Safe fallback in node/bun unit tests where react-native flow syntax isn't transpiled
}

/**
 * Triggers native haptic feedback (iOS Taptic Engine, Android Vibrator).
 * Safe to call on all platforms and in test environments.
 */
export async function triggerHaptic(tone?: HapticTone): Promise<void> {
  if (!expoHaptics) return;
  try {
    switch (tone) {
      case 'error':
        await expoHaptics.notificationAsync(expoHaptics.NotificationFeedbackType.Error);
        break;
      case 'warning':
        await expoHaptics.notificationAsync(expoHaptics.NotificationFeedbackType.Warning);
        break;
      case 'success':
        await expoHaptics.notificationAsync(expoHaptics.NotificationFeedbackType.Success);
        break;
      case 'selection':
        await expoHaptics.selectionAsync();
        break;
      case 'info':
      case 'impact':
      default:
        await expoHaptics.impactAsync(expoHaptics.ImpactFeedbackStyle.Light);
        break;
    }
  } catch {
    // Non-blocking fallback
  }
}
