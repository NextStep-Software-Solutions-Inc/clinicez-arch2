import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';
import { lightColors, createShadows } from '@clinicez/design-tokens';

const RNMock = {
  View: 'div',
  Text: 'span',
  TouchableOpacity: 'button',
  TextInput: 'input',
  ScrollView: 'div',
  ActivityIndicator: 'div',
  Modal: (props: any) => (props.visible ? React.createElement('div', { ...props, 'data-modal': 'true' }) : null),
  StyleSheet: {
    create: (styles: any) => styles
  }
};

mock.module('react-native', () => RNMock);

import { GuestJoinPage, formatDobInput } from '../../src/web-ui/GuestJoinPage';
import { CallWaitingRoom as WebCallWaitingRoom } from '../../src/web-ui/CallWaitingRoom';
import { CallStage as WebCallStage } from '../../src/web-ui/CallStage';
import { createHookHarness, act } from '../react/hook-test-harness';

let NativeCallWaitingRoom: any;
let NativeCallStage: any;

beforeAll(async () => {
  const wrMod = await import('../../src/native-ui/CallWaitingRoom');
  NativeCallWaitingRoom = wrMod.CallWaitingRoom;
  const stageMod = await import('../../src/native-ui/CallStage');
  NativeCallStage = stageMod.CallStage;
});

