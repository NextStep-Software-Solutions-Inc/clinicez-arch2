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
    create: (styles: any) => styles,
  },
};

mock.module('react-native', () => RNMock);

import {
  resolveOrientationFromDimensions,
  detectTrackVideoOrientation,
  detectViewportVideoOrientation,
} from '../../src/core/media/videoOrientation';
import { useAutoVideoOrientation } from '../../src/react/hooks/useAutoVideoOrientation';
import { CallStage as WebCallStage } from '../../src/web-ui/CallStage';
import { createHookHarness, act } from '../react/hook-test-harness';

let NativeCallStage: any;
beforeAll(async () => {
  const mod = await import('../../src/native-ui/CallStage');
  NativeCallStage = mod.CallStage;
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
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(element)) return element;
  if (element.props?.children) {
    return findElement(element.props.children, predicate);
  }
  return null;
}

function findAllElements(element: any, predicate: (el: any) => boolean): any[] {
  const results: any[] = [];
  function search(el: any) {
    if (!el) return;
    if (Array.isArray(el)) {
      el.forEach(search);
      return;
    }
    if (predicate(el)) results.push(el);
    if (el.props?.children) {
      search(el.props.children);
    }
  }
  search(element);
  return results;
}

function flattenStyle(style: any): Record<string, any> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(flattenStyle));
  }
  return typeof style === 'object' ? style : {};
}

