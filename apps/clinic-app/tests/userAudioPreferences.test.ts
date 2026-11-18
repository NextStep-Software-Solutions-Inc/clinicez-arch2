import { describe, it, expect, beforeEach, mock } from 'bun:test';

mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Vibration: { vibrate: () => {} },
}));

const {
  SOUND_THEME_PRESETS,
  validateAudioFile,
  getActiveAudioPreferences,
  setActiveAudioPreferences,
  MAX_AUDIO_FILE_BYTES,
} = await import('../utils/alertSounds');

describe('User Audio Preferences & Sound Customization', () => {
  beforeEach(() => {
    setActiveAudioPreferences({
      soundTheme: 'gentleBell',
      isMuted: false,
    });
  });

  describe('Audio File Validation', () => {
    it('accepts valid MP3, WAV, and OGG files within the 500 KB ceiling', () => {
      const mp3File = { name: 'chime.mp3', size: 120 * 1024, type: 'audio/mpeg' };
      const wavFile = { name: 'alert.wav', size: 250 * 1024, type: 'audio/wav' };
      const oggFile = { name: 'ding.ogg', size: 400 * 1024, type: 'audio/ogg' };

      expect(validateAudioFile(mp3File).valid).toBe(true);
      expect(validateAudioFile(wavFile).valid).toBe(true);
      expect(validateAudioFile(oggFile).valid).toBe(true);
    });

    it('rejects disallowed file extensions with clear error message', () => {
      const pdf = { name: 'document.pdf', size: 10 * 1024, type: 'application/pdf' };
      const exe = { name: 'malware.exe', size: 10 * 1024, type: 'application/x-msdownload' };
      const mp4 = { name: 'video.mp4', size: 10 * 1024, type: 'video/mp4' };

      const pdfCheck = validateAudioFile(pdf);
      expect(pdfCheck.valid).toBe(false);
      expect(pdfCheck.error).toContain('Only .mp3, .wav, and .ogg files are accepted');

      const exeCheck = validateAudioFile(exe);
      expect(exeCheck.valid).toBe(false);
      expect(exeCheck.error).toContain('Only .mp3, .wav, and .ogg files are accepted');

      const mp4Check = validateAudioFile(mp4);
      expect(mp4Check.valid).toBe(false);
      expect(mp4Check.error).toContain('Only .mp3, .wav, and .ogg files are accepted');
    });

    it('rejects audio files exceeding the 500 KB limit', () => {
      const oversizedFile = {
        name: 'huge_chime.wav',
        size: MAX_AUDIO_FILE_BYTES + 1024,
        type: 'audio/wav',
      };

      const result = validateAudioFile(oversizedFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Audio file is too large');
      expect(result.error).toContain('Maximum allowed size is 500 KB');
    });
  });

  describe('Sound Preset Themes', () => {
    it('contains all curated sound presets including mute and custom', () => {
      const presetIds = SOUND_THEME_PRESETS.map((p: any) => p.id);
      expect(presetIds).toContain('gentleBell');
      expect(presetIds).toContain('digitalPing');
      expect(presetIds).toContain('marimba');
      expect(presetIds).toContain('softPop');
      expect(presetIds).toContain('chime');
      expect(presetIds).toContain('silent');
      expect(presetIds).toContain('custom');
    });
  });

  describe('Persistence & PreferencesJson Mapping', () => {
    it('serializes and deserializes user preferences cleanly', () => {
      const samplePrefs = {
        soundTheme: 'marimba' as const,
        customAudioDataUri: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        customAudioFileName: 'marimba_custom.wav',
        isMuted: true,
        preferredChartLayout: 'split' as const,
      };

      const json = JSON.stringify(samplePrefs);
      const parsed = JSON.parse(json);

      expect(parsed.soundTheme).toBe('marimba');
      expect(parsed.customAudioFileName).toBe('marimba_custom.wav');
      expect(parsed.isMuted).toBe(true);
      expect(parsed.preferredChartLayout).toBe('split');

      setActiveAudioPreferences(parsed);
      const active = getActiveAudioPreferences();
      expect(active.soundTheme).toBe('marimba');
      expect(active.preferredChartLayout).toBe('split');
      expect(active.isMuted).toBe(true);
    });
  });
});
