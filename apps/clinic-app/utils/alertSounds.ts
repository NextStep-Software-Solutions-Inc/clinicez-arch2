import * as ReactNative from 'react-native';
import { Platform } from 'react-native';

const Vibration = (ReactNative as any).Vibration ?? (ReactNative as any).default?.Vibration;

export type SoundTheme =
  | 'gentleBell'
  | 'digitalPing'
  | 'marimba'
  | 'softPop'
  | 'chime'
  | 'silent'
  | 'custom';

export interface UserAudioPreferences {
  soundTheme: SoundTheme;
  customAudioDataUri?: string | null;
  customAudioFileName?: string | null;
  isMuted?: boolean;
  preferredChartLayout?: 'modal' | 'split' | 'drawer';
  themeMode?: 'light' | 'dark' | 'system';
  userBrandColorHex?: string | null;
}

export const SOUND_THEME_PRESETS: Array<{
  id: SoundTheme;
  name: string;
  description: string;
}> = [
  {
    id: 'gentleBell',
    name: 'Gentle Bell (Default)',
    description: 'Soft harmonic two-tone bell (D5 → A5)',
  },
  {
    id: 'digitalPing',
    name: 'Digital Ping',
    description: 'Crisp, modern high-pitch ping (C6 → E6)',
  },
  {
    id: 'marimba',
    name: 'Marimba Triad',
    description: 'Warm acoustic triad chord (C5 → E5 → G5)',
  },
  {
    id: 'softPop',
    name: 'Soft Pop',
    description: 'Subtle, low-frequency muted bubble pop',
  },
  {
    id: 'chime',
    name: 'Bright Chime',
    description: 'Clear two-tone notification chime (G5 → C6)',
  },
  {
    id: 'silent',
    name: 'Mute / Silent',
    description: 'Disables all alert sounds for your workstation',
  },
  {
    id: 'custom',
    name: 'Custom Audio File',
    description: 'Upload your own personalized MP3, WAV, or OGG audio clip',
  },
];

export const MAX_AUDIO_FILE_BYTES = 512 * 1024; // 500 KB limit
export const ACCEPTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg'];
export const ACCEPTED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/vorbis',
];

export function validateAudioFile(file: { name?: string; size?: number; type?: string }): {
  valid: boolean;
  error?: string;
} {
  if (!file) return { valid: false, error: 'No audio file selected.' };

  const fileName = file.name || '';
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  const isExtAllowed = ACCEPTED_AUDIO_EXTENSIONS.includes(ext);
  const isMimeAllowed = Boolean(
    file.type && ACCEPTED_AUDIO_MIME_TYPES.some((m) => file.type?.toLowerCase().startsWith(m))
  );

  if (!isExtAllowed && !isMimeAllowed) {
    return {
      valid: false,
      error: `Unsupported audio format "${ext || file.type || 'unknown'}". Only .mp3, .wav, and .ogg files are accepted.`,
    };
  }

  if (file.size && file.size > MAX_AUDIO_FILE_BYTES) {
    const kb = Math.round(file.size / 1024);
    return {
      valid: false,
      error: `Audio file is too large (${kb} KB). Maximum allowed size is 500 KB.`,
    };
  }

  return { valid: true };
}

export const ACTIVE_AUDIO_PREFERENCES_KEY = 'clinicez:user_audio_preferences';

let cachedAudioPrefs: UserAudioPreferences | null = null;

export function getActiveAudioPreferences(): UserAudioPreferences {
  if (cachedAudioPrefs) return cachedAudioPrefs;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(ACTIVE_AUDIO_PREFERENCES_KEY);
      if (raw) {
        cachedAudioPrefs = JSON.parse(raw);
        return cachedAudioPrefs!;
      }
    } catch {
      // Ignore parse failure
    }
  }
  return { soundTheme: 'gentleBell', isMuted: false };
}

export function setActiveAudioPreferences(prefs: UserAudioPreferences): void {
  cachedAudioPrefs = prefs;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(ACTIVE_AUDIO_PREFERENCES_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage error
    }
  }
}

function getAudioContext(): AudioContext | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    } catch {
      return null;
    }
  }
  return null;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  vol = 0.15,
  type: OscillatorType = 'sine'
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gain.gain.setValueAtTime(vol, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration);
}

/**
 * Plays a preview of the specified alert tone or custom audio URI.
 */
export function playAlertTone(theme: SoundTheme, customAudioDataUri?: string | null): void {
  if (theme === 'silent') return;

  if (theme === 'custom' && customAudioDataUri) {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(customAudioDataUri);
        audio.volume = 0.5;
        audio.play().catch(() => {});
        return;
      } catch {
        // Fallback to synthetic tone
      }
    }
  }

  const ctx = getAudioContext();
  if (!ctx) return;

  switch (theme) {
    case 'digitalPing':
      playTone(ctx, 1046.5, 0, 0.08, 0.18, 'triangle');
      playTone(ctx, 1318.5, 0.06, 0.16, 0.2, 'sine');
      break;
    case 'marimba':
      playTone(ctx, 523.25, 0, 0.14, 0.18, 'triangle');
      playTone(ctx, 659.25, 0.07, 0.16, 0.18, 'triangle');
      playTone(ctx, 783.99, 0.14, 0.22, 0.2, 'sine');
      break;
    case 'softPop':
      playTone(ctx, 440, 0, 0.06, 0.15, 'sine');
      playTone(ctx, 659, 0.04, 0.12, 0.16, 'sine');
      break;
    case 'chime':
      playTone(ctx, 783.99, 0, 0.12, 0.16, 'sine');
      playTone(ctx, 1046.5, 0.1, 0.25, 0.18, 'sine');
      break;
    case 'gentleBell':
    default:
      playTone(ctx, 587.33, 0, 0.12, 0.12, 'sine');
      playTone(ctx, 880, 0.08, 0.22, 0.15, 'sine');
      break;
  }
}

/**
 * Synthesizes an attention chime using Web Audio API on web workstations.
 */
export function playStatAudioChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(ctx, 880, 0, 0.18, 0.2, 'sine');
  playTone(ctx, 1174.66, 0.2, 0.35, 0.25, 'sine');
}

/**
 * Synthesizes a chat message chime according to the signed-in user's personalized sound preferences.
 */
export function playMessageChime(): void {
  const prefs = getActiveAudioPreferences();
  if (prefs.isMuted || prefs.soundTheme === 'silent') return;
  playAlertTone(prefs.soundTheme, prefs.customAudioDataUri);
}

/**
 * Triggers device vibration pattern for STAT emergency findings on supported platforms.
 */
export function triggerStatVibration(): void {
  try {
    Vibration?.vibrate?.([0, 250, 100, 250]);
  } catch {
    // Vibration unsupported or blocked
  }
}
