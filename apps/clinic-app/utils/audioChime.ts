/**
 * Web Audio API chime synthesizer and speech announcement engine for
 * Clinic EZ Waiting Area Public TV Display.
 *
 * Supports:
 *  - Multiple curated Web Audio API alert chimes without external media assets.
 *  - Browser-native Text-to-Speech (TTS) via window.speechSynthesis (English only).
 *  - 100% offline LAN kiosk compliance (no cloud speech APIs or external asset dependencies).
 */

export type TvSoundTheme =
  | 'classicChime'
  | 'doorbell'
  | 'marimba'
  | 'bell'
  | 'elevator'
  | 'silent';

export interface TvSoundThemePreset {
  id: TvSoundTheme;
  name: string;
  description: string;
}

export const TV_SOUND_THEMES: TvSoundThemePreset[] = [
  {
    id: 'classicChime',
    name: 'Classic Medical Chime (Default)',
    description: 'Standard hospital two-tone chime (D5 → A5)',
  },
  {
    id: 'doorbell',
    name: 'Doorbell Ding-Dong',
    description: 'Warm, welcoming two-tone chime (G4 → E4)',
  },
  {
    id: 'marimba',
    name: 'Hospital Marimba',
    description: 'Soft harmonic triad chord (C5 → E5 → G5)',
  },
  {
    id: 'bell',
    name: 'Attention Bell',
    description: 'Crisp, resonant service desk bell (C6)',
  },
  {
    id: 'elevator',
    name: 'Modern Elevator Chime',
    description: 'Subtle, low-echo single chime tone (F5 → C6)',
  },
  {
    id: 'silent',
    name: 'Silent / Mute',
    description: 'Visual call animation only, no chime sound',
  },
];

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

  if (!audioCtx || (audioCtx as any).constructor !== AudioContextClass) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

let fallbackMuted = false;

export function isAudioMuted(): boolean {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const val = localStorage.getItem(CHIME_CONFIG.storageKey);
      if (val !== null) return val === 'true';
    } catch {
      // Ignore storage read error and use fallback
    }
  }
  return fallbackMuted;
}

export function setAudioMuted(muted: boolean): void {
  fallbackMuted = muted;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(CHIME_CONFIG.storageKey, String(muted));
    } catch {
      // Ignore storage quota or security errors
    }
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
 * Plays the selected chime tone using Web Audio API synthesis.
 */
export function playAlertChime(theme: string = 'classicChime'): void {
  if (isAudioMuted() || theme === 'silent') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    switch (theme) {
      case 'doorbell': {
        // G4 (392.00 Hz) -> E4 (329.63 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(392.00, now);
        gain1.gain.setValueAtTime(0.35, now);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.45);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(329.63, now + 0.24);
        gain2.gain.setValueAtTime(0.38, now + 0.24);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.70);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.24);
        osc2.stop(now + 0.70);
        break;
      }

      case 'marimba': {
        // Triad chord C5 (523.25 Hz) -> E5 (659.25 Hz) -> G5 (783.99 Hz)
        const notes = [
          { freq: 523.25, time: now },
          { freq: 659.25, time: now + 0.12 },
          { freq: 783.99, time: now + 0.24 },
        ];
        notes.forEach(({ freq, time }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, time);
          gain.gain.setValueAtTime(0.28, time);
          gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(time);
          osc.stop(time + 0.35);
        });
        break;
      }

      case 'bell': {
        // High harmonic desk bell: C6 (1046.50 Hz)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1046.50, now);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.65);
        break;
      }

      case 'elevator': {
        // F5 (698.46 Hz) -> C6 (1046.50 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(698.46, now);
        gain1.gain.setValueAtTime(0.25, now);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.30);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.30);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1046.50, now + 0.18);
        gain2.gain.setValueAtTime(0.30, now + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.60);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.18);
        osc2.stop(now + 0.60);
        break;
      }

      case 'classicChime':
      default: {
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

        // Tone 2: 880.00 Hz (A5) starting 220ms after Tone 1
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
        break;
      }
    }
  } catch {
    // Graceful fallback if audio context fails
  }
}

/**
 * Speaks an announcement aloud using browser-native Web Speech Synthesis API.
 * Strictly English only per facility requirements.
 * Formats hyphenated or alphanumeric tickets (e.g. "P-102" -> "P 1 0 2")
 * so speech engines pronounce each digit clearly rather than mumbling.
 */
export function announceTicketVoice(params: {
  ticketNumber: string;
  roomOrStation?: string | null;
  doctorName?: string | null;
}): void {
  if (isAudioMuted()) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  try {
    // Cancel any in-flight utterance so announcements do not pile up
    window.speechSynthesis.cancel();

    // Clean pronunciation: "P-102" -> "P 1 0 2"
    const pronouncedTicket = params.ticketNumber
      .replace(/-/g, ' ')
      .split('')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    let text = `Now serving ticket ${pronouncedTicket}.`;
    if (params.roomOrStation && params.roomOrStation.trim()) {
      text += ` Please proceed to ${params.roomOrStation.trim()}.`;
    } else if (params.doctorName && params.doctorName.trim()) {
      text += ` Please proceed to ${params.doctorName.trim()}.`;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; // Strictly English only
    utterance.rate = 0.92; // Slightly paced for waiting room acoustic clarity
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
  } catch {
    // Non-fatal if speech synthesis is unsupported on platform
  }
}

/**
 * Orchestrates the full calling sequence:
 * 1. Plays selected chime sound (if not silent).
 * 2. If voiceEnabled, waits 600ms for chime decay, then reads the ticket in English.
 */
export function playQueueCallAlert(params: {
  theme?: string;
  voiceEnabled?: boolean;
  ticketNumber?: string;
  roomOrStation?: string | null;
  doctorName?: string | null;
}): void {
  if (isAudioMuted()) return;

  const theme = params.theme || 'classicChime';
  if (theme !== 'silent') {
    playAlertChime(theme);
  }

  if (params.voiceEnabled && params.ticketNumber) {
    const delay = theme === 'silent' ? 50 : 600;
    setTimeout(() => {
      announceTicketVoice({
        ticketNumber: params.ticketNumber!,
        roomOrStation: params.roomOrStation,
        doctorName: params.doctorName,
      });
    }, delay);
  }
}
