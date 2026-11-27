import React from 'react';
import { StyleSheet } from 'react-native';
import Pdf from 'react-native-pdf';
import type { NativePdfPreviewProps } from './NativePdfPreview';

export function renderNativePdfPreview({ uri, backgroundColor }: NativePdfPreviewProps): React.ReactNode {
  return (
    <Pdf
      source={{ uri }}
      style={[styles.pdf, backgroundColor ? { backgroundColor } : undefined]}
      trustAllCerts={false}
    />
  );
}

export const supportsNativeInlinePdf = true;

const styles = StyleSheet.create({
  pdf: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
