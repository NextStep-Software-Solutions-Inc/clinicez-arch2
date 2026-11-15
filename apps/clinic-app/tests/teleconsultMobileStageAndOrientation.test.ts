import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const modalPath = path.join(
  import.meta.dir,
  '../components/teleconsult/TeleconsultWaitingRoomModal.tsx',
);
const modalSource = fs.readFileSync(modalPath, 'utf8');

describe('Clinic Teleconsult Mobile Stage & Auto Orientation', () => {
  it('1. fullScreenStage preserves challenger_m9 layout invariants while capping to dynamic viewport bounds', () => {
    const fullScreenStyleMatch = modalSource.match(/fullScreenStage:\s*\{([\s\S]*?)\},/);
    expect(fullScreenStyleMatch).not.toBeNull();
    const styleBody = fullScreenStyleMatch![1];

    expect(styleBody).toContain("position: 'fixed'");
    expect(styleBody).toContain("width: '100vw'");
    expect(styleBody).toContain("height: '100vh'");
    expect(styleBody).toContain('zIndex: 2000000');
    expect(styleBody).toContain("maxWidth: '100dvw'");
    expect(styleBody).toContain("maxHeight: '100dvh'");
    expect(styleBody).toContain("overflow: 'hidden'");

    expect(modalSource).toContain('testID="teleconsult-active-stage-container"');
    expect(modalSource).toContain('webStageViewportHeight');
    expect(modalSource).toContain('window.visualViewport');
    expect(modalSource).toContain('window.innerHeight');
  });

  it('2. WebVideoTrackView accepts onIntrinsicDimensions and subscribes to video dimension events', () => {
    expect(modalSource).toContain('onIntrinsicDimensions?: (width: number, height: number) => void;');
    expect(modalSource).toContain("el.addEventListener('loadedmetadata', reportIntrinsicDims)");
    expect(modalSource).toContain("el.addEventListener('loadeddata', reportIntrinsicDims)");
    expect(modalSource).toContain("el.addEventListener('resize', reportIntrinsicDims)");
  });

  it('3. ActiveTeleconsultModal wires useAutoVideoOrientation across CallStage, CallWaitingRoom, and docked PiP', () => {
    expect(modalSource).toContain('useAutoVideoOrientation({');

    const callStageMatch = modalSource.match(/<CallStage([\s\S]*?)\/>/);
    expect(callStageMatch).not.toBeNull();
    expect(callStageMatch![1]).toContain('videoOrientation={videoOrientation}');
    expect(callStageMatch![1]).toContain('onToggleOrientation={handleToggleOrientation}');
    expect(callStageMatch![1]).toContain(
      'onIntrinsicDimensions={!session.mediaTracks.isScreenSharing ? reportVideoDimensions : undefined}',
    );

    const waitingRoomMatch = modalSource.match(/<CallWaitingRoom([\s\S]*?)\/>/);
    expect(waitingRoomMatch).not.toBeNull();
    expect(waitingRoomMatch![1]).toContain('videoOrientation={videoOrientation}');
    expect(waitingRoomMatch![1]).toContain('onToggleOrientation={handleToggleOrientation}');
    expect(waitingRoomMatch![1]).toContain('onIntrinsicDimensions={reportVideoDimensions}');

    const dockedPipMatch = modalSource.match(/styles\.dockedPipSelfInset([\s\S]*?)pointerEvents="none"/);
    expect(dockedPipMatch).not.toBeNull();
    expect(dockedPipMatch![1]).toContain('styles.dockedPipSelfInsetPortrait');
    expect(modalSource).toContain('dockedPipSelfInsetPortrait:');
  });

  it('4. CallStage dark-mode contrast overrides derive from semantic theme tokens with zero raw hex/rgba', () => {
    expect(modalSource).toContain('colors={callStageColors}');
    expect(modalSource).toContain('const callStageColors = useMemo(');
    expect(modalSource).toContain('surfaceInverse: activeTheme.resolvedColors.background');
    expect(modalSource).toContain('textInverted: activeTheme.resolvedColors.text');
    expect(modalSource).toContain('onPrimary: activeTheme.resolvedColors.text');

    expect(modalSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(modalSource).not.toMatch(/\brgba?\s*\(/i);
  });
});
