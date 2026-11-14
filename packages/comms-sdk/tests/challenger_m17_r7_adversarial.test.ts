import { describe, it, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';

describe('Milestone M17 Challenger: Empirical Verification of R7.1 & R7.2', () => {
  const rootDir = path.resolve(__dirname, '../../..');

  describe('Focus 1: Absolute Zero Emojis and Zero Cross Dingbats Across UI', () => {
    const targetDirs = [
      'packages/comms-sdk/src/native-ui',
      'packages/comms-sdk/src/web-ui',
      'apps/clinic-app/components/teleconsult',
      'apps/portal-web/src/components/teleconsult',
    ];

    const comprehensiveEmojiRegex =
      /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}\u{1FA00}-\u{1FAFF}\u{200D}\u{FE0F}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FB}\u{25FC}\u{25B6}\u{25C0}\u{3297}\u{3299}]/gu;

    const crossDingbats = ['✕', '✖', '❌', '✗', '✘'];

    function getTsxFiles(dirPath: string): string[] {
      const absDir = path.join(rootDir, dirPath);
      if (!fs.existsSync(absDir)) return [];
      const results: string[] = [];
      const entries = fs.readdirSync(absDir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(absDir, entry.name);
        if (entry.isDirectory()) {
          results.push(...getTsxFiles(path.join(dirPath, entry.name)));
        } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          results.push(full);
        }
      }
      return results;
    }

    it('1.1: Every UI component in the 4 target directories contains 0 emoji characters', () => {
      const violations: { file: string; line: number; match: string }[] = [];

      for (const dir of targetDirs) {
        const files = getTsxFiles(dir);
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            const matches = line.match(comprehensiveEmojiRegex);
            if (matches) {
              matches.forEach((m) => {
                violations.push({
                  file: path.relative(rootDir, file),
                  line: idx + 1,
                  match: m,
                });
              });
            }
          });
        }
      }

      expect(violations).toEqual([]);
    });

    it('1.2: Every UI component in the 4 target directories contains 0 cross dingbats (✕, ✖, ❌)', () => {
      const violations: { file: string; line: number; char: string }[] = [];

      for (const dir of targetDirs) {
        const files = getTsxFiles(dir);
        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            for (const dingbat of crossDingbats) {
              if (line.includes(dingbat)) {
                violations.push({
                  file: path.relative(rootDir, file),
                  line: idx + 1,
                  char: dingbat,
                });
              }
            }
          });
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('Focus 2: Inline Lucide SVGs & sr-only Wrapping in web-ui', () => {
    it('2.1: packages/comms-sdk/src/web-ui/icons.tsx exports 22 Lucide-style SVG icons with standard properties', () => {
      const iconsPath = path.join(rootDir, 'packages/comms-sdk/src/web-ui/icons.tsx');
      expect(fs.existsSync(iconsPath)).toBe(true);
      const content = fs.readFileSync(iconsPath, 'utf-8');

      const expectedIcons = [
        'MicIcon',
        'MicOffIcon',
        'VideoIcon',
        'VideoOffIcon',
        'ScreenShareIcon',
        'UsersIcon',
        'MessageSquareIcon',
        'CircleDotIcon',
        'PhoneOffIcon',
        'ShieldCheckIcon',
        'LockIcon',
        'DockIcon',
        'PipIcon',
        'RotateCwIcon',
        'ShareIcon',
        'CopyIcon',
        'CloseIcon',
        'CheckIcon',
        'CheckCheckIcon',
        'AlertCircleIcon',
        'LoaderIcon',
        'UserIcon',
      ];

      for (const icon of expectedIcons) {
        expect(content).toContain(`export const ${icon}`);
      }

      // Check standard Lucide attributes
      expect(content).toContain('viewBox="0 0 24 24"');
      expect(content).toContain('stroke="currentColor"');
      expect(content).toContain('strokeWidth="2"');
    });

    it('2.2: Raw button fallback text in web-ui/CallStage.tsx is strictly enclosed in <span className="sr-only">', () => {
      const stagePath = path.join(rootDir, 'packages/comms-sdk/src/web-ui/CallStage.tsx');
      const content = fs.readFileSync(stagePath, 'utf-8');

      // Verify buttons have sr-only fallbacks
      expect(content).toContain('<span className="sr-only">{isMicEnabled ? \'MIC\' : \'MUTE\'}</span>');
      expect(content).toContain('<span className="sr-only">{isCameraEnabled ? \'CAM\' : \'OFF\'}</span>');
      expect(content).toContain('<span className="sr-only">{isScreenSharing ? \'SHARING\' : \'SHARE\'}</span>');
      expect(content).toContain('<span className="sr-only">DOCK</span>');
      expect(content).toContain('<span className="sr-only">PIP</span>');
      expect(content).toContain('<span className="sr-only">ROTATE</span>');
      expect(content).toContain('<span className="sr-only">USERS</span>');
      expect(content).toContain('<span className="sr-only">REC</span>');
      expect(content).toContain('<span className="sr-only">END</span>');
    });

    it('2.3: Raw button fallback text in web-ui/CallWaitingRoom.tsx is strictly enclosed in <span className="sr-only">', () => {
      const waitingPath = path.join(rootDir, 'packages/comms-sdk/src/web-ui/CallWaitingRoom.tsx');
      const content = fs.readFileSync(waitingPath, 'utf-8');

      expect(content).toContain('<span className="sr-only">{isMicActive ? \'MIC\' : \'MUTE\'}</span>');
      expect(content).toContain('<span className="sr-only">{isCameraActive ? \'CAM\' : \'OFF\'}</span>');
      expect(content).toContain('<span className="sr-only">SHARE</span>');
      expect(content).toContain('<span className="sr-only">LOCK</span>');
      expect(content).toContain('<span className="sr-only">OK</span>');
    });
  });

  describe('Focus 3: native-ui Geometric Cross Bars & Indicator Invariants', () => {
    it('3.1: btn-close-participants renders two geometric View cross bars with rotate 45deg and -45deg without text', () => {
      const nativeStagePath = path.join(rootDir, 'packages/comms-sdk/src/native-ui/CallStage.tsx');
      const content = fs.readFileSync(nativeStagePath, 'utf-8');

      const btnMatch = content.match(/testID="btn-close-participants"[\s\S]*?<\/TouchableOpacity>/);
      expect(btnMatch).not.toBeNull();
      const btnContent = btnMatch![0];

      expect(btnContent).not.toContain('<Text');
      expect(btnContent).not.toContain('✕');
      expect(btnContent).toContain("transform: [{ rotate: '45deg' }]");
      expect(btnContent).toContain("transform: [{ rotate: '-45deg' }]");
    });

    it('3.2: native-ui roster mic/cam/screen indicators reuse existing COMMS_ICON_MAP keys and fall back to Views', () => {
      const nativeStagePath = path.join(rootDir, 'packages/comms-sdk/src/native-ui/CallStage.tsx');
      const content = fs.readFileSync(nativeStagePath, 'utf-8');

      expect(content).toContain("renderIcon(active ? 'mic' : 'micOff'");
      expect(content).toContain("renderIcon(active ? 'video' : 'videoOff'");
      expect(content).toContain("renderIcon('screenShare'");

      // Geometric View fallbacks
      expect(content).toContain('accessibilityLabel={active ? \'Microphone active\' : \'Microphone muted\'}');
      expect(content).toContain('accessibilityLabel={active ? \'Camera active\' : \'Camera off\'}');
      expect(content).toContain('accessibilityLabel="Screen sharing active"');
    });
  });

  describe('Focus 4: Strict 17-Key COMMS_ICON_MAP Invariant', () => {
    it('4.1: COMMS_ICON_MAP in TeleconsultWaitingRoomModal.tsx contains EXACTLY 17 keys', () => {
      const modalPath = path.join(
        rootDir,
        'apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx'
      );
      const content = fs.readFileSync(modalPath, 'utf-8');

      const mapMatch = content.match(/const\s+COMMS_ICON_MAP[^{]+{([^}]+)}/s);
      expect(mapMatch).not.toBeNull();

      const mapBody = mapMatch![1];
      const keys = mapBody
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('//'))
        .map((l) => l.split(':')[0].trim());

      expect(keys.length).toBe(17);
      expect(keys).toEqual([
        'mic',
        'micOff',
        'video',
        'videoOff',
        'cameraOff',
        'screenShare',
        'screenShareOff',
        'switchCamera',
        'chat',
        'recordDot',
        'phoneOff',
        'shieldCheck',
        'lock',
        'dock',
        'pip',
        'rotate',
        'share',
      ]);
    });
  });

  describe('Focus 5: Tailwind CSS v4 globals.css @source Directive', () => {
    it('5.1: apps/portal-web/src/app/globals.css includes @source directive pointing to comms-sdk/src', () => {
      const globalsPath = path.join(rootDir, 'apps/portal-web/src/app/globals.css');
      const content = fs.readFileSync(globalsPath, 'utf-8');

      expect(content).toContain('@source "../../../../packages/comms-sdk/src";');
    });
  });

  describe('Focus 6: TeleconsultGuestFlow Hardware Lifecycle & Mappers', () => {
    const guestFlowPath = path.join(
      rootDir,
      'apps/portal-web/src/components/teleconsult/TeleconsultGuestFlow.tsx'
    );

    it('6.1: getUserMedia preview stream tracks are cleanly stopped and AudioContext is closed when transitioning out of waiting_room', () => {
      const content = fs.readFileSync(guestFlowPath, 'utf-8');

      // Check transition out of waiting_room
      expect(content).toContain('if (stage !== "waiting_room") {');
      expect(content).toContain('previewStreamRef.current.getTracks().forEach((t) => t.stop());');
      expect(content).toContain('audioCtxRef.current.close().catch(() => {});');

      // Check handleEnterCall
      expect(content).toContain('const handleEnterCall = useCallback(() => {');
      expect(content).toContain('setStage("in_call");');

      // Check handleCancelCall
      expect(content).toContain('const handleCancelCall = useCallback(() => {');
      expect(content).toContain('setStage("ended");');
    });

    it('6.2: TeleconsultGuestFlow provides exhaustive 17-key renderIcon, renderParticipantsIcon, and renderPrivacyIcon', () => {
      const content = fs.readFileSync(guestFlowPath, 'utf-8');

      const expectedCases = [
        '"mic"',
        '"micOff"',
        '"video"',
        '"videoOff"',
        '"cameraOff"',
        '"screenShare"',
        '"screenShareOff"',
        '"switchCamera"',
        '"chat"',
        '"recordDot"',
        '"phoneOff"',
        '"shieldCheck"',
        '"lock"',
        '"dock"',
        '"pip"',
        '"rotate"',
        '"share"',
      ];

      for (const c of expectedCases) {
        expect(content).toContain(`case ${c}:`);
      }

      expect(content).toContain('const renderParticipantsIcon = useCallback(');
      expect(content).toContain('<Users size=');

      expect(content).toContain('const renderPrivacyIcon = useCallback(');
      expect(content).toContain('<EyeOff size=');
      expect(content).toContain('<Eye size=');
    });
  });
});