function getTextContent(element: any): string {
  if (!element) return '';
  if (typeof element === 'string') return element;
  if (typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(getTextContent).join(' ');
  if (element.props?.children) return getTextContent(element.props.children);
  return '';
}

function findElement(element: any, predicate: (el: any) => boolean): any {
  if (!element) return null;
  if (predicate(element)) return element;
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  if (element.props?.children) {
    if (Array.isArray(element.props.children)) {
      for (const child of element.props.children) {
        const found = findElement(child, predicate);
        if (found) return found;
      }
    } else {
      return findElement(element.props.children, predicate);
    }
  }
  return null;
}

const baseWebWRProps = {
  callId: 'call-ux-1',
  appointmentId: 'apt-ux-1',
  userRole: 'Clinician' as const,
  patientName: 'Clemente, Mark Kenneth C.',
  clinicianName: 'Wave Ambray',
  scheduledTime: '2026-11-13 at 4:00 PM',
  paymentPolicy: 'Exempt' as const,
  paymentStatus: 'Exempt' as const,
  isReadyToAdmit: true,
  recordingConsentStatus: 'None' as const,
  onAdmitPatient: () => {},
  onSubmitConsent: () => {},
  onEnterCall: () => {},
  onCancelCall: () => {},
  patientLink: 'https://portal.dev.clinicez.net/teleconsult/join?token=abc',
  patientPin: '494470',
  onSharePatientLink: () => {},
  onCopyPatientPin: () => {},
};

const baseNativeWRProps = {
  ...baseWebWRProps,
  colors: lightColors,
  shadows: createShadows(lightColors),
};

const baseStageProps = {
  callId: 'call-ux-1',
  roomName: 'call-room-ux-1',
  userRole: 'Clinician' as const,
  participantName: 'Clemente, Mark Kenneth C.',
  selfName: 'Wave Ambray',
  isMicEnabled: true,
  isCameraEnabled: false,
  isScreenSharing: false,
  onToggleMic: () => {},
  onToggleCamera: () => {},
  onEndCall: () => {},
  isParticipantsOpen: true,
  patientLink: 'https://portal.dev.clinicez.net/teleconsult/join?token=abc',
  patientPin: '148248',
  onSharePatientLink: async () => {},
  onCopyPatientPin: async () => {},
};

describe('Teleconsultation UX Polish & 5Fixes Regression Suite', () => {
  describe('Issue 1: Auto-Format Patient DOB (YYYY-MM-DD) & 6-Digit OTP Paste', () => {
    it('formats raw digits, partial inputs, slashes, and backspaces cleanly without trailing hyphen traps', () => {
      expect(formatDobInput('')).toBe('');
      expect(formatDobInput('200')).toBe('200');
      expect(formatDobInput('2001')).toBe('2001');
      expect(formatDobInput('20010')).toBe('2001-0');
      expect(formatDobInput('2001-')).toBe('2001');
      expect(formatDobInput('200105')).toBe('2001-05');
      expect(formatDobInput('2001-05-')).toBe('2001-05');
      expect(formatDobInput('20010503')).toBe('2001-05-03');
      expect(formatDobInput('2001/05/03')).toBe('2001-05-03');
      expect(formatDobInput('1995-12-25')).toBe('1995-12-25');
      expect(formatDobInput('20010503999')).toBe('2001-05-03');
      expect(formatDobInput('abc1985def04ghi12')).toBe('1985-04-12');
    });

    it('GuestJoinPage #dob-input auto-formats digits live and OTP cells support 6-digit paste submission', async () => {
      let submittedDob = '';
      let submittedOtp = '';

      const harness = createHookHarness(() =>
        GuestJoinPage({
          inviteToken: 'tok-ux-1',
          apiBaseUrl: 'http://localhost:5000',
          mockVerificationHandler: async (dob, otp) => {
            submittedDob = dob;
            submittedOtp = otp;
            return {
              guestToken: 'gt-1',
              roomName: 'room-1',
              relayUrl: 'wss://livekit.local',
            };
          },
        })
      );

      const dobInput = findElement(harness.result.current, (el) => el.props?.id === 'dob-input');
      expect(dobInput).not.toBeNull();
      expect(dobInput.props.inputMode).toBe('numeric');
      expect(dobInput.props.maxLength).toBe(10);

      await act(async () => {
        dobInput.props.onChange?.({ target: { value: '20010503' } });
      });

      const updatedDobInput = findElement(harness.result.current, (el) => el.props?.id === 'dob-input');
      expect(updatedDobInput.props.value).toBe('2001-05-03');

      const otpInput1 = findElement(harness.result.current, (el) => el.props?.['aria-label'] === 'OTP digit 1');
      expect(otpInput1).not.toBeNull();
      let prevented = false;
      await act(async () => {
        otpInput1.props.onPaste?.({
          preventDefault: () => {
            prevented = true;
          },
          clipboardData: {
            getData: () => '49-44-70',
          },
        });
      });
      expect(prevented).toBe(true);

      const form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit?.({ preventDefault: () => {} });
      });

      expect(submittedDob).toBe('2001-05-03');
      expect(submittedOtp).toBe('494470');
      harness.unmount();
    });
  });

  describe('Issue 4: Borderless Icon-Only Copy Link & Copy PIN + Duplicate Overlay Suppression', () => {
    it('CallWaitingRoom (Web & Native): copy link and copy PIN are borderless icon-only with zero COPY text and no camera overlay copy duplicate', () => {
      const webHarness = createHookHarness(() => WebCallWaitingRoom(baseWebWRProps));
      expect(findElement(webHarness.result.current, (el) => el.props?.['data-testid'] === 'btn-share-patient-link')).toBeNull();

      const webCardLinkBtn = findElement(webHarness.result.current, (el) => el.props?.['data-testid'] === 'btn-share-patient-link-card');
      const webCardPinBtn = findElement(webHarness.result.current, (el) => el.props?.['data-testid'] === 'btn-copy-patient-pin');
      expect(webCardLinkBtn).not.toBeNull();
      expect(webCardPinBtn).not.toBeNull();
      expect(getTextContent(webCardLinkBtn).trim()).toBe('');
      expect(getTextContent(webCardPinBtn).trim()).toBe('');
      expect(String(webCardLinkBtn.props.className)).toContain('bg-transparent');
      expect(String(webCardLinkBtn.props.className)).toContain('border-0');
      expect(String(webCardPinBtn.props.className)).toContain('bg-transparent');
      expect(String(webCardPinBtn.props.className)).toContain('border-0');
      expect(webCardLinkBtn.props.style?.backgroundColor).toBeUndefined();
      expect(webCardPinBtn.props.style?.backgroundColor).toBeUndefined();
      webHarness.unmount();

      const nativeHarness = createHookHarness(() => NativeCallWaitingRoom(baseNativeWRProps));
      expect(findElement(nativeHarness.result.current, (el) => el.props?.testID === 'btn-share-patient-link')).toBeNull();

      const nativeCardLinkBtn = findElement(nativeHarness.result.current, (el) => el.props?.testID === 'btn-share-patient-link-card');
      const nativeCardPinBtn = findElement(nativeHarness.result.current, (el) => el.props?.testID === 'btn-copy-patient-pin');
      expect(nativeCardLinkBtn).not.toBeNull();
      expect(nativeCardPinBtn).not.toBeNull();
      expect(getTextContent(nativeCardLinkBtn).trim()).toBe('');
      expect(getTextContent(nativeCardPinBtn).trim()).toBe('');
      expect(nativeCardLinkBtn.props.style).toMatchObject({ backgroundColor: 'transparent', borderWidth: 0 });
      expect(nativeCardPinBtn.props.style).toMatchObject({ backgroundColor: 'transparent', borderWidth: 0 });
      nativeHarness.unmount();
    });

    it('CallStage (Web & Native): roster Copy Link and Copy PIN are borderless icon-only 44x44 buttons', () => {
      const webHarness = createHookHarness(() => WebCallStage(baseStageProps));
      const webInviteBtn = findElement(webHarness.result.current, (el) => el.props?.['data-testid'] === 'btn-roster-copy-invite');
      const webPinBtn = findElement(webHarness.result.current, (el) => el.props?.['data-testid'] === 'btn-roster-copy-pin');
      expect(webInviteBtn).not.toBeNull();
      expect(webPinBtn).not.toBeNull();
      expect(getTextContent(webInviteBtn).trim()).toBe('');
      expect(getTextContent(webPinBtn).trim()).toBe('');
      expect(String(webInviteBtn.props.className)).toContain('bg-transparent');
      expect(String(webInviteBtn.props.className)).toContain('border-0');
      expect(String(webPinBtn.props.className)).toContain('bg-transparent');
      expect(String(webPinBtn.props.className)).toContain('border-0');
      expect(webInviteBtn.props.style?.backgroundColor).toBeUndefined();
      expect(webPinBtn.props.style?.backgroundColor).toBeUndefined();
      webHarness.unmount();

      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseStageProps,
          colors: lightColors,
          shadows: createShadows(lightColors),
        })
      );
      const nativeInviteBtn = findElement(nativeHarness.result.current, (el) => el.props?.testID === 'btn-roster-copy-invite');
      const nativePinBtn = findElement(nativeHarness.result.current, (el) => el.props?.testID === 'btn-roster-copy-pin');
      expect(nativeInviteBtn).not.toBeNull();
      expect(nativePinBtn).not.toBeNull();
      expect(getTextContent(nativeInviteBtn).trim()).toBe('');
      expect(getTextContent(nativePinBtn).trim()).toBe('');
      expect(nativeInviteBtn.props.style).toMatchObject({
        backgroundColor: 'transparent',
        borderWidth: 0,
        minHeight: 44,
        minWidth: 44,
      });
      expect(nativePinBtn.props.style).toMatchObject({
        backgroundColor: 'transparent',
        borderWidth: 0,
        minHeight: 44,
        minWidth: 44,
      });
      nativeHarness.unmount();
    });
  });

  describe('Issue 5: Remove Lower-Right "Cam Off" PiP Frame When Camera & Screen Share Are Off', () => {
    it('CallStage (Web & Native): omits local PiP container when camera and screen share are both off and never renders "(Cam Off)" text', () => {
      for (const [isWeb, Comp] of [
        [true, WebCallStage],
        [false, NativeCallStage],
      ] as const) {
        const harnessOff = createHookHarness(() =>
          Comp({
            ...baseStageProps,
            ...(isWeb ? {} : { colors: lightColors, shadows: createShadows(lightColors) }),
            isCameraEnabled: false,
            isScreenSharing: false,
          })
        );
        const pipOff = findElement(harnessOff.result.current, (el) =>
          isWeb
            ? el.props?.['data-testid'] === 'call-stage-local-pip'
            : el.props?.testID === 'call-stage-local-pip'
        );
        expect(pipOff).toBeNull();
        expect(getTextContent(harnessOff.result.current)).not.toContain('(Cam Off)');
        harnessOff.unmount();

        const harnessCamOn = createHookHarness(() =>
          Comp({
            ...baseStageProps,
            ...(isWeb ? {} : { colors: lightColors, shadows: createShadows(lightColors) }),
            isCameraEnabled: true,
            isScreenSharing: false,
          })
        );
        const pipCamOn = findElement(harnessCamOn.result.current, (el) =>
          isWeb
            ? el.props?.['data-testid'] === 'call-stage-local-pip'
            : el.props?.testID === 'call-stage-local-pip'
        );
        expect(pipCamOn).not.toBeNull();
        expect(getTextContent(harnessCamOn.result.current)).not.toContain('(Cam Off)');
        harnessCamOn.unmount();

        const harnessShareOn = createHookHarness(() =>
          Comp({
            ...baseStageProps,
            ...(isWeb ? {} : { colors: lightColors, shadows: createShadows(lightColors) }),
            isCameraEnabled: false,
            isScreenSharing: true,
          })
        );
        const pipShareOn = findElement(harnessShareOn.result.current, (el) =>
          isWeb
            ? el.props?.['data-testid'] === 'call-stage-local-pip'
            : el.props?.testID === 'call-stage-local-pip'
        );
        expect(pipShareOn).not.toBeNull();
        expect(getTextContent(pipShareOn).trim()).toBe('');
        harnessShareOn.unmount();
      }
    });
  });

  describe('Issue 6: Top-Right Self-Preview & Compact Call Controls Toolbar', () => {
    it('CallStage (Web): positions self-preview top-right, uses compact h-11 w-11 circles, and toggles mobile More overflow menu', async () => {
      const pipSpy = mock(() => {});
      const harness = createHookHarness(() =>
        WebCallStage({
          ...baseStageProps,
          isCameraEnabled: true,
          isScreenSharing: false,
          onToggleScreenShare: () => {},
          onDockCall: () => {},
          onTogglePip: pipSpy,
          onToggleOrientation: () => {},
          onStartRecording: () => {},
          canStartRecording: true,
        })
      );

      const pip = findElement(harness.result.current, (el) => el.props?.['data-testid'] === 'call-stage-local-pip');
      expect(pip).not.toBeNull();
      expect(pip.props.className).toContain('top-');
      expect(pip.props.className).toContain('right-');
      expect(pip.props.className).not.toContain('bottom-24');

      const micBtn = findElement(harness.result.current, (el) => el.props?.['aria-label'] === 'Mute microphone');
      expect(micBtn?.props?.className).toContain('h-11 w-11');
      expect(micBtn?.props?.className).toContain('bg-white/10');

      const moreBtn = findElement(harness.result.current, (el) => el.props?.['data-testid'] === 'btn-toggle-more-controls');
      expect(moreBtn).not.toBeNull();
      expect(findElement(harness.result.current, (el) => el.props?.['data-testid'] === 'popover-more-controls')).toBeNull();

      await act(async () => {
        moreBtn.props.onClick();
      });

      const popover = findElement(harness.result.current, (el) => el.props?.['data-testid'] === 'popover-more-controls');
      expect(popover).not.toBeNull();
      const morePipBtn = findElement(popover, (el) => el.props?.['data-testid'] === 'more-menu-toggle-pip');
      expect(morePipBtn).not.toBeNull();

      await act(async () => {
        morePipBtn.props.onClick();
      });
      expect(pipSpy).toHaveBeenCalledTimes(1);
      expect(findElement(harness.result.current, (el) => el.props?.['data-testid'] === 'popover-more-controls')).toBeNull();
      harness.unmount();
    });

    it('CallStage (Native): anchors PiP top-right, uses dark-glass buttons, and collapses secondary controls under <640px onLayout', async () => {
      const dockSpy = mock(() => {});
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseStageProps,
          colors: lightColors,
          shadows: createShadows(lightColors),
          isCameraEnabled: true,
          isScreenSharing: false,
          onToggleScreenShare: () => {},
          onDockCall: dockSpy,
          onTogglePip: () => {},
          onToggleOrientation: () => {},
          onStartRecording: () => {},
          canStartRecording: true,
        })
      );

      const pipDefault = findElement(harness.result.current, (el) => el.props?.testID === 'call-stage-local-pip');
      const pipDefaultStyle = Object.assign({}, ...pipDefault.props.style.filter(Boolean));
      expect(pipDefaultStyle.top).toBeDefined();
      expect(pipDefaultStyle.bottom).toBeUndefined();
      expect(pipDefaultStyle.width).toBe(105);

      const rootView = harness.result.current;
      await act(async () => {
        rootView.props.onLayout?.({ nativeEvent: { layout: { width: 375, height: 667 } } });
      });

      const pipCompact = findElement(harness.result.current, (el) => el.props?.testID === 'call-stage-local-pip');
      const pipCompactStyle = Object.assign({}, ...pipCompact.props.style.filter(Boolean));
      expect(pipCompactStyle.width).toBe(84);

      expect(findElement(harness.result.current, (el) => el.props?.testID === 'btn-toggle-pip')).toBeNull();
      const moreBtn = findElement(harness.result.current, (el) => el.props?.testID === 'btn-toggle-more-controls');
      expect(moreBtn).not.toBeNull();

      await act(async () => {
        moreBtn.props.onPress();
      });

      const popover = findElement(harness.result.current, (el) => el.props?.testID === 'popover-more-controls');
      expect(popover).not.toBeNull();
      const moreDockBtn = findElement(popover, (el) => el.props?.testID === 'more-menu-dock-call');
      expect(moreDockBtn).not.toBeNull();

      await act(async () => {
        moreDockBtn.props.onPress();
      });
      expect(dockSpy).toHaveBeenCalledTimes(1);
      harness.unmount();
    });
  });
});
