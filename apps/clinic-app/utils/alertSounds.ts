import { Platform, Vibration } from 'react-native';

/**
 * Synthesizes an attention chime using Web Audio API on web workstations.
 * Zero external audio file dependencies.
 */
export function playStatAudioChime(): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Clinical alert chime: 880Hz (A5) followed by 1174.66Hz (D6)
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };

      playTone(880, 0, 0.18);
      playTone(1174.66, 0.2, 0.35);
    } catch {
      // AudioContext could be blocked by browser autoplay policy before user gesture
    }
  }
}

/**
 * Triggers device vibration pattern for STAT emergency findings on supported platforms.
 */
export function triggerStatVibration(): void {
  try {
    Vibration.vibrate([0, 250, 100, 250]);
  } catch {
    // Vibration unsupported or blocked
  }
}
