import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  detectTrackVideoOrientation,
  detectViewportVideoOrientation,
  resolveOrientationFromDimensions,
  type VideoOrientation,
  type VideoViewportDimensions
} from '../../core/media/videoOrientation';

export interface UseAutoVideoOrientationOptions {
  /** Fallback orientation when neither stream nor viewport dimensions are available. */
  defaultOrientation?: VideoOrientation;
  /** Optional React Native window dimensions (`useWindowDimensions()`). */
  externalDimensions?: VideoViewportDimensions | null;
  /** Optional local camera track / MediaStream to inspect before `<video>` metadata fires. */
  localVideoTrack?: unknown;
  /** When true, incoming screen-share dimensions are ignored for self-preview orientation. */
  isScreenSharing?: boolean;
}

export interface UseAutoVideoOrientationResult {
  videoOrientation: VideoOrientation;
  autoOrientation: VideoOrientation;
  isManualOverride: boolean;
  setVideoOrientation: React.Dispatch<React.SetStateAction<VideoOrientation>>;
  toggleOrientation: () => void;
  resetOrientationOverride: () => void;
  reportVideoDimensions: (width: number, height: number) => void;
}

/**
 * Automatically detects local self-preview orientation from the live video stream
 * (authoritative) and viewport/device orientation (initial & fallback), while
 * allowing manual toggle overrides that reset only on physical/stream flips.
 */
export function useAutoVideoOrientation(
  options?: UseAutoVideoOrientationOptions
): UseAutoVideoOrientationResult {
  const defaultOrientation = options?.defaultOrientation ?? 'landscape';
  const externalWidth = options?.externalDimensions?.width;
  const externalHeight = options?.externalDimensions?.height;
  const localVideoTrack = options?.localVideoTrack;
  const isScreenSharing = Boolean(options?.isScreenSharing);

  const [autoOrientation, setAutoOrientation] = useState<VideoOrientation>(() => {
    const fromTrack = !isScreenSharing
      ? detectTrackVideoOrientation(localVideoTrack)
      : null;
    if (fromTrack) return fromTrack;
    return detectViewportVideoOrientation(defaultOrientation, options?.externalDimensions);
  });

  const [manualOverride, setManualOverride] = useState<VideoOrientation | null>(null);

  const videoOrientation: VideoOrientation = manualOverride ?? autoOrientation;

  const videoOrientationRef = useRef<VideoOrientation>(videoOrientation);
  videoOrientationRef.current = videoOrientation;

  const isScreenSharingRef = useRef<boolean>(isScreenSharing);
  isScreenSharingRef.current = isScreenSharing;

  const lastStreamOrientationRef = useRef<VideoOrientation | null>(
    !isScreenSharing ? detectTrackVideoOrientation(localVideoTrack) : null
  );
  const lastViewportOrientationRef = useRef<VideoOrientation>(
    detectViewportVideoOrientation(defaultOrientation, options?.externalDimensions)
  );
  const prevTrackRef = useRef<unknown>(localVideoTrack);

  const reportVideoDimensions = useCallback((width: number, height: number) => {
    if (isScreenSharingRef.current) return;
    const next = resolveOrientationFromDimensions(width, height);
    if (!next) return;

    const prevStream = lastStreamOrientationRef.current;
    lastStreamOrientationRef.current = next;
    setAutoOrientation(next);

    // Physical rotation / aspect flip clears stale manual override; adaptive bitrate scaling keeps it.
    if (prevStream !== null && prevStream !== next) {
      setManualOverride(null);
    }
  }, []);

  useEffect(() => {
    const trackChanged = prevTrackRef.current !== localVideoTrack;
    prevTrackRef.current = localVideoTrack;

    if (!localVideoTrack) {
      lastStreamOrientationRef.current = null;
      return;
    }

    if (isScreenSharing) {
      return;
    }

    if (trackChanged) {
      lastStreamOrientationRef.current = null;
    }

    if (lastStreamOrientationRef.current === null) {
      const fromTrack = detectTrackVideoOrientation(localVideoTrack);
      if (fromTrack) {
        lastStreamOrientationRef.current = fromTrack;
        setAutoOrientation(fromTrack);
      }
    }
  }, [localVideoTrack, isScreenSharing]);

  useEffect(() => {
    const syncViewportOrientation = () => {
      const dims =
        typeof externalWidth === 'number' && typeof externalHeight === 'number'
          ? { width: externalWidth, height: externalHeight }
          : null;
      const nextViewport = detectViewportVideoOrientation(defaultOrientation, dims);
      if (nextViewport !== lastViewportOrientationRef.current) {
        lastViewportOrientationRef.current = nextViewport;
        setManualOverride(null);
        if (lastStreamOrientationRef.current === null) {
          setAutoOrientation(nextViewport);
        }
      }
    };

    syncViewportOrientation();

    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return undefined;
    }

    window.addEventListener('resize', syncViewportOrientation);
    window.addEventListener('orientationchange', syncViewportOrientation);
    const screenOrientation = window.screen?.orientation;
    if (screenOrientation && typeof screenOrientation.addEventListener === 'function') {
      screenOrientation.addEventListener('change', syncViewportOrientation);
    }

    return () => {
      window.removeEventListener('resize', syncViewportOrientation);
      window.removeEventListener('orientationchange', syncViewportOrientation);
      if (screenOrientation && typeof screenOrientation.removeEventListener === 'function') {
        screenOrientation.removeEventListener('change', syncViewportOrientation);
      }
    };
  }, [defaultOrientation, externalWidth, externalHeight]);

  const setVideoOrientation = useCallback<React.Dispatch<React.SetStateAction<VideoOrientation>>>(
    (valueOrUpdater) => {
      const next =
        typeof valueOrUpdater === 'function'
          ? valueOrUpdater(videoOrientationRef.current)
          : valueOrUpdater;
      setManualOverride(next);
    },
    []
  );

  const toggleOrientation = useCallback(() => {
    setManualOverride(
      videoOrientationRef.current === 'portrait' ? 'landscape' : 'portrait'
    );
  }, []);

  const resetOrientationOverride = useCallback(() => {
    setManualOverride(null);
  }, []);

  return {
    videoOrientation,
    autoOrientation,
    isManualOverride: manualOverride !== null,
    setVideoOrientation,
    toggleOrientation,
    resetOrientationOverride,
    reportVideoDimensions
  };
}
