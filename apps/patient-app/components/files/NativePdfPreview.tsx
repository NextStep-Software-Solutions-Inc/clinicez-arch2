import type React from 'react';

export interface NativePdfPreviewProps {
  uri: string;
  backgroundColor?: string;
}

/**
 * Web / default stub for native PDF rendering.
 * On iOS and Android, Metro resolves `NativePdfPreview.native.tsx`.
 */
export function renderNativePdfPreview(_props: NativePdfPreviewProps): React.ReactNode {
  return null;
}

export const supportsNativeInlinePdf = false;
