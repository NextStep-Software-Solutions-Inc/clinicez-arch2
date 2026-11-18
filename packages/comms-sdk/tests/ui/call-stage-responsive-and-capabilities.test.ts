import { describe, expect, it, mock, beforeAll, afterEach } from 'bun:test';
import React from 'react';
import { lightColors, createShadows, sizes } from '@clinicez/design-tokens';

const RNMock = {
  View: 'div',
  Text: 'span',
  TouchableOpacity: 'button',
  TextInput: 'input',
  ScrollView: 'div',
  ActivityIndicator: 'div',
  Modal: (props: any) => (props.visible ? React.createElement('div', { ...props, 'data-modal': 'true' }) : null),
  StyleSheet: {
    create: (styles: any) => styles,
  },
};

mock.module('react-native', () => RNMock);

import {
  isMobileBrowserRuntime,
  isScreenShareSupported,
  isBrowserPipSupported,
  hasMultipleVideoInputs,
  LiveKitMediaAdapter,
} from '../../src/core';
import { useCallSession } from '../../src/react/hooks/useCallSession';
import { CallStage as WebCallStage } from '../../src/web-ui/CallStage';
import type { ThreadMessage } from '../../src/native-ui/types';
import { createHookHarness, act } from '../react/hook-test-harness';

let NativeCallStage: any;
let NativeCallWaitingRoom: any;
let NativeMessageThread: any;

beforeAll(async () => {
  const stageMod = await import('../../src/native-ui/CallStage');
  NativeCallStage = stageMod.CallStage;
  const waitingMod = await import('../../src/native-ui/CallWaitingRoom');
  NativeCallWaitingRoom = waitingMod.CallWaitingRoom;
  const threadMod = await import('../../src/native-ui/MessageThread');
  NativeMessageThread = threadMod.MessageThread;
});

const originalWindow = (globalThis as any).window;
const originalNavigator = (globalThis as any).navigator;
const originalDocument = (globalThis as any).document;
const originalHTMLVideoElement = (globalThis as any).HTMLVideoElement;

afterEach(() => {
  (globalThis as any).window = originalWindow;
  (globalThis as any).navigator = originalNavigator;
  (globalThis as any).document = originalDocument;
  (globalThis as any).HTMLVideoElement = originalHTMLVideoElement;
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

function flattenStyle(style: any): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  }
  return typeof style === 'object' ? style : {};
}

const baseStageProps = {
  callId: 'call-resp-1',
  roomName: 'room-resp-1',
  userRole: 'Clinician' as const,
  participantName: 'Clemente, Mark Kenneth C.',
  selfName: 'Wave Ambray',
  isMicEnabled: true,
  isCameraEnabled: true,
  isScreenSharing: false,
  onToggleMic: () => {},
  onToggleCamera: () => {},
  onEndCall: () => {},
};

