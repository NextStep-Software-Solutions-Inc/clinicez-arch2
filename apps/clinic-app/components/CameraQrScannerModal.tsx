import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Button, ThemedText } from './ui';
import { theme } from '../constants/theme';

export interface CameraQrScannerModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onScanned: (data: string) => void;
  onClose: () => void;
}

/**
 * Native and web camera scanner modal for patient QR codes, share tokens, and laboratory/prescription slips.
 * Handles permission states (requesting, granted, denied/blocked) and delivers a single scan per presentation.
 */
export default function CameraQrScannerModal({
  visible,
  title = 'Scan Patient QR',
  subtitle = 'Point camera at the patient QR code or digital share token',
  onScanned,
  onClose,
}: CameraQrScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (visible) {
      handled.current = false;
    }
  }, [visible]);

  const handleScan = (result: BarcodeScanningResult) => {
    if (handled.current) return;
    const raw = result.data?.trim();
    if (!raw) return;
    handled.current = true;
    onScanned(raw);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header Overlay */}
        <View style={styles.header}>
          <ThemedText variant="h3" color="#FFFFFF">
            {title}
          </ThemedText>
          <ThemedText variant="small" color="#94A3B8" style={styles.headerSubtitle}>
            {subtitle}
          </ThemedText>
        </View>

        {/* Camera / Permission Body */}
        {!permission ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <ThemedText variant="body" color="#FFFFFF">
              Initializing camera…
            </ThemedText>
          </View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <ThemedText variant="body" color="#FFFFFF" style={styles.message}>
              {permission.canAskAgain
                ? 'Camera access is required to scan patient QR codes and share tokens.'
                : 'Camera permission is disabled. Please enable camera access in your device settings to scan QR codes.'}
            </ThemedText>
            <View style={styles.permissionActions}>
              <Button
                title={permission.canAskAgain ? 'Grant Camera Access' : 'Open Device Settings'}
                variant="primary"
                onPress={() => {
                  if (permission.canAskAgain) {
                    void requestPermission();
                  } else {
                    void Linking.openSettings();
                  }
                }}
              />
              <Button title="Cancel" variant="ghost" onPress={onClose} />
            </View>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleScan}
            />

            {/* Target Reticle Overlay */}
            <View style={styles.reticleOverlay} pointerEvents="none">
              <View style={styles.reticleFrame} />
              <View style={styles.hintBadge}>
                <ThemedText variant="captionBold" color="#FFFFFF">
                  Align QR code within the frame
                </ThemedText>
              </View>
            </View>
          </View>
        )}

        {/* Footer Actions */}
        <View style={styles.footer}>
          <Pressable style={styles.cancelButton} onPress={onClose} accessibilityRole="button">
            <ThemedText variant="bodyBold" color="#111827">
              Close Scanner
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'space-between',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 32,
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    alignItems: 'center',
    zIndex: 10,
  },
  headerSubtitle: {
    marginTop: 4,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 20,
  },
  message: {
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  permissionActions: {
    gap: 12,
    width: '100%',
    maxWidth: 280,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  reticleOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: theme.colors.primary,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  hintBadge: {
    marginTop: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  footer: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    zIndex: 10,
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 12,
  },
});
