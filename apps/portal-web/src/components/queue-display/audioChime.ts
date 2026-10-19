/**
 * Web Audio API chime synthesizer for Clinic EZ Public Waiting Area TV Display.
 * Generates an audible medical chime without external audio assets.
 * Conforms to F2.5 audio specs:
 *   Tone 1: 587.33 Hz (D5)
 *   Tone 2: 880.00 Hz (A5)
 *   Duration: 400ms per tone
 *   Persistence key: 'clinicez_tv_muted'
 */

export const CHIME_CONFIG = {
  tone1Hz: 587.33,
  tone2Hz: 880.00,
  durationMs: 400,
  storageKey: 'clinicez_tv_muted',
} as const;

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isAudioMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CHIME_CONFIG.storageKey) === 'true';
  } catch {
    return false;
  }
}

export function setAudioMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHIME_CONFIG.storageKey, String(muted));
  } catch {
    // Ignore storage quota or security errors
  }
}

export function unlockAudio(): boolean {
  try {
    const ctx = getAudioContext();
    return !!ctx;
  } catch {
    return false;
  }
}

/**
 * Plays the two-tone medical alert chime (D5 -> A5).
 */
export function playAlertChime(): void {
  if (isAudioMuted()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(CHIME_CONFIG.tone1Hz, now);

    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + CHIME_CONFIG.durationMs / 1000);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + CHIME_CONFIG.durationMs / 1000);

    // Tone 2: 880.00 Hz (A5) starting 200ms after Tone 1
    const tone2Start = now + 0.22;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(CHIME_CONFIG.tone2Hz, tone2Start);

    gain2.gain.setValueAtTime(0.35, tone2Start);
    gain2.gain.exponentialRampToValueAtTime(0.0001, tone2Start + CHIME_CONFIG.durationMs / 1000);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(tone2Start);
    osc2.stop(tone2Start + CHIME_CONFIG.durationMs / 1000);
  } catch {
    // Graceful fallback if audio context fails
  }
}