describe('Responsive CallStage, Screen-Share Reliability & Browser Capability Gating', () => {
  describe('Browser capability detection', () => {
    it('detects mobile vs desktop userAgents and userAgentData.mobile cleanly', () => {
      expect(
        isMobileBrowserRuntime(
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
        ),
      ).toBe(true);
      expect(
        isMobileBrowserRuntime(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        ),
      ).toBe(true);
      expect(
        isMobileBrowserRuntime(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        ),
      ).toBe(false);

      (globalThis as any).navigator = {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        userAgentData: { mobile: true },
      };
      expect(isMobileBrowserRuntime()).toBe(true);
    });

    it('gates screen sharing and browser PiP cleanly for mobile and unsupported runtimes', () => {
      (globalThis as any).window = {};
      (globalThis as any).navigator = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0',
        mediaDevices: { getDisplayMedia: async () => ({}) },
      };
      (globalThis as any).document = { pictureInPictureEnabled: true };
      (globalThis as any).HTMLVideoElement = {
        prototype: { requestPictureInPicture: async () => {} },
      };

      expect(isScreenShareSupported()).toBe(true);
      expect(isBrowserPipSupported()).toBe(true);

      // Mobile Chrome even with partial properties present must be gated off
      (globalThis as any).navigator = {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile) Chrome/124.0',
        mediaDevices: { getDisplayMedia: async () => ({}) },
      };
      expect(isScreenShareSupported()).toBe(false);
      expect(isBrowserPipSupported()).toBe(false);

      // Desktop without getDisplayMedia or PiP API
      (globalThis as any).navigator = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0',
        mediaDevices: {},
      };
      (globalThis as any).document = { pictureInPictureEnabled: false };
      expect(isScreenShareSupported()).toBe(false);
      expect(isBrowserPipSupported()).toBe(false);
    });

    it('resolves hasMultipleVideoInputs accurately for 0, 1, 2 cameras and enumeration errors', async () => {
      (globalThis as any).navigator = {
        mediaDevices: {
          enumerateDevices: async () => [{ kind: 'audioinput' }, { kind: 'videoinput' }],
        },
      };
      expect(await hasMultipleVideoInputs()).toBe(false);

      (globalThis as any).navigator = {
        mediaDevices: {
          enumerateDevices: async () => [
            { kind: 'videoinput', deviceId: 'front' },
            { kind: 'videoinput', deviceId: 'back' },
          ],
        },
      };
      expect(await hasMultipleVideoInputs()).toBe(true);

      (globalThis as any).navigator = {
        mediaDevices: {
          enumerateDevices: async () => {
            throw new Error('Permission denied');
          },
        },
      };
      expect(await hasMultipleVideoInputs()).toBe(false);
    });
  });

  describe('useCallSession & LiveKitMediaAdapter hardware/screen-share fixes', () => {
    it('syncs initialMicEnabled and initialCameraEnabled into connect() and reverts/rethrows on screen share cancellation or failure', async () => {
      let connectOptionsSeen: any = null;
      let screenTrack: any = null;
      let throwOnShare = false;

      const fakeAdapter: any = {
        connectionState: 'disconnected',
        connect: async (opts: any) => {
          connectOptionsSeen = opts;
          fakeAdapter.connectionState = 'connected';
        },
        disconnect: async () => {},
        isConnected: () => fakeAdapter.connectionState === 'connected',
        setMicrophoneEnabled: async () => {},
        setCameraEnabled: async () => {},
        setScreenShareEnabled: async (enabled: boolean) => {
          if (throwOnShare && enabled) {
            throw new Error('Permission denied by system');
          }
        },
        switchCamera: async () => {},
        sendDataMessage: async () => {},
        getLocalVideoTrack: () => null,
        getLocalScreenShareTrack: () => screenTrack,
        getRemoteVideoTrack: () => null,
        getRemoteAudioTrack: () => null,
        getRemoteParticipants: () => [],
        getNetworkQuality: () => 'good',
        on: () => () => {},
      };

      const harness = createHookHarness((props: { mic: boolean; cam: boolean }) =>
        useCallSession('call-cap-1', {
          initialMicEnabled: props.mic,
          initialCameraEnabled: props.cam,
          mediaAdapter: fakeAdapter,
          onJoinCall: async () => ({
            liveKitToken: 'tok-1',
            roomName: 'room-cap-1',
            wsUrl: 'wss://sfu.invalid',
            participantIdentity: 'pat-1',
          }),
        }),
        { initialProps: { mic: false, cam: false } },
      );

      expect(harness.result.current.mediaTracks.isMicEnabled).toBe(false);
      expect(harness.result.current.mediaTracks.isCameraEnabled).toBe(false);

      await act(async () => {
        await harness.result.current.joinCall();
      });

      expect(connectOptionsSeen?.audioEnabled).toBe(false);
      expect(connectOptionsSeen?.videoEnabled).toBe(false);

      // User cancels screen share picker -> adapter resolves without producing a screen track
      screenTrack = null;
      await act(async () => {
        await harness.result.current.mediaTracks.toggleScreenShare();
      });
      expect(harness.result.current.mediaTracks.isScreenSharing).toBe(false);

      // Adapter throws on screen share -> toggleScreenShare keeps state false AND rethrows
      throwOnShare = true;
      let caughtError: unknown = null;
      await act(async () => {
        try {
          await harness.result.current.mediaTracks.toggleScreenShare();
        } catch (err) {
          caughtError = err;
        }
      });
      expect(caughtError).toBeInstanceOf(Error);
      expect(harness.result.current.mediaTracks.isScreenSharing).toBe(false);

      harness.unmount();
    });

    it('LiveKitMediaAdapter isolates camera failure on connect() and cleans up publication on native screen track ended', async () => {
      const roomListeners = new Map<string, Function>();
      let screenEnabledCalls: boolean[] = [];
      let endedListener: (() => void) | null = null;

      const mockRoom: any = {
        name: 'call-12345678-1234-1234-1234-123456789abc',
        state: 'connected',
        connect: async () => {},
        disconnect: async () => {},
        on: (event: string, cb: Function) => roomListeners.set(event, cb),
        off: () => {},
        remoteParticipants: new Map(),
        localParticipant: {
          videoTrackPublications: new Map(),
          audioTrackPublications: new Map(),
          setMicrophoneEnabled: async () => {},
          setCameraEnabled: async () => {
            throw new Error('Device in use');
          },
          setScreenShareEnabled: async (enabled: boolean) => {
            screenEnabledCalls.push(enabled);
          },
        },
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });
      const trackEvents: Array<{ kind: string; enabled: boolean }> = [];
      const errors: Error[] = [];
      adapter.on('localTrackChanged', (kind, enabled) => {
        trackEvents.push({ kind: String(kind), enabled: Boolean(enabled) });
      });
      adapter.on('error', (err) => {
        if (err instanceof Error) errors.push(err);
      });

      await adapter.connect({
        url: 'wss://sfu.invalid',
        token: 'tok-lk-1',
        roomName: 'call-12345678-1234-1234-1234-123456789abc',
        audioEnabled: true,
        videoEnabled: true,
      });

      expect(adapter.connectionState).toBe('connected');
      expect(trackEvents).toContainEqual({ kind: 'video', enabled: false });
      expect(errors.length).toBeGreaterThan(0);

      // Simulate native browser Stop Sharing -> 'ended' on MediaStreamTrack
      const pubHandler = roomListeners.get('localTrackPublished');
      expect(pubHandler).toBeDefined();
      pubHandler!({
        source: 'screen_share',
        track: {
          mediaStreamTrack: {
            addEventListener: (evt: string, fn: () => void) => {
              if (evt === 'ended') endedListener = fn;
            },
          },
        },
      });
      expect(endedListener).not.toBeNull();
      endedListener!();
      expect(screenEnabledCalls).toContain(false);
      expect(trackEvents).toContainEqual({ kind: 'screen', enabled: false });
    });
  });

  describe('Toolbar pill removal, compact <640px drawer overlays, and unsupported control hiding', () => {
    it('Native CallStage removes outer dark-glass pill container, sets nowrap, and overlays drawers at <640px', async () => {
      const harness = createHookHarness((props: any) =>
        NativeCallStage({
          ...baseStageProps,
          colors: lightColors,
          shadows: createShadows(lightColors),
          isChatOpen: true,
          renderChatDrawer: () => React.createElement('div', { testID: 'mock-chat-body' }, 'Chat'),
          ...props,
        }),
      );

      const rootView = harness.result.current;
      await act(async () => {
        rootView.props.onLayout({ nativeEvent: { layout: { width: 375, height: 700 } } });
      });

      const toolbarEl = findElement(
        harness.result.current,
        (el) =>
          Array.isArray(el.props?.style) &&
          el.props.style.some((s: any) => s?.flexDirection === 'row' && s?.flexWrap === 'nowrap'),
      );
      expect(toolbarEl).not.toBeNull();
      const mergedToolbarStyle = flattenStyle(toolbarEl.props.style);
      expect(mergedToolbarStyle.backgroundColor).toBeUndefined();
      expect(mergedToolbarStyle.borderRadius).toBeUndefined();
      expect(mergedToolbarStyle.borderWidth).toBeUndefined();

      const chatPanel = findElement(harness.result.current, (el) => el.props?.testID === 'panel-in-call-chat');
      expect(chatPanel).not.toBeNull();
      const chatStyle = flattenStyle(chatPanel.props.style);
      expect(chatStyle.position).toBe('absolute');
      expect(chatStyle.width).toBe('100%');
      expect(chatStyle.zIndex).toBe(40);

      harness.rerender({ isChatOpen: false, isParticipantsOpen: true });
      const rosterPanel = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'panel-participants-roster',
      );
      expect(rosterPanel).not.toBeNull();
      const rosterStyle = flattenStyle(rosterPanel.props.style);
      expect(rosterStyle.position).toBe('absolute');
      expect(rosterStyle.width).toBe('100%');

      // When overflow items are all unsupported, More button must stay hidden
      const moreBtn = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'btn-toggle-more-controls',
      );
      expect(moreBtn).toBeNull();

      harness.unmount();
    });

    it('Native CallStage hides screen share and switch camera controls when support flags are false', async () => {
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseStageProps,
          colors: lightColors,
          shadows: createShadows(lightColors),
          onToggleScreenShare: () => {},
          isScreenShareSupported: false,
          onSwitchCamera: () => {},
          isSwitchCameraSupported: false,
          onTogglePip: () => {},
          isPipSupported: false,
          onToggleOrientation: () => {},
        }),
      );

      await act(async () => {
        harness.result.current.props.onLayout({ nativeEvent: { layout: { width: 375, height: 700 } } });
      });

      const moreBtn = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'btn-toggle-more-controls',
      );
      expect(moreBtn).not.toBeNull();

      await act(async () => {
        moreBtn.props.onPress();
      });

      expect(
        findElement(harness.result.current, (el) => el.props?.testID === 'more-menu-screen-share'),
      ).toBeNull();
      expect(
        findElement(harness.result.current, (el) => el.props?.testID === 'more-menu-switch-camera'),
      ).toBeNull();

      harness.unmount();
    });

    it('Web CallStage removes outer dark pill wrapper, hides unsupported screen share, and suppresses empty local PiP container', () => {
      const harness = createHookHarness(() =>
        WebCallStage({
          ...baseStageProps,
          isCameraEnabled: true,
          isScreenSharing: false,
          onToggleScreenShare: () => {},
          isScreenShareSupported: false,
          isPipSupported: false,
          renderCustomVideoSurface: () => null,
        }),
      );

      const toolbar = findElement(
        harness.result.current,
        (el) => el.props?.['data-testid'] === 'call-stage-media-toolbar',
      );
      expect(toolbar).not.toBeNull();
      expect(toolbar.props.className).not.toContain('bg-slate-950');
      expect(toolbar.props.className).not.toContain('rounded-full');

      const pip = findElement(
        harness.result.current,
        (el) => el.props?.['data-testid'] === 'call-stage-local-pip',
      );
      expect(pip).toBeNull();

      const shareBtn = findElement(
        harness.result.current,
        (el) => el.props?.['aria-label'] === 'Start screen sharing',
      );
      expect(shareBtn).toBeNull();

      const moreBtn = findElement(
        harness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-more-controls',
      );
      expect(moreBtn).toBeNull();

      harness.unmount();
    });

    it('Native MessageThread renders 44x44 close button when onClose is provided and omits literal LOCK text on internal notes', () => {
      let closed = false;
      const internalMsg: ThreadMessage = {
        id: 'm-internal-1',
        seq: 1,
        conversationId: 'conv-1',
        senderType: 'Staff',
        senderId: 'doc-1',
        senderDisplayName: 'Dr. Wave',
        contentText: 'Patient prefers follow-up in 2 weeks',
        clientSentAtUtc: '2026-11-15T10:00:00Z',
        state: 'Sent',
        visibility: 'Internal',
        requiresAcknowledgement: false,
      };

      const harness = createHookHarness(() =>
        NativeMessageThread({
          conversationId: 'conv-1',
          conversationTitle: 'Chat • Clemente, Mark Kenneth C.',
          conversationScope: 'In-Call Chat',
          messages: [internalMsg],
          currentUserId: 'doc-1',
          onSendMessage: async () => {},
          onClose: () => {
            closed = true;
          },
          colors: lightColors,
          shadows: createShadows(lightColors),
        }),
      );

      const closeBtn = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'btn-close-chat-drawer',
      );
      expect(closeBtn).not.toBeNull();
      expect(closeBtn.props.style.minWidth).toBeGreaterThanOrEqual(sizes.touchTarget);
      expect(closeBtn.props.style.minHeight).toBeGreaterThanOrEqual(sizes.touchTarget);

      closeBtn.props.onPress();
      expect(closed).toBe(true);

      const textOut = getTextContent(harness.result.current);
      expect(textOut).toContain('Private Staff Note');
      expect(textOut).not.toContain('LOCK');

      harness.unmount();
    });
  });

  describe('High-contrast icon & text colors when bright brand palette sets dark onPrimary (#111827)', () => {
    const skyBlueColors = {
      ...lightColors,
      primary: '#0284C8',
      primaryDark: '#065A86',
      primaryLight: '#DCF0FA',
      primarySubtle: '#EEF7FC',
      primaryBorder: '#B3DAEF',
      onPrimary: '#111827',
      surfaceInverse: '#0F172A',
      textInverted: '#FFFFFF',
    };

    const collectIcons = (el: any, out: Array<{ name: string; color?: string }> = []) => {
      if (!el) return out;
      if (Array.isArray(el)) {
        el.forEach((child) => collectIcons(child, out));
        return out;
      }
      if (el.props?.['data-icon']) {
        out.push({ name: el.props['data-icon'], color: el.props['data-color'] });
      }
      if (el.props?.children) collectIcons(el.props.children, out);
      return out;
    };

    const collectMoreDotColors = (el: any): string[] => {
      const moreBtn = findElement(el, (n) => n.props?.testID === 'btn-toggle-more-controls');
      if (!moreBtn) return [];
      const colors: string[] = [];
      const walk = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        const st = flattenStyle(node.props?.style);
        if (st.width === 4 && st.height === 4 && st.backgroundColor) {
          colors.push(st.backgroundColor);
        }
        if (node.props?.children) walk(node.props.children);
      };
      walk(moreBtn.props?.children);
      return colors;
    };

    it('Native CallStage renders white icons/text on dark & emergency controls when inactive, and onPrimary (#111827) when active', async () => {
      const renderIconSpy = (name: string, props?: { color?: string; size?: number }) =>
        React.createElement('span', { 'data-icon': name, 'data-color': props?.color });
      const renderParticipantsIconSpy = (props?: { color?: string; size?: number }) =>
        React.createElement('span', { 'data-icon': 'participants', 'data-color': props?.color });

      const harness = createHookHarness((props: any) =>
        NativeCallStage({
          ...baseStageProps,
          colors: skyBlueColors,
          shadows: createShadows(skyBlueColors, false),
          isMicEnabled: true,
          isCameraEnabled: true,
          isScreenSharing: false,
          isChatOpen: false,
          isParticipantsOpen: false,
          isPipActive: false,
          onToggleScreenShare: () => {},
          onToggleChat: () => {},
          onToggleParticipants: () => {},
          onTogglePip: () => {},
          onToggleOrientation: () => {},
          onDockCall: () => {},
          renderIcon: renderIconSpy,
          renderParticipantsIcon: renderParticipantsIconSpy,
          ...props,
        }),
      );

      // Compact (<640px) viewport with More menu open
      await act(async () => {
        harness.result.current.props.onLayout({ nativeEvent: { layout: { width: 375, height: 700 } } });
      });
      const moreBtn = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'btn-toggle-more-controls',
      );
      expect(moreBtn).not.toBeNull();
      expect(collectMoreDotColors(harness.result.current)).toEqual(['#FFFFFF', '#FFFFFF', '#FFFFFF']);

      await act(async () => {
        moreBtn.props.onPress();
      });

      const compactIcons = collectIcons(harness.result.current);
      expect(compactIcons.find((i) => i.name === 'mic')?.color).toBe('#FFFFFF');
      expect(compactIcons.find((i) => i.name === 'video')?.color).toBe('#FFFFFF');
      expect(compactIcons.find((i) => i.name === 'chat')?.color).toBe('#FFFFFF');
      expect(compactIcons.find((i) => i.name === 'participants')?.color).toBe('#FFFFFF');
      expect(compactIcons.find((i) => i.name === 'phoneOff')?.color).toBe('#FFFFFF');

      const badge = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'badge-participants-count',
      );
      expect(badge).not.toBeNull();
      const badgeText = findElement(badge, (el) => el.type === 'span');
      expect(flattenStyle(badgeText.props.style).color).toBe('#FFFFFF');

      const popover = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'popover-more-controls',
      );
      expect(popover).not.toBeNull();
      const popoverIcons = collectIcons(popover);
      expect(popoverIcons.length).toBeGreaterThan(0);
      popoverIcons.forEach((ic) => expect(ic.color).toBe('#FFFFFF'));
      const moreShareRow = findElement(
        popover,
        (el) => el.props?.testID === 'more-menu-screen-share',
      );
      const moreShareLabel = findElement(moreShareRow, (el) => el.type === 'span' && getTextContent(el).includes('Share screen'));
      expect(flattenStyle(moreShareLabel.props.style).color).toBe('#FFFFFF');

      // Active state on desktop toolbar: active toggle buttons use #111827 on #0284C8
      await act(async () => {
        harness.result.current.props.onLayout({ nativeEvent: { layout: { width: 1024, height: 768 } } });
      });
      harness.rerender({
        isChatOpen: true,
        isParticipantsOpen: true,
        isPipActive: true,
        isScreenSharing: true,
      });

      const activeIcons = collectIcons(harness.result.current);
      expect(activeIcons.find((i) => i.name === 'mic')?.color).toBe('#FFFFFF');
      expect(activeIcons.find((i) => i.name === 'video')?.color).toBe('#FFFFFF');
      expect(activeIcons.find((i) => i.name === 'rotate')?.color).toBe('#FFFFFF');
      expect(activeIcons.find((i) => i.name === 'dock')?.color).toBe('#FFFFFF');
      expect(activeIcons.find((i) => i.name === 'phoneOff')?.color).toBe('#FFFFFF');

      expect(activeIcons.find((i) => i.name === 'screenShareOff')?.color).toBe('#111827');
      expect(activeIcons.find((i) => i.name === 'pip')?.color).toBe('#111827');
      expect(activeIcons.find((i) => i.name === 'chat')?.color).toBe('#111827');
      expect(activeIcons.find((i) => i.name === 'participants')?.color).toBe('#111827');

      harness.unmount();
    });

    it('Native CallWaitingRoom keeps muted media preview icons and overlay labels white (#FFFFFF)', () => {
      const renderIconSpy = (name: string, props?: { color?: string; size?: number }) =>
        React.createElement('span', { 'data-icon': name, 'data-color': props?.color });

      const harness = createHookHarness(() =>
        NativeCallWaitingRoom({
          callId: 'call-wr-sky-1',
          appointmentId: 'apt-wr-sky-1',
          userRole: 'Clinician',
          patientName: 'Clemente, Mark Kenneth C.',
          clinicianName: 'Wave Ambray',
          scheduledTime: '2026-11-16 at 12:00 PM',
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          isReadyToAdmit: true,
          recordingConsentStatus: 'None',
          isMicEnabled: false,
          isCameraEnabled: false,
          onToggleMic: () => {},
          onToggleCamera: () => {},
          onAdmitPatient: async () => {},
          onCancelCall: () => {},
          renderIcon: renderIconSpy,
          colors: skyBlueColors,
          shadows: createShadows(skyBlueColors, false),
        }),
      );

      const icons = collectIcons(harness.result.current);
      expect(icons.find((i) => i.name === 'micOff')?.color).toBe('#FFFFFF');
      expect(icons.filter((i) => i.name === 'videoOff').some((i) => i.color === '#FFFFFF')).toBe(true);

      const micLabelEl = findElement(
        harness.result.current,
        (el) => el.type === 'span' && getTextContent(el).includes('Mic Level:'),
      );
      expect(micLabelEl).not.toBeNull();
      expect(flattenStyle(micLabelEl.props.style).color).toBe('#FFFFFF');

      harness.unmount();
    });
  });
});
