import React, { useRef } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import ThemedText from '@ui/ThemedText';
import { normalizeScannedClaimCode } from '../utils/scanCode';

interface QrScannerProps {
  /** Called once with the normalised code of the first usable QR the camera reads. */
  onScanned: (code: string) => void;
  onClose: () => void;
}

/** Full-screen camera that reads a prescription QR code. Asks for the camera permission and explains a refusal. */
export function QrScanner({ onScanned, onClose }: QrScannerProps): React.JSX.Element {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const handleBarcode = ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    const code = normalizeScannedClaimCode(data);
    if (!code) return;
    handled.current = true;
    onScanned(code);
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <ThemedText style={styles.message}>
          {permission.canAskAgain
            ? 'Allow camera access to scan the QR code on the patient\u2019s prescription.'
            : 'Camera access is turned off for this app. Enable it in your device settings to scan prescriptions.'}
        </ThemedText>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
        >
          <ThemedText style={styles.primaryBtnText}>{permission.canAskAgain ? 'Allow camera' : 'Open settings'}</ThemedText>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={onClose}>
          <ThemedText style={styles.ghostBtnText}>Type the code instead</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={styles.fill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcode}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.frame} pointerEvents="none" />
        <ThemedText style={styles.overlayText}>Point the camera at the prescription QR code</ThemedText>
        <Pressable style={styles.ghostBtn} onPress={onClose}>
          <ThemedText style={styles.ghostBtnText}>Cancel</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: 24,
    gap: 16,
  },
  frame: {
    position: 'absolute',
    top: '28%',
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: '#2DD4BF',
    borderRadius: 18,
  },
  overlayText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: '#0D9488',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  ghostBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  ghostBtnText: {
    color: '#E2E8F0',
    fontWeight: '600',
    fontSize: 14,
  },
});