describe('Auto Video Orientation Detection & Overlaid Call Alerts', () => {
  describe('videoOrientation core utilities', () => {
    it('resolveOrientationFromDimensions distinguishes portrait, landscape, and invalid inputs', () => {
      expect(resolveOrientationFromDimensions(720, 1280)).toBe('portrait');
      expect(resolveOrientationFromDimensions(1280, 720)).toBe('landscape');
      expect(resolveOrientationFromDimensions(720, 720)).toBe('landscape');

      expect(resolveOrientationFromDimensions(0, 720)).toBeNull();
      expect(resolveOrientationFromDimensions(720, 0)).toBeNull();
      expect(resolveOrientationFromDimensions(-640, 480)).toBeNull();
      expect(resolveOrientationFromDimensions(Number.NaN, 480)).toBeNull();
      expect(resolveOrientationFromDimensions(640, Number.POSITIVE_INFINITY)).toBeNull();
      expect(resolveOrientationFromDimensions(undefined, 480)).toBeNull();
      expect(resolveOrientationFromDimensions(640, null)).toBeNull();
    });

    it('detectTrackVideoOrientation supports LiveKit, MediaStreamTrack, MediaStream, and ignores screen share', () => {
      expect(detectTrackVideoOrientation({ dimensions: { width: 720, height: 1280 } })).toBe('portrait');
      expect(detectTrackVideoOrientation({ getSettings: () => ({ width: 1280, height: 720 }) })).toBe('landscape');
      expect(
        detectTrackVideoOrientation({
          getVideoTracks: () => [{ getSettings: () => ({ width: 480, height: 640 }) }],
        }),
      ).toBe('portrait');

      expect(
        detectTrackVideoOrientation({
          source: 'screen_share',
          dimensions: { width: 1920, height: 1080 },
        }),
      ).toBeNull();
      expect(
        detectTrackVideoOrientation({
          mediaStreamTrack: {
            source: 'screen_share',
            getSettings: () => ({ width: 1920, height: 1080 }),
          },
        }),
      ).toBeNull();
      expect(
        detectTrackVideoOrientation({
          getSettings: () => ({ width: 1920, height: 1080, displaySurface: 'monitor' }),
        }),
      ).toBeNull();
    });

    it('detectViewportVideoOrientation uses externalDimensions and falls back when invalid', () => {
      expect(detectViewportVideoOrientation('landscape', { width: 390, height: 844 })).toBe('portrait');
      expect(detectViewportVideoOrientation('portrait', { width: 1280, height: 800 })).toBe('landscape');
      expect(detectViewportVideoOrientation('portrait', { width: 0, height: 0 })).toBe('portrait');
      expect(detectViewportVideoOrientation('landscape', null)).toBe('landscape');
    });
  });

  describe('useAutoVideoOrientation hook', () => {
    it('initializes from externalDimensions and localVideoTrack metadata', () => {
      const mobileHarness = createHookHarness(() =>
        useAutoVideoOrientation({
          defaultOrientation: 'landscape',
          externalDimensions: { width: 390, height: 844 },
        }),
      );
      expect(mobileHarness.result.current.autoOrientation).toBe('portrait');
      expect(mobileHarness.result.current.videoOrientation).toBe('portrait');
      expect(mobileHarness.result.current.isManualOverride).toBe(false);
      mobileHarness.unmount();

      const trackHarness = createHookHarness(() =>
        useAutoVideoOrientation({
          defaultOrientation: 'portrait',
          externalDimensions: { width: 390, height: 844 },
          localVideoTrack: { dimensions: { width: 1280, height: 720 } },
        }),
      );
      expect(trackHarness.result.current.autoOrientation).toBe('landscape');
      expect(trackHarness.result.current.videoOrientation).toBe('landscape');
      trackHarness.unmount();
    });

    it('updates via reportVideoDimensions, keeps manual override on adaptive bitrate scaling, and resets on aspect flip', async () => {
      const harness = createHookHarness(() =>
        useAutoVideoOrientation({
          defaultOrientation: 'portrait',
          externalDimensions: { width: 1280, height: 800 },
        }),
      );

      await act(() => {
        harness.result.current.reportVideoDimensions(1280, 720);
      });
      expect(harness.result.current.autoOrientation).toBe('landscape');
      expect(harness.result.current.videoOrientation).toBe('landscape');

      await act(() => {
        harness.result.current.toggleOrientation();
      });
      expect(harness.result.current.videoOrientation).toBe('portrait');
      expect(harness.result.current.isManualOverride).toBe(true);

      // Same-orientation adaptive bitrate downscale preserves manual override
      await act(() => {
        harness.result.current.reportVideoDimensions(640, 360);
      });
      expect(harness.result.current.autoOrientation).toBe('landscape');
      expect(harness.result.current.videoOrientation).toBe('portrait');
      expect(harness.result.current.isManualOverride).toBe(true);

      // Physical/stream flip clears manual override and follows new orientation
      await act(() => {
        harness.result.current.reportVideoDimensions(720, 1280);
      });
      expect(harness.result.current.isManualOverride).toBe(false);
      expect(harness.result.current.autoOrientation).toBe('portrait');
      expect(harness.result.current.videoOrientation).toBe('portrait');

      // Flip back after manual override also clears override
      await act(() => {
        harness.result.current.setVideoOrientation('landscape');
      });
      expect(harness.result.current.isManualOverride).toBe(true);
      await act(() => {
        harness.result.current.reportVideoDimensions(1280, 720);
      });
      expect(harness.result.current.isManualOverride).toBe(false);
      expect(harness.result.current.videoOrientation).toBe('landscape');

      harness.unmount();
    });

    it('resets manual override when externalDimensions flip orientation', async () => {
      const harness = createHookHarness(
        (props: { width: number; height: number }) =>
          useAutoVideoOrientation({
            defaultOrientation: 'portrait',
            externalDimensions: props,
          }),
        { initialProps: { width: 1280, height: 800 } },
      );

      expect(harness.result.current.videoOrientation).toBe('landscape');
      await act(() => {
        harness.result.current.toggleOrientation();
      });
      expect(harness.result.current.videoOrientation).toBe('portrait');
      expect(harness.result.current.isManualOverride).toBe(true);

      harness.rerender({ width: 390, height: 844 });
      expect(harness.result.current.isManualOverride).toBe(false);
      expect(harness.result.current.autoOrientation).toBe('portrait');
      expect(harness.result.current.videoOrientation).toBe('portrait');

      harness.unmount();
    });

    it('ignores reportVideoDimensions while screen sharing', async () => {
      const harness = createHookHarness(() =>
        useAutoVideoOrientation({
          defaultOrientation: 'portrait',
          externalDimensions: { width: 390, height: 844 },
          isScreenSharing: true,
        }),
      );

      expect(harness.result.current.videoOrientation).toBe('portrait');
      await act(() => {
        harness.result.current.reportVideoDimensions(1920, 1080);
      });
      expect(harness.result.current.videoOrientation).toBe('portrait');
      expect(harness.result.current.autoOrientation).toBe('portrait');
      harness.unmount();
    });
  });

  describe('Overlaid In-Call Alerts (WebCallStage & NativeCallStage)', () => {
    const alertProps = {
      callId: 'call-alert-overlay-001',
      roomName: 'room-alert-overlay-001',
      userRole: 'Patient' as const,
      participantName: 'Dr. Maria Santos',
      selfName: 'Juan Dela Cruz',
      isMicEnabled: true,
      isCameraEnabled: true,
      isScreenSharing: false,
      networkQuality: 'poor' as const,
      isRecording: true,
      recordingConsentStatus: 'requested' as const,
      onAcceptRecording: () => {},
      onDeclineRecording: () => {},
      onToggleMic: () => {},
      onToggleCamera: () => {},
      onToggleScreenShare: () => {},
      onSwitchCamera: () => {},
      onEndCall: () => {},
    };

    it('WebCallStage overlays network, recording, and consent alerts inside <main> without shifting layout', () => {
      const harness = createHookHarness(() => WebCallStage(alertProps));
      const tree = harness.result.current;

      const mainEl = findElement(tree, (n) => n?.type === 'main');
      expect(mainEl).not.toBeNull();

      const overlayEl = findElement(
        mainEl,
        (n) => n?.props?.['data-testid'] === 'call-stage-alerts-overlay',
      );
      expect(overlayEl).not.toBeNull();
      expect(overlayEl.props.className).toContain('absolute');
      expect(overlayEl.props.className).toContain('pointer-events-none');

      const networkBannerInOverlay = findElement(
        overlayEl,
        (n) => n?.props?.['data-testid'] === 'banner-network-quality',
      );
      expect(networkBannerInOverlay).not.toBeNull();

      const overlayText = getTextContent(overlayEl);
      expect(overlayText).toContain('REC');
      expect(overlayText.toLowerCase()).toContain('record');

      // Ensure no duplicate network quality banner exists outside <main>
      expect(
        findAllElements(tree, (n) => n?.props?.['data-testid'] === 'banner-network-quality').length,
      ).toBe(1);

      harness.unmount();
    });

    it('NativeCallStage overlays network, recording, and consent alerts with position absolute inside the video surface', () => {
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...alertProps,
          colors: lightColors,
          shadows: createShadows(),
        }),
      );
      const tree = harness.result.current;

      const overlayEl = findElement(
        tree,
        (n) => n?.props?.testID === 'call-stage-alerts-overlay',
      );
      expect(overlayEl).not.toBeNull();
      expect(overlayEl.props.pointerEvents).toBe('box-none');
      expect(flattenStyle(overlayEl.props.style).position).toBe('absolute');

      const networkBannerInOverlay = findElement(
        overlayEl,
        (n) => n?.props?.testID === 'banner-network-quality',
      );
      expect(networkBannerInOverlay).not.toBeNull();

      const overlayText = getTextContent(overlayEl);
      expect(overlayText).toContain('REC');
      expect(overlayText.toLowerCase()).toContain('record');

      expect(
        findAllElements(tree, (n) => n?.props?.testID === 'banner-network-quality').length,
      ).toBe(1);

      harness.unmount();
    });
  });
});
