import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface ClaimQrScannerProps {
  visible: boolean;
  /** Receives the raw QR content once per opening of the scanner. */
  onScanned: (data: string) => void;
  onClose: () => void;
}

/**
 * Full-screen camera scanner for the patient's slip QR. Handles the permission flow (ask, denied, blocked in system
 * settings) and reports a single scan per opening so a steady QR is not claimed repeatedly.
 */
export function ClaimQrScanner({ visible, onScanned, onClose }: ClaimQrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (visible) handled.current = false;
  }, [visible]);

  const handleScan = ({ data }: { data: string }) => {
    if (handled.current) return;
    handled.current = true;
    onScanned(data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : permission.granted ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleScan}
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.message}>
              {permission.canAskAgain
                ? 'Camera access is needed to scan the QR code on the patient slip.'
                : 'Camera access is turned off for this app. Enable it in the system settings to scan slips.'}
            </Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
            >
              <Text style={styles.primaryButtonText}>{permission.canAskAgain ? 'Allow camera' : 'Open settings'}</Text>
            </Pressable>
          </View>
        )}

        {permission?.granted ? (
          <View style={styles.hint} pointerEvents="none">
            <Text style={styles.hintText}>Point the camera at the QR code on the slip</Text>
          </View>
        ) : null}

        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  camera: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 },
  message: { color: '#FFFFFF', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  primaryButton: { backgroundColor: '#7C3AED', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700' },
  hint: { position: 'absolute', top: 64, left: 0, right: 0, alignItems: 'center' },
  hintText: {
    color: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 14,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  closeButtonText: { color: '#111827', fontWeight: '700' },
});
