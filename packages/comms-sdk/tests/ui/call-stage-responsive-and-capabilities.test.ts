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
let NativeMessageThread: any;

beforeAll(async () => {
  const stageMod = await import('../../src/native-ui/CallStage');
  NativeCallStage = stageMod.CallStage;
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
});
