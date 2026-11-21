/**
 * Web Audio API chime synthesizer and speech announcement engine for
 * Clinic EZ Public Waiting Area TV Display (Portal / Cloud TV).
 *
 * Supports:
 *  - Multiple curated Web Audio API alert chimes without external media assets.
 *  - Browser-native Text-to-Speech (TTS) via window.speechSynthesis (English only).
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
 */
export function announceTicketVoice(params: {
  ticketNumber: string;
  roomOrStation?: string | null;
  doctorName?: string | null;
  onEnd?: () => void;
}): void {
  if (isAudioMuted()) {
    params.onEnd?.();
    return;
  }
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    params.onEnd?.();
    return;
  }

  try {
    window.speechSynthesis.cancel();

    const pronouncedTicket = params.ticketNumber
      .replace(/-/g, ' ')
      .split('')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Strictly announce station or room only, omitting attending physician or staff
    let text = `Now serving ticket ${pronouncedTicket}.`;
    if (params.roomOrStation && params.roomOrStation.trim()) {
      text += ` Please proceed to ${params.roomOrStation.trim()}.`;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; // Strictly English only
    utterance.rate = 0.92;
    utterance.pitch = 1.0;

    let finished = false;
    const finish = () => {
      if (!finished) {
        finished = true;
        params.onEnd?.();
      }
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    setTimeout(finish, 6000);

    window.speechSynthesis.speak(utterance);
  } catch {
    params.onEnd?.();
  }
}

/**
 * Orchestrates the full calling sequence for Cloud TV display:
 * 1. Plays selected chime sound (if not silent).
 * 2. If voiceEnabled, waits 600ms for chime decay, then reads the ticket in English.
 * 3. Triggers onStart and onEnd lifecycle callbacks for glowing synchronization.
 */
export function playQueueCallAlert(params: {
  theme?: string;
  voiceEnabled?: boolean;
  ticketNumber?: string;
  roomOrStation?: string | null;
  doctorName?: string | null;
  onStart?: () => void;
  onEnd?: () => void;
}): void {
  params.onStart?.();

  if (isAudioMuted()) {
    setTimeout(() => {
      params.onEnd?.();
    }, 3200);
    return;
  }

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
        onEnd: params.onEnd,
      });
    }, delay);
  } else {
    setTimeout(() => {
      params.onEnd?.();
    }, 3200);
  }
}
