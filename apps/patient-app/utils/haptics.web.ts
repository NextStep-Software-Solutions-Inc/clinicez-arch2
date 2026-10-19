export type HapticTone = 'error' | 'warning' | 'success' | 'info' | 'impact' | 'selection';

const vibrationPatterns: Record<HapticTone, number[]> = {
  success: [40, 100, 40],
  warning: [50, 100, 50],
  error: [60, 100, 60, 100, 60],
  selection: [50],
  info: [40],
  impact: [40],
};

function isVibrationAvailable(): boolean {
  return typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator;
}

function iOSSwitchHaptic(): void {
  try {
    if (typeof document === 'undefined') return;
    const labelEl = document.createElement('label');
    labelEl.ariaHidden = 'true';
    labelEl.style.display = 'none';

    const inputEl = document.createElement('input');
    inputEl.type = 'checkbox';
    inputEl.setAttribute('switch', '');
    labelEl.appendChild(inputEl);

    document.head.appendChild(labelEl);
    labelEl.click();
    document.head.removeChild(labelEl);
  } catch {}
}

/**
 * Triggers web browser haptic / vibration feedback for error, warning, success, etc.
 * Uses navigator.vibrate when available (Android/Desktop), iOS Safari switch haptic on touch,
 * and gracefully no-ops in headless / non-browser environments.
 */
export async function triggerHaptic(tone?: HapticTone): Promise<void> {
  const resolvedTone = tone ?? 'info';
  const pattern = vibrationPatterns[resolvedTone] ?? [40];

  if (isVibrationAvailable()) {
    try {
      navigator.vibrate(pattern);
    } catch {}
    return;
  }

  if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) {
    const count = resolvedTone === 'error' ? 3 : resolvedTone === 'warning' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      iOSSwitchHaptic();
    }
  }
}
