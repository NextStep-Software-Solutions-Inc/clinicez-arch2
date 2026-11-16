/**
 * Runtime capability helpers for web browser teleconsult features.
 * Safe in SSR and React Native environments where DOM/navigator globals may be absent.
 */

export function isMobileBrowserRuntime(userAgentOverride?: string): boolean {
  const uaPattern = /Android|iPhone|iPad|iPod|Mobile|CriOS|FxiOS|EdgiOS/i;
  if (userAgentOverride !== undefined) {
    return uaPattern.test(userAgentOverride);
  }
  if (typeof navigator === 'undefined') {
    return false;
  }
  const navWithUaData = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  if (navWithUaData.userAgentData?.mobile === true) {
    return true;
  }
  return uaPattern.test(navigator.userAgent || '');
}

export function isScreenShareSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  if (isMobileBrowserRuntime()) {
    return false;
  }
  return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

export function isBrowserPipSupported(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  if (isMobileBrowserRuntime()) {
    return false;
  }
  const docWithPip = document as Document & { pictureInPictureEnabled?: boolean };
  if (!docWithPip.pictureInPictureEnabled) {
    return false;
  }
  return (
    typeof HTMLVideoElement !== 'undefined' &&
    typeof HTMLVideoElement.prototype?.requestPictureInPicture === 'function'
  );
}

export async function hasMultipleVideoInputs(): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.mediaDevices?.enumerateDevices !== 'function'
  ) {
    return false;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputCount = devices.filter((device) => device.kind === 'videoinput').length;
    return videoInputCount > 1;
  } catch {
    return false;
  }
}
