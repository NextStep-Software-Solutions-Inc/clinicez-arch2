export type VideoOrientation = 'portrait' | 'landscape';

export interface VideoViewportDimensions {
  width: number;
  height: number;
}

/**
 * Resolves video orientation from positive finite dimensions.
 * Returns null if dimensions are unavailable or non-positive.
 */
export function resolveOrientationFromDimensions(
  width?: number | null,
  height?: number | null
): VideoOrientation | null {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return height > width ? 'portrait' : 'landscape';
}

interface DuckTypedVideoTrack {
  source?: unknown;
  dimensions?: { width?: number; height?: number } | null;
  mediaStreamTrack?: DuckTypedVideoTrack | null;
  getSettings?: () => {
    width?: number;
    height?: number;
    displaySurface?: unknown;
  };
  getVideoTracks?: () => DuckTypedVideoTrack[];
}

/**
 * Best-effort orientation detection from a WebRTC MediaStream, MediaStreamTrack,
 * or LiveKit LocalVideoTrack wrapper. Screen-share tracks are ignored.
 */
export function detectTrackVideoOrientation(trackOrStream: unknown): VideoOrientation | null {
  if (!trackOrStream || typeof trackOrStream !== 'object') {
    return null;
  }

  const candidate = trackOrStream as DuckTypedVideoTrack;

  if (typeof candidate.getVideoTracks === 'function') {
    const videoTracks = candidate.getVideoTracks();
    if (!Array.isArray(videoTracks) || videoTracks.length === 0) {
      return null;
    }
    return detectTrackVideoOrientation(videoTracks[0]);
  }

  if (candidate.source === 'screen_share' || candidate.source === 'screen_share_audio') {
    return null;
  }

  const underlying = candidate.mediaStreamTrack ?? candidate;
  if (underlying.source === 'screen_share' || underlying.source === 'screen_share_audio') {
    return null;
  }

  const settings =
    typeof underlying.getSettings === 'function' ? underlying.getSettings() : null;
  if (settings && typeof settings === 'object' && Boolean(settings.displaySurface)) {
    return null;
  }

  const fromWrapperDimensions = resolveOrientationFromDimensions(
    candidate.dimensions?.width,
    candidate.dimensions?.height
  );
  if (fromWrapperDimensions) {
    return fromWrapperDimensions;
  }

  return resolveOrientationFromDimensions(settings?.width, settings?.height);
}

/**
 * Detects orientation from explicit dimensions (React Native useWindowDimensions)
 * or the browser viewport / screen orientation API, falling back to `fallback`.
 */
export function detectViewportVideoOrientation(
  fallback: VideoOrientation = 'landscape',
  externalDimensions?: VideoViewportDimensions | null
): VideoOrientation {
  const fromExternal = resolveOrientationFromDimensions(
    externalDimensions?.width,
    externalDimensions?.height
  );
  if (fromExternal) {
    return fromExternal;
  }

  if (typeof window !== 'undefined') {
    const fromWindow = resolveOrientationFromDimensions(
      window.innerWidth,
      window.innerHeight
    );
    if (fromWindow) {
      return fromWindow;
    }

    const screenType = window.screen?.orientation?.type;
    if (typeof screenType === 'string') {
      if (screenType.startsWith('portrait')) return 'portrait';
      if (screenType.startsWith('landscape')) return 'landscape';
    }
  }

  return fallback;
}
