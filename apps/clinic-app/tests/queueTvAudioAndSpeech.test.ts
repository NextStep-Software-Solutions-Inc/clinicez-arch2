import { describe, it, expect, beforeEach, mock } from 'bun:test';

mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Vibration: { vibrate: () => {} },
}));

const {
  TV_SOUND_THEMES,
  CHIME_CONFIG,
  isAudioMuted,
  setAudioMuted,
  playAlertChime,
  announceTicketVoice,
  playQueueCallAlert,
  unlockAudio,
} = await import('../utils/audioChime');

describe('Queue TV Display Alert Chimes & Voice Announcement (English Only)', () => {
  let spokenUtterances: any[] = [];
  let speechCancelled = false;

  beforeEach(() => {
    setAudioMuted(false);
    spokenUtterances = [];
    speechCancelled = false;

    // Mock window and Web Speech API
    (globalThis as any).window = {
      AudioContext: class {
        state = 'running';
        currentTime = 0;
        createOscillator() {
          return {
            type: 'sine',
            frequency: { setValueAtTime: () => {} },
            connect: () => {},
            start: () => {},
            stop: () => {},
          };
        }
        createGain() {
          return {
            gain: {
              setValueAtTime: () => {},
              exponentialRampToValueAtTime: () => {},
            },
            connect: () => {},
          };
        }
        destination = {};
        resume() {
          return Promise.resolve();
        }
      },
      speechSynthesis: {
        cancel: () => {
          speechCancelled = true;
        },
        speak: (utterance: any) => {
          spokenUtterances.push(utterance);
        },
      },
    };

    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string;
      lang = '';
      rate = 1.0;
      pitch = 1.0;
      constructor(text: string) {
        this.text = text;
      }
    };
  });

  describe('Curated Chime Themes', () => {
    it('provides all 6 curated sound themes', () => {
      const ids = TV_SOUND_THEMES.map((t: any) => t.id);
      expect(ids).toContain('classicChime');
      expect(ids).toContain('doorbell');
      expect(ids).toContain('marimba');
      expect(ids).toContain('bell');
      expect(ids).toContain('elevator');
      expect(ids).toContain('silent');
    });

    it('plays all chime themes without error', () => {
      TV_SOUND_THEMES.forEach((theme: any) => {
        expect(() => playAlertChime(theme.id)).not.toThrow();
      });
    });

    it('respects mute state and does not play when muted', () => {
      setAudioMuted(true);
      expect(isAudioMuted()).toBe(true);
      expect(() => playAlertChime('classicChime')).not.toThrow();
    });
  });

  describe('Voice Ticket Read-Aloud (Strictly English Only)', () => {
    it('pronounces hyphenated tickets clearly and sets lang to en-US', () => {
      announceTicketVoice({
        ticketNumber: 'P-102',
        roomOrStation: 'Room 3',
      });

      expect(speechCancelled).toBe(true);
      expect(spokenUtterances.length).toBe(1);

      const utterance = spokenUtterances[0];
      // Ticket number should have spaced characters for pronunciation clarity
      expect(utterance.text).toContain('P 1 0 2');
      expect(utterance.text).toContain('Please proceed to Room 3.');
      // Strictly English only
      expect(utterance.lang).toBe('en-US');
    });

    it('announces station or room and strictly omits doctor or staff names', () => {
      announceTicketVoice({
        ticketNumber: 'D-005',
        roomOrStation: 'Station 4',
        doctorName: 'Dr. Santos',
      });

      expect(spokenUtterances.length).toBe(1);
      const utterance = spokenUtterances[0];
      expect(utterance.text).toContain('D 0 0 5');
      expect(utterance.text).toContain('Please proceed to Station 4.');
      expect(utterance.text).not.toContain('Dr. Santos');
      expect(utterance.lang).toBe('en-US');
    });

    it('pronounces only ticket when room or station is absent, omitting doctor name', () => {
      announceTicketVoice({
        ticketNumber: 'D-005',
        doctorName: 'Dr. Santos',
      });

      expect(spokenUtterances.length).toBe(1);
      const utterance = spokenUtterances[0];
      expect(utterance.text).toBe('Now serving ticket D 0 0 5.');
      expect(utterance.text).not.toContain('Dr. Santos');
      expect(utterance.lang).toBe('en-US');
    });

    it('does not speak when audio is muted', () => {
      setAudioMuted(true);
      announceTicketVoice({
        ticketNumber: 'A-010',
        roomOrStation: 'Triage Desk',
      });

      expect(spokenUtterances.length).toBe(0);
    });
  });

  describe('Full Alert Sequence Coordination', () => {
    it('executes playQueueCallAlert with chime and delayed voice announcement', async () => {
      playQueueCallAlert({
        theme: 'doorbell',
        voiceEnabled: true,
        ticketNumber: 'Q-042',
        roomOrStation: 'Station 2',
      });

      // Voice is queued with a delay so chime plays first
      await new Promise((r) => setTimeout(r, 650));

      expect(spokenUtterances.length).toBe(1);
      expect(spokenUtterances[0].text).toContain('Q 0 4 2');
      expect(spokenUtterances[0].text).toContain('Station 2');
    });
  });
});
